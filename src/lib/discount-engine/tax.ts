import type { TaxTreatment } from '@/api/model/discount.ts'
import type { AppliedDiscountLine } from '@/lib/discount-engine/types.ts'
import { roundCurrency } from '@/lib/discount-engine/rounding.ts'

export const pickOrderTaxTreatment = (lines: AppliedDiscountLine[]): TaxTreatment => {
  if (lines.some(l => l.taxTreatment === 'tax_after_discount')) {
    return 'tax_after_discount'
  }
  if (lines.some(l => l.taxTreatment === 'inclusive')) {
    return 'inclusive'
  }
  if (lines.some(l => l.taxTreatment === 'exclusive')) {
    return 'exclusive'
  }
  return 'tax_before_discount'
}

export const computeTaxAmount = (
  itemsTotal: number,
  discountTotal: number,
  taxRate: number,
  treatment: TaxTreatment
): { taxableAmount: number; taxAmount: number } => {
  const rate = taxRate / 100

  if (treatment === 'tax_before_discount') {
    const taxAmount = roundCurrency(itemsTotal * rate)
    return { taxableAmount: itemsTotal, taxAmount }
  }

  if (treatment === 'tax_after_discount') {
    const taxableAmount = Math.max(0, roundCurrency(itemsTotal - discountTotal))
    const taxAmount = roundCurrency(taxableAmount * rate)
    return { taxableAmount, taxAmount }
  }

  if (treatment === 'inclusive') {
    const netAfterDiscount = Math.max(0, itemsTotal - discountTotal)
    const taxAmount = roundCurrency(netAfterDiscount - netAfterDiscount / (1 + rate))
    const taxableAmount = roundCurrency(netAfterDiscount - taxAmount)
    return { taxableAmount, taxAmount }
  }

  // exclusive
  const taxableAmount = Math.max(0, roundCurrency(itemsTotal - discountTotal))
  const taxAmount = roundCurrency(taxableAmount * rate)
  return { taxableAmount, taxAmount }
}
