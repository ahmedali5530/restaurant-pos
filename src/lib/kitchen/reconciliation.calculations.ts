/**
 * Pure calculation functions for kitchen inventory reconciliation lines.
 *
 * Formulas:
 * - expected_stock = opening + issued + transfers_in - transfers_out - theoretical_consumption
 * - actual_consumption = expected_stock - physical_count (0 when physical is null / MISSED)
 * - variance = actual_consumption - theoretical - waste - staff_meals - complimentary
 */
export type ReconciliationLineInput = {
  openingStock: number;
  issuedQty: number;
  transfersIn: number;
  transfersOut: number;
  theoreticalConsumption: number;
  physicalCount: number | null;
  wasteQty: number;
  staffMealQty: number;
  complimentaryQty: number;
};

export type ReconciliationLineComputed = ReconciliationLineInput & {
  expectedStock: number;
  actualConsumption: number;
  variance: number;
};

export function computeLine(input: ReconciliationLineInput): ReconciliationLineComputed {
  const expectedStock =
    input.openingStock + input.issuedQty + input.transfersIn
    - input.transfersOut - input.theoreticalConsumption;

  const actualConsumption =
    input.physicalCount == null
      ? 0
      : expectedStock - input.physicalCount;

  const variance =
    input.physicalCount == null
      ? 0
      : actualConsumption
        - input.theoreticalConsumption
        - input.wasteQty
        - input.staffMealQty
        - input.complimentaryQty;

  return {...input, expectedStock, actualConsumption, variance};
}

export type ReconciliationTotals = {
  totalVariance: number;
  totalActualConsumption: number;
  totalTheoreticalConsumption: number;
  lineCount: number;
  linesWithVariance: number;
};

export function computeTotals(lines: ReconciliationLineComputed[]): ReconciliationTotals {
  return lines.reduce(
    (acc, line) => ({
      totalVariance: acc.totalVariance + line.variance,
      totalActualConsumption: acc.totalActualConsumption + line.actualConsumption,
      totalTheoreticalConsumption: acc.totalTheoreticalConsumption + line.theoreticalConsumption,
      lineCount: acc.lineCount + 1,
      linesWithVariance: acc.linesWithVariance + (Math.abs(line.variance) > 0.0001 ? 1 : 0),
    }),
    {
      totalVariance: 0,
      totalActualConsumption: 0,
      totalTheoreticalConsumption: 0,
      lineCount: 0,
      linesWithVariance: 0,
    }
  );
}

export function getTopVarianceLines(
  lines: Array<ReconciliationLineComputed & {itemId?: string; itemName?: string}>,
  limit = 10
) {
  return [...lines]
    .filter((line) => line.physicalCount != null)
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, limit);
}
