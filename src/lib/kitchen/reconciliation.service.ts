/**
 * Kitchen reconciliation orchestration.
 *
 * Data flow:
 * 1. generateReconciliation — resolve business window, flag missed days, aggregate movements
 * 2. saveManualInputs — persist physical counts / waste / staff / complimentary, recompute lines
 * 3. verifyReconciliation — lock record, post to inventory_item_waste ledger
 *
 * Historical verified and missed records are never updated in place; edits create a new revision.
 */
import {StringRecordId} from "surrealdb";
import {DateTime} from "luxon";
import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {
  KitchenReconciliation,
  KitchenReconciliationStatus,
} from "@/api/model/kitchen_reconciliation.ts";
import {KitchenReconciliationItem} from "@/api/model/kitchen_reconciliation_item.ts";
import {KitchenReconciliationChangeType} from "@/api/model/kitchen_reconciliation_revision.ts";
import {
  enumerateBusinessDates,
  resolveBusinessDateWindow,
} from "@/lib/kitchen/business-date.ts";
import {ClosingCycleWindow} from "@/lib/closing-cycle.ts";
import {computeLine} from "@/lib/kitchen/reconciliation.calculations.ts";
import {nowSurrealDateTime, toJsDate, toSurrealDateTime, getAppTimezone} from "@/lib/datetime.ts";
import {safeNumber, toRecordId} from "@/lib/utils.ts";
import {fetchNextSequentialNumber} from "@/utils/recordNumbers.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type ManualLineInput = {
  itemId: string;
  physicalCount?: number | null;
  wasteQty?: number;
  staffMealQty?: number;
  complimentaryQty?: number;
};

type QuantityMap = Map<string, number>;

const toKitchenRecordId = (kitchenId: string) => {
  const normalized = kitchenId.includes(":") ? kitchenId : `${Tables.kitchens}:${kitchenId}`;
  return toRecordId(normalized);
};

const toFullRecordIdString = (value: unknown, table: string): string => {
  if (!value) return "";
  const raw =
    typeof value === "object" && value !== null && "toString" in value
      ? (value as {toString(): string}).toString()
      : typeof value === "string"
        ? value
        : String(value);
  return raw.includes(":") ? raw : `${table}:${raw}`;
};

const toDishRecordId = (dishId: string) => {
  const normalized = dishId.includes(":") ? dishId : `${Tables.dishes}:${dishId}`;
  return toRecordId(normalized);
};

const toInventoryItemRecordId = (itemId: string) => {
  const normalized = itemId.includes(":") ? itemId : `${Tables.inventory_items}:${itemId}`;
  return toRecordId(normalized);
};

const toReconciliationRecordId = (reconciliationId: unknown) => {
  const normalized = toFullRecordIdString(reconciliationId, Tables.kitchen_reconciliations);
  if (!normalized) {
    throw new Error("Invalid reconciliation id");
  }
  return toRecordId(normalized);
};

const fetchReconciliationItems = async (
  db: DatabaseClient,
  reconciliationId: string
): Promise<KitchenReconciliationItem[]> => {
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliation_items}
      WHERE reconciliation = $reconciliation
      FETCH item
    `,
    {reconciliation: toReconciliationRecordId(reconciliationId)}
  );
  return unwrapRows<KitchenReconciliationItem>(rows);
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
    const itemId = recordToString(row.item);
    if (itemId) {
      map.set(itemId, safeNumber(row.total));
    }
  }
  return map;
};

export const getActiveReconciliation = async (
  db: DatabaseClient,
  kitchenId: string,
  businessDate: string
): Promise<KitchenReconciliation | null> => {
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE kitchen = $kitchen
        AND business_date = $businessDate
        AND superseded_by = NONE
      ORDER BY revision DESC
      LIMIT 1
      FETCH kitchen
    `,
    {kitchen: toKitchenRecordId(kitchenId), businessDate}
  );

  const reconciliation = unwrapRows<KitchenReconciliation>(rows)[0] ?? null;
  if (!reconciliation) return null;
  return attachReconciliationItems(db, reconciliation);
};

export const getMissedReconciliations = async (
  db: DatabaseClient,
  kitchenId: string
): Promise<KitchenReconciliation[]> => {
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE kitchen = $kitchen
        AND status = 'missed'
        AND superseded_by = NONE
      ORDER BY business_date DESC
      FETCH kitchen
    `,
    {kitchen: toKitchenRecordId(kitchenId)}
  );

  return unwrapRows<KitchenReconciliation>(rows);
};

export const detectMissedDays = async (
  db: DatabaseClient,
  kitchenId: string,
  fromDate: string,
  toDate: string
): Promise<string[]> => {
  if (fromDate > toDate) return [];

  const candidateDates = enumerateBusinessDates(fromDate, toDate);
  const [rows] = await db.query(
    `
      SELECT business_date FROM ${Tables.kitchen_reconciliations}
      WHERE kitchen = $kitchen
        AND business_date >= $fromDate
        AND business_date <= $toDate
        AND superseded_by = NONE
    `,
    {kitchen: toKitchenRecordId(kitchenId), fromDate, toDate}
  );

  const existing = new Set(
    unwrapRows<{business_date: string}>(rows).map((row) => row.business_date)
  );

  return candidateDates.filter((date) => !existing.has(date));
};

const fetchKitchenDishIds = async (
  db: DatabaseClient,
  kitchenId: string
): Promise<Set<string>> => {
  const dishIds = new Set<string>();

  const [kitchenRows] = await db.query(
    `SELECT * FROM ${Tables.kitchens} WHERE id = $kitchen FETCH items`,
    {kitchen: toKitchenRecordId(kitchenId)}
  );
  const kitchen = unwrapRows<{items?: Array<{id?: unknown}>}>(kitchenRows)[0];
  kitchen?.items?.forEach((dish) => {
    const id = toFullRecordIdString(dish.id, Tables.dishes);
    if (id) dishIds.add(id);
  });

  const [workflowRows] = await db.query(
    `
      SELECT VALUE menu_item FROM ${Tables.dishes}
      WHERE workflow IN (
        SELECT VALUE workflow FROM ${Tables.workflow_stages} WHERE kitchen = $kitchen
      )
    `,
    {kitchen: toKitchenRecordId(kitchenId)}
  );
  unwrapRows<unknown>(workflowRows).forEach((dishId) => {
    const id = toFullRecordIdString(dishId, Tables.dishes);
    if (id) dishIds.add(id);
  });

  return dishIds;
};

const fetchOpeningStock = async (
  db: DatabaseClient,
  kitchenId: string,
  businessDate: string
): Promise<QuantityMap> => {
  const map: QuantityMap = new Map();
  const [rows] = await db.query(
    `
      SELECT * FROM ${Tables.kitchen_reconciliations}
      WHERE kitchen = $kitchen
        AND status = 'verified'
        AND business_date < $businessDate
        AND superseded_by = NONE
      ORDER BY business_date DESC, revision DESC
      LIMIT 1
    `,
    {kitchen: toKitchenRecordId(kitchenId), businessDate}
  );

  const reconciliation = unwrapRows<KitchenReconciliation>(rows)[0];
  if (!reconciliation) return map;

  const lines = await fetchReconciliationItems(
    db,
    toFullRecordIdString(reconciliation.id, Tables.kitchen_reconciliations)
  );
  lines.forEach((line) => {
    const itemId = recordToString(line.item?.id ?? line.item);
    if (itemId && line.physical_count != null) {
      map.set(itemId, safeNumber(line.physical_count));
    }
  });
  return map;
};

const fetchIssuedQty = async (
  db: DatabaseClient,
  kitchenId: string,
  window: ClosingCycleWindow
): Promise<QuantityMap> => {
  const [rows] = await db.query(
    `
      SELECT item, math::sum(quantity) AS total FROM ${Tables.inventory_issue_items}
      WHERE issue IN (
        SELECT VALUE id FROM ${Tables.inventory_issues}
        WHERE kitchen = $kitchen
          AND created_at >= $dateFrom
          AND created_at <= $dateTo
      )
      GROUP BY item
    `,
    {
      kitchen: toKitchenRecordId(kitchenId),
      dateFrom: toSurrealDateTime(window.date_from),
      dateTo: toSurrealDateTime(window.date_to),
    }
  );

  return toItemMap(unwrapRows(rows));
};

const fetchTransfers = async (
  db: DatabaseClient,
  kitchenId: string,
  window: ClosingCycleWindow
): Promise<{transfersIn: QuantityMap; transfersOut: QuantityMap}> => {
  const params = {
    kitchen: toKitchenRecordId(kitchenId),
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
            WHERE to_kitchen = $kitchen
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
            WHERE from_kitchen = $kitchen
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

const fetchTheoreticalConsumption = async (
  db: DatabaseClient,
  kitchenDishIds: Set<string>,
  window: ClosingCycleWindow
): Promise<QuantityMap> => {
  const consumption: QuantityMap = new Map();
  if (kitchenDishIds.size === 0) return consumption;

  const dbFormat = import.meta.env.VITE_DB_DATABASE_FORMAT as string;
  const timezone = getAppTimezone();
  const dateFrom = DateTime.fromJSDate(window.date_from).setZone(timezone).toFormat("yyyy-MM-dd HH:mm");
  const dateTo = DateTime.fromJSDate(window.date_to).setZone(timezone).toFormat("yyyy-MM-dd HH:mm");
  const dishIds = Array.from(kitchenDishIds).map((id) => toDishRecordId(id));

  const [orderItemRows] = await db.query(
    `
      SELECT item, math::sum(quantity) AS total FROM ${Tables.order_items}
      WHERE item IN $dishIds
        AND order IN (
          SELECT VALUE id FROM ${Tables.orders}
          WHERE status = 'Paid'
            AND time::format(created_at, $fmt) >= $dateFrom
            AND time::format(created_at, $fmt) <= $dateTo
        )
      GROUP BY item
    `,
    {dishIds, fmt: dbFormat, dateFrom, dateTo}
  );

  const soldByDish = new Map<string, number>();
  unwrapRows<{item?: unknown; total?: unknown}>(orderItemRows).forEach((row) => {
    const dishId = toFullRecordIdString(row.item, Tables.dishes);
    if (dishId) soldByDish.set(dishId, safeNumber(row.total));
  });

  if (soldByDish.size === 0) {
    return consumption;
  }

  const [recipeRows] = await db.query(
    `
      SELECT * FROM ${Tables.dishes_recipes}
      WHERE menu_item IN $dishIds
      FETCH item
    `,
    {dishIds}
  );

  const recipesMap = new Map<string, Array<{item?: {id?: unknown}; quantity?: unknown}>>();
  unwrapRows<{menu_item?: unknown; item?: {id?: unknown}; quantity?: unknown}>(recipeRows).forEach(
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
      const itemId = toFullRecordIdString(recipe.item?.id ?? recipe.item, Tables.inventory_items);
      if (!itemId) return;
      const qty = soldQty * safeNumber(recipe.quantity);
      consumption.set(itemId, (consumption.get(itemId) ?? 0) + qty);
    });
  });

  return consumption;
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

const snapshotItems = (items: KitchenReconciliationItem[]) =>
  items.map((line) => ({
    item_id: recordToString(line.item?.id ?? line.item),
    opening_stock: line.opening_stock,
    issued_qty: line.issued_qty,
    transfers_in: line.transfers_in,
    transfers_out: line.transfers_out,
    theoretical_consumption: line.theoretical_consumption,
    expected_stock: line.expected_stock,
    physical_count: line.physical_count,
    waste_qty: line.waste_qty,
    staff_meal_qty: line.staff_meal_qty,
    complimentary_qty: line.complimentary_qty,
    actual_consumption: line.actual_consumption,
    variance: line.variance,
  }));

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
  await db.create(Tables.kitchen_reconciliation_revisions, {
    reconciliation: toRecordId(reconciliationId),
    revision_number: revisionNumber,
    change_type: changeType,
    changed_by: toRecordId(userId),
    changed_at: nowSurrealDateTime(),
    snapshot_before: snapshotBefore ?? undefined,
    snapshot_after: snapshotAfter,
    field_changes: fieldChanges,
  });
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

const persistLineItems = async (
  db: DatabaseClient,
  reconciliationId: string,
  lineRecords: ReturnType<typeof buildLineRecords>
) => {
  await db.query(
    `DELETE ${Tables.kitchen_reconciliation_items} WHERE reconciliation = $reconciliation`,
    {reconciliation: toReconciliationRecordId(reconciliationId)}
  );

  const createdRows = await Promise.all(
    lineRecords.map((record) => db.create(Tables.kitchen_reconciliation_items, record))
  );
  const itemRefs = createdRows
    .map(([created]) => created?.id)
    .filter((id): id is NonNullable<typeof id> => Boolean(id));

  return itemRefs;
};

const getLastReconciliationDate = async (
  db: DatabaseClient,
  kitchenId: string
): Promise<string | null> => {
  const [rows] = await db.query(
    `
      SELECT business_date FROM ${Tables.kitchen_reconciliations}
      WHERE kitchen = $kitchen AND superseded_by = NONE
      ORDER BY business_date DESC
      LIMIT 1
    `,
    {kitchen: toKitchenRecordId(kitchenId)}
  );
  return unwrapRows<{business_date: string}>(rows)[0]?.business_date ?? null;
};

const aggregateMovementData = async (
  db: DatabaseClient,
  kitchenId: string,
  window: ClosingCycleWindow,
  businessDate: string
) => {
  const kitchenDishIds = await fetchKitchenDishIds(db, kitchenId);

  const opening = await fetchOpeningStock(db, kitchenId, businessDate);
  const issued = await fetchIssuedQty(db, kitchenId, window);
  const {transfersIn, transfersOut} = await fetchTransfers(db, kitchenId, window);
  const theoretical = await fetchTheoreticalConsumption(db, kitchenDishIds, window);
  const itemIds = collectIngredientScope(opening, issued, transfersIn, transfersOut, theoretical);

  return {opening, issued, transfersIn, transfersOut, theoretical, itemIds};
};

const createReconciliationHeader = async (
  db: DatabaseClient,
  params: {
    kitchenId: string;
    businessDate: string;
    window: ClosingCycleWindow;
    status: KitchenReconciliationStatus;
    userId: string;
    revision?: number;
    parentId?: string;
  }
) => {
  const [created] = await db.create(Tables.kitchen_reconciliations, {
    kitchen: toKitchenRecordId(params.kitchenId),
    business_date: params.businessDate,
    date_from: toSurrealDateTime(params.window.date_from),
    date_to: toSurrealDateTime(params.window.date_to),
    status: params.status,
    revision: params.revision ?? 1,
    parent: params.parentId ? toRecordId(params.parentId) : undefined,
    created_at: nowSurrealDateTime(),
    created_by: toRecordId(params.userId),
  });

  if (!created?.id) {
    throw new Error("Failed to create reconciliation");
  }

  return recordToString(created.id);
};

export const createMissedStub = async (
  db: DatabaseClient,
  kitchenId: string,
  businessDate: string,
  userId: string
): Promise<KitchenReconciliation> => {
  const existing = await getActiveReconciliation(db, kitchenId, businessDate);
  if (existing) return existing;

  const window = await resolveBusinessDateWindow(db, businessDate);
  const {opening, issued, transfersIn, transfersOut, theoretical, itemIds} =
    await aggregateMovementData(db, kitchenId, window, businessDate);

  const reconciliationId = await createReconciliationHeader(db, {
    kitchenId,
    businessDate,
    window,
    status: "missed",
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
    true
  );
  await persistLineItems(db, reconciliationId, lineRecords);

  await writeRevision(db, reconciliationId, 1, "missed_stub", userId, {
    status: "missed",
    business_date: businessDate,
    items: lineRecords,
  });

  return (await getActiveReconciliation(db, kitchenId, businessDate))!;
};

export const generateReconciliation = async (
  db: DatabaseClient,
  kitchenId: string,
  businessDate: string,
  userId: string
): Promise<KitchenReconciliation> => {
  const existing = await getActiveReconciliation(db, kitchenId, businessDate);
  if (existing) {
    return existing;
  }

  const lastDate = await getLastReconciliationDate(db, kitchenId);
  if (lastDate && lastDate < businessDate) {
    const dates = enumerateBusinessDates(lastDate, businessDate);
    const gapDates = dates.slice(1, -1);
    for (const gapDate of gapDates) {
      await createMissedStub(db, kitchenId, gapDate, userId);
    }
  }

  const window = await resolveBusinessDateWindow(db, businessDate);
  const {opening, issued, transfersIn, transfersOut, theoretical, itemIds} =
    await aggregateMovementData(db, kitchenId, window, businessDate);

  const reconciliationId = await createReconciliationHeader(db, {
    kitchenId,
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
  await persistLineItems(db, reconciliationId, lineRecords);

  await writeRevision(db, reconciliationId, 1, "create", userId, {
    status: "draft",
    business_date: businessDate,
    items: lineRecords,
  });

  const result = (await getActiveReconciliation(db, kitchenId, businessDate))!;
  return result;
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
      FETCH kitchen
    `,
    {id: toReconciliationRecordId(reconciliationId)}
  );
  const source = unwrapRows<KitchenReconciliation>(rows)[0];
  if (!source) throw new Error("Reconciliation not found");
  await attachReconciliationItems(db, source);
  if (source.superseded_by) throw new Error("Reconciliation already superseded");

  const kitchenId = recordToString(source.kitchen?.id ?? source.kitchen);
  const newRevision = (source.revision ?? 1) + 1;

  const newId = await createReconciliationHeader(db, {
    kitchenId,
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

  await db.merge(reconciliationId, {superseded_by: toRecordId(newId)});

  const manualByItem = new Map<string, ManualLineInput>();
  source.items?.forEach((line) => {
    const itemId = recordToString(line.item?.id ?? line.item);
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
    const itemId = recordToString(line.item?.id ?? line.item);
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
      reconciliation: toRecordId(newId),
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
    {status: "draft", items: lineRecords},
    {status: source.status, items: snapshotItems(source.items ?? [])}
  );

  return (await getActiveReconciliation(db, kitchenId, source.business_date))!;
};

const upsertManualTables = async (
  db: DatabaseClient,
  reconciliationId: string,
  userId: string,
  lines: ManualLineInput[]
) => {
  for (const line of lines) {
    if (line.physicalCount != null) {
      const [existing] = await db.query(
        `
          SELECT * FROM ${Tables.kitchen_stock_counts}
          WHERE reconciliation = $reconciliation AND item = $item
        `,
        {reconciliation: toRecordId(reconciliationId), item: toInventoryItemRecordId(line.itemId)}
      );
      const row = unwrapRows<{id: string}>(existing)[0];
      if (row?.id) {
        await db.merge(row.id, {
          quantity: line.physicalCount,
          counted_at: nowSurrealDateTime(),
          counted_by: toRecordId(userId),
        });
      } else {
        await db.create(Tables.kitchen_stock_counts, {
          reconciliation: toRecordId(reconciliationId),
          item: toInventoryItemRecordId(line.itemId),
          quantity: line.physicalCount,
          counted_at: nowSurrealDateTime(),
          counted_by: toRecordId(userId),
        });
      }
    }

    const upsertQtyTable = async (
      table: Tables,
      qty: number | undefined,
      extra?: Record<string, unknown>
    ) => {
      if (qty === undefined) return;
      await db.query(
        `DELETE ${table} WHERE reconciliation = $reconciliation AND item = $item`,
        {reconciliation: toRecordId(reconciliationId), item: toInventoryItemRecordId(line.itemId)}
      );
      if (qty > 0) {
        await db.create(table, {
          reconciliation: toRecordId(reconciliationId),
          item: toInventoryItemRecordId(line.itemId),
          quantity: qty,
          created_at: nowSurrealDateTime(),
          created_by: toRecordId(userId),
          ...extra,
        });
      }
    };

    await upsertQtyTable(Tables.kitchen_wastes, line.wasteQty);
    await upsertQtyTable(Tables.kitchen_staff_meals, line.staffMealQty, {
      notes: "Reconciliation staff meal",
    });
    await upsertQtyTable(Tables.kitchen_complimentary_items, line.complimentaryQty);
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
    `SELECT * FROM ${Tables.kitchen_reconciliations} WHERE id = $id FETCH kitchen`,
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

  const beforeSnapshot = {items: snapshotItems(reconciliation.items ?? [])};
  await upsertManualTables(db, targetId, userId, lines);

  const manualByItem = new Map<string, ManualLineInput>();
  reconciliation.items?.forEach((line) => {
    const itemId = recordToString(line.item?.id ?? line.item);
    if (itemId) {
      manualByItem.set(itemId, {
        itemId,
        physicalCount: line.physical_count ?? null,
        wasteQty: line.waste_qty,
        staffMealQty: line.staff_meal_qty,
        complimentaryQty: line.complimentary_qty,
      });
    }
  });
  lines.forEach((line) => {
    const existing = manualByItem.get(line.itemId) ?? {itemId: line.itemId};
    manualByItem.set(line.itemId, {
      ...existing,
      ...line,
      itemId: line.itemId,
    });
  });

  const lineRecords = (reconciliation.items ?? []).map((line) => {
    const itemId = recordToString(line.item?.id ?? line.item);
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
      reconciliation: toReconciliationRecordId(targetId),
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
      posted_to_ledger: line.posted_to_ledger ?? false,
    };
  });

  await persistLineItems(db, targetId, lineRecords);

  const fieldChanges = lines.flatMap((line) => {
    const changes: Array<{item_id: string; field: string; old: unknown; new: unknown}> = [];
    const prev = beforeSnapshot.items.find((i) => i.item_id === line.itemId);
    if (line.physicalCount !== undefined) {
      changes.push({item_id: line.itemId, field: "physical_count", old: prev?.physical_count, new: line.physicalCount});
    }
    if (line.wasteQty !== undefined) {
      changes.push({item_id: line.itemId, field: "waste_qty", old: prev?.waste_qty, new: line.wasteQty});
    }
    if (line.staffMealQty !== undefined) {
      changes.push({item_id: line.itemId, field: "staff_meal_qty", old: prev?.staff_meal_qty, new: line.staffMealQty});
    }
    if (line.complimentaryQty !== undefined) {
      changes.push({item_id: line.itemId, field: "complimentary_qty", old: prev?.complimentary_qty, new: line.complimentaryQty});
    }
    return changes;
  });

  await writeRevision(
    db,
    targetId,
    reconciliation.revision ?? 1,
    changeType,
    userId,
    {items: lineRecords},
    beforeSnapshot,
    fieldChanges
  );

  const kitchenId = recordToString(reconciliation.kitchen?.id ?? reconciliation.kitchen);
  return (await getActiveReconciliation(db, kitchenId, reconciliation.business_date))!;
};

const resolveIssueForPosting = async (
  db: DatabaseClient,
  kitchenId: string,
  window: ClosingCycleWindow,
  userId: string
): Promise<string> => {
  const [rows] = await db.query(
    `
      SELECT id, created_at FROM ${Tables.inventory_issues}
      WHERE kitchen = $kitchen
        AND created_at >= $dateFrom
        AND created_at <= $dateTo
      ORDER BY created_at DESC
      LIMIT 1
    `,
    {
      kitchen: toKitchenRecordId(kitchenId),
      dateFrom: toSurrealDateTime(window.date_from),
      dateTo: toSurrealDateTime(window.date_to),
    }
  );

  const existing = unwrapRows<{id: unknown}>(rows)[0];
  if (existing?.id) return recordToString(existing.id);

  const invoiceNumber = await fetchNextSequentialNumber(db, Tables.inventory_issues, "invoice_number");
  const [created] = await db.create(Tables.inventory_issues, {
    kitchen: toKitchenRecordId(kitchenId),
    items: [],
    invoice_number: invoiceNumber,
    created_at: nowSurrealDateTime(),
    created_by: toRecordId(userId),
  });

  if (!created?.id) throw new Error("Failed to create issue for ledger posting");
  return recordToString(created.id);
};

const postToLedger = async (
  db: DatabaseClient,
  reconciliation: KitchenReconciliation,
  userId: string
) => {
  const kitchenId = recordToString(reconciliation.kitchen?.id ?? reconciliation.kitchen);
  const window = {
    date_from: toJsDate(reconciliation.date_from),
    date_to: toJsDate(reconciliation.date_to),
  };

  const issueId = await resolveIssueForPosting(db, kitchenId, window, userId);
  const reconciliationId = reconciliation.id;

  const [[wasteRows], [staffRows], [compRows]] = await Promise.all([
    db.query(
      `SELECT * FROM ${Tables.kitchen_wastes} WHERE reconciliation = $id AND ledger_waste_item = NONE FETCH item`,
      {id: toRecordId(reconciliationId)}
    ),
    db.query(
      `SELECT * FROM ${Tables.kitchen_staff_meals} WHERE reconciliation = $id AND ledger_waste_item = NONE FETCH item`,
      {id: toRecordId(reconciliationId)}
    ),
    db.query(
      `SELECT * FROM ${Tables.kitchen_complimentary_items} WHERE reconciliation = $id AND ledger_waste_item = NONE FETCH item`,
      {id: toRecordId(reconciliationId)}
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
      itemId: recordToString(row.item?.id ?? row.item),
      quantity: safeNumber(row.quantity),
      source: "reconciliation_waste",
    });
  });
  unwrapRows<{id: string; item: {id?: unknown}; quantity: number}>(staffRows).forEach((row) => {
    entries.push({
      table: Tables.kitchen_staff_meals,
      rowId: row.id,
      itemId: recordToString(row.item?.id ?? row.item),
      quantity: safeNumber(row.quantity),
      source: "staff_meal",
    });
  });
  unwrapRows<{id: string; item: {id?: unknown}; quantity: number}>(compRows).forEach((row) => {
    entries.push({
      table: Tables.kitchen_complimentary_items,
      rowId: row.id,
      itemId: recordToString(row.item?.id ?? row.item),
      quantity: safeNumber(row.quantity),
      source: "complimentary",
    });
  });

  if (entries.length === 0) return;

  const invoiceNumber = await fetchNextSequentialNumber(db, Tables.inventory_wastes, "invoice_number");
  const [wasteHeader] = await db.create(Tables.inventory_wastes, {
    issue: toRecordId(issueId),
    invoice_number: invoiceNumber,
    items: [],
    created_at: nowSurrealDateTime(),
    created_by: toRecordId(userId),
  });

  const wasteId = recordToString(wasteHeader?.id);
  const wasteItemRefs: unknown[] = [];

  for (const entry of entries) {
    if (entry.quantity <= 0) continue;

    const [issueItemRows] = await db.query(
      `
        SELECT id FROM ${Tables.inventory_issue_items}
        WHERE issue = $issue AND item = $item
        LIMIT 1
      `,
      {issue: toRecordId(issueId), item: toInventoryItemRecordId(entry.itemId)}
    );
    const issueItem = unwrapRows<{id: unknown}>(issueItemRows)[0];

    const [wasteItem] = await db.create(Tables.inventory_waste_items, {
      waste: toRecordId(wasteId),
      item: toInventoryItemRecordId(entry.itemId),
      issue_item: issueItem?.id ? toRecordId(issueItem.id) : undefined,
      quantity: entry.quantity,
      comments: entry.source,
      source: entry.source,
    });

    if (wasteItem?.id) {
      wasteItemRefs.push(wasteItem.id);
      await db.merge(entry.rowId, {ledger_waste_item: wasteItem.id});
    }
  }

  await db.merge(toRecordId(wasteId), {items: wasteItemRefs});

  await db.query(
    `UPDATE ${Tables.kitchen_reconciliation_items} SET posted_to_ledger = true WHERE reconciliation = $id`,
    {id: toRecordId(reconciliationId)}
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
      FETCH kitchen
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

  const beforeSnapshot = {status: reconciliation.status, items: snapshotItems(reconciliation.items ?? [])};

  await postToLedger(db, reconciliation, userId);

  const reconciliationRecordId = toFullRecordIdString(
    reconciliation.id,
    Tables.kitchen_reconciliations
  );

  await db.merge(toReconciliationRecordId(reconciliationRecordId), {
    status: "verified",
    verified_at: nowSurrealDateTime(),
    verified_by: toRecordId(userId),
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

  const kitchenId = recordToString(reconciliation.kitchen?.id ?? reconciliation.kitchen);
  return (await getActiveReconciliation(db, kitchenId, reconciliation.business_date))!;
};

export const discardDraftReconciliation = async (
  db: DatabaseClient,
  reconciliationId: unknown,
  kitchenId: string,
  businessDate: string,
  userId: string
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
  await Promise.all([
    db.query(`DELETE ${Tables.kitchen_reconciliation_items} WHERE reconciliation = $id`, {id: recId}),
    db.query(`DELETE ${Tables.kitchen_reconciliation_revisions} WHERE reconciliation = $id`, {id: recId}),
    db.query(`DELETE ${Tables.kitchen_stock_counts} WHERE reconciliation = $id`, {id: recId}),
    db.query(`DELETE ${Tables.kitchen_wastes} WHERE reconciliation = $id`, {id: recId}),
    db.query(`DELETE ${Tables.kitchen_staff_meals} WHERE reconciliation = $id`, {id: recId}),
    db.query(`DELETE ${Tables.kitchen_complimentary_items} WHERE reconciliation = $id`, {id: recId}),
  ]);

  await db.delete(id);

  return generateReconciliation(db, kitchenId, businessDate, userId);
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
      FETCH kitchen, created_by, verified_by
    `,
    params
  );

  let reconciliations = unwrapRows<KitchenReconciliation>(rows);

  if (filters.kitchenIds && filters.kitchenIds.length > 0) {
    const kitchenIdSet = new Set(
      filters.kitchenIds.map((id) => toFullRecordIdString(id, Tables.kitchens))
    );
    reconciliations = reconciliations.filter((reconciliation) => {
      const kitchenId = toFullRecordIdString(
        reconciliation.kitchen?.id ?? reconciliation.kitchen,
        Tables.kitchens
      );
      return kitchenIdSet.has(kitchenId);
    });
  }

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
