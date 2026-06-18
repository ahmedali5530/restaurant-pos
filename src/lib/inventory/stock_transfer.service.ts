import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {StockTransfer} from "@/api/model/stock_transfer.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {nowSurrealDateTime, toSurrealDateTime} from "@/lib/datetime.ts";
import {toRecordId} from "@/lib/utils.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type StockTransferType = "kitchen" | "store";

export type StockTransferLineInput = {
  itemId: string;
  quantity: number;
};

export type StockTransferInput = {
  type: StockTransferType;
  fromKitchenId?: string;
  toKitchenId?: string;
  fromStoreId?: string;
  toStoreId?: string;
  createdAt?: Date;
  notes?: string;
  items: StockTransferLineInput[];
};

export type StockTransferListFilters = {
  kitchenId?: string;
  storeId?: string;
};

const toKitchenRecordId = (kitchenId: string) => {
  const normalized = kitchenId.includes(":") ? kitchenId : `${Tables.kitchens}:${kitchenId}`;
  return toRecordId(normalized);
};

export const toStoreRecordId = (storeId: string) => {
  const normalized = storeId.includes(":") ? storeId : `${Tables.inventory_stores}:${storeId}`;
  return toRecordId(normalized);
};

const toItemRecordId = (itemId: string) => {
  const normalized = itemId.includes(":") ? itemId : `${Tables.inventory_items}:${itemId}`;
  return toRecordId(normalized);
};

const toTransferRecordId = (id: string) => {
  const normalized = id.includes(":") ? id : `${Tables.stock_transfers}:${id}`;
  return toRecordId(normalized);
};

const toUserRecordId = (userId: string) => {
  const normalized = userId.includes(":") ? userId : `${Tables.users}:${userId}`;
  return toRecordId(normalized);
};

const buildHeaderPayload = (input: StockTransferInput, userId?: string) => {
  const payload: Record<string, unknown> = {
    notes: input.notes?.trim() || null,
    from_kitchen: null,
    to_kitchen: null,
    from_store: null,
    to_store: null,
  };

  if (input.type === "kitchen") {
    payload.from_kitchen = toKitchenRecordId(input.fromKitchenId!);
    payload.to_kitchen = toKitchenRecordId(input.toKitchenId!);
  } else {
    payload.from_store = toStoreRecordId(input.fromStoreId!);
    payload.to_store = toStoreRecordId(input.toStoreId!);
  }

  if (input.createdAt) {
    payload.created_at = toSurrealDateTime(input.createdAt);
  }

  if (userId) {
    payload.created_by = toUserRecordId(userId);
  }

  return payload;
};

const createLineItems = async (
  db: DatabaseClient,
  transferId: string,
  items: StockTransferLineInput[]
) => {
  const transferRef = toTransferRecordId(transferId);

  await Promise.all(
    items.map((line) =>
      db.create(Tables.stock_transfer_items, {
        transfer: transferRef,
        item: toItemRecordId(line.itemId),
        quantity: Number(line.quantity),
      })
    )
  );
};

export const listStockTransfers = async (
  db: DatabaseClient,
  {
    page = 0,
    pageSize = 10,
    filters = {},
  }: {
    page?: number;
    pageSize?: number;
    filters?: StockTransferListFilters;
  } = {}
): Promise<{total: number; data: StockTransfer[]}> => {
  const where: string[] = [];
  const params: Record<string, unknown> = {
    limit: pageSize,
    start: page * pageSize,
  };

  if (filters.kitchenId) {
    where.push("(from_kitchen = $kitchen OR to_kitchen = $kitchen)");
    params.kitchen = toKitchenRecordId(filters.kitchenId);
  }

  if (filters.storeId) {
    where.push("(from_store = $store OR to_store = $store)");
    params.store = toStoreRecordId(filters.storeId);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const [[countRows], [listRows]] = await Promise.all([
    db.query(
      `SELECT count() AS count FROM ${Tables.stock_transfers} ${whereClause} GROUP ALL`,
      params
    ),
    db.query(
      `SELECT *,
        (SELECT * FROM ${Tables.stock_transfer_items} WHERE transfer = $parent.id FETCH item) AS items
      FROM ${Tables.stock_transfers}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $limit START $start
      FETCH from_kitchen, to_kitchen, from_store, to_store, created_by`,
      params
    ),
  ]);

  return {
    total: (countRows as {count?: number}[])?.[0]?.count ?? 0,
    data: (listRows ?? []) as StockTransfer[],
  };
};

export const getStockTransfer = async (
  db: DatabaseClient,
  id: string
): Promise<StockTransfer | null> => {
  const recId = toTransferRecordId(id);

  const [[header], [items]] = await Promise.all([
    db.query(
      `SELECT * FROM ONLY $id FETCH from_kitchen, to_kitchen, from_store, to_store, created_by`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.stock_transfer_items} WHERE transfer = $id FETCH item`,
      {id: recId}
    ),
  ]);

  if (!header) {
    return null;
  }

  return {
    ...(header as StockTransfer),
    items: (items ?? []) as StockTransfer["items"],
  };
};

export const createStockTransfer = async (
  db: DatabaseClient,
  input: StockTransferInput,
  userId: string
): Promise<StockTransfer> => {
  const payload = {
    ...buildHeaderPayload(input, userId),
    created_at: input.createdAt
      ? toSurrealDateTime(input.createdAt)
      : nowSurrealDateTime(),
  };

  const [created] = await db.create(Tables.stock_transfers, payload);
  const transferId = recordToString(created?.id);

  if (!transferId) {
    throw new Error("Failed to create stock transfer");
  }

  await createLineItems(db, transferId, input.items);

  const result = await getStockTransfer(db, transferId);
  if (!result) {
    throw new Error("Failed to load created stock transfer");
  }

  return result;
};

export const updateStockTransfer = async (
  db: DatabaseClient,
  id: string,
  input: StockTransferInput
): Promise<StockTransfer> => {
  const recId = toTransferRecordId(id);
  const payload = buildHeaderPayload(input);

  await db.merge(recId, payload);
  await db.query(`DELETE ${Tables.stock_transfer_items} WHERE transfer = $id`, {id: recId});
  await createLineItems(db, id, input.items);

  const result = await getStockTransfer(db, id);
  if (!result) {
    throw new Error("Failed to load updated stock transfer");
  }

  return result;
};

export const inferTransferType = (transfer: StockTransfer): StockTransferType => {
  if (transfer.from_kitchen || transfer.to_kitchen) {
    return "kitchen";
  }
  return "store";
};

const getTotalFromRows = (rows: unknown): number => {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return 0;
  const first = rows[0] as {total?: number};
  return Number(first?.total ?? 0);
};

export const fetchStoreTransferTotals = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string,
  excludeTransferId?: string
): Promise<{transfersIn: number; transfersOut: number}> => {
  const params: Record<string, unknown> = {
    item: toItemRecordId(itemId),
    store: toStoreRecordId(storeId),
  };

  const excludeClause = excludeTransferId
    ? " AND transfer != $excludeTransfer"
    : "";
  if (excludeTransferId) {
    params.excludeTransfer = toTransferRecordId(excludeTransferId);
  }

  const [[transfersInRows], [transfersOutRows]] = await Promise.all([
    db.query(
      `SELECT math::sum(quantity) AS total FROM ${Tables.stock_transfer_items}
      WHERE item = $item AND transfer IN (
        SELECT VALUE id FROM ${Tables.stock_transfers}
        WHERE to_store = $store AND from_store != NONE
      )${excludeClause}
      GROUP ALL`,
      params
    ),
    db.query(
      `SELECT math::sum(quantity) AS total FROM ${Tables.stock_transfer_items}
      WHERE item = $item AND transfer IN (
        SELECT VALUE id FROM ${Tables.stock_transfers}
        WHERE from_store = $store AND to_store != NONE
      )${excludeClause}
      GROUP ALL`,
      params
    ),
  ]);

  return {
    transfersIn: getTotalFromRows(transfersInRows),
    transfersOut: getTotalFromRows(transfersOutRows),
  };
};

export type StoreTransferAggregateRow = {
  storeId: string;
  itemId: string;
  quantity: number;
  direction: "in" | "out";
};

export const fetchStoreTransferAggregates = async (
  db: DatabaseClient,
  dateFrom?: string | null,
  dateTo?: string | null
): Promise<StoreTransferAggregateRow[]> => {
  const transfers = await fetchStoreTransferLinesForReport(db, dateFrom, dateTo);
  const rows: StoreTransferAggregateRow[] = [];

  for (const transfer of transfers) {
    const fromId = recordToString(transfer.from_store?.id ?? transfer.from_store);
    const toId = recordToString(transfer.to_store?.id ?? transfer.to_store);
    if (!fromId || !toId) continue;

    for (const line of transfer.items ?? []) {
      const itemId = recordToString(line.item?.id ?? line.item);
      if (!itemId) continue;

      rows.push({
        storeId: fromId,
        itemId,
        quantity: Number(line.quantity) || 0,
        direction: "out",
      });
      rows.push({
        storeId: toId,
        itemId,
        quantity: Number(line.quantity) || 0,
        direction: "in",
      });
    }
  }

  return rows;
};

export const fetchStoreTransferLinesForReport = async (
  db: DatabaseClient,
  dateFrom?: string | null,
  dateTo?: string | null
) => {
  const where: string[] = ["from_store != NONE", "to_store != NONE"];
  const params: Record<string, unknown> = {};
  const dbFormat = import.meta.env.VITE_DB_DATABASE_FORMAT as string;

  if (dateFrom) {
    where.push(`time::format(created_at, '${dbFormat}') >= $dateFrom`);
    params.dateFrom = dateFrom;
  }
  if (dateTo) {
    where.push(`time::format(created_at, '${dbFormat}') <= $dateTo`);
    params.dateTo = dateTo;
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await db.query(
    `SELECT *,
      (SELECT * FROM ${Tables.stock_transfer_items} WHERE transfer = $parent.id FETCH item) AS items
    FROM ${Tables.stock_transfers}
    ${whereClause}
    ORDER BY created_at ASC
    FETCH from_store, to_store, created_by`,
    params
  );

  return (rows ?? []) as StockTransfer[];
};
