export const computeAccrual = (input: {
  accrualRate: number
  monthsEmployed: number
  maxDaysPerYear?: number
  carriedOver?: number
}): number => {
  const rate = Math.max(0, input.accrualRate)
  const months = Math.max(0, input.monthsEmployed)
  const accrued = (rate / 12) * months + (input.carriedOver ?? 0)

  if (input.maxDaysPerYear !== undefined && input.maxDaysPerYear !== null) {
    return Math.min(accrued, input.maxDaysPerYear)
  }

  return Math.round(accrued * 100) / 100
}

export const computeRemainingBalance = (input: {
  accrued: number
  used?: number
  pending?: number
  carriedOver?: number
}): { remaining: number; available: number } => {
  const accrued = Math.max(0, input.accrued)
  const used = Math.max(0, input.used ?? 0)
  const pending = Math.max(0, input.pending ?? 0)
  const carriedOver = Math.max(0, input.carriedOver ?? 0)

  const total = accrued + carriedOver
  const remaining = Math.round((total - used) * 100) / 100
  const available = Math.round((remaining - pending) * 100) / 100

  return {
    remaining: Math.max(0, remaining),
    available: Math.max(0, available),
  }
}
