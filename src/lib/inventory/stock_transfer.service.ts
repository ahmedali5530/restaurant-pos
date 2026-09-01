import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {StockTransfer} from "@/api/model/stock_transfer.ts";
import {recordIdToString, recordToString} from "@/api/reports/shared/records.ts";
import {nowSurrealDateTime, toSurrealDateTime} from "@/lib/datetime.ts";
import {toLocationRecordId} from "@/lib/inventory/location.service.ts";
import {toRecordId} from "@/lib/utils.ts";
import type {IntegrationManager} from "@/integrations/core/integration-manager.ts";
import {publishInventoryTransferred} from "@/integrations/accounting/events/publish.ts";

type DatabaseClient = ReturnType<typeof useDB>;

/** Location↔location transfers. Legacy "store" means the same. */
export type StockTransferType = "location" | "store";

export type StockTransferLineInput = {
  itemId: string;
  quantity: number;
};

export type StockTransferInput = {
  type: StockTransferType;
  fromLocationId?: string;
  toLocationId?: string;
  /** @deprecated use fromLocationId */
  fromStoreId?: string;
  /** @deprecated use toLocationId */
  toStoreId?: string;
  createdAt?: Date;
  notes?: string;
  items: StockTransferLineInput[];
};

export type StockTransferListFilters = {
  locationId?: string;
  /** @deprecated use locationId */
  storeId?: string;
};

/** @deprecated Prefer toLocationRecordId — accepts location or legacy store ids. */
export const toStoreRecordId = (storeId: string) => {
  const key = recordIdToString(storeId) || String(storeId);
  if (key.startsWith(`${Tables.inventory_locations}:`) || key.includes("inventory_location")) {
    return toLocationRecordId(key);
  }
  const normalized = key.includes(":") ? key : `${Tables.inventory_stores}:${key}`;
  return toRecordId(normalized);
};

const toItemRecordId = (itemId: string) => {
  const key = recordIdToString(itemId) || String(itemId);
  const normalized = key.includes(":") ? key : `${Tables.inventory_items}:${key}`;
  return toRecordId(normalized);
};

const toTransferRecordId = (id: string) => {
  const key = recordIdToString(id) || String(id);
  const normalized = key.includes(":") ? key : `${Tables.stock_transfers}:${key}`;
  return toRecordId(normalized);
};

const toUserRecordId = (userId: string) => {
  const key = recordIdToString(userId) || String(userId);
  const normalized = key.includes(":") ? key : `${Tables.users}:${key}`;
  return toRecordId(normalized);
};

const resolveEndpointIds = (input: StockTransferInput) => ({
  fromId: input.fromLocationId || input.fromStoreId,
  toId: input.toLocationId || input.toStoreId,
});

const buildHeaderPayload = (
  input: StockTransferInput,
  userId?: string,
  options?: {status?: string}
) => {
  const {fromId, toId} = resolveEndpointIds(input);
  const payload: Record<string, unknown> = {
    notes: input.notes?.trim() || null,
    from_kitchen: null,
    to_kitchen: null,
    from_store: null,
    to_store: null,
    from_location: fromId ? toLocationRecordId(fromId) : null,
    to_location: toId ? toLocationRecordId(toId) : null,
  };

  if (options?.status) {
    payload.status = options.status;
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

  const locationFilter = filters.locationId || filters.storeId;
  if (locationFilter) {
    where.push("(from_location = $location OR to_location = $location)");
    params.location = toLocationRecordId(locationFilter);
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
      FETCH from_location, to_location, created_by`,
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
      `SELECT * FROM ONLY $id FETCH from_location, to_location, created_by`,
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
  userId: string,
  integrationManager?: IntegrationManager | null
): Promise<StockTransfer> => {
  const payload = {
    ...buildHeaderPayload(input, userId, {status: "draft"}),
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

  const itemIds = input.items.map((line) => line.itemId).filter(Boolean);
  let inventoryValue = 0;
  if (itemIds.length > 0) {
    const [rows] = await db.query(
      `SELECT id, average_price, price FROM ${Tables.inventory_items} WHERE id IN $ids`,
      { ids: itemIds.map((id) => toItemRecordId(id)) }
    );
    const items = (Array.isArray(rows) ? rows : []) as Array<{
      id: unknown;
      average_price?: number;
      price?: number;
    }>;
    const priceById = new Map(
      items.map((row) => [
        String(row.id),
        Number(row.average_price ?? row.price ?? 0),
      ])
    );
    inventoryValue = Number(
      input.items
        .reduce((sum, line) => {
          const unit = priceById.get(String(toItemRecordId(line.itemId))) ?? 0;
          return sum + Number(line.quantity || 0) * unit;
        }, 0)
        .toFixed(2)
    );
  }

  if (inventoryValue > 0) {
    await publishInventoryTransferred(integrationManager, {
      documentId: transferId,
      fromLocationId: input.fromLocationId || input.fromStoreId,
      toLocationId: input.toLocationId || input.toStoreId,
      inventoryValue,
    });
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

export const inferTransferType = (_transfer: StockTransfer): StockTransferType => {
  return "location";
};

const getTotalFromRows = (rows: unknown): number => {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return 0;
  const first = rows[0] as {total?: number};
  return Number(first?.total ?? 0);
};

export const fetchStoreTransferTotals = async (
  db: DatabaseClient,
  itemId: string,
  locationId: string,
  excludeTransferId?: string
): Promise<{transfersIn: number; transfersOut: number}> => {
  const params: Record<string, unknown> = {
    item: toItemRecordId(itemId),
    location: toLocationRecordId(locationId),
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
        WHERE to_location = $location
          AND from_location != NONE
          AND (status = 'posted' OR status = NONE)
      )${excludeClause}
      GROUP ALL`,
      params
    ),
    db.query(
      `SELECT math::sum(quantity) AS total FROM ${Tables.stock_transfer_items}
      WHERE item = $item AND transfer IN (
        SELECT VALUE id FROM ${Tables.stock_transfers}
        WHERE from_location = $location
          AND to_location != NONE
          AND (status = 'posted' OR status = NONE)
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
  locationId: string;
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
    const fromId = recordToString(transfer.from_location?.id ?? transfer.from_location);
    const toId = recordToString(transfer.to_location?.id ?? transfer.to_location);
    if (!fromId || !toId) continue;

    for (const line of transfer.items ?? []) {
      const itemId = recordToString(line.item?.id ?? line.item);
      if (!itemId) continue;

      rows.push({
        locationId: fromId,
        itemId,
        quantity: Number(line.quantity) || 0,
        direction: "out",
      });
      rows.push({
        locationId: toId,
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
  const where: string[] = [
    "from_location != NONE",
    "to_location != NONE",
  ];
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
    FETCH from_location, to_location, created_by`,
    params
  );

  return (rows ?? []) as StockTransfer[];
};
