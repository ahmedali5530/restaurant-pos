/**
 * Kitchen reconciliation orchestration.
 *
 * Data flow:
 * 1. generateReconciliation — resolve business window, flag missed days, aggregate movements
 * 2. saveManualInputs — persist physical counts / waste / staff / complimentary, recompute lines
 * 3. verifyReconciliation — lock record, post to inventory_item_waste ledger
 *
 * Primary identity is inventory location (not kitchen). Historical verified and missed
 * records are never updated in place; edits create a new revision.
 */
import {RecordId, StringRecordId} from "surrealdb";
import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {recordIdToString, toQueryRecordId} from "@/api/reports/shared/records.ts";
import {
  KitchenReconciliation,
  KitchenReconciliationStatus,
} from "@/api/model/kitchen_reconciliation.ts";
import {KitchenReconciliationItem} from "@/api/model/kitchen_reconciliation_item.ts";
import {KitchenReconciliationChangeType} from "@/api/model/kitchen_reconciliation_revision.ts";
import {
  buildWindowForBusinessDate,
  enumerateBusinessDates,
  resolveBusinessDateWindow,
} from "@/lib/kitchen/business-date.ts";
import {ClosingCycleWindow, loadClosingCycleConfig} from "@/lib/closing-cycle.ts";
import {computeLine} from "@/lib/kitchen/reconciliation.calculations.ts";
import {nowSurrealDateTime, toJsDate, toSurrealDateTime} from "@/lib/datetime.ts";
import {safeNumber} from "@/lib/utils.ts";
import {fetchNextSequentialNumber} from "@/utils/recordNumbers.ts";
import {postDocument} from "@/lib/inventory/posting.service.ts";
import {toLocationRecordId} from "@/lib/inventory/location.service.ts";
import { publishStockCountCompleted } from "@/integrations/events/publish/ops.ts";
import { entityAfterWrite } from "@/integrations/events/publish/entity.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type ManualLineInput = {
  itemId: string;
  physicalCount?: number | null;
  wasteQty?: number;
  staffMealQty?: number;
  complimentaryQty?: number;
};

type QuantityMap = Map<string, number>;

const toFullRecordIdString = (value: unknown, table: string): string => {
  const raw = recordIdToString(value);
  if (!raw) return "";
  return raw.includes(":") ? raw : `${table}:${raw}`;
};

/**
 * Inventory item ids must be a single `inventory_item:…` key.
 * Enriched `{tb, id: RecordId}` shapes otherwise become `inventory_item:inventory_item:…`
 * and draft saves silently skip every row.
 */
export const normalizeInventoryItemId = (value: unknown): string => {
  if (value == null || value === "") return "";

  if (typeof value === "string") {
    let raw = value.trim();
    const prefix = `${Tables.inventory_items}:`;
    while (raw.startsWith(prefix + prefix) || raw.startsWith(`${prefix}${Tables.inventory_items}:`)) {
      raw = raw.slice(prefix.length);
    }
    if (raw.startsWith(prefix)) return raw;
    if (raw.includes(":")) return raw;
    return `${prefix}${raw}`;
  }

  if (value instanceof StringRecordId || value instanceof RecordId) {
    return normalizeInventoryItemId(value.toString());
  }

  if (typeof value === "object" && value !== null && "id" in value) {
    const inner = (value as {id: unknown}).id;
    if (inner != null && typeof inner === "object") {
      return normalizeInventoryItemId(inner);
    }
    if (typeof inner === "string" && inner) {
      return normalizeInventoryItemId(inner);
    }
  }

  return normalizeInventoryItemId(recordIdToString(value));
};

const toKitchenRecordId = (kitchenId: unknown) =>
  toQueryRecordId(kitchenId, Tables.kitchens);

const toDishRecordId = (dishId: unknown) => toQueryRecordId(dishId, Tables.dishes);

const toInventoryItemRecordId = (itemId: unknown) =>
  toQueryRecordId(normalizeInventoryItemId(itemId) || itemId, Tables.inventory_items);

const toReconciliationRecordId = (reconciliationId: unknown) =>
  toQueryRecordId(reconciliationId, Tables.kitchen_reconciliations);

const toUserRecordId = (userId: unknown) => toQueryRecordId(userId, Tables.users);

const fetchReconciliationItems = async (
  db: DatabaseClient,
  reconciliationId: string
): Promise<KitchenReconciliationItem[]> => {
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliation_items}
      WHERE reconciliation = $reconciliation
    `,
    {reconciliation: toReconciliationRecordId(reconciliationId)}
  );
  const lines = unwrapRows<KitchenReconciliationItem>(rows);
  if (lines.length === 0) return lines;

  const itemIdStrings = Array.from(
    new Set(
      lines
        .map((line) => normalizeInventoryItemId(line.item))
        .filter(Boolean)
    )
  );

  if (itemIdStrings.length === 0) return lines;

  const metaById = new Map<string, {id?: unknown; name?: string; code?: string; uom?: string}>();
  const META_CHUNK = 80;
  try {
    for (let i = 0; i < itemIdStrings.length; i += META_CHUNK) {
      const ids = itemIdStrings
        .slice(i, i + META_CHUNK)
        .map((id) => toInventoryItemRecordId(id));
      const [itemRows] = await db.query(
        `SELECT id, name, code, uom FROM ${Tables.inventory_items} WHERE id IN $ids`,
        {ids}
      );
      unwrapRows<{id?: unknown; name?: string; code?: string; uom?: string}>(itemRows).forEach(
        (item) => {
          const id = normalizeInventoryItemId(item.id);
          if (id) metaById.set(id, item);
        }
      );
    }
  } catch {
    return lines;
  }

  return lines.map((line) => {
    const id = normalizeInventoryItemId(line.item);
    const meta = id ? metaById.get(id) : undefined;
    if (!meta) return line;
    // Keep a plain string id — spreading RecordId creates {tb,id} and double-prefixes on save.
    return {
      ...line,
      item: {
        id,
        name: meta.name,
        code: meta.code,
        uom: meta.uom,
      } as KitchenReconciliationItem["item"],
    };
  });
};

const attachReconciliationItems = async (
  db: DatabaseClient,
  reconciliation: KitchenReconciliation
): Promise<KitchenReconciliation> => {
  const id = toFullRecordIdString(reconciliation.id, Tables.kitchen_reconciliations);
  reconciliation.items = await fetchReconciliationItems(db, id);
  return reconciliation;
};

const unwrapRows = <T>(result: unknown): T[] => {
  if (!result) return [];
  if (Array.isArray(result)) {
    const first = result[0];
    if (Array.isArray(first)) return first as T[];
    if (first && typeof first === "object" && "result" in (first as object)) {
      return ((first as {result: T[]}).result ?? []) as T[];
    }
    return result as T[];
  }
  return [];
};

const toItemMap = (rows: Array<{item?: unknown; total?: unknown}>): QuantityMap => {
  const map: QuantityMap = new Map();
  for (const row of rows) {
    const itemId = recordIdToString(row.item);
    if (itemId) {
      map.set(itemId, safeNumber(row.total));
    }
  }
  return map;
};

export const getActiveReconciliation = async (
  db: DatabaseClient,
  locationId: string,
  businessDate: string
): Promise<KitchenReconciliation | null> => {
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE location = $location
        AND business_date = $businessDate
        AND superseded_by = NONE
      ORDER BY revision DESC
      LIMIT 1
      FETCH location
    `,
    {location: toLocationRecordId(locationId), businessDate}
  );

  const reconciliation = unwrapRows<KitchenReconciliation>(rows)[0] ?? null;
  if (!reconciliation) return null;
  return attachReconciliationItems(db, reconciliation);
};

export const getMissedReconciliations = async (
  db: DatabaseClient,
  locationId: string
): Promise<KitchenReconciliation[]> => {
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE location = $location
        AND status = 'missed'
        AND superseded_by = NONE
      ORDER BY business_date DESC
      FETCH location
    `,
    {location: toLocationRecordId(locationId)}
  );

  return unwrapRows<KitchenReconciliation>(rows);
};

export const detectMissedDays = async (
  db: DatabaseClient,
  locationId: string,
  fromDate: string,
  toDate: string
): Promise<string[]> => {
  if (fromDate > toDate) return [];

  const candidateDates = enumerateBusinessDates(fromDate, toDate);
  const [rows] = await db.query(
    `
      SELECT business_date FROM ${Tables.kitchen_reconciliations}
      WHERE location = $location
        AND business_date >= $fromDate
        AND business_date <= $toDate
        AND superseded_by = NONE
    `,
    {location: toLocationRecordId(locationId), fromDate, toDate}
  );

  const existing = new Set(
    unwrapRows<{business_date: string}>(rows).map((row) => row.business_date)
  );

  return candidateDates.filter((date) => !existing.has(date));
};

const fetchOpeningStock = async (
  db: DatabaseClient,
  locationId: string,
  businessDate: string
): Promise<QuantityMap> => {
  const map: QuantityMap = new Map();
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE location = $location
        AND status = 'verified'
        AND business_date < $businessDate
        AND superseded_by = NONE
      ORDER BY business_date DESC, revision DESC
      LIMIT 1
    `,
    {location: toLocationRecordId(locationId), businessDate}
  );

  const reconciliation = unwrapRows<KitchenReconciliation>(rows)[0];
  if (!reconciliation) return map;

  const lines = await fetchReconciliationItems(
    db,
    toFullRecordIdString(reconciliation.id, Tables.kitchen_reconciliations)
  );
  lines.forEach((line) => {
    const itemId = recordIdToString(line.item);
    if (itemId && line.physical_count != null) {
      map.set(itemId, safeNumber(line.physical_count));
    }
  });
  return map;
};

const fetchIssuedQty = async (
  db: DatabaseClient,
  locationId: string,
  window: ClosingCycleWindow
): Promise<QuantityMap> => {
  const params: Record<string, unknown> = {
    location: toLocationRecordId(locationId),
    dateFrom: toSurrealDateTime(window.date_from),
    dateTo: toSurrealDateTime(window.date_to),
  };

  try {
    const [issueIdRows] = await db.query(
      `
        SELECT VALUE id FROM ${Tables.inventory_issues}
        WHERE location = $location
          AND created_at >= $dateFrom
          AND created_at <= $dateTo
      `,
      params
    );
    const issueIds = unwrapRows<unknown>(issueIdRows)
      .map((id) => toFullRecordIdString(id, Tables.inventory_issues))
      .filter(Boolean)
      .map((id) => toQueryRecordId(id, Tables.inventory_issues));
    if (issueIds.length === 0) return new Map();

    const [rows] = await db.query(
      `
        SELECT item, math::sum(quantity) AS total FROM ${Tables.inventory_issue_items}
        WHERE issue IN $issueIds
        GROUP BY item
      `,
      {issueIds}
    );
    return toItemMap(unwrapRows(rows));
  } catch {
    return new Map();
  }
};

const fetchTransfers = async (
  db: DatabaseClient,
  locationId: string,
  window: ClosingCycleWindow
): Promise<{transfersIn: QuantityMap; transfersOut: QuantityMap}> => {
  const params: Record<string, unknown> = {
    location: toLocationRecordId(locationId),
    dateFrom: toSurrealDateTime(window.date_from),
    dateTo: toSurrealDateTime(window.date_to),
  };

  try {
    const [[inRows], [outRows]] = await Promise.all([
      db.query(
        `
          SELECT item, math::sum(quantity) AS total FROM ${Tables.stock_transfer_items}
          WHERE transfer IN (
            SELECT VALUE id FROM ${Tables.stock_transfers}
            WHERE to_location = $location
              AND created_at >= $dateFrom
              AND created_at <= $dateTo
          )
          GROUP BY item
        `,
        params
      ),
      db.query(
        `
          SELECT item, math::sum(quantity) AS total FROM ${Tables.stock_transfer_items}
          WHERE transfer IN (
            SELECT VALUE id FROM ${Tables.stock_transfers}
            WHERE from_location = $location
              AND created_at >= $dateFrom
              AND created_at <= $dateTo
          )
          GROUP BY item
        `,
        params
      ),
    ]);

    return {
      transfersIn: toItemMap(unwrapRows(inRows)),
      transfersOut: toItemMap(unwrapRows(outRows)),
    };
  } catch {
    return {transfersIn: new Map(), transfersOut: new Map()};
  }
};

const collectIngredientScope = (
  opening: QuantityMap,
  issued: QuantityMap,
  transfersIn: QuantityMap,
  transfersOut: QuantityMap,
  theoretical: QuantityMap
): string[] => {
  const ids = new Set<string>();
  [opening, issued, transfersIn, transfersOut, theoretical].forEach((map) => {
    map.forEach((_, itemId) => ids.add(itemId));
  });
  return Array.from(ids);
};

const writeRevision = async (
  db: DatabaseClient,
  reconciliationId: string,
  revisionNumber: number,
  changeType: KitchenReconciliationChangeType,
  userId: string,
  snapshotAfter: Record<string, unknown>,
  snapshotBefore?: Record<string, unknown> | null,
  fieldChanges: Array<{item_id?: string; field: string; old: unknown; new: unknown}> = []
) => {
  await db.query(
    `CREATE ${Tables.kitchen_reconciliation_revisions} CONTENT $content RETURN NONE`,
    {
      content: {
        reconciliation: toReconciliationRecordId(reconciliationId),
        revision_number: revisionNumber,
        change_type: changeType,
        changed_by: toUserRecordId(userId),
        changed_at: nowSurrealDateTime(),
        snapshot_before: snapshotBefore ?? undefined,
        snapshot_after: snapshotAfter,
        field_changes: fieldChanges,
      },
    }
  );
};

const buildLineRecords = (
  reconciliationId: string,
  itemIds: string[],
  opening: QuantityMap,
  issued: QuantityMap,
  transfersIn: QuantityMap,
  transfersOut: QuantityMap,
  theoretical: QuantityMap,
  manualByItem: Map<string, ManualLineInput>,
  isMissed: boolean
) => {
  return itemIds.map((itemId) => {
    const manual = manualByItem.get(itemId);
    const physicalCount = isMissed
      ? null
      : manual?.physicalCount !== undefined
        ? manual.physicalCount
        : null;

    const computed = computeLine({
      openingStock: opening.get(itemId) ?? 0,
      issuedQty: issued.get(itemId) ?? 0,
      transfersIn: transfersIn.get(itemId) ?? 0,
      transfersOut: transfersOut.get(itemId) ?? 0,
      theoreticalConsumption: theoretical.get(itemId) ?? 0,
      physicalCount,
      wasteQty: manual?.wasteQty ?? 0,
      staffMealQty: manual?.staffMealQty ?? 0,
      complimentaryQty: manual?.complimentaryQty ?? 0,
    });

    return {
      reconciliation: toReconciliationRecordId(reconciliationId),
      item: toInventoryItemRecordId(itemId),
      opening_stock: computed.openingStock,
      issued_qty: computed.issuedQty,
      transfers_in: computed.transfersIn,
      transfers_out: computed.transfersOut,
      theoretical_consumption: computed.theoreticalConsumption,
      expected_stock: computed.expectedStock,
      physical_count: computed.physicalCount,
      waste_qty: computed.wasteQty,
      staff_meal_qty: computed.staffMealQty,
      complimentary_qty: computed.complimentaryQty,
      actual_consumption: computed.actualConsumption,
      variance: computed.variance,
      posted_to_ledger: false,
    };
  });
};

const LINE_INSERT_CHUNK = 25;
const LINE_UPDATE_CHUNK = 10;

type LineRecord = {
  reconciliation: unknown;
  item: unknown;
  opening_stock: number;
  issued_qty: number;
  transfers_in: number;
  transfers_out: number;
  theoretical_consumption: number;
  expected_stock: number;
  physical_count: number | null;
  waste_qty: number;
  staff_meal_qty: number;
  complimentary_qty: number;
  actual_consumption: number;
  variance: number;
  posted_to_ledger: boolean;
};

/** Wipe by id chunks — bulk DELETE … WHERE hangs the websocket on large drafts. */
const deleteLineItemsByReconciliation = async (
  db: DatabaseClient,
  reconciliationId: string
) => {
  const reconciliation = toReconciliationRecordId(reconciliationId);
  const [idRows] = await db.query(
    `SELECT VALUE id FROM ${Tables.kitchen_reconciliation_items} WHERE reconciliation = $reconciliation`,
    {reconciliation}
  );
  const ids = unwrapRows<unknown>(idRows)
    .map((id) => toQueryRecordId(id, Tables.kitchen_reconciliation_items))
    .filter(Boolean);

  for (let i = 0; i < ids.length; i += LINE_INSERT_CHUNK) {
    const chunk = ids.slice(i, i + LINE_INSERT_CHUNK);
    await db.query(`DELETE $ids RETURN NONE`, {ids: chunk});
  }
};

const insertLineRecordChunks = async (db: DatabaseClient, lineRecords: LineRecord[]) => {
  if (lineRecords.length === 0) return;
  // RETURN NONE — default INSERT returns every row and hangs the websocket client.
  for (let i = 0; i < lineRecords.length; i += LINE_INSERT_CHUNK) {
    const rows = lineRecords.slice(i, i + LINE_INSERT_CHUNK);
    await db.query(
      `INSERT INTO ${Tables.kitchen_reconciliation_items} $rows RETURN NONE`,
      {rows}
    );
  }
};

const persistLineItems = async (
  db: DatabaseClient,
  reconciliationId: string,
  lineRecords: LineRecord[]
) => {
  await deleteLineItemsByReconciliation(db, reconciliationId);
  await insertLineRecordChunks(db, lineRecords);
  return [];
};

/**
 * Draft saves must not DELETE+reinsert. Update by (reconciliation, item) so enriched
 * item shapes / line-id mismatches cannot silently skip writes.
 */
const patchDirtyLineItems = async (
  db: DatabaseClient,
  reconciliationId: string,
  patches: Array<{
    itemId: string;
    physical_count: number | null;
    waste_qty: number;
    staff_meal_qty: number;
    complimentary_qty: number;
    expected_stock: number;
    actual_consumption: number;
    variance: number;
  }>
) => {
  if (patches.length === 0) return;

  const reconciliation = toReconciliationRecordId(reconciliationId);
  for (let i = 0; i < patches.length; i += LINE_UPDATE_CHUNK) {
    const chunk = patches.slice(i, i + LINE_UPDATE_CHUNK);
    await Promise.all(
      chunk.map((patch) =>
        db.query(
          `
            UPDATE ${Tables.kitchen_reconciliation_items} SET
              physical_count = $physical_count,
              waste_qty = $waste_qty,
              staff_meal_qty = $staff_meal_qty,
              complimentary_qty = $complimentary_qty,
              expected_stock = $expected_stock,
              actual_consumption = $actual_consumption,
              variance = $variance
            WHERE reconciliation = $reconciliation AND item = $item
            RETURN NONE
          `,
          {
            reconciliation,
            item: toInventoryItemRecordId(patch.itemId),
            physical_count: patch.physical_count,
            waste_qty: patch.waste_qty,
            staff_meal_qty: patch.staff_meal_qty,
            complimentary_qty: patch.complimentary_qty,
            expected_stock: patch.expected_stock,
            actual_consumption: patch.actual_consumption,
            variance: patch.variance,
          }
        )
      )
    );
  }
};

const getLastReconciliationDate = async (
  db: DatabaseClient,
  locationId: string
): Promise<string | null> => {
  const [rows] = await db.query(
    `
      SELECT business_date FROM ${Tables.kitchen_reconciliations}
      WHERE location = $location AND superseded_by = NONE
      ORDER BY business_date DESC
      LIMIT 1
    `,
    {location: toLocationRecordId(locationId)}
  );
  return unwrapRows<{business_date: string}>(rows)[0]?.business_date ?? null;
};

/**
 * POS shim: linked_kitchen on the inventory location drives dish/theoretical scope only.
 * Stock identity remains location.
 */
const resolveLinkedKitchenId = async (
  db: DatabaseClient,
  locationId: string
): Promise<string | null> => {
  try {
    const result = await db.query(
      `SELECT linked_kitchen FROM ONLY $id`,
      {id: toLocationRecordId(locationId)}
    );
    const first = Array.isArray(result) ? result[0] : undefined;
    const row = (Array.isArray(first) ? first[0] : first) as
      | {linked_kitchen?: unknown}
      | undefined;
    const kitchenId = recordIdToString(row?.linked_kitchen);
    return kitchenId || null;
  } catch {
    return null;
  }
};

/** Kitchen dishes for theoretical — never FETCH items (photo blobs hang Surreal). */
const fetchKitchenDishIds = async (
  db: DatabaseClient,
  kitchenId: string
): Promise<Set<string>> => {
  const dishIds = new Set<string>();
  const kitchen = toKitchenRecordId(kitchenId);

  const [kitchenRows] = await db.query(
    `SELECT items FROM ${Tables.kitchens} WHERE id = $kitchen`,
    {kitchen}
  );
  const kitchenRow = unwrapRows<{items?: unknown[]}>(kitchenRows)[0];
  kitchenRow?.items?.forEach((dish) => {
    const id = toFullRecordIdString(dish, Tables.dishes);
    if (id) dishIds.add(id);
  });

  const [workflowIds] = await db.query(
    `SELECT VALUE workflow FROM ${Tables.workflow_stages} WHERE kitchen = $kitchen`,
    {kitchen}
  );
  const workflows = unwrapRows<unknown>(workflowIds)
    .map((id) => toFullRecordIdString(id, Tables.workflows))
    .filter(Boolean)
    .map((id) => toQueryRecordId(id, Tables.workflows));

  if (workflows.length > 0) {
    const [dishRows] = await db.query(
      `SELECT VALUE id FROM ${Tables.dishes} WHERE workflow IN $workflows`,
      {workflows}
    );
    unwrapRows<unknown>(dishRows).forEach((dishId) => {
      const id = toFullRecordIdString(dishId, Tables.dishes);
      if (id) dishIds.add(id);
    });
  }

  return dishIds;
};

/**
 * Sold dishes in the business window → recipe ingredients.
 * Uses datetime filters on order_item (no nested order IN / time::format).
 */
const fetchTheoreticalConsumption = async (
  db: DatabaseClient,
  kitchenDishIds: Set<string>,
  window: ClosingCycleWindow
): Promise<QuantityMap> => {
  const consumption: QuantityMap = new Map();
  if (kitchenDishIds.size === 0) return consumption;

  const dishIds = Array.from(kitchenDishIds).map((id) => toDishRecordId(id));
  const dateFrom = toSurrealDateTime(window.date_from);
  const dateTo = toSurrealDateTime(window.date_to);

  const soldByDish = new Map<string, number>();
  try {
    const [orderItemRows] = await db.query(
      `
        SELECT item, math::sum(quantity) AS total FROM ${Tables.order_items}
        WHERE item IN $dishIds
          AND created_at >= $dateFrom
          AND created_at <= $dateTo
          AND (is_refunded = false OR is_refunded = NONE OR is_refunded = null)
          AND (deleted_at = NONE OR deleted_at = null)
        GROUP BY item
      `,
      {dishIds, dateFrom, dateTo}
    );
    unwrapRows<{item?: unknown; total?: unknown}>(orderItemRows).forEach((row) => {
      const dishId = toFullRecordIdString(row.item, Tables.dishes);
      if (dishId) soldByDish.set(dishId, safeNumber(row.total));
    });
  } catch {
    return consumption;
  }

  if (soldByDish.size === 0) return consumption;

  let recipeRows: unknown = [];
  try {
    const [rows] = await db.query(
      `
        SELECT menu_item, item, quantity FROM ${Tables.dishes_recipes}
        WHERE menu_item IN $dishIds
      `,
      {dishIds}
    );
    recipeRows = rows;
  } catch {
    return consumption;
  }

  const recipesMap = new Map<string, Array<{item?: unknown; quantity?: unknown}>>();
  unwrapRows<{menu_item?: unknown; item?: unknown; quantity?: unknown}>(recipeRows).forEach(
    (recipe) => {
      const dishId = toFullRecordIdString(recipe.menu_item, Tables.dishes);
      if (!dishId) return;
      const list = recipesMap.get(dishId) ?? [];
      list.push(recipe);
      recipesMap.set(dishId, list);
    }
  );

  soldByDish.forEach((soldQty, dishId) => {
    const recipes = recipesMap.get(dishId) ?? [];
    recipes.forEach((recipe) => {
      const itemId = toFullRecordIdString(recipe.item, Tables.inventory_items);
      if (!itemId) return;
      const qty = soldQty * safeNumber(recipe.quantity);
      consumption.set(itemId, (consumption.get(itemId) ?? 0) + qty);
    });
  });

  return consumption;
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
};

const aggregateMovementData = async (
  db: DatabaseClient,
  locationId: string,
  window: ClosingCycleWindow,
  businessDate: string,
  onProgress?: (stage: GenerateProgressStage) => void
) => {
  const [opening, issued, transfers] = await Promise.all([
    fetchOpeningStock(db, locationId, businessDate),
    fetchIssuedQty(db, locationId, window),
    fetchTransfers(db, locationId, window),
  ]);
  const {transfersIn, transfersOut} = transfers;

  onProgress?.("theoretical");
  let theoretical: QuantityMap = new Map();
  const kitchenId = await resolveLinkedKitchenId(db, locationId);
  if (kitchenId) {
    try {
      const dishIds = await fetchKitchenDishIds(db, kitchenId);
      theoretical = await withTimeout(
        fetchTheoreticalConsumption(db, dishIds, window),
        45_000,
        "Theoretical consumption"
      );
    } catch {
      theoretical = new Map();
    }
  } else {
    onProgress?.("theoretical_skipped");
  }

  const itemIds = collectIngredientScope(opening, issued, transfersIn, transfersOut, theoretical);

  return {opening, issued, transfersIn, transfersOut, theoretical, itemIds};
};

const hasActiveReconciliation = async (
  db: DatabaseClient,
  locationId: string,
  businessDate: string
): Promise<boolean> => {
  const [rows] = await db.query(
    `
      SELECT VALUE id FROM ${Tables.kitchen_reconciliations}
      WHERE location = $location
        AND business_date = $businessDate
        AND superseded_by = NONE
      LIMIT 1
    `,
    {location: toLocationRecordId(locationId), businessDate}
  );
  return unwrapRows(rows).length > 0;
};

const createReconciliationHeader = async (
  db: DatabaseClient,
  params: {
    locationId: string;
    businessDate: string;
    window: ClosingCycleWindow;
    status: KitchenReconciliationStatus;
    userId: string;
    revision?: number;
    parentId?: string;
  }
) => {
  const [created] = await db.create(Tables.kitchen_reconciliations, {
    location: toLocationRecordId(params.locationId),
    business_date: params.businessDate,
    date_from: toSurrealDateTime(params.window.date_from),
    date_to: toSurrealDateTime(params.window.date_to),
    status: params.status,
    revision: params.revision ?? 1,
    parent: params.parentId ? toReconciliationRecordId(params.parentId) : undefined,
    created_at: nowSurrealDateTime(),
    created_by: toUserRecordId(params.userId),
  });

  if (!created?.id) {
    throw new Error("Failed to create reconciliation");
  }

  return recordIdToString(created.id);
};

export const createMissedStub = async (
  db: DatabaseClient,
  locationId: string,
  businessDate: string,
  userId: string,
  window?: ClosingCycleWindow
): Promise<void> => {
  if (await hasActiveReconciliation(db, locationId, businessDate)) {
    return;
  }

  // Marker only — no line items. Next verified day's opening uses last verified close.
  const resolvedWindow = window ?? (await resolveBusinessDateWindow(db, businessDate));
  const reconciliationId = await createReconciliationHeader(db, {
    locationId,
    businessDate,
    window: resolvedWindow,
    status: "missed",
    userId,
  });

  await writeRevision(db, reconciliationId, 1, "missed_stub", userId, {
    status: "missed",
    business_date: businessDate,
    item_count: 0,
  });
};

export type GenerateProgressStage =
  | "checking"
  | "missed_days"
  | "aggregating"
  | "theoretical"
  | "theoretical_skipped"
  | "saving"
  | "saving_lines"
  | "saving_revision";

const STUB_CHUNK = 8;

export const generateReconciliation = async (
  db: DatabaseClient,
  locationId: string,
  businessDate: string,
  userId: string,
  onProgress?: (stage: GenerateProgressStage) => void
): Promise<KitchenReconciliation> => {
  onProgress?.("checking");
  const existing = await getActiveReconciliation(db, locationId, businessDate);
  if (existing) {
    return existing;
  }

  const lastDate = await getLastReconciliationDate(db, locationId);
  if (lastDate && lastDate < businessDate) {
    const dates = enumerateBusinessDates(lastDate, businessDate);
    const gapDates = dates.slice(1, -1);
    if (gapDates.length > 0) {
      onProgress?.("missed_days");

      const [existingRows] = await db.query(
        `
          SELECT business_date FROM ${Tables.kitchen_reconciliations}
          WHERE location = $location
            AND business_date > $fromDate
            AND business_date < $toDate
            AND superseded_by = NONE
        `,
        {
          location: toLocationRecordId(locationId),
          fromDate: lastDate,
          toDate: businessDate,
        }
      );
      const alreadyHave = new Set(
        unwrapRows<{business_date: string}>(existingRows).map((row) => row.business_date)
      );
      const missing = gapDates.filter((date) => !alreadyHave.has(date));

      if (missing.length > 0) {
        const {config} = await loadClosingCycleConfig(db);
        for (let i = 0; i < missing.length; i += STUB_CHUNK) {
          const chunk = missing.slice(i, i + STUB_CHUNK);
          await Promise.all(
            chunk.map((gapDate) =>
              createMissedStub(
                db,
                locationId,
                gapDate,
                userId,
                buildWindowForBusinessDate(config, gapDate)
              )
            )
          );
        }
      }
    }
  }

  onProgress?.("aggregating");
  const window = await resolveBusinessDateWindow(db, businessDate);
  const {opening, issued, transfersIn, transfersOut, theoretical, itemIds} =
    await aggregateMovementData(db, locationId, window, businessDate, onProgress);

  onProgress?.("saving");
  const reconciliationId = await createReconciliationHeader(db, {
    locationId,
    businessDate,
    window,
    status: "draft",
    userId,
  });

  const lineRecords = buildLineRecords(
    reconciliationId,
    itemIds,
    opening,
    issued,
    transfersIn,
    transfersOut,
    theoretical,
    new Map(),
    false
  );

  onProgress?.("saving_lines");
  await persistLineItems(db, reconciliationId, lineRecords);

  onProgress?.("saving_revision");
  await writeRevision(db, reconciliationId, 1, "create", userId, {
    status: "draft",
    business_date: businessDate,
    item_count: lineRecords.length,
  });

  // Load header only — full line FETCH/IN binds after a large insert can hang the socket.
  // The hook calls load() next, which attaches items in a separate request.
  const [headerRows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE id = $id
      LIMIT 1
      FETCH location
    `,
    {id: toReconciliationRecordId(reconciliationId)}
  );
  const header = unwrapRows<KitchenReconciliation>(headerRows)[0];
  if (!header) {
    throw new Error("Failed to create reconciliation");
  }
  header.items = [];
  return header;
};

export const createRevision = async (
  db: DatabaseClient,
  reconciliationId: string,
  userId: string
): Promise<KitchenReconciliation> => {
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE id = $id
      FETCH location
    `,
    {id: toReconciliationRecordId(reconciliationId)}
  );
  const source = unwrapRows<KitchenReconciliation>(rows)[0];
  if (!source) throw new Error("Reconciliation not found");
  await attachReconciliationItems(db, source);
  if (source.superseded_by) throw new Error("Reconciliation already superseded");

  const locationId = recordIdToString(source.location);
  if (!locationId) throw new Error("Reconciliation missing location");
  const newRevision = (source.revision ?? 1) + 1;

  const newId = await createReconciliationHeader(db, {
    locationId,
    businessDate: source.business_date,
    window: {
      date_from: toJsDate(source.date_from),
      date_to: toJsDate(source.date_to),
    },
    status: "draft",
    userId,
    revision: newRevision,
    parentId: reconciliationId,
  });

  await db.merge(toReconciliationRecordId(reconciliationId), {superseded_by: toReconciliationRecordId(newId)});

  const manualByItem = new Map<string, ManualLineInput>();
  source.items?.forEach((line) => {
    const itemId = recordIdToString(line.item);
    if (!itemId) return;
    manualByItem.set(itemId, {
      itemId,
      physicalCount: line.physical_count ?? null,
      wasteQty: line.waste_qty,
      staffMealQty: line.staff_meal_qty,
      complimentaryQty: line.complimentary_qty,
    });
  });

  const lineRecords = source.items?.map((line) => {
    const itemId = recordIdToString(line.item);
    const manual = manualByItem.get(itemId);
    const computed = computeLine({
      openingStock: line.opening_stock,
      issuedQty: line.issued_qty,
      transfersIn: line.transfers_in,
      transfersOut: line.transfers_out,
      theoreticalConsumption: line.theoretical_consumption,
      physicalCount: manual?.physicalCount ?? null,
      wasteQty: manual?.wasteQty ?? 0,
      staffMealQty: manual?.staffMealQty ?? 0,
      complimentaryQty: manual?.complimentaryQty ?? 0,
    });

    return {
      reconciliation: toReconciliationRecordId(newId),
      item: toInventoryItemRecordId(itemId),
      opening_stock: computed.openingStock,
      issued_qty: computed.issuedQty,
      transfers_in: computed.transfersIn,
      transfers_out: computed.transfersOut,
      theoretical_consumption: computed.theoreticalConsumption,
      expected_stock: computed.expectedStock,
      physical_count: computed.physicalCount,
      waste_qty: computed.wasteQty,
      staff_meal_qty: computed.staffMealQty,
      complimentary_qty: computed.complimentaryQty,
      actual_consumption: computed.actualConsumption,
      variance: computed.variance,
      posted_to_ledger: false,
    };
  }) ?? [];

  await persistLineItems(db, newId, lineRecords);

  await writeRevision(
    db,
    newId,
    newRevision,
    "create",
    userId,
    {status: "draft", item_count: lineRecords.length},
    {status: source.status, item_count: source.items?.length ?? 0}
  );

  return (await getActiveReconciliation(db, locationId, source.business_date))!;
};

const sameManualValue = (a: unknown, b: unknown) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Number(a) === Number(b);
};

const upsertManualTables = async (
  db: DatabaseClient,
  reconciliationId: string,
  userId: string,
  lines: ManualLineInput[]
) => {
  if (lines.length === 0) return;

  const reconciliation = toReconciliationRecordId(reconciliationId);
  const countedBy = toUserRecordId(userId);
  const countedAt = nowSurrealDateTime();
  const items = lines
    .map((line) => toInventoryItemRecordId(line.itemId))
    .filter(Boolean);

  // Only clear/reinsert rows for lines being saved — never wipe the whole recon.
  await Promise.all([
    db.query(
      `DELETE ${Tables.kitchen_stock_counts} WHERE reconciliation = $reconciliation AND item IN $items RETURN NONE`,
      {reconciliation, items}
    ),
    db.query(
      `DELETE ${Tables.kitchen_wastes} WHERE reconciliation = $reconciliation AND item IN $items RETURN NONE`,
      {reconciliation, items}
    ),
    db.query(
      `DELETE ${Tables.kitchen_staff_meals} WHERE reconciliation = $reconciliation AND item IN $items RETURN NONE`,
      {reconciliation, items}
    ),
    db.query(
      `DELETE ${Tables.kitchen_complimentary_items} WHERE reconciliation = $reconciliation AND item IN $items RETURN NONE`,
      {reconciliation, items}
    ),
  ]);

  const stockRows: Array<Record<string, unknown>> = [];
  const wasteRows: Array<Record<string, unknown>> = [];
  const staffRows: Array<Record<string, unknown>> = [];
  const complimentaryRows: Array<Record<string, unknown>> = [];

  for (const line of lines) {
    const item = toInventoryItemRecordId(line.itemId);
    if (line.physicalCount != null) {
      stockRows.push({
        reconciliation,
        item,
        quantity: line.physicalCount,
        counted_at: countedAt,
        counted_by: countedBy,
      });
    }
    if ((line.wasteQty ?? 0) > 0) {
      wasteRows.push({
        reconciliation,
        item,
        quantity: line.wasteQty,
        created_at: countedAt,
        created_by: countedBy,
      });
    }
    if ((line.staffMealQty ?? 0) > 0) {
      staffRows.push({
        reconciliation,
        item,
        quantity: line.staffMealQty,
        notes: "Reconciliation staff meal",
        created_at: countedAt,
        created_by: countedBy,
      });
    }
    if ((line.complimentaryQty ?? 0) > 0) {
      complimentaryRows.push({
        reconciliation,
        item,
        quantity: line.complimentaryQty,
        created_at: countedAt,
        created_by: countedBy,
      });
    }
  }

  const insertChunks = async (table: Tables, rows: Array<Record<string, unknown>>) => {
    if (rows.length === 0) return;
    for (let i = 0; i < rows.length; i += LINE_INSERT_CHUNK) {
      const chunk = rows.slice(i, i + LINE_INSERT_CHUNK);
      await db.query(`INSERT INTO ${table} $rows RETURN NONE`, {rows: chunk});
    }
  };

  await insertChunks(Tables.kitchen_stock_counts, stockRows);
  await insertChunks(Tables.kitchen_wastes, wasteRows);
  await insertChunks(Tables.kitchen_staff_meals, staffRows);
  await insertChunks(Tables.kitchen_complimentary_items, complimentaryRows);

  if (stockRows.length > 0) {
    await publishStockCountCompleted(undefined, {
      countId: String(reconciliationId),
      lineCount: stockRows.length,
      completedBy: countedBy ? String(countedBy) : undefined,
    });
    await entityAfterWrite({
      domain: "inventory",
      table: Tables.kitchen_stock_counts,
      entityId: String(reconciliationId),
      action: "status_change",
      after: { lineCount: stockRows.length },
      source: "kitchen-reconciliation",
      label: "stock_count",
    });
  }
};

export const saveManualInputs = async (
  db: DatabaseClient,
  reconciliationId: string,
  lines: ManualLineInput[],
  userId: string,
  changeType: KitchenReconciliationChangeType = "update"
): Promise<KitchenReconciliation> => {
  let targetId = reconciliationId;
  const [headerRows] = await db.query(
    `SELECT * FROM ${Tables.kitchen_reconciliations} WHERE id = $id FETCH location`,
    {id: toReconciliationRecordId(reconciliationId)}
  );
  let reconciliation = unwrapRows<KitchenReconciliation>(headerRows)[0];

  if (!reconciliation) throw new Error("Reconciliation not found");
  await attachReconciliationItems(db, reconciliation);

  if (reconciliation.status === "verified") {
    reconciliation = await createRevision(db, reconciliationId, userId);
    targetId = reconciliation.id;
  } else if (reconciliation.status === "missed") {
    throw new Error("Cannot edit a missed reconciliation day; generate the next business date instead");
  }

  const beforeSnapshot = {item_count: reconciliation.items?.length ?? 0};
  const existingByItem = new Map(
    (reconciliation.items ?? [])
      .map((line) => {
        const itemId = normalizeInventoryItemId(line.item);
        return [itemId, line] as const;
      })
      .filter((entry) => Boolean(entry[0]))
  );

  const normalizedLines: ManualLineInput[] = lines
    .map((line) => ({
      ...line,
      itemId: normalizeInventoryItemId(line.itemId),
    }))
    .filter((line) => Boolean(line.itemId));

  const dirtyLines = normalizedLines.filter((line) => {
    const prev = existingByItem.get(line.itemId);
    if (!prev) return true;
    if (line.physicalCount !== undefined && !sameManualValue(prev.physical_count, line.physicalCount)) {
      return true;
    }
    if (line.wasteQty !== undefined && !sameManualValue(prev.waste_qty, line.wasteQty ?? 0)) {
      return true;
    }
    if (line.staffMealQty !== undefined && !sameManualValue(prev.staff_meal_qty, line.staffMealQty ?? 0)) {
      return true;
    }
    if (
      line.complimentaryQty !== undefined &&
      !sameManualValue(prev.complimentary_qty, line.complimentaryQty ?? 0)
    ) {
      return true;
    }
    return false;
  });

  await upsertManualTables(db, targetId, userId, dirtyLines);

  const patches = dirtyLines.map((line) => {
    const existing = existingByItem.get(line.itemId);
    const computed = computeLine({
      openingStock: existing?.opening_stock ?? 0,
      issuedQty: existing?.issued_qty ?? 0,
      transfersIn: existing?.transfers_in ?? 0,
      transfersOut: existing?.transfers_out ?? 0,
      theoreticalConsumption: existing?.theoretical_consumption ?? 0,
      physicalCount: line.physicalCount ?? null,
      wasteQty: line.wasteQty ?? 0,
      staffMealQty: line.staffMealQty ?? 0,
      complimentaryQty: line.complimentaryQty ?? 0,
    });

    return {
      itemId: line.itemId,
      physical_count: computed.physicalCount,
      waste_qty: computed.wasteQty,
      staff_meal_qty: computed.staffMealQty,
      complimentary_qty: computed.complimentaryQty,
      expected_stock: computed.expectedStock,
      actual_consumption: computed.actualConsumption,
      variance: computed.variance,
    };
  });

  await patchDirtyLineItems(db, targetId, patches);

  const fieldChanges = dirtyLines.flatMap((line) => {
    const changes: Array<{item_id: string; field: string; old: unknown; new: unknown}> = [];
    const prev = existingByItem.get(line.itemId);
    const pushIfChanged = (field: string, oldVal: unknown, newVal: unknown) => {
      if (sameManualValue(oldVal, newVal)) return;
      if ((oldVal == null || oldVal === "") && (newVal == null || newVal === "")) return;
      changes.push({item_id: line.itemId, field, old: oldVal, new: newVal});
    };
    if (line.physicalCount !== undefined) {
      pushIfChanged("physical_count", prev?.physical_count ?? null, line.physicalCount);
    }
    if (line.wasteQty !== undefined) {
      pushIfChanged("waste_qty", prev?.waste_qty ?? 0, line.wasteQty ?? 0);
    }
    if (line.staffMealQty !== undefined) {
      pushIfChanged("staff_meal_qty", prev?.staff_meal_qty ?? 0, line.staffMealQty ?? 0);
    }
    if (line.complimentaryQty !== undefined) {
      pushIfChanged("complimentary_qty", prev?.complimentary_qty ?? 0, line.complimentaryQty ?? 0);
    }
    return changes;
  });

  const slimFieldChanges =
    fieldChanges.length > 100
      ? [{item_id: "", field: "_summary", old: null, new: `${fieldChanges.length} cell updates`}]
      : fieldChanges;

  await writeRevision(
    db,
    targetId,
    reconciliation.revision ?? 1,
    changeType,
    userId,
    {item_count: reconciliation.items?.length ?? 0, changed_fields: fieldChanges.length},
    beforeSnapshot,
    slimFieldChanges
  );

  const locationId = recordIdToString(reconciliation.location);
  if (!locationId) throw new Error("Reconciliation missing location");
  return (await getActiveReconciliation(db, locationId, reconciliation.business_date))!;
};

const resolveIssueForPosting = async (
  db: DatabaseClient,
  locationId: string,
  window: ClosingCycleWindow,
  userId: string
): Promise<string> => {
  const params: Record<string, unknown> = {
    location: toLocationRecordId(locationId),
    dateFrom: toSurrealDateTime(window.date_from),
    dateTo: toSurrealDateTime(window.date_to),
  };

  const [rows] = await db.query(
    `
      SELECT id, created_at FROM ${Tables.inventory_issues}
      WHERE location = $location
        AND created_at >= $dateFrom
        AND created_at <= $dateTo
      ORDER BY created_at DESC
      LIMIT 1
    `,
    params
  );

  const existing = unwrapRows<{id: unknown}>(rows)[0];
  if (existing?.id) return recordIdToString(existing.id);

  const invoiceNumber = await fetchNextSequentialNumber(db, Tables.inventory_issues, "invoice_number");
  const [created] = await db.create(Tables.inventory_issues, {
    location: toLocationRecordId(locationId),
    items: [],
    invoice_number: invoiceNumber,
    created_at: nowSurrealDateTime(),
    created_by: toUserRecordId(userId),
  });

  if (!created?.id) throw new Error("Failed to create issue for ledger posting");
  return recordIdToString(created.id);
};

const postToLedger = async (
  db: DatabaseClient,
  reconciliation: KitchenReconciliation,
  userId: string
) => {
  const locationId = recordIdToString(reconciliation.location);
  if (!locationId) throw new Error("Reconciliation missing location");

  const window = {
    date_from: toJsDate(reconciliation.date_from),
    date_to: toJsDate(reconciliation.date_to),
  };

  const issueId = await resolveIssueForPosting(db, locationId, window, userId);
  const reconciliationId = reconciliation.id;

  const [[wasteRows], [staffRows], [compRows]] = await Promise.all([
    db.query(
      `SELECT * FROM ${Tables.kitchen_wastes} WHERE reconciliation = $id AND ledger_waste_item = NONE FETCH item`,
      {id: toReconciliationRecordId(reconciliationId)}
    ),
    db.query(
      `SELECT * FROM ${Tables.kitchen_staff_meals} WHERE reconciliation = $id AND ledger_waste_item = NONE FETCH item`,
      {id: toReconciliationRecordId(reconciliationId)}
    ),
    db.query(
      `SELECT * FROM ${Tables.kitchen_complimentary_items} WHERE reconciliation = $id AND ledger_waste_item = NONE FETCH item`,
      {id: toReconciliationRecordId(reconciliationId)}
    ),
  ]);

  const entries: Array<{
    table: Tables;
    rowId: string;
    itemId: string;
    quantity: number;
    source: string;
  }> = [];

  unwrapRows<{id: string; item: {id?: unknown}; quantity: number}>(wasteRows).forEach((row) => {
    entries.push({
      table: Tables.kitchen_wastes,
      rowId: row.id,
      itemId: recordIdToString(row.item),
      quantity: safeNumber(row.quantity),
      source: "reconciliation_waste",
    });
  });
  unwrapRows<{id: string; item: {id?: unknown}; quantity: number}>(staffRows).forEach((row) => {
    entries.push({
      table: Tables.kitchen_staff_meals,
      rowId: row.id,
      itemId: recordIdToString(row.item),
      quantity: safeNumber(row.quantity),
      source: "staff_meal",
    });
  });
  unwrapRows<{id: string; item: {id?: unknown}; quantity: number}>(compRows).forEach((row) => {
    entries.push({
      table: Tables.kitchen_complimentary_items,
      rowId: row.id,
      itemId: recordIdToString(row.item),
      quantity: safeNumber(row.quantity),
      source: "complimentary",
    });
  });

  if (entries.length === 0) return;

  const invoiceNumber = await fetchNextSequentialNumber(db, Tables.inventory_wastes, "invoice_number");
  const [wasteHeader] = await db.create(Tables.inventory_wastes, {
    issue: toQueryRecordId(issueId, Tables.inventory_issues),
    invoice_number: invoiceNumber,
    items: [],
    created_at: nowSurrealDateTime(),
    created_by: toUserRecordId(userId),
    status: "draft",
  });

  const wasteId = recordIdToString(wasteHeader?.id);
  const wasteItemRefs: unknown[] = [];

  const [issueRows] = await db.query(
    `SELECT location, store FROM $id LIMIT 1`,
    {id: toQueryRecordId(issueId, Tables.inventory_issues)}
  );
  const issueDoc = unwrapRows<{location?: unknown; store?: unknown}>(issueRows)[0];
  const issueLocationId =
    recordIdToString((issueDoc as any)?.location) ||
    recordIdToString((issueDoc as any)?.store) ||
    locationId;

  for (const entry of entries) {
    if (entry.quantity <= 0) continue;

    const [issueItemRows] = await db.query(
      `
        SELECT id, location, store FROM ${Tables.inventory_issue_items}
        WHERE issue = $issue AND item = $item
        LIMIT 1
      `,
      {issue: toQueryRecordId(issueId, Tables.inventory_issues), item: toInventoryItemRecordId(entry.itemId)}
    );
    const issueItem = unwrapRows<{id: unknown; location?: unknown; store?: unknown}>(issueItemRows)[0];
    const lineLocationId =
      recordIdToString((issueItem as any)?.location) ||
      recordIdToString((issueItem as any)?.store) ||
      issueLocationId;

    const [wasteItem] = await db.create(Tables.inventory_waste_items, {
      waste: toQueryRecordId(wasteId, Tables.inventory_wastes),
      item: toInventoryItemRecordId(entry.itemId),
      issue_item: issueItem?.id ? toQueryRecordId(issueItem.id, Tables.inventory_issue_items) : undefined,
      location: lineLocationId ? toLocationRecordId(lineLocationId) : undefined,
      quantity: entry.quantity,
      comments: entry.source,
      source: entry.source,
    });

    if (wasteItem?.id) {
      wasteItemRefs.push(wasteItem.id);
      await db.merge(entry.rowId, {ledger_waste_item: wasteItem.id});
    }
  }

  await db.merge(toQueryRecordId(wasteId, Tables.inventory_wastes), {items: wasteItemRefs});

  if (wasteId && wasteItemRefs.length > 0) {
    await postDocument({
      db,
      documentType: "waste",
      documentId: wasteId,
      userId,
    });
  }

  await db.query(
    `UPDATE ${Tables.kitchen_reconciliation_items} SET posted_to_ledger = true WHERE reconciliation = $id`,
    {id: toReconciliationRecordId(reconciliationId)}
  );
};

export const verifyReconciliation = async (
  db: DatabaseClient,
  reconciliationId: string,
  userId: string
): Promise<KitchenReconciliation> => {
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE id = $id
      FETCH location
    `,
    {id: toReconciliationRecordId(reconciliationId)}
  );
  const reconciliation = unwrapRows<KitchenReconciliation>(rows)[0];
  if (!reconciliation) throw new Error("Reconciliation not found");
  await attachReconciliationItems(db, reconciliation);
  if (reconciliation.status === "verified") return reconciliation;
  if (reconciliation.status === "missed") {
    throw new Error("Missed reconciliations cannot be verified");
  }
  if (reconciliation.superseded_by) {
    throw new Error("Cannot verify a superseded reconciliation");
  }

  const beforeSnapshot = {status: reconciliation.status, item_count: reconciliation.items?.length ?? 0};

  await postToLedger(db, reconciliation, userId);

  const reconciliationRecordId = toFullRecordIdString(
    reconciliation.id,
    Tables.kitchen_reconciliations
  );

  await db.merge(toReconciliationRecordId(reconciliationRecordId), {
    status: "verified",
    verified_at: nowSurrealDateTime(),
    verified_by: toUserRecordId(userId),
  });

  await writeRevision(
    db,
    reconciliationRecordId,
    reconciliation.revision ?? 1,
    "verify",
    userId,
    {status: "verified"},
    beforeSnapshot
  );

  const locationId = recordIdToString(reconciliation.location);
  if (!locationId) throw new Error("Reconciliation missing location");
  return (await getActiveReconciliation(db, locationId, reconciliation.business_date))!;
};

export const discardDraftReconciliation = async (
  db: DatabaseClient,
  reconciliationId: unknown,
  locationId: string,
  businessDate: string,
  userId: string,
  onProgress?: (stage: GenerateProgressStage) => void
): Promise<KitchenReconciliation> => {
  const id = toFullRecordIdString(reconciliationId, Tables.kitchen_reconciliations);
  if (!id) throw new Error("Invalid reconciliation id");

  const [rows] = await db.query(
    `SELECT status FROM ${Tables.kitchen_reconciliations} WHERE id = $id`,
    {id: toReconciliationRecordId(id)}
  );
  const record = unwrapRows<{status: KitchenReconciliationStatus}>(rows)[0];
  if (!record) throw new Error("Reconciliation not found");
  if (record.status !== "draft") {
    throw new Error("Only draft reconciliations can be discarded");
  }

  const recId = toReconciliationRecordId(id);
  // Chunked item wipe — bulk DELETE … WHERE hangs on large drafts.
  await deleteLineItemsByReconciliation(db, id);
  // RETURN NONE — default DELETE returns every deleted row over the websocket and hangs.
  await Promise.all([
    db.query(
      `DELETE ${Tables.kitchen_reconciliation_revisions} WHERE reconciliation = $id RETURN NONE`,
      {id: recId}
    ),
    db.query(
      `DELETE ${Tables.kitchen_stock_counts} WHERE reconciliation = $id RETURN NONE`,
      {id: recId}
    ),
    db.query(
      `DELETE ${Tables.kitchen_wastes} WHERE reconciliation = $id RETURN NONE`,
      {id: recId}
    ),
    db.query(
      `DELETE ${Tables.kitchen_staff_meals} WHERE reconciliation = $id RETURN NONE`,
      {id: recId}
    ),
    db.query(
      `DELETE ${Tables.kitchen_complimentary_items} WHERE reconciliation = $id RETURN NONE`,
      {id: recId}
    ),
  ]);

  await db.delete(recId);

  return generateReconciliation(db, locationId, businessDate, userId, onProgress);
};

export const getReconciliationRevisions = async (
  db: DatabaseClient,
  reconciliationId: unknown
) => {
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliation_revisions}
      WHERE reconciliation = $id OR reconciliation.parent = $id
      ORDER BY changed_at DESC
      FETCH changed_by
    `,
    {id: toReconciliationRecordId(reconciliationId)}
  );
  return unwrapRows(rows);
};

export type KitchenReconciliationReportFilters = {
  startDate?: string | null;
  endDate?: string | null;
  locationIds?: string[];
  /** @deprecated ignored — use locationIds */
  kitchenIds?: string[];
  statuses?: KitchenReconciliationStatus[];
};

export const listKitchenReconciliationsForReport = async (
  db: DatabaseClient,
  filters: KitchenReconciliationReportFilters
): Promise<KitchenReconciliation[]> => {
  const conditions: string[] = ["superseded_by = NONE"];
  const params: Record<string, unknown> = {};

  if (filters.startDate) {
    conditions.push("business_date >= $startDate");
    params.startDate = filters.startDate;
  }
  if (filters.endDate) {
    conditions.push("business_date <= $endDate");
    params.endDate = filters.endDate;
  }
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push("status IN $statuses");
    params.statuses = filters.statuses;
  }

  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE ${conditions.join(" AND ")}
      ORDER BY business_date ASC
      FETCH location, created_by, verified_by
    `,
    params
  );

  let reconciliations = unwrapRows<KitchenReconciliation>(rows);

  if (filters.locationIds && filters.locationIds.length > 0) {
    const locationIdSet = new Set(
      filters.locationIds.map((id) => toFullRecordIdString(id, Tables.inventory_locations))
    );
    reconciliations = reconciliations.filter((reconciliation) => {
      const locationId = toFullRecordIdString(
        reconciliation.location,
        Tables.inventory_locations
      );
      return locationIdSet.has(locationId);
    });
  }
  // kitchenIds is deprecated and intentionally ignored

  if (reconciliations.length === 0) return [];

  const reconciliationIds = reconciliations.map((reconciliation) =>
    toReconciliationRecordId(reconciliation.id)
  );
  const [itemRows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliation_items}
      WHERE reconciliation IN $ids
      FETCH item
    `,
    {ids: reconciliationIds}
  );

  const itemsByReconciliation = new Map<string, KitchenReconciliationItem[]>();
  unwrapRows<KitchenReconciliationItem & {reconciliation?: unknown}>(itemRows).forEach((line) => {
    const reconciliationId = toFullRecordIdString(line.reconciliation, Tables.kitchen_reconciliations);
    if (!reconciliationId) return;
    const list = itemsByReconciliation.get(reconciliationId) ?? [];
    list.push(line);
    itemsByReconciliation.set(reconciliationId, list);
  });

  return reconciliations.map((reconciliation) => {
    const id = toFullRecordIdString(reconciliation.id, Tables.kitchen_reconciliations);
    return {
      ...reconciliation,
      items: itemsByReconciliation.get(id) ?? [],
    };
  });
};
