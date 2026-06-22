import type {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {ProductionBatch} from "@/api/model/production_batch.ts";
import {
  CostAllocationMethod,
  OutputDisposition,
  Recipe,
} from "@/api/model/recipe.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {
  scaleRecipe,
  validateRecipe,
  type ScaledRecipeResult,
} from "@/lib/inventory/production.calculations.ts";
import {toStoreRecordId} from "@/lib/inventory/stock_transfer.service.ts";
import {nowSurrealDateTime} from "@/lib/datetime.ts";
import {validateProductionAvailability} from "@/utils/inventory.ts";
import {fetchNextSequentialNumber} from "@/utils/recordNumbers.ts";
import {toRecordId} from "@/lib/utils.ts";

type DatabaseClient = ReturnType<typeof useDB>;

export type RecipeItemInput = {
  itemId: string;
  quantity: number;
  sortOrder?: number;
};

export type RecipeOutputInput = {
  itemId: string;
  yieldPercent: number;
  disposition: OutputDisposition;
  valueWeight?: number;
  isPrimary?: boolean;
  sortOrder?: number;
};

export type RecipeInput = {
  name: string;
  code?: string;
  notes?: string;
  isActive?: boolean;
  baseBatchQty: number;
  costAllocation: CostAllocationMethod;
  items: RecipeItemInput[];
  outputs: RecipeOutputInput[];
};

export type ProductionBatchCompleteInput = {
  recipeId: string;
  storeId: string;
  producedQty: number;
  batchNumber?: string;
  notes?: string;
  updateItemCost?: boolean;
};

export type ProductionBatchListFilters = {
  storeId?: string;
  recipeId?: string;
  dateFrom?: string;
  dateTo?: string;
};

const toItemRecordId = (itemId: string) => {
  const normalized = itemId.includes(":") ? itemId : `${Tables.inventory_items}:${itemId}`;
  return toRecordId(normalized);
};

const toOutputRecordId = (id: string) => {
  const normalized = id.includes(":") ? id : `${Tables.recipe_outputs}:${id}`;
  return toRecordId(normalized);
};

const toRecipeRecordId = (id: string) => {
  const normalized = id.includes(":") ? id : `${Tables.recipes}:${id}`;
  return toRecordId(normalized);
};

const toBatchRecordId = (id: string) => {
  const normalized = id.includes(":") ? id : `${Tables.production_batches}:${id}`;
  return toRecordId(normalized);
};

const toUserRecordId = (userId: string) => {
  const normalized = userId.includes(":") ? userId : `${Tables.users}:${userId}`;
  return toRecordId(normalized);
};

const getTotalFromRows = (rows: unknown): number => {
  if (!rows || !Array.isArray(rows) || rows.length === 0) return 0;
  const first = rows[0] as {total?: number};
  return Number(first?.total ?? 0);
};

const fetchItemPrices = async (
  db: DatabaseClient,
  itemIds: string[]
): Promise<Map<string, {average_price?: number; price?: number; name?: string}>> => {
  const map = new Map<string, {average_price?: number; price?: number; name?: string}>();
  if (itemIds.length === 0) return map;

  const uniqueIds = [...new Set(itemIds)];
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.inventory_items} WHERE id IN $ids`,
    {ids: uniqueIds.map(toItemRecordId)}
  );

  for (const row of (rows ?? []) as Array<{
    id: unknown;
    name?: string;
    price?: number;
    average_price?: number;
  }>) {
    const id = recordToString(row.id);
    if (id) {
      map.set(id, {
        name: row.name,
        price: row.price,
        average_price: row.average_price,
      });
    }
  }

  return map;
};

export const listRecipes = async (
  db: DatabaseClient,
  {
    page = 0,
    pageSize = 10,
    activeOnly = false,
  }: {page?: number; pageSize?: number; activeOnly?: boolean} = {}
): Promise<{total: number; data: Recipe[]}> => {
  const where = activeOnly ? "WHERE is_active = true" : "";
  const params = {limit: pageSize, start: page * pageSize};

  const [[countRows], [listRows]] = await Promise.all([
    db.query(`SELECT count() AS count FROM ${Tables.recipes} ${where} GROUP ALL`, params),
    db.query(
      `SELECT *,
        (SELECT * FROM ${Tables.recipe_items} WHERE recipe = $parent.id ORDER BY sort_order FETCH item) AS items,
        (SELECT * FROM ${Tables.recipe_outputs} WHERE recipe = $parent.id ORDER BY sort_order FETCH item) AS outputs
      FROM ${Tables.recipes}
      ${where}
      ORDER BY name ASC
      LIMIT $limit START $start
      FETCH created_by, primary_output`,
      params
    ),
  ]);

  return {
    total: (countRows as {count?: number}[])?.[0]?.count ?? 0,
    data: (listRows ?? []) as Recipe[],
  };
};

export const getRecipe = async (db: DatabaseClient, id: string): Promise<Recipe | null> => {
  const recId = toRecipeRecordId(id);

  const [[header], [items], [outputs]] = await Promise.all([
    db.query(
      `SELECT * FROM ONLY $id FETCH created_by, primary_output`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.recipe_items} WHERE recipe = $id ORDER BY sort_order FETCH item`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.recipe_outputs} WHERE recipe = $id ORDER BY sort_order FETCH item`,
      {id: recId}
    ),
  ]);

  if (!header) return null;

  return {
    ...(header as Recipe),
    items: (items ?? []) as Recipe["items"],
    outputs: (outputs ?? []) as Recipe["outputs"],
  };
};

const createRecipeChildren = async (
  db: DatabaseClient,
  recipeId: string,
  input: RecipeInput
) => {
  const recipeRef = toRecipeRecordId(recipeId);
  let primaryOutputId: string | null = null;

  await Promise.all(
    input.items.map((line, index) =>
      db.create(Tables.recipe_items, {
        recipe: recipeRef,
        item: toItemRecordId(line.itemId),
        quantity: Number(line.quantity),
        sort_order: line.sortOrder ?? index,
      })
    )
  );

  const outputRecords = await Promise.all(
    input.outputs.map(async (line, index) => {
      const [record] = await db.create(Tables.recipe_outputs, {
        recipe: recipeRef,
        item: toItemRecordId(line.itemId),
        yield_percent: Number(line.yieldPercent),
        disposition: line.disposition,
        value_weight: Number(line.valueWeight ?? 1),
        is_primary: Boolean(line.isPrimary),
        sort_order: line.sortOrder ?? index,
      });
      return record;
    })
  );

  const primaryIndex = input.outputs.findIndex((o) => o.isPrimary);
  if (primaryIndex >= 0 && outputRecords[primaryIndex]?.id) {
    primaryOutputId = recordToString(outputRecords[primaryIndex].id);
    if (primaryOutputId) {
      await db.merge(recipeRef, {primary_output: toOutputRecordId(primaryOutputId)});
    }
  }

  return primaryOutputId;
};

export const createRecipe = async (
  db: DatabaseClient,
  input: RecipeInput,
  userId: string
): Promise<Recipe> => {
  const validation = validateRecipe({
    base_batch_qty: input.baseBatchQty,
    cost_allocation: input.costAllocation,
    items: input.items.map((i) => ({item: {id: i.itemId} as never, quantity: i.quantity})),
    outputs: input.outputs.map((o) => ({
      item: {id: o.itemId} as never,
      yield_percent: o.yieldPercent,
      disposition: o.disposition,
      value_weight: o.valueWeight ?? 1,
      is_primary: Boolean(o.isPrimary),
    })),
  });

  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  const [created] = await db.create(Tables.recipes, {
    name: input.name.trim(),
    code: input.code?.trim() || null,
    notes: input.notes?.trim() || null,
    is_active: input.isActive !== false,
    base_batch_qty: Number(input.baseBatchQty),
    cost_allocation: input.costAllocation,
    created_by: toUserRecordId(userId),
    created_at: nowSurrealDateTime(),
  });

  const recipeId = recordToString(created?.id);
  if (!recipeId) throw new Error("Failed to create recipe");

  await createRecipeChildren(db, recipeId, input);

  const result = await getRecipe(db, recipeId);
  if (result) return result;

  return {
    id: recipeId,
    name: input.name.trim(),
    code: input.code?.trim(),
    notes: input.notes?.trim(),
    is_active: input.isActive !== false,
    base_batch_qty: Number(input.baseBatchQty),
    cost_allocation: input.costAllocation,
    created_by: created?.created_by,
    created_at: created?.created_at,
    items: [],
    outputs: [],
  } as Recipe;
};

export const updateRecipe = async (
  db: DatabaseClient,
  id: string,
  input: RecipeInput
): Promise<Recipe> => {
  const recId = toRecipeRecordId(id);

  const validation = validateRecipe({
    base_batch_qty: input.baseBatchQty,
    cost_allocation: input.costAllocation,
    items: input.items.map((i) => ({item: {id: i.itemId} as never, quantity: i.quantity})),
    outputs: input.outputs.map((o) => ({
      item: {id: o.itemId} as never,
      yield_percent: o.yieldPercent,
      disposition: o.disposition,
      value_weight: o.valueWeight ?? 1,
      is_primary: Boolean(o.isPrimary),
    })),
  });

  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  await db.merge(recId, {
    name: input.name.trim(),
    code: input.code?.trim() || null,
    notes: input.notes?.trim() || null,
    is_active: input.isActive !== false,
    base_batch_qty: Number(input.baseBatchQty),
    cost_allocation: input.costAllocation,
    primary_output: null,
  });

  await db.query(`DELETE ${Tables.recipe_items} WHERE recipe = $id`, {id: recId});
  await db.query(`DELETE ${Tables.recipe_outputs} WHERE recipe = $id`, {id: recId});
  await createRecipeChildren(db, id, input);

  const result = await getRecipe(db, id);
  if (result) return result;

  return {
    id,
    name: input.name.trim(),
    code: input.code?.trim(),
    notes: input.notes?.trim(),
    is_active: input.isActive !== false,
    base_batch_qty: Number(input.baseBatchQty),
    cost_allocation: input.costAllocation,
    items: [],
    outputs: [],
  } as Recipe;
};

export const deleteRecipe = async (db: DatabaseClient, id: string): Promise<void> => {
  const recId = toRecipeRecordId(id);
  await db.query(`DELETE ${Tables.recipe_items} WHERE recipe = $id`, {id: recId});
  await db.query(`DELETE ${Tables.recipe_outputs} WHERE recipe = $id`, {id: recId});
  await db.delete(recId);
};

export const previewProductionBatch = async (
  db: DatabaseClient,
  recipeId: string,
  producedQty: number
): Promise<ScaledRecipeResult> => {
  const recipe = await getRecipe(db, recipeId);
  if (!recipe) throw new Error("Recipe not found");

  const itemIds = [
    ...(recipe.items ?? []).map((i) => recordToString(i.item?.id ?? i.item) ?? ""),
    ...(recipe.outputs ?? []).map((o) => recordToString(o.item?.id ?? o.item) ?? ""),
  ].filter(Boolean);

  const prices = await fetchItemPrices(db, itemIds);
  return scaleRecipe(
    {
      base_batch_qty: recipe.base_batch_qty,
      cost_allocation: recipe.cost_allocation,
      items: recipe.items ?? [],
      outputs: recipe.outputs ?? [],
    },
    producedQty,
    prices
  );
};

const generateBatchNumber = async (db: DatabaseClient): Promise<string> => {
  const [rows] = await db.query(
    `SELECT count() AS count FROM ${Tables.production_batches} GROUP ALL`
  );
  const count = (rows as {count?: number}[])?.[0]?.count ?? 0;
  return `PB-${String(Number(count) + 1).padStart(6, "0")}`;
};

export const completeProductionBatch = async (
  db: DatabaseClient,
  input: ProductionBatchCompleteInput,
  userId: string
): Promise<ProductionBatch> => {
  const recipe = await getRecipe(db, input.recipeId);
  if (!recipe) throw new Error("Recipe not found");
  if (!recipe.is_active) throw new Error("Recipe is not active");

  const scaled = await previewProductionBatch(db, input.recipeId, input.producedQty);

  const availability = await validateProductionAvailability(
    db,
    input.storeId,
    scaled.inputs.map((line) => ({itemId: line.itemId, quantity: line.quantity}))
  );

  if (!availability.valid) {
    throw new Error(
      `Insufficient stock for item. Available: ${availability.available}, requested: ${availability.requested}`
    );
  }

  const batchNumber = input.batchNumber?.trim() || (await generateBatchNumber(db));
  const storeRef = toStoreRecordId(input.storeId);
  const now = nowSurrealDateTime();

  const [batchHeader] = await db.create(Tables.production_batches, {
    recipe: toRecipeRecordId(input.recipeId),
    store: storeRef,
    batch_number: batchNumber,
    scale_factor: scaled.scaleFactor,
    produced_qty: Number(input.producedQty),
    status: "completed",
    total_input_cost: scaled.totalInputCost,
    total_output_cost: scaled.totalOutputCost,
    yield_loss_percent: scaled.yieldLossPercent,
    cost_allocation: recipe.cost_allocation,
    created_by: toUserRecordId(userId),
    created_at: now,
    completed_at: now,
    notes: input.notes?.trim() || null,
  });

  const batchId = recordToString(batchHeader?.id);
  if (!batchId) throw new Error("Failed to create production batch");

  const batchRef = toBatchRecordId(batchId);

  await Promise.all(
    scaled.inputs.map((line) =>
      db.create(Tables.production_batch_inputs, {
        batch: batchRef,
        item: toItemRecordId(line.itemId),
        store: storeRef,
        quantity: line.quantity,
        unit_cost: line.unitCost,
        total_cost: line.totalCost,
      })
    )
  );

  const wasteOutputs = scaled.outputs.filter((o) => o.disposition === "waste" && o.quantity > 0);
  let wasteHeaderId: string | null = null;

  if (wasteOutputs.length > 0) {
    const invoiceNumber = await fetchNextSequentialNumber(db, Tables.inventory_wastes, "invoice_number");
    const [wasteHeader] = await db.create(Tables.inventory_wastes, {
      created_at: now,
      created_by: toUserRecordId(userId),
      invoice_number: invoiceNumber,
    });
    wasteHeaderId = recordToString(wasteHeader?.id);
  }

  await Promise.all(
    scaled.outputs.map(async (line) => {
      let ledgerWasteItem = null;

      if (line.disposition === "waste" && line.quantity > 0 && wasteHeaderId) {
        const [wasteItem] = await db.create(Tables.inventory_waste_items, {
          waste: toRecordId(wasteHeaderId),
          item: toItemRecordId(line.itemId),
          quantity: line.quantity,
          comments: `Production batch ${batchNumber}`,
          source: "production",
        });
        ledgerWasteItem = wasteItem?.id ?? null;
      }

      await db.create(Tables.production_batch_outputs, {
        batch: batchRef,
        item: toItemRecordId(line.itemId),
        store: storeRef,
        quantity: line.quantity,
        yield_percent: line.yieldPercent,
        disposition: line.disposition,
        allocated_cost: line.allocatedCost,
        unit_cost: line.unitCost,
        ledger_waste_item: ledgerWasteItem,
      });

      if (input.updateItemCost && line.disposition === "inventory" && line.unitCost > 0) {
        await db.merge(toItemRecordId(line.itemId), {
          average_price: line.unitCost,
        });
      }
    })
  );

  const result = await getProductionBatch(db, batchId);
  if (result) return result;

  return {
    id: batchId,
    recipe: recipe as ProductionBatch["recipe"],
    store: batchHeader?.store as ProductionBatch["store"],
    batch_number: batchNumber,
    scale_factor: scaled.scaleFactor,
    produced_qty: Number(input.producedQty),
    status: "completed",
    total_input_cost: scaled.totalInputCost,
    total_output_cost: scaled.totalOutputCost,
    yield_loss_percent: scaled.yieldLossPercent,
    cost_allocation: recipe.cost_allocation,
    created_by: batchHeader?.created_by as ProductionBatch["created_by"],
    created_at: batchHeader?.created_at as ProductionBatch["created_at"],
    completed_at: now,
    notes: input.notes?.trim() || undefined,
    inputs: [],
    outputs: [],
  } as ProductionBatch;
};

export const listProductionBatches = async (
  db: DatabaseClient,
  {
    page = 0,
    pageSize = 10,
    filters = {},
  }: {
    page?: number;
    pageSize?: number;
    filters?: ProductionBatchListFilters;
  } = {}
): Promise<{total: number; data: ProductionBatch[]}> => {
  const where: string[] = [];
  const params: Record<string, unknown> = {
    limit: pageSize,
    start: page * pageSize,
  };
  const dbFormat = import.meta.env.VITE_DB_DATABASE_FORMAT as string;

  if (filters.storeId) {
    where.push("store = $store");
    params.store = toStoreRecordId(filters.storeId);
  }
  if (filters.recipeId) {
    where.push("recipe = $recipe");
    params.recipe = toRecipeRecordId(filters.recipeId);
  }
  if (filters.dateFrom) {
    where.push(`time::format(created_at, '${dbFormat}') >= $dateFrom`);
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    where.push(`time::format(created_at, '${dbFormat}') <= $dateTo`);
    params.dateTo = filters.dateTo;
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const [[countRows], [listRows]] = await Promise.all([
    db.query(
      `SELECT count() AS count FROM ${Tables.production_batches} ${whereClause} GROUP ALL`,
      params
    ),
    db.query(
      `SELECT * FROM ${Tables.production_batches}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $limit START $start
      FETCH recipe, store, created_by`,
      params
    ),
  ]);

  return {
    total: (countRows as {count?: number}[])?.[0]?.count ?? 0,
    data: (listRows ?? []) as ProductionBatch[],
  };
};

export const getProductionBatch = async (
  db: DatabaseClient,
  id: string
): Promise<ProductionBatch | null> => {
  const recId = toBatchRecordId(id);

  const [[header], [inputs], [outputs]] = await Promise.all([
    db.query(
      `SELECT * FROM ONLY $id FETCH recipe, store, created_by`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.production_batch_inputs} WHERE batch = $id FETCH item, store`,
      {id: recId}
    ),
    db.query(
      `SELECT * FROM ${Tables.production_batch_outputs} WHERE batch = $id FETCH item, store, ledger_waste_item`,
      {id: recId}
    ),
  ]);

  if (!header) return null;

  return {
    ...(header as ProductionBatch),
    inputs: (inputs ?? []) as ProductionBatch["inputs"],
    outputs: (outputs ?? []) as ProductionBatch["outputs"],
  };
};

export const fetchProductionInputTotals = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<number> => {
  const [rows] = await db.query(
    `SELECT math::sum(quantity) AS total FROM ${Tables.production_batch_inputs}
    WHERE item = $item AND store = $store
    AND batch IN (SELECT VALUE id FROM ${Tables.production_batches} WHERE status = 'completed')
    GROUP ALL`,
    {item: toItemRecordId(itemId), store: toStoreRecordId(storeId)}
  );
  return getTotalFromRows(rows);
};

export const fetchProductionOutputTotals = async (
  db: DatabaseClient,
  itemId: string,
  storeId: string
): Promise<number> => {
  const [rows] = await db.query(
    `SELECT math::sum(quantity) AS total FROM ${Tables.production_batch_outputs}
    WHERE item = $item AND store = $store AND disposition = 'inventory'
    AND batch IN (SELECT VALUE id FROM ${Tables.production_batches} WHERE status = 'completed')
    GROUP ALL`,
    {item: toItemRecordId(itemId), store: toStoreRecordId(storeId)}
  );
  return getTotalFromRows(rows);
};

export type ProductionReportLine = {
  batchId: string;
  batchNumber: string;
  createdAt: Date;
  recipeName: string;
  storeId: string;
  storeName: string;
  itemId: string;
  producedQty: number;
  totalInputCost: number;
  totalOutputCost: number;
  yieldLossPercent: number;
  itemName: string;
  quantity: number;
  direction: "in" | "out";
  unitCost: number;
  totalCost: number;
  disposition?: OutputDisposition;
};

export const fetchProductionLinesForReport = async (
  db: DatabaseClient,
  filters: ProductionBatchListFilters = {}
): Promise<ProductionReportLine[]> => {
  const where: string[] = ["status = 'completed'"];
  const params: Record<string, unknown> = {};
  const dbFormat = import.meta.env.VITE_DB_DATABASE_FORMAT as string;

  if (filters.storeId) {
    where.push("store = $store");
    params.store = toStoreRecordId(filters.storeId);
  }
  if (filters.recipeId) {
    where.push("recipe = $recipe");
    params.recipe = toRecipeRecordId(filters.recipeId);
  }
  if (filters.dateFrom) {
    where.push(`time::format(created_at, '${dbFormat}') >= $dateFrom`);
    params.dateFrom = filters.dateFrom;
  }
  if (filters.dateTo) {
    where.push(`time::format(created_at, '${dbFormat}') <= $dateTo`);
    params.dateTo = filters.dateTo;
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const [batches] = await db.query(
    `SELECT *,
      (SELECT * FROM ${Tables.production_batch_inputs} WHERE batch = $parent.id FETCH item) AS inputs,
      (SELECT * FROM ${Tables.production_batch_outputs} WHERE batch = $parent.id FETCH item) AS outputs
    FROM ${Tables.production_batches}
    ${whereClause}
    ORDER BY created_at ASC
    FETCH recipe, store`,
    params
  );

  const lines: ProductionReportLine[] = [];

  for (const batch of (batches ?? []) as ProductionBatch[]) {
    const batchId = recordToString(batch.id) ?? "";
    const recipeName =
      typeof batch.recipe === "object" ? batch.recipe.name : String(batch.recipe);
    const storeId = recordToString(batch.store?.id ?? batch.store) ?? "";
    const storeName =
      typeof batch.store === "object" ? batch.store.name : String(batch.store);
    const createdAt =
      batch.created_at instanceof Date
        ? batch.created_at
        : new Date(String(batch.created_at));

    for (const input of batch.inputs ?? []) {
      const itemName =
        typeof input.item === "object" ? input.item.name : String(input.item);
      const itemId = recordToString(input.item?.id ?? input.item) ?? "";
      lines.push({
        batchId,
        batchNumber: batch.batch_number,
        createdAt,
        recipeName,
        storeId,
        storeName,
        itemId,
        producedQty: batch.produced_qty,
        totalInputCost: batch.total_input_cost,
        totalOutputCost: batch.total_output_cost,
        yieldLossPercent: batch.yield_loss_percent,
        itemName,
        quantity: Number(input.quantity),
        direction: "out",
        unitCost: Number(input.unit_cost),
        totalCost: Number(input.total_cost),
      });
    }

    for (const output of batch.outputs ?? []) {
      if (output.disposition === "waste") continue;
      const itemName =
        typeof output.item === "object" ? output.item.name : String(output.item);
      const itemId = recordToString(output.item?.id ?? output.item) ?? "";
      lines.push({
        batchId,
        batchNumber: batch.batch_number,
        createdAt,
        recipeName,
        storeId,
        storeName,
        itemId,
        producedQty: batch.produced_qty,
        totalInputCost: batch.total_input_cost,
        totalOutputCost: batch.total_output_cost,
        yieldLossPercent: batch.yield_loss_percent,
        itemName,
        quantity: Number(output.quantity),
        direction: "in",
        unitCost: Number(output.unit_cost),
        totalCost: Number(output.allocated_cost),
        disposition: output.disposition,
      });
    }
  }

  return lines;
};

export const fetchProductionBatchLinesForDetailedReport = async (
  db: DatabaseClient,
  dateFrom?: string | null,
  dateTo?: string | null
) => {
  return fetchProductionLinesForReport(db, {
    dateFrom: dateFrom ?? undefined,
    dateTo: dateTo ?? undefined,
  });
};
