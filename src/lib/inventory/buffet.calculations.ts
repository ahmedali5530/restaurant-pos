export type BuffetLineInput = {
  itemId: string;
  itemName?: string;
  perGuestQty: number;
  producedQty: number;
  startQty: number;
  refillQty: number;
  endQty: number | null;
  wasteQty: number;
  staffMealQty: number;
  totalFoodCost: number;
};

export type BuffetLineComputed = BuffetLineInput & {
  totalConsumed: number;
  theoreticalGuestQty: number;
  guestConsumption: number;
  varianceQty: number;
  unitFoodCost: number;
  overproductionQty: number;
};

export type BuffetSessionAnalytics = {
  actualGuests: number;
  buffetPrice: number;
  totalSales: number;
  totalFoodCost: number;
  costPerGuest: number;
  totalWasteQty: number;
  totalProducedQty: number;
  wastePercent: number;
  totalOverproduction: number;
  profit: number;
  profitMargin: number;
};

export type BuffetClosingValidation = {
  valid: boolean;
  errors: string[];
};

const roundQty = (value: number) => Math.round(value * 10000) / 10000;
const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const computeBuffetLine = (
  input: BuffetLineInput,
  actualGuests: number
): BuffetLineComputed => {
  const producedQty = roundQty(input.producedQty);
  const startQty = roundQty(input.startQty);
  const refillQty = roundQty(input.refillQty);
  const endQty = input.endQty == null ? 0 : roundQty(input.endQty);
  const wasteQty = roundQty(input.wasteQty);
  const staffMealQty = roundQty(input.staffMealQty);

  const totalConsumed = roundQty(startQty + producedQty + refillQty - endQty);
  const theoreticalGuestQty = roundQty(input.perGuestQty * actualGuests);
  const guestConsumption = roundQty(Math.max(0, totalConsumed - wasteQty - staffMealQty));
  const varianceQty = roundQty(guestConsumption - theoreticalGuestQty);
  const unitFoodCost =
    producedQty + refillQty > 0
      ? roundMoney(input.totalFoodCost / (producedQty + refillQty))
      : 0;
  const overproductionQty = roundQty(producedQty - theoreticalGuestQty - endQty);

  return {
    ...input,
    producedQty,
    startQty,
    refillQty,
    endQty: input.endQty == null ? null : endQty,
    wasteQty,
    staffMealQty,
    totalConsumed,
    theoreticalGuestQty,
    guestConsumption,
    varianceQty,
    unitFoodCost,
    overproductionQty,
  };
};

export const computeBuffetSessionAnalytics = (
  lines: BuffetLineComputed[],
  actualGuests: number,
  buffetPrice: number
): BuffetSessionAnalytics => {
  const totalFoodCost = roundMoney(lines.reduce((sum, line) => sum + line.totalFoodCost, 0));
  const totalWasteQty = roundQty(lines.reduce((sum, line) => sum + line.wasteQty, 0));
  const totalProducedQty = roundQty(
    lines.reduce((sum, line) => sum + line.producedQty + line.refillQty, 0)
  );
  const totalOverproduction = roundQty(
    lines.reduce((sum, line) => sum + line.overproductionQty, 0)
  );
  const totalSales = roundMoney(actualGuests * buffetPrice);
  const costPerGuest = actualGuests > 0 ? roundMoney(totalFoodCost / actualGuests) : 0;
  const wastePercent =
    totalProducedQty > 0 ? roundQty((totalWasteQty / totalProducedQty) * 100) : 0;
  const profit = roundMoney(totalSales - totalFoodCost);
  const profitMargin = totalSales > 0 ? roundQty((profit / totalSales) * 100) : 0;

  return {
    actualGuests,
    buffetPrice,
    totalSales,
    totalFoodCost,
    costPerGuest,
    totalWasteQty,
    totalProducedQty,
    wastePercent,
    totalOverproduction,
    profit,
    profitMargin,
  };
};

export const validateBuffetClosing = (params: {
  lines: BuffetLineComputed[];
  hasEndSnapshots: boolean;
  pendingBatches: number;
}): BuffetClosingValidation => {
  const errors: string[] = [];

  if (!params.hasEndSnapshots) {
    errors.push("End stock snapshots are required before closing");
  }

  if (params.pendingBatches > 0) {
    errors.push("All production batches must be completed or skipped before closing");
  }

  for (const line of params.lines) {
    if (line.endQty == null) {
      errors.push(`Leftover quantity required for ${line.itemName ?? line.itemId}`);
      continue;
    }

    if (line.wasteQty + line.staffMealQty > line.totalConsumed + 0.0001) {
      errors.push(
        `Waste and staff meals exceed total consumed for ${line.itemName ?? line.itemId}`
      );
    }
  }

  return {valid: errors.length === 0, errors};
};
