import { Tax } from "@/api/model/tax.ts";
import { TaxMode } from "@/api/model/menu.ts";

export interface TaxAmount {
  tax: Tax;
  amount: number;
  rate: number;
}

export interface TaxCalculationResult {
  net_price: number;
  tax_amounts: TaxAmount[];
  total_tax: number;
  gross_price: number;
}

/**
 * Calculate tax amounts for an item based on base price, taxes, and tax mode
 * All taxes are calculated on the base price (cumulative, not compound)
 */
export const calculateItemTax = (
  base_price: number,
  taxes: Tax[],
  tax_mode: TaxMode
): TaxCalculationResult => {
  if (!taxes || taxes.length === 0) {
    return {
      net_price: base_price,
      tax_amounts: [],
      total_tax: 0,
      gross_price: base_price,
    };
  }

  const tax_amounts: TaxAmount[] = taxes.map((tax) => {
    const rate = tax.rate || 0;
    const amount = (base_price * rate) / 100;
    return {
      tax,
      amount: Math.round(amount * 100) / 100,
      rate,
    };
  });

  const total_tax = tax_amounts.reduce((sum, t) => sum + t.amount, 0);
  const gross_price = tax_mode === 'inclusive' 
    ? base_price 
    : base_price + total_tax;
  const net_price = tax_mode === 'inclusive'
    ? base_price - total_tax
    : base_price;

  return {
    net_price: Math.round(net_price * 100) / 100,
    tax_amounts,
    total_tax: Math.round(total_tax * 100) / 100,
    gross_price: Math.round(gross_price * 100) / 100,
  };
};

/**
 * Back-calculate base price from inclusive display price
 * For inclusive pricing: display_price = base_price + total_tax
 * We need to solve for base_price when tax is included
 */
export const calculateInclusiveBasePrice = (
  display_price: number,
  taxes: Tax[]
): number => {
  if (!taxes || taxes.length === 0) {
    return display_price;
  }

  // For cumulative taxes on base price:
  // display_price = base_price + base_price * (sum of tax rates / 100)
  // display_price = base_price * (1 + sum of tax rates / 100)
  // base_price = display_price / (1 + sum of tax rates / 100)
  
  const total_tax_rate = taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
  const divisor = 1 + total_tax_rate / 100;
  const base_price = display_price / divisor;
  
  return Math.round(base_price * 100) / 100;
};

/**
 * Calculate the display price for an item based on base price and tax mode
 */
export const calculateDisplayPrice = (
  base_price: number,
  taxes: Tax[],
  tax_mode: TaxMode
): number => {
  const calculation = calculateItemTax(base_price, taxes, tax_mode);
  return calculation.gross_price;
};

/**
 * Format tax breakdown for UI display
 */
export const formatTaxBreakdown = (tax_amounts: TaxAmount[]): string => {
  if (tax_amounts.length === 0) {
    return '';
  }

  return tax_amounts
    .map((t) => `${t.tax.name} (${t.rate}%): ${t.amount.toFixed(2)}`)
    .join(', ');
};

/**
 * Get total tax rate from multiple taxes
 */
export const getTotalTaxRate = (taxes: Tax[]): number => {
  if (!taxes || taxes.length === 0) {
    return 0;
  }
  return taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
};

/**
 * Calculate tax for a single tax rate (legacy support)
 */
export const calculateSingleTax = (
  base_price: number,
  tax_rate: number,
  tax_mode: TaxMode
): { net_price: number; tax_amount: number; gross_price: number } => {
  const tax_amount = (base_price * tax_rate) / 100;
  const gross_price = tax_mode === 'inclusive' 
    ? base_price 
    : base_price + tax_amount;
  const net_price = tax_mode === 'inclusive'
    ? base_price - tax_amount
    : base_price;

  return {
    net_price: Math.round(net_price * 100) / 100,
    tax_amount: Math.round(tax_amount * 100) / 100,
    gross_price: Math.round(gross_price * 100) / 100,
  };
};
