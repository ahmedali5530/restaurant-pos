import {InventoryItem} from "@/api/model/inventory_item.ts";
import {
  CostAllocationMethod,
  OutputDisposition,
  Recipe,
  RecipeItem,
  RecipeOutput,
} from "@/api/model/recipe.ts";
import {recordToString} from "@/api/reports/shared/records.ts";

export type ScaledInputLine = {
  itemId: string;
  itemName?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

export type ScaledOutputLine = {
  itemId: string;
  itemName?: string;
  quantity: number;
  yieldPercent: number;
  disposition: OutputDisposition;
  valueWeight: number;
  allocatedCost: number;
  unitCost: number;
};

export type ScaledRecipeResult = {
  scaleFactor: number;
  inputs: ScaledInputLine[];
  outputs: ScaledOutputLine[];
  totalInputCost: number;
  totalOutputCost: number;
  yieldLossPercent: number;
};

export type RecipeValidationResult = {
  valid: boolean;
  errors: string[];
};

export type RecipeForCalculation = Pick<Recipe, "base_batch_qty" | "cost_allocation"> & {
  items: Array<Pick<RecipeItem, "item" | "quantity">>;
  outputs: Array<
    Pick<RecipeOutput, "item" | "yield_percent" | "disposition" | "value_weight" | "is_primary">
  >;
};

const roundQty = (value: number) => Math.round(value * 10000) / 10000;
const roundMoney = (value: number) => Math.round(value * 100) / 100;

const resolveItemId = (item: unknown): string =>
  recordToString(
    typeof item === "object" && item !== null && "id" in item
      ? (item as {id?: unknown}).id ?? item
      : item
  ) ?? "";

const resolveItemName = (
  item: unknown,
  itemMeta: {name?: string}
): string | undefined => {
  if (itemMeta.name) return itemMeta.name;
  if (typeof item === "object" && item !== null && "name" in item) {
    return (item as InventoryItem).name;
  }
  return undefined;
};

export const getItemUnitCost = (item: {average_price?: number; price?: number}): number => {
  const avg = Number(item.average_price);
  if (avg > 0) return avg;
  return Number(item.price) || 0;
};

export const validateRecipe = (recipe: RecipeForCalculation): RecipeValidationResult => {
  const errors: string[] = [];

  if (!recipe.items?.length) {
    errors.push("Recipe must have at least one input item");
  }

  if (!recipe.outputs?.length) {
    errors.push("Recipe must have at least one output");
  }

  const primaryOutputs = recipe.outputs?.filter((o) => o.is_primary) ?? [];
  if (primaryOutputs.length !== 1) {
    errors.push("Recipe must have exactly one primary output");
  }

  for (const item of recipe.items ?? []) {
    if (Number(item.quantity) <= 0) {
      errors.push("Input quantities must be greater than zero");
      break;
    }
  }

  for (const output of recipe.outputs ?? []) {
    if (Number(output.yield_percent) <= 0) {
      errors.push("Output yield percentages must be greater than zero");
      break;
    }
  }

  if (Number(recipe.base_batch_qty) <= 0) {
    errors.push("Base batch quantity must be greater than zero");
  }

  return {valid: errors.length === 0, errors};
};

export const computeYieldLoss = (outputs: Array<Pick<RecipeOutput, "yield_percent">>): number => {
  const totalYield = outputs.reduce((sum, o) => sum + Number(o.yield_percent), 0);
  return roundQty(Math.max(0, 100 - totalYield));
};

export const computeScaleFactor = (producedQty: number, baseBatchQty: number): number => {
  if (baseBatchQty <= 0) return 0;
  return producedQty / baseBatchQty;
};

export const scaleRecipe = (
  recipe: RecipeForCalculation,
  producedQty: number,
  itemPrices: Map<string, {average_price?: number; price?: number; name?: string}>
): ScaledRecipeResult => {
  const scaleFactor = computeScaleFactor(producedQty, Number(recipe.base_batch_qty));
  const totalBaseInputQty = (recipe.items ?? []).reduce(
    (sum, line) => sum + Number(line.quantity),
    0
  );
  const totalScaledInputQty = totalBaseInputQty * scaleFactor;

  const inputs: ScaledInputLine[] = (recipe.items ?? []).map((line) => {
    const itemId = resolveItemId(line.item);
    const itemMeta = itemPrices.get(itemId) ?? {};
    const quantity = roundQty(Number(line.quantity) * scaleFactor);
    const unitCost = getItemUnitCost(itemMeta);
    return {
      itemId,
      itemName: resolveItemName(line.item, itemMeta),
      quantity,
      unitCost,
      totalCost: roundMoney(quantity * unitCost),
    };
  });

  const totalInputCost = roundMoney(inputs.reduce((sum, line) => sum + line.totalCost, 0));

  const rawOutputs = (recipe.outputs ?? []).map((line) => {
    const itemId = resolveItemId(line.item);
    const itemMeta = itemPrices.get(itemId) ?? {};
    const quantity = roundQty((Number(line.yield_percent) / 100) * totalScaledInputQty);
    return {
      itemId,
      itemName: resolveItemName(line.item, itemMeta),
      quantity,
      yieldPercent: Number(line.yield_percent),
      disposition: line.disposition,
      valueWeight: Number(line.value_weight) || 1,
      allocatedCost: 0,
      unitCost: 0,
    };
  });

  const outputsWithCosts = allocateOutputCosts(
    totalInputCost,
    rawOutputs,
    recipe.cost_allocation ?? "yield"
  );

  const totalOutputCost = roundMoney(
    outputsWithCosts
      .filter((o) => o.disposition === "inventory")
      .reduce((sum, line) => sum + line.allocatedCost, 0)
  );

  return {
    scaleFactor: roundQty(scaleFactor),
    inputs,
    outputs: outputsWithCosts,
    totalInputCost,
    totalOutputCost,
    yieldLossPercent: computeYieldLoss(recipe.outputs ?? []),
  };
};

export const allocateOutputCosts = (
  totalInputCost: number,
  outputs: Array<
    Pick<ScaledOutputLine, "itemId" | "quantity" | "yieldPercent" | "disposition" | "valueWeight">
  >,
  method: CostAllocationMethod
): ScaledOutputLine[] => {
  const inventoryOutputs = outputs.filter((o) => o.disposition === "inventory");

  let weights: number[];
  if (method === "value") {
    weights = inventoryOutputs.map((o) => Number(o.valueWeight) || 1);
  } else {
    weights = inventoryOutputs.map((o) => Number(o.yieldPercent) || 0);
  }

  const weightTotal = weights.reduce((sum, w) => sum + w, 0);

  const costByItemId = new Map<string, number>();
  inventoryOutputs.forEach((output, index) => {
    const share = weightTotal > 0 ? (weights[index] / weightTotal) * totalInputCost : 0;
    costByItemId.set(output.itemId, roundMoney(share));
  });

  return outputs.map((output) => {
    if (output.disposition === "waste") {
      return {
        ...output,
        allocatedCost: 0,
        unitCost: 0,
      };
    }

    const allocatedCost = costByItemId.get(output.itemId) ?? 0;
    const unitCost =
      Number(output.quantity) > 0 ? roundMoney(allocatedCost / Number(output.quantity)) : 0;

    return {
      ...output,
      allocatedCost,
      unitCost,
    };
  });
};

export const computeInputCosts = (
  inputs: Array<{quantity: number; itemId: string}>,
  itemPrices: Map<string, {average_price?: number; price?: number}>
): {lines: ScaledInputLine[]; totalCost: number} => {
  const lines = inputs.map((line) => {
    const itemMeta = itemPrices.get(line.itemId) ?? {};
    const unitCost = getItemUnitCost(itemMeta);
    const quantity = roundQty(Number(line.quantity));
    return {
      itemId: line.itemId,
      quantity,
      unitCost,
      totalCost: roundMoney(quantity * unitCost),
    };
  });

  return {
    lines,
    totalCost: roundMoney(lines.reduce((sum, line) => sum + line.totalCost, 0)),
  };
};
