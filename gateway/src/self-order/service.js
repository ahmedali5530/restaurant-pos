'use strict';

/**
 * QR self-ordering: a customer scans the code on their table, orders from the
 * menu, pays online, and the paid order lands in the POS for the kitchen.
 *
 * The order is written through the same sync protocol the tills use
 * (`sync-service.push`) as the virtual terminal `self-order`, so the gateway
 * mints its invoice number, every terminal pulls it, and the KDS gets its
 * kitchen stage rows exactly as if a cashier had rung it up and settled it.
 */

const crypto = require('crypto');
const { rows, first, toRecord } = require('../sync-store');
const syncService = require('../sync-service');
const { getCatalog, invalidateCatalog, kitchenStagesForDish, idOf } = require('./catalog');
const { priceLine, summarize, round2 } = require('./pricing');
const payments = require('./payment-client');

const TERMINAL_ID = 'self-order';
const SETTINGS_KEY = 'self_order';
const ONLINE_GATEWAYS = ['stripe', 'paypal'];
const THEME_BRANDS = ['classic', 'ocean', 'forest', 'cream', 'ruby', 'sapphire', 'custom'];
const THEME_MODES = ['light', 'dark', 'system'];
const MAX_LINES = 50;
const MAX_QUANTITY = 50;
const CHECKOUT_TTL_MS = 60 * 60 * 1000;

const DEFAULT_SETTINGS = {
  enabled: false,
  restaurantName: '',
  welcomeText: '',
  orderTypeId: null,
  orderTaxId: null,
  paymentTypeIds: [],
  testMode: false,
  testPaymentTypeId: null,
  currency: 'USD',
  timezone: 'UTC',
  hiddenCategoryIds: null,
  baseUrl: '',
  themeBrand: 'classic',
  themeMode: 'system',
  themeCustomPrimary: null,
};

class SelfOrderError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let schemaReady = null;
function ensureSchema(db) {
  if (!schemaReady) {
    schemaReady = db
      .query(`
        DEFINE TABLE IF NOT EXISTS self_order_table SCHEMALESS PERMISSIONS NONE;
        DEFINE INDEX IF NOT EXISTS self_order_table_token ON self_order_table FIELDS token UNIQUE;
        DEFINE TABLE IF NOT EXISTS self_order_checkout SCHEMALESS PERMISSIONS NONE;
      `)
      .catch((err) => {
        schemaReady = null;
        throw err;
      });
  }
  return schemaReady;
}

const randomKey = (length = 20) => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
};

const newToken = () => crypto.randomBytes(18).toString('base64url');
const keyPart = (id) => String(id).split(':').slice(1).join(':') || String(id);

function businessDay(timezone, date = new Date()) {
  // en-CA formats as yyyy-MM-dd.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/* ------------------------------------------------------------------ settings */

async function loadSettings(db) {
  const row = first(
    await db.query(`SELECT * FROM setting WHERE key = $key AND is_global = true LIMIT 1`, { key: SETTINGS_KEY }),
  );
  return { ...DEFAULT_SETTINGS, ...(row?.values || {}) };
}

function cleanIdList(value) {
  return Array.isArray(value) ? [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))] : [];
}

async function saveSettings(db, input) {
  const current = await loadSettings(db);
  const next = { ...current };
  const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
  const idOrNull = (v) => (v ? str(v, 100) : null);
  if ('enabled' in input) next.enabled = !!input.enabled;
  if ('restaurantName' in input) next.restaurantName = str(input.restaurantName, 80);
  if ('welcomeText' in input) next.welcomeText = str(input.welcomeText, 300);
  if ('orderTypeId' in input) next.orderTypeId = idOrNull(input.orderTypeId);
  if ('orderTaxId' in input) next.orderTaxId = idOrNull(input.orderTaxId);
  if ('paymentTypeIds' in input) next.paymentTypeIds = cleanIdList(input.paymentTypeIds);
  if ('testMode' in input) next.testMode = !!input.testMode;
  if ('testPaymentTypeId' in input) next.testPaymentTypeId = idOrNull(input.testPaymentTypeId);
  if ('currency' in input && str(input.currency, 3)) next.currency = str(input.currency, 3).toUpperCase();
  if ('timezone' in input && str(input.timezone, 64)) next.timezone = str(input.timezone, 64);
  if ('hiddenCategoryIds' in input) {
    next.hiddenCategoryIds = input.hiddenCategoryIds === null ? null : cleanIdList(input.hiddenCategoryIds);
  }
  if ('baseUrl' in input) next.baseUrl = str(input.baseUrl, 300).replace(/\/+$/, '');
  if ('themeBrand' in input) {
    const brand = str(input.themeBrand, 20).toLowerCase();
    if (THEME_BRANDS.includes(brand)) next.themeBrand = brand;
  }
  if ('themeMode' in input) {
    const mode = str(input.themeMode, 10).toLowerCase();
    if (THEME_MODES.includes(mode)) next.themeMode = mode;
  }
  if ('themeCustomPrimary' in input) {
    const raw = str(input.themeCustomPrimary, 9);
    const match = raw.match(/^#?([0-9a-fA-F]{6})$/);
    next.themeCustomPrimary = match ? `#${match[1].toLowerCase()}` : null;
  }

  await db.query(
    `UPSERT type::record('setting', 'self_order') MERGE { key: $key, is_global: true, values: $values }`,
    { key: SETTINGS_KEY, values: next },
  );
  invalidateCatalog();
  return next;
}

/* -------------------------------------------------------------------- tables */

async function listTables(db) {
  await ensureSchema(db);
  const [tables, tokens] = await Promise.all([
    db.query(`SELECT id, name, number, priority, floor.id AS floor_id, floor.name AS floor_name, floor.priority AS floor_priority
              FROM floor_table WHERE deleted_at = NONE OR deleted_at = NULL`),
    db.query(`SELECT * FROM self_order_table`),
  ]);
  const tokenByTable = new Map(rows(tokens).map((row) => [idOf(row.table), row]));
  const out = [];
  for (const table of rows(tables)) {
    const tableId = idOf(table.id);
    let entry = tokenByTable.get(tableId);
    if (!entry) {
      entry = { token: newToken() };
      await db.query(
        `UPSERT type::record('self_order_table', $key) CONTENT { table: $table, token: $qrToken, created_at: time::now() }`,
        { key: keyPart(tableId), table: toRecord('floor_table', tableId), qrToken: entry.token },
      );
    }
    out.push({
      id: tableId,
      name: String(table.name ?? ''),
      number: table.number != null ? String(table.number) : '',
      priority: Number(table.priority ?? 0),
      floorId: table.floor_id ? idOf(table.floor_id) : null,
      floorName: table.floor_name ? String(table.floor_name) : '',
      floorPriority: Number(table.floor_priority ?? 0),
      token: entry.token,
      enabled: entry.enabled !== false,
    });
  }
  out.sort(
    (a, b) =>
      a.floorPriority - b.floorPriority ||
      a.floorName.localeCompare(b.floorName) ||
      a.number.localeCompare(b.number, undefined, { numeric: true }) ||
      a.name.localeCompare(b.name),
  );
  return out;
}

async function updateTable(db, tableId, { regenerate, enabled }) {
  await ensureSchema(db);
  const id = toRecord('self_order_table', keyPart(tableId));
  const patch = {};
  if (regenerate) patch.token = newToken();
  if (enabled !== undefined) patch.enabled = !!enabled;
  await db.query(`UPSERT $id MERGE $patch`, {
    id,
    patch: { ...patch, table: toRecord('floor_table', tableId) },
  });
  const fullId = String(tableId).startsWith('floor_table:') ? String(tableId) : `floor_table:${tableId}`;
  return (await listTables(db)).find((t) => t.id === fullId);
}

async function resolveTable(db, token) {
  await ensureSchema(db);
  const clean = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(clean)) throw new SelfOrderError(404, 'This QR code is not valid.', 'BAD_TOKEN');
  const entry = first(await db.query(`SELECT * FROM self_order_table WHERE token = $qrToken LIMIT 1`, { qrToken: clean }));
  if (!entry || entry.enabled === false) throw new SelfOrderError(404, 'This QR code is not active.', 'BAD_TOKEN');
  const table = first(
    await db.query(`SELECT id, name, number, floor, categories, floor.name AS floor_name, deleted_at FROM $id`, {
      id: entry.table,
    }),
  );
  if (!table || table.deleted_at) throw new SelfOrderError(404, 'This table no longer exists.', 'BAD_TOKEN');
  return {
    id: idOf(table.id),
    name: String(table.name ?? ''),
    number: table.number != null ? String(table.number) : '',
    floorId: table.floor ? idOf(table.floor) : null,
    floorName: table.floor_name ? String(table.floor_name) : '',
    categoryIds: (table.categories || []).map(idOf),
  };
}

/* ------------------------------------------------------------ payment types */

async function loadPaymentTypes(db) {
  return rows(
    await db.query(
      `SELECT id, name, type, gateway, gateway_mode, priority FROM payment_type
       WHERE deleted_at = NONE OR deleted_at = NULL ORDER BY priority ASC`,
    ),
  ).map((pt) => ({
    id: idOf(pt.id),
    name: String(pt.name ?? ''),
    type: String(pt.type ?? ''),
    gateway: pt.gateway ? String(pt.gateway).toLowerCase() : null,
    mode: pt.gateway_mode ? String(pt.gateway_mode) : null,
  }));
}

async function paymentMethods(db, settings) {
  const types = await loadPaymentTypes(db);
  const methods = types
    .filter((pt) => settings.paymentTypeIds.includes(pt.id) && ONLINE_GATEWAYS.includes(pt.gateway))
    .map((pt) => ({ id: pt.id, name: pt.name, gateway: pt.gateway }));
  if (settings.testMode) {
    const testType = types.find((pt) => pt.id === settings.testPaymentTypeId) ?? types[0];
    if (testType) methods.push({ id: testType.id, name: `${testType.name} (test payment)`, gateway: 'test' });
  }
  return methods;
}

/* ------------------------------------------------------------------- menu */

function visibleCatalog(catalog, settings, table) {
  const hidden = new Set(settings.hiddenCategoryIds ?? catalog.modifierOnlyCategoryIds);
  const tableCats = table.categoryIds.length ? new Set(table.categoryIds) : null;
  const allowedCat = (id) => !hidden.has(id) && (!tableCats || tableCats.has(id));
  const dishes = catalog.dishes.filter((dish) => dish.categoryIds.some(allowedCat));
  const used = new Set(dishes.flatMap((d) => d.categoryIds.filter(allowedCat)));
  const categories = catalog.categories.filter((c) => used.has(c.id));
  return { dishes, categories, allowedCat };
}

async function getPublicMenu(db, token) {
  const settings = await loadSettings(db);
  if (!settings.enabled) throw new SelfOrderError(403, 'Ordering from the table is not available right now.', 'DISABLED');
  const table = await resolveTable(db, token);
  const catalog = await getCatalog(db, settings.timezone);
  const { dishes, categories, allowedCat } = visibleCatalog(catalog, settings, table);
  const orderTax = settings.orderTaxId
    ? first(await db.query(`SELECT id, name, rate FROM $id`, { id: toRecord('tax', settings.orderTaxId) }))
    : null;

  return {
    restaurant: { name: settings.restaurantName, welcomeText: settings.welcomeText },
    table: { name: table.name, number: table.number, floor: table.floorName },
    currency: settings.currency,
    theme: {
      brand: settings.themeBrand,
      mode: settings.themeMode,
      customPrimary: settings.themeCustomPrimary ?? null,
    },
    orderTax: orderTax ? { id: idOf(orderTax.id), name: String(orderTax.name ?? 'Tax'), rate: Number(orderTax.rate || 0) } : null,
    categories,
    dishes: dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      price: dish.price,
      taxMode: dish.tax_mode,
      taxes: dish.taxes,
      categoryIds: dish.categoryIds.filter(allowedCat),
      modifierGroups: dish.modifierGroups.map((group) => ({
        id: group.id,
        name: group.name,
        required: group.required,
        options: group.options.map((o) => ({ id: o.id, name: o.name, price: o.price })),
      })),
    })),
    paymentMethods: await paymentMethods(db, settings),
  };
}

/* ---------------------------------------------------------------- pricing */

/**
 * Validate the cart against the catalog and price it. Returns the order_item
 * rows (with kitchen stages) exactly as `buildOrderItemRows` would.
 */
async function priceCart(db, settings, table, cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw new SelfOrderError(400, 'Your cart is empty.', 'EMPTY_CART');
  }
  if (cartItems.length > MAX_LINES) throw new SelfOrderError(400, 'Too many items in one order.', 'TOO_MANY');

  const catalog = await getCatalog(db, settings.timezone);
  const { allowedCat } = visibleCatalog(catalog, settings, table);
  const orderTax = settings.orderTaxId
    ? first(await db.query(`SELECT id, name, rate FROM $id`, { id: toRecord('tax', settings.orderTaxId) }))
    : null;
  const orderTaxRow = orderTax ? { id: idOf(orderTax.id), name: String(orderTax.name ?? 'Tax'), rate: Number(orderTax.rate || 0) } : null;
  const categoryName = new Map(catalog.categories.map((c) => [c.id, c.name]));

  const lines = cartItems.map((raw, index) => {
    const dish = catalog.dishMap.get(String(raw?.dishId || ''));
    if (!dish || !dish.categoryIds.some(allowedCat)) {
      throw new SelfOrderError(409, 'An item in your cart is no longer available. Please refresh the menu.', 'UNAVAILABLE');
    }
    const quantity = Math.floor(Number(raw?.quantity));
    if (!Number.isFinite(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new SelfOrderError(400, `Invalid quantity for ${dish.name}.`, 'BAD_QUANTITY');
    }
    const picked = raw?.modifiers && typeof raw.modifiers === 'object' ? raw.modifiers : {};
    const groups = dish.modifierGroups.map((group) => {
      const ids = Array.isArray(picked[group.id]) ? picked[group.id].map(String) : [];
      const chosen = [...new Set(ids)].map((id) => group.options.find((o) => o.id === id));
      if (chosen.some((o) => !o)) {
        throw new SelfOrderError(409, `An option for ${dish.name} is no longer available.`, 'UNAVAILABLE');
      }
      if (group.required > 0 && chosen.length !== group.required) {
        throw new SelfOrderError(400, `Please choose ${group.required} for "${group.name}" (${dish.name}).`, 'MODIFIERS');
      }
      return { group, chosen };
    });
    const allChosen = groups.flatMap((g) => g.chosen);
    const pricing = priceLine(dish, quantity, allChosen, orderTaxRow);
    const comments = String(raw?.comments ?? '').trim().slice(0, 200) || undefined;
    const firstCategory = dish.categoryIds.find(allowedCat) ?? dish.categoryIds[0] ?? null;

    let modifierIndex = 0;
    const modifiers = groups
      .filter((g) => g.chosen.length > 0)
      .map(({ group, chosen }) => ({
        id: group.id,
        in: dish.id,
        out: { id: group.groupId, name: group.name, priority: group.priority },
        required_modifiers: group.required,
        has_required_modifiers: group.required > 0,
        selectedModifiers: chosen.map((option) => {
          const netPrice = pricing.netModifiers[allChosen.indexOf(option)];
          modifierIndex += 1;
          return {
            id: `${randomKey(8)}${modifierIndex}`,
            quantity: 1,
            dish: { id: option.dishId, name: option.name, number: option.number, price: option.price },
            price: netPrice,
            level: 1,
            isModifier: true,
            newOrOld: 'new',
            catalogModifierId: option.id,
            tax_mode: pricing.taxMode,
            taxes: pricing.taxes.length ? pricing.taxes : undefined,
            category: '',
          };
        }),
      }));

    return {
      index,
      dish,
      quantity,
      comments,
      pricing,
      modifiers,
      categoryId: firstCategory,
      categoryName: firstCategory ? categoryName.get(firstCategory) ?? '' : '',
      summary: {
        name: dish.name,
        quantity,
        options: allChosen.map((o) => o.name),
        comments,
        // What the customer sees per line: display prices (tax-inclusive where the menu says so).
        amount: round2((pricing.displayPrice + allChosen.reduce((s, o) => s + Number(o.price || 0), 0)) * quantity),
      },
    };
  });

  const totals = summarize(lines.map((l) => l.pricing));
  return { lines, totals, orderTax: orderTaxRow, kitchens: catalog.kitchens };
}

function publicQuote(priced, currency) {
  return {
    currency,
    items: priced.lines.map((l) => l.summary),
    subtotal: priced.totals.subtotal,
    taxes: priced.totals.taxRows.map((row) => ({ name: row.tax.name, rate: row.tax.rate, amount: row.amount })),
    taxAmount: priced.totals.taxAmount,
    total: priced.totals.total,
  };
}

async function quote(db, token, body) {
  const settings = await loadSettings(db);
  if (!settings.enabled) throw new SelfOrderError(403, 'Ordering from the table is not available right now.', 'DISABLED');
  const table = await resolveTable(db, token);
  const priced = await priceCart(db, settings, table, body?.items);
  return publicQuote(priced, settings.currency);
}

/* --------------------------------------------------------------- checkout */

function buildOrderRows(orderId, priced, createdAt) {
  const items = [];
  const kitchens = [];
  priced.lines.forEach((line, position) => {
    const itemId = `order_item:${randomKey()}`;
    const { pricing } = line;
    items.push({
      id: itemId,
      order: orderId,
      item: line.dish.id,
      price: pricing.netPrice,
      ...(pricing.netPrice !== pricing.displayPrice ? { original_price: pricing.displayPrice } : {}),
      quantity: line.quantity,
      comments: line.comments,
      modifiers: line.modifiers,
      service_charges: 0,
      discount: 0,
      tax: pricing.storedTax,
      taxes: pricing.taxes.map((t) => t.id),
      tax_mode: pricing.taxMode,
      is_suspended: false,
      is_addition: false,
      position,
      level: 0,
      category: line.categoryName,
      category_id: line.categoryId,
      menu: line.dish.menu_name ?? undefined,
      created_at: createdAt,
      created_by: null,
    });
    for (const stage of kitchenStagesForDish(line.dish, priced.kitchens)) {
      if (!stage.kitchenId) continue;
      kitchens.push({
        id: `order_item_kitchen:${randomKey()}`,
        kitchen: stage.kitchenId,
        order_item: itemId,
        status: stage.status,
        sequence: stage.sequence,
        is_terminal: stage.isTerminal,
        workflow: stage.workflowId,
        stage: stage.stageId,
        stage_name: stage.stageName,
        created_at: createdAt,
        activated_at: stage.status === 'pending' ? createdAt : null,
      });
    }
  });
  return { items, kitchens };
}

/** Extract the bare 24-char key from a `self_order_checkout:<key>` record id. */
function checkoutKeyFromRecord(record) {
  const id = String(record?.id ?? '');
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
}

async function startCheckout(db, token, body) {
  const settings = await loadSettings(db);
  if (!settings.enabled) throw new SelfOrderError(403, 'Ordering from the table is not available right now.', 'DISABLED');
  if (!settings.orderTypeId) throw new SelfOrderError(503, 'Table ordering is not fully set up yet. Please ask a staff member.', 'NOT_CONFIGURED');
  const table = await resolveTable(db, token);
  const priced = await priceCart(db, settings, table, body?.items);
  if (!(priced.totals.total > 0)) throw new SelfOrderError(400, 'The order total must be more than zero.', 'ZERO_TOTAL');

  const methods = await paymentMethods(db, settings);
  const methodId = String(body?.paymentMethodId || '');
  const method = methods.find((m) => m.id === methodId && m.gateway === String(body?.gateway || ''))
    ?? methods.find((m) => m.id === methodId);
  if (!method) throw new SelfOrderError(400, 'Please choose a payment method.', 'NO_PAYMENT_METHOD');

  const idempotencyKey = String(body?.idempotencyKey ?? '').trim().slice(0, 64);

  // A retry after a lost response (or a double-tap) must not create a second
  // gateway intent that could also be paid. If the client supplied a key and a
  // live checkout already exists for it, return that one.
  if (idempotencyKey) {
    const [existingRows] = await db.query(
      `SELECT * FROM self_order_checkout WHERE token = $qrToken AND idempotency_key = $idemKey AND status != 'expired' ORDER BY created_at DESC LIMIT 1`,
      { qrToken: String(token), idemKey: idempotencyKey }
    );
    const existing = Array.isArray(existingRows) ? existingRows[0] : existingRows;
    if (existing) {
      return {
        checkoutId: checkoutKeyFromRecord(existing),
        gateway: existing.gateway,
        quote: existing.quote,
        payment: existing.payment ?? null,
      };
    }
  }

  const checkoutId = randomKey(24);
  const orderId = `order:${randomKey()}`;
  const createdAt = new Date().toISOString();
  const { items, kitchens } = buildOrderRows(orderId, priced, createdAt);
  const customerName = String(body?.customerName ?? '').trim().slice(0, 60);
  const note = String(body?.notes ?? '').trim().slice(0, 300);

  let intent = null;
  if (method.gateway !== 'test') {
    intent = await payments.createIntent({
      gateway: method.gateway,
      amount: priced.totals.total,
      currency: settings.currency,
      orderId,
      paymentTypeId: method.id,
      checkoutId,
    });
  }

  // Persist the client-facing payment payload so an idempotent retry returns
  // the same intent rather than minting (and possibly charging) another.
  const payment = intent
    ? {
        intentId: intent.intentId,
        clientToken: intent.clientToken ?? null,
        publishableKey: intent.gatewayPayload?.publishableKey ?? null,
        clientId: intent.gatewayPayload?.clientId ?? null,
        mode: intent.gatewayPayload?.mode ?? null,
      }
    : null;

  await db.query(`CREATE type::record('self_order_checkout', $id) CONTENT $data`, {
    id: checkoutId,
    data: {
      status: 'pending',
      token: String(token),
      idempotency_key: idempotencyKey || null,
      table: table.id,
      floor: table.floorId,
      order_id: orderId,
      order_type: settings.orderTypeId,
      order_tax: priced.orderTax?.id ?? null,
      payment_type: method.id,
      gateway: method.gateway,
      intent_id: intent?.intentId ?? null,
      total: priced.totals.total,
      tax_amount: priced.totals.taxAmount,
      tax_rows: priced.totals.taxRows.map((row) => ({ tax: row.tax.id, amount: row.amount })),
      currency: settings.currency,
      timezone: settings.timezone,
      customer_name: customerName,
      notes: note,
      items,
      kitchens,
      quote: publicQuote(priced, settings.currency),
      payment,
      created_at: createdAt,
    },
  });

  return {
    checkoutId,
    gateway: method.gateway,
    quote: publicQuote(priced, settings.currency),
    payment,
  };
}

async function loadCheckout(db, checkoutId, token) {
  const clean = String(checkoutId || '');
  if (!/^[a-z0-9]{24}$/.test(clean)) throw new SelfOrderError(404, 'Order not found.', 'NOT_FOUND');
  const checkout = first(await db.query(`SELECT * FROM type::record('self_order_checkout', $id)`, { id: clean }));
  if (!checkout || String(checkout.token) !== String(token || '')) {
    throw new SelfOrderError(404, 'Order not found.', 'NOT_FOUND');
  }
  return { ...checkout, id: clean };
}

function publicStatus(checkout) {
  return {
    checkoutId: checkout.id,
    status: checkout.status,
    orderNumber: checkout.invoice_display ?? (checkout.invoice_number != null ? String(checkout.invoice_number) : null),
    quote: checkout.quote,
    message: checkout.status === 'failed' ? checkout.error ?? null : null,
    orderReady: false,
  };
}

/** Kitchen statuses that mean the order is still being prepared. */
const INCOMPLETE_KITCHEN_STATUSES = ['waiting', 'pending', 'in_progress'];

/**
 * True once every kitchen stage for the order is terminal (or the order has no
 * kitchen work). Mirrors the order-display page's readiness classification.
 */
async function isOrderReady(db, orderId) {
  const kitchenRows = rows(
    await db.query(`SELECT status FROM order_item_kitchen WHERE order_item.order = $orderId`, {
      orderId: toRecord('order', keyPart(orderId)),
    }),
  );
  if (kitchenRows.length === 0) return true;
  return !kitchenRows.some((row) => INCOMPLETE_KITCHEN_STATUSES.includes(String(row.status)));
}

async function getCheckoutStatus(db, checkoutId, token) {
  const checkout = await loadCheckout(db, checkoutId, token);
  const status = publicStatus(checkout);
  if (checkout.status === 'submitted' && checkout.order_id) {
    try {
      status.orderReady = await isOrderReady(db, String(checkout.order_id));
    } catch {
      // Readiness is best-effort; a lookup failure must not break the status call.
      status.orderReady = false;
    }
  }
  return status;
}

/** Push the paid order to the POS through the sync protocol (idempotent per checkout). */
async function submitToPos(db, checkout) {
  const createdAt = checkout.created_at instanceof Date ? checkout.created_at.toISOString() : String(checkout.created_at);
  const paidAt = new Date().toISOString();
  const orderId = String(checkout.order_id);
  const day = businessDay(checkout.timezone, new Date(createdAt));
  const opBase = `self-order:${checkout.id}`;
  const seqBase = Date.now() * 10;
  const tags = ['Normal', 'QR Order', ...(checkout.gateway === 'test' ? ['Test Payment'] : [])];
  const notes = [
    checkout.customer_name ? `QR order — ${checkout.customer_name}` : 'QR order',
    checkout.notes,
  ].filter(Boolean).join('\n');

  const order = {
    id: orderId,
    status: 'In Progress',
    covers: 1,
    floor: checkout.floor ?? null,
    table: checkout.table,
    order_type: checkout.order_type,
    customer: null,
    user: null,
    items: checkout.items.map((item) => item.id),
    tags,
    notes,
    tax: checkout.order_tax ?? null,
    service_charge: 0,
    service_charge_amount: 0,
    service_charge_type: 'Percent',
    tax_amount: 0,
    discount_amount: 0,
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
    owner_terminal_id: TERMINAL_ID,
    owner_heartbeat_at: createdAt,
    server_version: 1,
  };

  const orderKey = keyPart(orderId);
  const taxRows = (checkout.tax_rows || []).map((row) => ({
    id: `order_tax:${orderKey}_${keyPart(row.tax)}`,
    order: orderId,
    tax: String(row.tax),
    amount: Number(row.amount),
  }));
  const paymentId = `order_payment:${orderKey}_self`;
  const operations = [
    {
      operationType: 'CREATE_RECORD',
      aggregateType: 'order',
      aggregateId: orderId,
      expectedVersion: 0,
      payload: {
        table: 'order',
        recordId: orderId,
        data: order,
        items: checkout.items,
        kitchens: checkout.kitchens,
        businessDay: day,
        terminalCode: 'QR',
      },
    },
    {
      operationType: 'REPLACE_ORDER_RELATION',
      aggregateType: 'order',
      aggregateId: orderId,
      expectedVersion: 1,
      payload: {
        table: 'order_tax',
        relation: 'order_taxes',
        orderId,
        recordId: orderId,
        rows: taxRows,
        data: { tax_amount: Number(checkout.tax_amount || 0), updated_at: paidAt, owner_heartbeat_at: paidAt },
      },
    },
    {
      operationType: 'CREATE_PAYMENT',
      aggregateType: 'order',
      aggregateId: orderId,
      expectedVersion: 2,
      payload: {
        table: 'order_payment',
        recordId: paymentId,
        orderId,
        data: {
          id: paymentId,
          order: orderId,
          amount: Number(checkout.total),
          payable: Number(checkout.total),
          payment_type: checkout.payment_type,
          comments: checkout.gateway === 'test'
            ? 'QR self-order (TEST payment — no money collected)'
            : `QR self-order via ${checkout.gateway} ${checkout.intent_id ?? ''}`.trim(),
          created_at: paidAt,
        },
      },
    },
    {
      operationType: 'MERGE_RECORD',
      aggregateType: 'order',
      aggregateId: orderId,
      expectedVersion: 3,
      payload: {
        table: 'order',
        recordId: orderId,
        data: {
          status: 'Paid',
          completed_at: paidAt,
          cashier: null,
          tags: [...tags, 'Paid'],
          owner_terminal_id: null,
          updated_at: paidAt,
          owner_heartbeat_at: paidAt,
        },
      },
    },
  ].map((op, index) => ({
    ...op,
    operationId: `${opBase}:${index}`,
    terminalId: TERMINAL_ID,
    sequence: seqBase + index,
    createdAt: paidAt,
  }));

  const result = await syncService.push(db, {
    terminalId: TERMINAL_ID,
    scopeId: day,
    actorId: 'system:self-order',
    metadata: { name: 'QR Self-Order', kind: 'self-order' },
    operations,
  });
  if (result.conflicts?.length) {
    const reason = result.conflicts.map((c) => `${c.code}: ${c.message}`).join('; ');
    throw new Error(`POS rejected the order (${reason})`);
  }
  const assignment = (result.assignments || []).find((a) => a.aggregateId === orderId);
  return {
    invoiceNumber: assignment?.invoiceNumber ?? null,
    invoiceDisplay: assignment?.invoiceDisplay ?? (assignment?.invoiceNumber != null ? String(assignment.invoiceNumber) : null),
  };
}

const finalizing = new Map();

async function confirmCheckout(db, checkoutId, token) {
  const checkout = await loadCheckout(db, checkoutId, token);
  if (checkout.status === 'submitted') return publicStatus(checkout);
  if (checkout.status === 'expired') throw new SelfOrderError(410, 'This checkout has expired. Please order again.', 'EXPIRED');

  // One confirmation at a time per checkout (double taps, webhook + client).
  if (finalizing.has(checkout.id)) return finalizing.get(checkout.id);
  const run = (async () => {
    let paid = checkout.status === 'paid';
    if (!paid) {
      if (checkout.gateway === 'test') {
        const settings = await loadSettings(db);
        if (!settings.testMode) throw new SelfOrderError(402, 'Test payments are turned off.', 'TEST_DISABLED');
        paid = true;
      } else {
        const ref = {
          gateway: checkout.gateway,
          intentId: checkout.intent_id,
          orderId: checkout.order_id,
          paymentTypeId: checkout.payment_type,
        };
        if (checkout.gateway === 'paypal') {
          await payments.capture(ref).catch(() => undefined); // already-captured orders still verify below
        }
        const verified = await payments.verify(ref);
        paid = verified?.status === 'paid' || verified?.status === 'authorized';
        if (!paid) {
          throw new SelfOrderError(402, `Payment not completed (status: ${verified?.status ?? 'unknown'}).`, 'NOT_PAID');
        }
      }
      await db.query(`UPDATE type::record('self_order_checkout', $id) MERGE { status: 'paid', paid_at: time::now() }`, {
        id: checkout.id,
      });
      checkout.status = 'paid';
    }

    try {
      const assigned = await submitToPos(db, checkout);
      await db.query(
        `UPDATE type::record('self_order_checkout', $id) MERGE {
           status: 'submitted', submitted_at: time::now(), error: NONE,
           invoice_number: $number, invoice_display: $display
         }`,
        { id: checkout.id, number: assigned.invoiceNumber, display: assigned.invoiceDisplay },
      );
      return publicStatus({ ...checkout, status: 'submitted', invoice_number: assigned.invoiceNumber, invoice_display: assigned.invoiceDisplay });
    } catch (err) {
      // Paid but not yet in the POS: keep `paid` so a retry (or staff) can resubmit.
      console.error('[self-order] submit to POS failed', checkout.id, err.message);
      await db.query(`UPDATE type::record('self_order_checkout', $id) MERGE { error: $error }`, {
        id: checkout.id,
        error: String(err.message || err).slice(0, 500),
      });
      throw new SelfOrderError(
        502,
        'Your payment went through, but we could not send the order to the kitchen yet. Please show this screen to a staff member.',
        'SUBMIT_FAILED',
      );
    }
  })();
  finalizing.set(checkout.id, run);
  try {
    return await run;
  } finally {
    finalizing.delete(checkout.id);
  }
}

/* ------------------------------------------------------------------ admin */

async function adminConfig(db) {
  await ensureSchema(db);
  const settings = await loadSettings(db);
  const [tables, paymentTypes, orderTypes, taxes, catalog] = await Promise.all([
    listTables(db),
    loadPaymentTypes(db),
    db.query(`SELECT id, name, priority FROM order_type WHERE deleted_at = NONE OR deleted_at = NULL ORDER BY priority ASC`),
    db.query(`SELECT id, name, rate FROM tax WHERE deleted_at = NONE OR deleted_at = NULL`),
    getCatalog(db, settings.timezone),
  ]);
  const paidAwaitingPos = rows(
    await db.query(`SELECT id, total, created_at, error FROM self_order_checkout WHERE status = 'paid' ORDER BY created_at DESC LIMIT 20`),
  ).map((row) => ({ id: keyPart(idOf(row.id)), total: row.total, createdAt: row.created_at, error: row.error ?? null }));
  return {
    settings,
    tables,
    paymentTypes,
    orderTypes: rows(orderTypes).map((o) => ({ id: idOf(o.id), name: String(o.name ?? '') })),
    taxes: rows(taxes).map((t) => ({ id: idOf(t.id), name: String(t.name ?? ''), rate: Number(t.rate || 0) })),
    categories: catalog.categories,
    defaultHiddenCategoryIds: catalog.modifierOnlyCategoryIds,
    paidAwaitingPos,
  };
}

/** Staff retry for a paid checkout whose POS submit failed. */
async function retryCheckout(db, checkoutId) {
  const checkout = first(await db.query(`SELECT token FROM type::record('self_order_checkout', $id)`, { id: String(checkoutId) }));
  if (!checkout) throw new SelfOrderError(404, 'Checkout not found', 'NOT_FOUND');
  return confirmCheckout(db, checkoutId, checkout.token);
}

/** Drop unpaid checkouts older than the TTL. */
async function expireStaleCheckouts(db) {
  await ensureSchema(db);
  await db.query(
    `UPDATE self_order_checkout SET status = 'expired'
     WHERE status = 'pending' AND created_at < $cutoff`,
    { cutoff: new Date(Date.now() - CHECKOUT_TTL_MS).toISOString() },
  );
}

module.exports = {
  SelfOrderError,
  businessDay,
  getPublicMenu,
  quote,
  startCheckout,
  confirmCheckout,
  getCheckoutStatus,
  adminConfig,
  saveSettings,
  updateTable,
  retryCheckout,
  expireStaleCheckouts,
};
