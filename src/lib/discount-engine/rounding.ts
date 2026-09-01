import { CURRENCY_DECIMALS } from '@/lib/discount-engine/constants.ts'

export const roundCurrency = (value: number): number => {
  const factor = 10 ** CURRENCY_DECIMALS
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/** Largest remainder method — allocations sum exactly to total */
export const allocateProportionally = (
  total: number,
  weights: { id: string; weight: number }[]
): { id: string; amount: number }[] => {
  if (weights.length === 0) {
    return []
  }
  const weightSum = weights.reduce((s, w) => s + w.weight, 0)
  if (weightSum <= 0) {
    return weights.map(w => ({ id: w.id, amount: 0 }))
  }

  const rounded = weights.map(w => {
    const raw = (total * w.weight) / weightSum
    const floored = Math.floor(raw * 100) / 100
    return { id: w.id, amount: floored, remainder: raw - floored }
  })

  let allocated = rounded.reduce((s, r) => s + r.amount, 0)
  let cents = roundCurrency(total - allocated)
  const sorted = [...rounded].sort((a, b) => b.remainder - a.remainder)

  let i = 0
  while (cents >= 0.01 && sorted.length > 0) {
    sorted[i % sorted.length].amount = roundCurrency(sorted[i % sorted.length].amount + 0.01)
    cents = roundCurrency(cents - 0.01)
    i++
    if (i > 10000) break
  }

  return sorted.map(({ id, amount }) => ({ id, amount: roundCurrency(amount) }))
}
