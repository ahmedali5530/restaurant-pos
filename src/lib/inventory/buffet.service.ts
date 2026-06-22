import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {BuffetMenu, BuffetMenuItem, BuffetSessionType} from "@/api/model/buffet_menu.ts";
import {
  BuffetConsumptionLog,
  BuffetSession,
  BuffetSessionStatus,
  BuffetSnapshotType,
  BuffetGuestCountType,
} from "@/api/model/buffet_session.ts";
import {Recipe} from "@/api/model/recipe.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {
  computeBuffetLine,
  computeBuffetSessionAnalytics,
  validateBuffetClosing,
  type BuffetLineComputed,
  type BuffetSessionAnalytics,
} from "@/lib/inventory/buffet.calculations.ts";
import {
  completeProductionBatch,
  getProductionBatch,
  getRecipe,
} from "@/lib/inventory/production.service.ts";
import {toStoreRecordId} from "@/lib/inventory/stock_transfer.service.ts";
import {nowSurrealDateTime} from "@/lib/datetime.ts";
import {fetchNextSequentialNumber} from "@/utils/recordNumbers.ts";
import {toRecordId} from "@/lib/utils.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type BuffetMenuItemInput = {
  recipeId: string;
  perGuestQty: number;
  sortOrder?: number;
};

export type BuffetMenuInput = {
  name: string;
  code?: string;
  sessionType: BuffetSessionType;
  isActive?: boolean;
  notes?: string;
  items: BuffetMenuItemInput[];
};

export type BuffetSessionInput = {
  menuId: string;
  storeId: string;
  businessDate: string;
  sessionType: BuffetSessionType;
  expectedGuests: number;
  buffetPrice: number;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  notes?: string;
};

export type BuffetSessionListFilters = {
  storeId?: string;
  status?: BuffetSessionStatus;
  sessionType?: BuffetSessionType;
  dateFrom?: string;
  dateTo?: string;
};

export type BuffetClosingLineInput = {
  itemId: string;
  leftoverQty: number;
  wasteQty: number;
  staffMealQty: number;
  wasteReason?: string;
};

export type BuffetReportLine = {
  sessionId: string;
  sessionNumber: string;
  businessDate: string;
  sessionType: BuffetSessionType;
  storeName: string;
  expectedGuests: number;
  actualGuests: number;
  buffetPrice: number;
  totalSales: number;
  totalFoodCost: number;
  costPerGuest: number;
  wastePercent: number;
  totalOverproduction: number;
  profit: number;
  profitMargin: number;
  status: BuffetSessionStatus;
};

const normalizeRecordKey = (id: unknown, table: string): string => {
  const key = recordToString(id);
  return key.includes(":") ? key : `${table}:${key}`;
};

const toMenuRecordId = (id: unknown) =>
  toRecordId(normalizeRecordKey(id, Tables.buffet_menus));

const toMenuItemRecordId = (id: unknown) =>
  toRecordId(normalizeRecordKey(id, Tables.buffet_menu_items));

const toSessionRecordId = (id: unknown) =>
  toRecordId(normalizeRecordKey(id, Tables.buffet_sessions));

const toRecipeRecordId = (id: unknown) =>
  toRecordId(normalizeRecordKey(id, Tables.recipes));

const toItemRecordId = (itemId: unknown) =>
  toRecordId(normalizeRecordKey(itemId, Tables.inventory_items));

const toUserRecordId = (userId: unknown) =>
  toRecordId(normalizeRecordKey(userId, Tables.users));

const toBatchRecordId = (id: unknown) =>
  toRecordId(normalizeRecordKey(id, Tables.production_batches));

const safeNumber = (value: unknown) => Number(value) || 0;

const unwrapRows = <T>(rows: unknown): T[] => {
  if (!rows) return [];
  if (Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])) {
    return rows[0] as T[];
  }
  return (rows as T[]) ?? [];
};

const generateSessionNumber = async (db: DatabaseClient): Promise<string> => {
  const [rows] = await db.query(
    `SELECT count() AS count FROM ${Tables.buffet_sessions} GROUP ALL`
  );
  const count = (rows as {count?: number}[])?.[0]?.count ?? 0;
  return `BS-${String(Number(count) + 1).padStart(6, "0")}`;
};

const getPrimaryOutputItemId = (recipe: Recipe): string | null => {
  const primary = recipe.outputs?.find((o) => o.is_primary)
    ?? recipe.outputs?.find((o) => {
      const primaryId = recordToString(recipe.primary_output?.id ?? recipe.primary_output);
      return primaryId && recordToString(o.id) === primaryId;
    });
  return recordToString(primary?.item?.id ?? primary?.item) ?? null;
};

const getPrimaryOutputQty = (batch: {
  outputs?: Array<{item: {id?: unknown}; quantity: number; disposition: string}>;
}, itemId: string): number => {
  const output = batch.outputs?.find(
    (o) =>
      recordToString(o.item?.id ?? o.item) === itemId
      && o.disposition === "inventory"
  );
  return safeNumber(output?.quantity);
};

// --- Menu CRUD ---

export const listBuffetMenus = async (
  db: DatabaseClient,
  {page = 0, pageSize = 10, activeOnly = false}: {
    page?: number;
    pageSize?: number;
    activeOnly?: boolean;
  } = {}
): Promise<{total: number; data: BuffetMenu[]}> => {
  const where = activeOnly ? "WHERE is_active = true" : "";
  const params = {limit: pageSize, start: page * pageSize};

  const [[countRows], [listRows]] = await Promise.all([
    db.query(`SELECT count() AS count FROM ${Tables.buffet_menus} ${where} GROUP ALL`, params),
    db.query(
      `SELECT *,
        (SELECT * FROM ${Tables.buffet_menu_items} WHERE menu = $parent.id ORDER BY sort_order FETCH recipe) AS items
      FROM ${Tables.buffet_menus}
      ${where}
      ORDER BY name ASC
      LIMIT $limit START $start
      FETCH created_by`,
      params
    ),
  ]);

  return {
    total: (countRows as {count?: number}[])?.[0]?.count ?? 0,
    data: (listRows ?? []) as BuffetMenu[],
  };
};

export const getBuffetMenu = async (db: DatabaseClient, id: string): Promise<BuffetMenu | null> => {
  const recId = toMenuRecordId(id);

  const [[header], [items]] = await Promise.all([
    db.query(`SELECT * FROM ONLY $id FETCH created_by`, {id: recId}),
    db.query(
      `SELECT * FROM ${Tables.buffet_menu_items} WHERE menu = $id ORDER BY sort_order FETCH recipe`,
      {id: recId}
    ),
  ]);

  if (!header) return null;

  return {
    ...(header as BuffetMenu),
    items: (items ?? []) as BuffetMenuItem[],
  };
};

const createMenuChildren = async (
  db: DatabaseClient,
  menuId: string,
  items: BuffetMenuItemInput[]
) => {
  const menuRef = toMenuRecordId(menuId);
  await Promise.all(
    items.map((line, index) =>
      db.create(Tables.buffet_menu_items, {
        menu: menuRef,
        recipe: toRecipeRecordId(line.recipeId),
        per_guest_qty: Number(line.perGuestQty),
        sort_order: line.sortOrder ?? index,
      })
    )
  );
};

export const createBuffetMenu = async (
  db: DatabaseClient,
  input: BuffetMenuInput,
  userId: string
): Promise<BuffetMenu> => {
  if (!input.items.length) throw new Error("Menu must have at least one item");

  const [created] = await db.create(Tables.buffet_menus, {
    name: input.name.trim(),
    code: input.code?.trim() || null,
    session_type: input.sessionType,
    is_active: input.isActive !== false,
    notes: input.notes?.trim() || null,
    created_by: toUserRecordId(userId),
    created_at: nowSurrealDateTime(),
  });

  const menuId = recordToString(created?.id);
  if (!menuId) throw new Error("Failed to create buffet menu");

  await createMenuChildren(db, menuId, input.items);

  const result = await getBuffetMenu(db, menuId);
  if (!result) throw new Error("Failed to load created buffet menu");
  return result;
};

export const updateBuffetMenu = async (
  db: DatabaseClient,
  id: string,
  input: BuffetMenuInput
): Promise<BuffetMenu> => {
  if (!input.items.length) throw new Error("Menu must have at least one item");

  const recId = toMenuRecordId(id);
  await db.merge(recId, {
    name: input.name.trim(),
    code: input.code?.trim() || null,
    session_type: input.sessionType,
    is_active: input.isActive !== false,
    notes: input.notes?.trim() || null,
  });

  await db.query(`DELETE ${Tables.buffet_menu_items} WHERE menu = $id`, {id: recId});
  await createMenuChildren(db, id, input.items);

  const result = await getBuffetMenu(db, id);
  if (!result) throw new Error("Failed to load updated buffet menu");
  return result;
};

export const deleteBuffetMenu = async (db: DatabaseClient, id: string): Promise<void> => {
  const recId = toMenuRecordId(id);
  await db.query(`DELETE ${Tables.buffet_menu_items} WHERE menu = $id`, {id: recId});
  await db.delete(recId);
};

// --- Session CRUD ---

export const listBuffetSessions = async (
  db: DatabaseClient,
  {
    page = 0,
    pageSize = 10,
    filters = {},
  }: {page?: number; pageSize?: number; filters?: BuffetSessionListFilters} = {}
): Promise<{total: number; data: BuffetSession[]}> => {
  const where: string[] = [];
  const params: Record<string, unknown> = {limit: pageSize, start: page * pageSize};

  if (filters.storeId) {
    where.push("store = $store");
    params.store = toStoreRecordId(filters.storeId);
  }
  if (filters.status) {
    where.push("status = $status");
    params.status = filters.status;
  }
  if (filters.sessionType) {
    where.push("session_type = $sessionType");
    params.sessionType = filters.sessionType;
  }
  if (filters.dateFrom) {
    where.push("business_date >= $dateFrom");
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    where.push("business_date <= $dateTo");
    params.dateTo = filters.dateTo;
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const [[countRows], [listRows]] = await Promise.all([
    db.query(
      `SELECT count() AS count FROM ${Tables.buffet_sessions} ${whereClause} GROUP ALL`,
      params
    ),
    db.query(
      `SELECT * FROM ${Tables.buffet_sessions}
      ${whereClause}
      ORDER BY business_date DESC, created_at DESC
      LIMIT $limit START $start
      FETCH menu, store, created_by, closed_by`,
      params
    ),
  ]);

  return {
    total: (countRows as {count?: number}[])?.[0]?.count ?? 0,
    data: (listRows ?? []) as BuffetSession[],
  };
};

export const getBuffetSession = async (
  db: DatabaseClient,
  id: string
): Promise<BuffetSession | null> => {
  const recId = toSessionRecordId(id);

  const [
    [header],
    [productionBatches],
    [snapshots],
    [guestCounts],
    [wasteLogs],
    [consumptionLogs],
  ] = await Promise.all([
    db.query(
      `SELECT * FROM ONLY $id FETCH menu, store, created_by, closed_by`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.buffet_production_batches} WHERE session = $id FETCH menu_item.recipe, production_batch`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.buffet_stock_snapshots} WHERE session = $id FETCH item, captured_by, production_batch`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.buffet_guest_counts} WHERE session = $id ORDER BY recorded_at DESC FETCH recorded_by`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.buffet_waste_logs} WHERE session = $id FETCH item, created_by`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.buffet_consumption_logs} WHERE session = $id FETCH item`,
      {id: recId}
    ),
  ]);

  if (!header) return null;

  const menuId = recordToString((header as BuffetSession).menu?.id ?? (header as BuffetSession).menu);
  let menu = (header as BuffetSession).menu;
  if (menuId && !menu?.items?.length) {
    const fullMenu = await getBuffetMenu(db, menuId);
    if (fullMenu) menu = fullMenu;
  }

  return {
    ...(header as BuffetSession),
    menu,
    production_batches: (productionBatches ?? []) as BuffetSession["production_batches"],
    snapshots: (snapshots ?? []) as BuffetSession["snapshots"],
    guest_counts: (guestCounts ?? []) as BuffetSession["guest_counts"],
    waste_logs: (wasteLogs ?? []) as BuffetSession["waste_logs"],
    consumption_logs: (consumptionLogs ?? []) as BuffetSession["consumption_logs"],
  };
};

export const createBuffetSession = async (
  db: DatabaseClient,
  input: BuffetSessionInput,
  userId: string
): Promise<BuffetSession> => {
  const menu = await getBuffetMenu(db, input.menuId);
  if (!menu) throw new Error("Buffet menu not found");

  const sessionNumber = await generateSessionNumber(db);

  const [created] = await db.create(Tables.buffet_sessions, {
    menu: toMenuRecordId(input.menuId),
    store: toStoreRecordId(input.storeId),
    business_date: input.businessDate,
    session_type: input.sessionType,
    status: "draft",
    expected_guests: Number(input.expectedGuests),
    actual_guests: 0,
    buffet_price: Number(input.buffetPrice),
    scheduled_start: input.scheduledStart ? input.scheduledStart.toISOString() : null,
    scheduled_end: input.scheduledEnd ? input.scheduledEnd.toISOString() : null,
    session_number: sessionNumber,
    posted_to_ledger: false,
    notes: input.notes?.trim() || null,
    created_by: toUserRecordId(userId),
    created_at: nowSurrealDateTime(),
  });

  const sessionId = recordToString(created?.id);
  if (!sessionId) throw new Error("Failed to create buffet session");

  await db.create(Tables.buffet_guest_counts, {
    session: toSessionRecordId(sessionId),
    count_type: "expected",
    guest_count: Number(input.expectedGuests),
    recorded_at: nowSurrealDateTime(),
    recorded_by: toUserRecordId(userId),
  });

  const result = await getBuffetSession(db, sessionId);
  if (!result) throw new Error("Failed to load created buffet session");
  return result;
};

// --- Production plan ---

export const generateProductionPlan = async (
  db: DatabaseClient,
  sessionId: string
): Promise<BuffetSession> => {
  const session = await getBuffetSession(db, sessionId);
  if (!session) throw new Error("Session not found");
  if (["closed", "voided"].includes(session.status)) {
    throw new Error("Cannot plan a closed or voided session");
  }

  const menu = session.menu;
  if (!menu?.items?.length) throw new Error("Menu has no items");

  const storeId = recordToString(session.store?.id ?? session.store);
  if (!storeId) throw new Error("Session store not found");

  await db.query(
    `DELETE ${Tables.buffet_production_batches} WHERE session = $id AND status = 'planned'`,
    {id: toSessionRecordId(sessionId)}
  );

  const sessionRef = toSessionRecordId(sessionId);
  const expectedGuests = session.expected_guests;

  for (const menuItem of menu.items) {
    const recipeId = recordToString(menuItem.recipe?.id ?? menuItem.recipe);
    if (!recipeId) continue;

    const recipe = await getRecipe(db, recipeId);
    if (!recipe?.is_active) throw new Error(`Recipe ${recipe?.name ?? recipeId} is not active`);

    const plannedQty = Number(menuItem.per_guest_qty) * expectedGuests;

    await db.create(Tables.buffet_production_batches, {
      session: sessionRef,
      menu_item: toMenuItemRecordId(menuItem.id),
      production_batch: null,
      planned_qty: plannedQty,
      status: "planned",
    });
  }

  await db.merge(sessionRef, {status: "planned"});

  const result = await getBuffetSession(db, sessionId);
  if (!result) throw new Error("Failed to load session after planning");
  return result;
};

export const completeSessionProduction = async (
  db: DatabaseClient,
  sessionId: string,
  userId: string
): Promise<BuffetSession> => {
  const session = await getBuffetSession(db, sessionId);
  if (!session) throw new Error("Session not found");

  const storeId = recordToString(session.store?.id ?? session.store);
  if (!storeId) throw new Error("Session store not found");

  const plannedBatches = session.production_batches?.filter((b) => b.status === "planned") ?? [];

  for (const row of plannedBatches) {
    const recipeId = recordToString(
      row.menu_item?.recipe?.id ?? row.menu_item?.recipe
    );
    if (!recipeId) continue;

    const batch = await completeProductionBatch(
      db,
      {
        recipeId,
        storeId,
        producedQty: row.planned_qty,
        notes: `Buffet session ${session.session_number}`,
      },
      userId
    );

    const batchRowId = recordToString(row.id);
    const productionBatchId = recordToString(batch.id);
    if (!batchRowId || !productionBatchId) continue;

    await db.merge(toRecordId(batchRowId), {
      production_batch: toBatchRecordId(productionBatchId),
      status: "completed",
    });
  }

  const result = await getBuffetSession(db, sessionId);
  if (result) return result;

  return session;
};

export const skipProductionBatch = async (
  db: DatabaseClient,
  batchRowId: string
): Promise<void> => {
  await db.merge(toRecordId(batchRowId), {status: "skipped"});
};

// --- Snapshots & guests ---

export const captureStockSnapshot = async (
  db: DatabaseClient,
  sessionId: string,
  itemId: string,
  snapshotType: BuffetSnapshotType,
  quantity: number,
  userId: string,
  options?: {productionBatchId?: string; notes?: string}
): Promise<void> => {
  const sessionRef = toSessionRecordId(sessionId);

  const [existing] = await db.query(
    `SELECT id FROM ${Tables.buffet_stock_snapshots}
    WHERE session = $session AND item = $item AND snapshot_type = $type`,
    {
      session: sessionRef,
      item: toItemRecordId(itemId),
      type: snapshotType,
    }
  );

  const existingId = unwrapRows<{id: unknown}>(existing)[0]?.id;

  const payload = {
    session: sessionRef,
    item: toItemRecordId(itemId),
    snapshot_type: snapshotType,
    quantity: Number(quantity),
    captured_at: nowSurrealDateTime(),
    captured_by: toUserRecordId(userId),
    production_batch: options?.productionBatchId
      ? toBatchRecordId(options.productionBatchId)
      : null,
    notes: options?.notes?.trim() || null,
  };

  if (existingId) {
    await db.merge(toRecordId(existingId), payload);
  } else {
    await db.create(Tables.buffet_stock_snapshots, payload);
  }
};

export const recordGuestCount = async (
  db: DatabaseClient,
  sessionId: string,
  guestCount: number,
  countType: BuffetGuestCountType,
  userId: string
): Promise<BuffetSession> => {
  const sessionRef = toSessionRecordId(sessionId);

  await db.create(Tables.buffet_guest_counts, {
    session: sessionRef,
    count_type: countType,
    guest_count: Number(guestCount),
    recorded_at: nowSurrealDateTime(),
    recorded_by: toUserRecordId(userId),
  });

  if (countType === "actual") {
    await db.merge(sessionRef, {actual_guests: Number(guestCount)});
  }

  const result = await getBuffetSession(db, sessionId);
  if (!result) throw new Error("Failed to load session after guest count");
  return result;
};

export const startBuffetSession = async (
  db: DatabaseClient,
  sessionId: string
): Promise<BuffetSession> => {
  await db.merge(toSessionRecordId(sessionId), {
    status: "in_progress",
    started_at: nowSurrealDateTime(),
  });

  const result = await getBuffetSession(db, sessionId);
  if (!result) throw new Error("Failed to load session");
  return result;
};

export const beginClosing = async (
  db: DatabaseClient,
  sessionId: string
): Promise<BuffetSession> => {
  await db.merge(toSessionRecordId(sessionId), {status: "closing"});

  const result = await getBuffetSession(db, sessionId);
  if (!result) throw new Error("Failed to load session");
  return result;
};

// --- Closing ---

const buildClosingLines = async (
  db: DatabaseClient,
  session: BuffetSession,
  staffMealByItem: Map<string, number>
): Promise<BuffetLineComputed[]> => {
  const menuItems = session.menu?.items ?? [];
  const actualGuests = session.actual_guests || session.expected_guests;

  const snapshots = session.snapshots ?? [];
  const getSnapshotQty = (itemId: string, type: BuffetSnapshotType) => {
    const snap = snapshots.find(
      (s) =>
        recordToString(s.item?.id ?? s.item) === itemId
        && s.snapshot_type === type
    );
    return snap ? safeNumber(snap.quantity) : type === "end" ? null : 0;
  };

  const wasteByItem = new Map<string, number>();
  for (const log of session.waste_logs ?? []) {
    const itemId = recordToString(log.item?.id ?? log.item);
    if (itemId) {
      wasteByItem.set(itemId, (wasteByItem.get(itemId) ?? 0) + safeNumber(log.quantity));
    }
  }

  const lines: BuffetLineComputed[] = [];

  for (const menuItem of menuItems) {
    const recipeId = recordToString(menuItem.recipe?.id ?? menuItem.recipe);
    if (!recipeId) continue;

    const recipe = menuItem.recipe?.outputs
      ? menuItem.recipe
      : await getRecipe(db, recipeId);
    if (!recipe) continue;

    const itemId = getPrimaryOutputItemId(recipe);
    if (!itemId) continue;

    const itemName = recipe.outputs?.find(
      (o) => recordToString(o.item?.id ?? o.item) === itemId
    )?.item?.name;

    let producedQty = 0;
    let totalFoodCost = 0;

    const batchRows = session.production_batches?.filter(
      (b) =>
        b.status === "completed"
        && recordToString(b.menu_item?.id ?? b.menu_item) === menuItem.id
    ) ?? [];

    for (const row of batchRows) {
      const batchId = recordToString(row.production_batch?.id ?? row.production_batch);
      if (!batchId) continue;

      const batch = row.production_batch?.outputs
        ? row.production_batch
        : await getProductionBatch(db, batchId);

      if (batch) {
        producedQty += getPrimaryOutputQty(batch, itemId);
        totalFoodCost += safeNumber(batch.total_input_cost);
      }
    }

    const refillQty = snapshots
      .filter(
        (s) =>
          recordToString(s.item?.id ?? s.item) === itemId
          && s.snapshot_type === "refill"
      )
      .reduce((sum, s) => sum + safeNumber(s.quantity), 0);

    const lineInput = {
      itemId,
      itemName,
      perGuestQty: safeNumber(menuItem.per_guest_qty),
      producedQty,
      startQty: getSnapshotQty(itemId, "start") as number,
      refillQty,
      endQty: getSnapshotQty(itemId, "end"),
      wasteQty: wasteByItem.get(itemId) ?? 0,
      staffMealQty: staffMealByItem.get(itemId) ?? 0,
      totalFoodCost,
    };

    lines.push(computeBuffetLine(lineInput, actualGuests));
  }

  return lines;
};

export const saveClosingInputs = async (
  db: DatabaseClient,
  sessionId: string,
  lines: BuffetClosingLineInput[],
  userId: string
): Promise<BuffetSession> => {
  const sessionRef = toSessionRecordId(sessionId);

  await db.query(`DELETE ${Tables.buffet_waste_logs} WHERE session = $id`, {id: sessionRef});

  for (const line of lines) {
    await captureStockSnapshot(
      db,
      sessionId,
      line.itemId,
      "end",
      line.leftoverQty,
      userId
    );

    if (line.wasteQty > 0) {
      await db.create(Tables.buffet_waste_logs, {
        session: sessionRef,
        item: toItemRecordId(line.itemId),
        quantity: Number(line.wasteQty),
        reason: line.wasteReason?.trim() || null,
        created_at: nowSurrealDateTime(),
        created_by: toUserRecordId(userId),
      });
    }
  }

  const staffMealByItem = new Map(lines.map((l) => [l.itemId, l.staffMealQty]));
  const session = await getBuffetSession(db, sessionId);
  if (!session) throw new Error("Session not found");

  const computedLines = await buildClosingLines(db, session, staffMealByItem);

  await db.query(`DELETE ${Tables.buffet_consumption_logs} WHERE session = $id`, {id: sessionRef});

  for (const line of computedLines) {
    await db.create(Tables.buffet_consumption_logs, {
      session: sessionRef,
      item: toItemRecordId(line.itemId),
      produced_qty: line.producedQty,
      leftover_qty: line.endQty ?? 0,
      total_consumed: line.totalConsumed,
      guest_consumption: line.guestConsumption,
      waste_qty: line.wasteQty,
      staff_meal_qty: line.staffMealQty,
      theoretical_guest_qty: line.theoreticalGuestQty,
      variance_qty: line.varianceQty,
      unit_food_cost: line.unitFoodCost,
      total_food_cost: line.totalFoodCost,
      posted_to_ledger: false,
    });
  }

  const result = await getBuffetSession(db, sessionId);
  if (!result) throw new Error("Failed to load session after saving closing inputs");
  return result;
};

export const computeSessionClosing = async (
  db: DatabaseClient,
  sessionId: string
): Promise<{lines: BuffetLineComputed[]; analytics: BuffetSessionAnalytics}> => {
  const session = await getBuffetSession(db, sessionId);
  if (!session) throw new Error("Session not found");

  const staffMealByItem = new Map<string, number>();
  for (const log of session.consumption_logs ?? []) {
    const itemId = recordToString(log.item?.id ?? log.item);
    if (itemId) staffMealByItem.set(itemId, safeNumber(log.staff_meal_qty));
  }

  const lines = await buildClosingLines(db, session, staffMealByItem);
  const analytics = computeBuffetSessionAnalytics(
    lines,
    session.actual_guests || session.expected_guests,
    session.buffet_price
  );

  return {lines, analytics};
};

const postBuffetToLedger = async (
  db: DatabaseClient,
  session: BuffetSession,
  userId: string
) => {
  const storeId = recordToString(session.store?.id ?? session.store);
  if (!storeId) throw new Error("Session store not found");

  const consumptionLogs = session.consumption_logs ?? [];
  const entries: Array<{itemId: string; quantity: number; source: string; logId: string; field: string}> = [];

  for (const log of consumptionLogs) {
    const itemId = recordToString(log.item?.id ?? log.item);
    const logId = recordToString(log.id);
    if (!itemId || !logId) continue;

    if (safeNumber(log.guest_consumption) > 0) {
      entries.push({
        itemId,
        quantity: safeNumber(log.guest_consumption),
        source: "buffet_guest",
        logId,
        field: "guest",
      });
    }
    if (safeNumber(log.waste_qty) > 0) {
      entries.push({
        itemId,
        quantity: safeNumber(log.waste_qty),
        source: "buffet_waste",
        logId,
        field: "waste",
      });
    }
    if (safeNumber(log.staff_meal_qty) > 0) {
      entries.push({
        itemId,
        quantity: safeNumber(log.staff_meal_qty),
        source: "buffet_staff_meal",
        logId,
        field: "staff",
      });
    }
  }

  if (entries.length === 0) return;

  const invoiceNumber = await fetchNextSequentialNumber(db, Tables.inventory_wastes, "invoice_number");
  const [wasteHeader] = await db.create(Tables.inventory_wastes, {
    created_at: nowSurrealDateTime(),
    created_by: toUserRecordId(userId),
    invoice_number: invoiceNumber,
  });

  const wasteId = recordToString(wasteHeader?.id);
  if (!wasteId) throw new Error("Failed to create waste header");

  const wasteItemRefs: unknown[] = [];
  const storeRef = toStoreRecordId(storeId);

  for (const entry of entries) {
    const [wasteItem] = await db.create(Tables.inventory_waste_items, {
      waste: toRecordId(wasteId),
      item: toItemRecordId(entry.itemId),
      store: storeRef,
      quantity: entry.quantity,
      comments: `Buffet session ${session.session_number} (${entry.source})`,
      source: entry.source,
    });

    if (wasteItem?.id) {
      wasteItemRefs.push(wasteItem.id);

      if (entry.field === "waste") {
        const wasteLog = session.waste_logs?.find(
          (w) => recordToString(w.item?.id ?? w.item) === entry.itemId
        );
        if (wasteLog?.id) {
          await db.merge(toRecordId(wasteLog.id), {ledger_waste_item: wasteItem.id});
        }
      }
    }
  }

  await db.merge(toRecordId(wasteId), {items: wasteItemRefs});

  const sessionRef = toSessionRecordId(session.id);
  await db.query(
    `UPDATE ${Tables.buffet_consumption_logs} SET posted_to_ledger = true WHERE session = $id`,
    {id: sessionRef}
  );
  await db.merge(sessionRef, {posted_to_ledger: true});
};

export const closeBuffetSession = async (
  db: DatabaseClient,
  sessionId: string,
  userId: string
): Promise<BuffetSession> => {
  const session = await getBuffetSession(db, sessionId);
  if (!session) throw new Error("Session not found");
  if (session.status === "closed") throw new Error("Session is already closed");

  const staffMealByItem = new Map<string, number>();
  for (const log of session.consumption_logs ?? []) {
    const itemId = recordToString(log.item?.id ?? log.item);
    if (itemId) staffMealByItem.set(itemId, safeNumber(log.staff_meal_qty));
  }

  const lines = await buildClosingLines(db, session, staffMealByItem);
  const snapshots = session.snapshots ?? [];
  const hasEndSnapshots = (session.menu?.items ?? []).every((menuItem) => {
    const recipe = menuItem.recipe;
    const itemId = recipe ? getPrimaryOutputItemId(recipe) : null;
    if (!itemId) return true;
    return snapshots.some(
      (s) =>
        recordToString(s.item?.id ?? s.item) === itemId
        && s.snapshot_type === "end"
    );
  });

  const pendingBatches =
    session.production_batches?.filter((b) => b.status === "planned").length ?? 0;

  const validation = validateBuffetClosing({lines, hasEndSnapshots, pendingBatches});
  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  const sessionRef = toSessionRecordId(sessionId);
  await db.query(`DELETE ${Tables.buffet_consumption_logs} WHERE session = $id`, {id: sessionRef});

  for (const line of lines) {
    await db.create(Tables.buffet_consumption_logs, {
      session: sessionRef,
      item: toItemRecordId(line.itemId),
      produced_qty: line.producedQty,
      leftover_qty: line.endQty ?? 0,
      total_consumed: line.totalConsumed,
      guest_consumption: line.guestConsumption,
      waste_qty: line.wasteQty,
      staff_meal_qty: line.staffMealQty,
      theoretical_guest_qty: line.theoreticalGuestQty,
      variance_qty: line.varianceQty,
      unit_food_cost: line.unitFoodCost,
      total_food_cost: line.totalFoodCost,
      posted_to_ledger: false,
    });
  }

  const freshSession = await getBuffetSession(db, sessionId);
  if (!freshSession) throw new Error("Session not found");

  await postBuffetToLedger(db, freshSession, userId);

  await db.merge(toSessionRecordId(sessionId), {
    status: "closed",
    closed_at: nowSurrealDateTime(),
    closed_by: toUserRecordId(userId),
  });

  const result = await getBuffetSession(db, sessionId);
  if (!result) throw new Error("Failed to load closed session");
  return result;
};

// --- Inventory integration ---

export const fetchBuffetConsumptionTotals = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<number> => {
  const [rows] = await db.query(
    `SELECT math::sum(
      guest_consumption + waste_qty + staff_meal_qty
    ) AS total
    FROM ${Tables.buffet_consumption_logs}
    WHERE item = $item
      AND posted_to_ledger = true
      AND session IN (
        SELECT VALUE id FROM ${Tables.buffet_sessions}
        WHERE store = $store AND status = 'closed'
      )
    GROUP ALL`,
    {item: toItemRecordId(itemId), store: toStoreRecordId(storeId)}
  );

  return safeNumber(unwrapRows<{total?: number}>(rows)[0]?.total);
};

export const fetchBuffetConsumptionLinesForStore = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<Array<{
  id: string;
  sessionNumber: string;
  businessDate: string;
  quantity: number;
  source: string;
  createdAt: string;
}>> => {
  const [rows] = await db.query(
    `SELECT *,
      session.session_number AS session_number,
      session.business_date AS business_date,
      session.closed_at AS closed_at
    FROM ${Tables.buffet_consumption_logs}
    WHERE item = $item
      AND posted_to_ledger = true
      AND session.store = $store
    FETCH session`,
    {item: toItemRecordId(itemId), store: toStoreRecordId(storeId)}
  );

  const lines: Array<{
    id: string;
    sessionNumber: string;
    businessDate: string;
    quantity: number;
    source: string;
    createdAt: string;
  }> = [];

  for (const row of unwrapRows<BuffetConsumptionLog & {
    session_number?: string;
    business_date?: string;
    closed_at?: string;
    session?: BuffetSession;
  }>(rows)) {
    const base = {
      id: recordToString(row.id) ?? "",
      sessionNumber: row.session?.session_number ?? row.session_number ?? "",
      businessDate: row.session?.business_date ?? row.business_date ?? "",
      createdAt: row.session?.closed_at?.toString() ?? row.closed_at?.toString() ?? "",
    };

    if (safeNumber(row.guest_consumption) > 0) {
      lines.push({...base, quantity: safeNumber(row.guest_consumption), source: "buffet_guest"});
    }
    if (safeNumber(row.waste_qty) > 0) {
      lines.push({...base, quantity: safeNumber(row.waste_qty), source: "buffet_waste"});
    }
    if (safeNumber(row.staff_meal_qty) > 0) {
      lines.push({...base, quantity: safeNumber(row.staff_meal_qty), source: "buffet_staff_meal"});
    }
  }

  return lines;
};

// --- Reports ---

export const fetchBuffetReportLines = async (
  db: DatabaseClient,
  filters: BuffetSessionListFilters = {}
): Promise<BuffetReportLine[]> => {
  const {data: sessions} = await listBuffetSessions(db, {
    page: 0,
    pageSize: 10000,
    filters: {...filters, status: filters.status ?? "closed"},
  });

  const lines: BuffetReportLine[] = [];

  for (const session of sessions) {
    const full = await getBuffetSession(db, session.id);
    if (!full) continue;

    const {analytics} = await computeSessionClosing(db, full.id);

    lines.push({
      sessionId: full.id,
      sessionNumber: full.session_number,
      businessDate: full.business_date,
      sessionType: full.session_type,
      storeName: full.store?.name ?? "",
      expectedGuests: full.expected_guests,
      actualGuests: full.actual_guests,
      buffetPrice: full.buffet_price,
      totalSales: analytics.totalSales,
      totalFoodCost: analytics.totalFoodCost,
      costPerGuest: analytics.costPerGuest,
      wastePercent: analytics.wastePercent,
      totalOverproduction: analytics.totalOverproduction,
      profit: analytics.profit,
      profitMargin: analytics.profitMargin,
      status: full.status,
    });
  }

  return lines;
};
