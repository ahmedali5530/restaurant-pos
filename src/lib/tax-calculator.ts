import { Tax } from "@/api/model/tax.ts";
import { TaxMode } from "@/api/model/menu.ts";
import { OrderItem } from "@/api/model/order_item.ts";
import { Order } from "@/api/model/order.ts";
import { MenuItem } from "@/api/model/cart_item.ts";
import { getOrderFilteredItems } from "@/lib/order.ts";
import { getCartItemTaxableUnitBase, getOrderItemTaxableUnitBase } from "@/lib/cart.ts";
import { safeNumber } from "@/lib/utils.ts";

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

export interface OrderTaxBreakdownEntry {
  name: string;
  rate: number;
  amount: number;
}

/**
 * Calculate tax amounts for an item based on base price, taxes, and tax mode.
 * All taxes are calculated on the base price (cumulative, not compound).
 */
export const calculateItemTax = (
  base_price: number,
  taxes: Tax[],
  tax_mode: TaxMode
): TaxCalculationResult => {
  const validTaxes = (taxes ?? []).filter((tax): tax is Tax => Boolean(tax));

  if (validTaxes.length === 0) {
    return {
      net_price: base_price,
      tax_amounts: [],
      total_tax: 0,
      gross_price: base_price,
    };
  }

  const tax_amounts: TaxAmount[] = validTaxes.map((tax) => {
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
 */
export const calculateInclusiveBasePrice = (
  display_price: number,
  taxes: Tax[]
): number => {
  const validTaxes = (taxes ?? []).filter((tax): tax is Tax => Boolean(tax));

  if (validTaxes.length === 0) {
    return display_price;
  }

  const total_tax_rate = validTaxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
  const divisor = 1 + total_tax_rate / 100;
  const base_price = display_price / divisor;

  return Math.round(base_price * 100) / 100;
};

export const calculateDisplayPrice = (
  base_price: number,
  taxes: Tax[],
  tax_mode: TaxMode
): number => {
  const calculation = calculateItemTax(base_price, taxes, tax_mode);
  return calculation.gross_price;
};

export const formatTaxBreakdown = (tax_amounts: TaxAmount[]): string => {
  if (tax_amounts.length === 0) {
    return '';
  }

  return tax_amounts
    .map((t) => `${t.tax.name} (${t.rate}%): ${t.amount.toFixed(2)}`)
    .join(', ');
};

export const getTotalTaxRate = (taxes: Tax[]): number => {
  const validTaxes = (taxes ?? []).filter((tax): tax is Tax => Boolean(tax));

  if (validTaxes.length === 0) {
    return 0;
  }
  return validTaxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
};

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

const roundTax = (value: number) => Math.round(value * 100) / 100;

const getLineItemTaxCalculation = (
  unitBase: number,
  quantity: number,
  taxMode: TaxMode,
  itemTaxes: Tax[] | undefined | null,
  orderTax?: Tax | null,
): TaxCalculationResult => {
  const qty = safeNumber(quantity || 1);

  if (taxMode === 'inclusive') {
    if (!itemTaxes || itemTaxes.length === 0) {
      return calculateItemTax(0, [], 'inclusive');
    }
    const perUnit = calculateItemTax(unitBase, itemTaxes, 'inclusive');
    return {
      ...perUnit,
      tax_amounts: perUnit.tax_amounts.map((entry) => ({
        ...entry,
        amount: roundTax(entry.amount * qty),
      })),
      total_tax: roundTax(perUnit.total_tax * qty),
      net_price: roundTax(perUnit.net_price * qty),
      gross_price: roundTax(perUnit.gross_price * qty),
    };
  }

  if (!orderTax) {
    return calculateItemTax(0, [], 'exclusive');
  }

  const perUnit = calculateItemTax(unitBase, [orderTax], 'exclusive');
  return {
    ...perUnit,
    tax_amounts: perUnit.tax_amounts.map((entry) => ({
      ...entry,
      amount: roundTax(entry.amount * qty),
    })),
    total_tax: roundTax(perUnit.total_tax * qty),
    net_price: roundTax(perUnit.net_price * qty),
    gross_price: roundTax(perUnit.gross_price * qty),
  };
};

/** Order items store inclusive lines as net price + menu taxes (exclusive add). */
const getOrderLineItemTaxCalculation = (
  unitBase: number,
  quantity: number,
  taxMode: TaxMode,
  itemTaxes: Tax[] | undefined | null,
  orderTax?: Tax | null,
): TaxCalculationResult => {
  const qty = safeNumber(quantity || 1);

  if (taxMode === 'inclusive') {
    if (!itemTaxes || itemTaxes.length === 0) {
      return calculateItemTax(0, [], 'exclusive');
    }
    const perUnit = calculateItemTax(unitBase, itemTaxes, 'exclusive');
    return {
      ...perUnit,
      tax_amounts: perUnit.tax_amounts.map((entry) => ({
        ...entry,
        amount: roundTax(entry.amount * qty),
      })),
      total_tax: roundTax(perUnit.total_tax * qty),
      net_price: roundTax(perUnit.net_price * qty),
      gross_price: roundTax(perUnit.gross_price * qty),
    };
  }

  if (!orderTax) {
    return calculateItemTax(0, [], 'exclusive');
  }

  const perUnit = calculateItemTax(unitBase, [orderTax], 'exclusive');
  return {
    ...perUnit,
    tax_amounts: perUnit.tax_amounts.map((entry) => ({
      ...entry,
      amount: roundTax(entry.amount * qty),
    })),
    total_tax: roundTax(perUnit.total_tax * qty),
    net_price: roundTax(perUnit.net_price * qty),
    gross_price: roundTax(perUnit.gross_price * qty),
  };
};

/**
 * Per-line payment tax: inclusive embedded tax from menu taxes, or exclusive runtime tax from order tax.
 */
export const calculateOrderItemPaymentTax = (
  item: OrderItem,
  orderTax?: Tax | null,
): number => {
  const taxMode = item.tax_mode ?? 'exclusive';
  const unitBase = getOrderItemTaxableUnitBase(item);
  const quantity = safeNumber(item.quantity || 1);
  const calculation = getOrderLineItemTaxCalculation(
    unitBase,
    quantity,
    taxMode,
    item.taxes,
    orderTax,
  );
  return calculation.total_tax;
};

/**
 * Per-line payment tax for pending cart items.
 */
export const calculateCartItemPaymentTax = (
  item: MenuItem,
  orderTax?: Tax | null,
): number => {
  const taxMode = item.tax_mode ?? 'exclusive';
  const unitBase = getCartItemTaxableUnitBase(item);
  const quantity = safeNumber(item.quantity || 1);
  const calculation = getLineItemTaxCalculation(
    unitBase,
    quantity,
    taxMode,
    item.taxes,
    orderTax,
  );
  return calculation.total_tax;
};

/**
 * Taxable (net) line total for cart items — same base settlement uses before exclusive order tax.
 */
export const calculateCartItemsBaseTotal = (cart: MenuItem[]): number => {
  return roundTax(
    cart
      .filter(item => !item.deleted_at)
      .reduce((sum, item) => {
        const quantity = safeNumber(item.quantity || 1);
        return sum + getCartItemTaxableUnitBase(item) * quantity;
      }, 0),
  );
};

/**
 * Cart grand total as if `orderTax` were applied as exclusive % on the whole cart base.
 * Used for pre-order previews so each system tax rate produces a distinct total.
 */
export const calculateCartTotalWithOrderTax = (
  cart: MenuItem[],
  orderTax?: Tax | null,
): number => {
  const base = calculateCartItemsBaseTotal(cart);
  if (!orderTax) {
    return base;
  }
  const rate = safeNumber(orderTax.rate);
  return roundTax(base + (base * rate) / 100);
};

export interface CartTaxPreviewTotal {
  tax: Tax;
  total: number;
  taxAmount: number;
}

/**
 * Projected totals for each system tax applied as exclusive % on the cart items base.
 */
export const calculateCartTotalsWithTaxes = (
  cart: MenuItem[],
  taxes: Tax[],
): CartTaxPreviewTotal[] => {
  const active = (taxes ?? []).filter((tax): tax is Tax => Boolean(tax));
  const base = calculateCartItemsBaseTotal(cart);

  return active.map(tax => {
    const rate = safeNumber(tax.rate);
    const taxAmount = roundTax((base * rate) / 100);
    return {
      tax,
      taxAmount,
      total: roundTax(base + taxAmount),
    };
  });
};

/**
 * Sum of payment taxes for an order and optional pending cart items.
 */
export const calculateOrderPaymentTaxAmount = (
  order: Order,
  orderTax?: Tax | null,
  pendingCart?: MenuItem[],
): number => {
  const orderItems = getOrderFilteredItems(order) ?? [];
  let total = orderItems.reduce(
    (sum, item) => sum + calculateOrderItemPaymentTax(item, orderTax),
    0,
  );

  if (pendingCart) {
    total += pendingCart
      .filter(item => !item.deleted_at)
      .reduce((sum, item) => sum + calculateCartItemPaymentTax(item, orderTax), 0);
  }

  return roundTax(total);
};

/**
 * Canonical order tax total: junction rows when loaded, else stored amount, else computed.
 */
export const getOrderTaxAmount = (order: Order): number => {
  if (order.order_taxes && order.order_taxes.length > 0) {
    return roundTax(order.order_taxes.reduce((sum, row) => sum + safeNumber(row.amount), 0));
  }
  if (order.tax_amount !== undefined && order.tax_amount !== null && order.tax_amount > 0) {
    return safeNumber(order.tax_amount);
  }
  return calculateOrderPaymentTaxAmount(order, order.tax ?? null);
};

/**
 * Per-line tax amount using the same rules as payment.
 */
export const getOrderItemTaxAmount = (item: OrderItem, order: Order): number => {
  return calculateOrderItemPaymentTax(item, order.tax ?? null);
};

const getOrderItemPaymentTaxBreakdown = (
  item: OrderItem,
  orderTax?: Tax | null,
): TaxAmount[] => {
  const taxMode = item.tax_mode ?? 'exclusive';
  const unitBase = getOrderItemTaxableUnitBase(item);
  const quantity = safeNumber(item.quantity || 1);
  return getOrderLineItemTaxCalculation(unitBase, quantity, taxMode, item.taxes, orderTax).tax_amounts;
};

const reconcileTaxBreakdownTotal = (
  entries: OrderTaxBreakdownEntry[],
  orderTotal: number,
  order: Order,
): OrderTaxBreakdownEntry[] => {
  if (orderTotal === 0) {
    return entries;
  }

  const computedTotal = roundTax(entries.reduce((sum, entry) => sum + entry.amount, 0));
  const adjustment = roundTax(orderTotal - computedTotal);

  if (adjustment === 0) {
    return entries;
  }

  if (entries.length > 0) {
    const largestIndex = entries.reduce(
      (best, entry, index, list) => (entry.amount > list[best].amount ? index : best),
      0,
    );
    return entries.map((entry, index) => (
      index === largestIndex
        ? {...entry, amount: roundTax(entry.amount + adjustment)}
        : entry
    ));
  }

  return [{
    name: order.tax?.name ?? 'Tax',
    rate: order.tax?.rate ?? 0,
    amount: orderTotal,
  }];
};

/**
 * Aggregated per-tax breakdown for reports and bills.
 * Junction-first: order_taxes rows; legacy item-level compute + reconcile fallback.
 */
export const getOrderTaxBreakdown = (order: Order): OrderTaxBreakdownEntry[] => {
  if (order.order_taxes && order.order_taxes.length > 0) {
    return order.order_taxes.map(row => {
      const tax = typeof row.tax === 'object' && row.tax !== null ? row.tax : null;
      return {
        name: tax?.name ?? 'Tax',
        rate: safeNumber(tax?.rate),
        amount: roundTax(safeNumber(row.amount)),
      };
    });
  }

  const breakdownMap = new Map<string, OrderTaxBreakdownEntry>();
  const orderTax = order.tax ?? null;

  (getOrderFilteredItems(order) ?? []).forEach((item) => {
    getOrderItemPaymentTaxBreakdown(item, orderTax).forEach(({tax, amount}) => {
      const key = `${tax.name} ${tax.rate}%`;
      const existing = breakdownMap.get(key) ?? {name: tax.name, rate: tax.rate || 0, amount: 0};
      existing.amount += amount;
      breakdownMap.set(key, existing);
    });
  });

  const entries = Array.from(breakdownMap.values()).map((entry) => ({
    ...entry,
    amount: roundTax(entry.amount),
  }));

  return reconcileTaxBreakdownTotal(entries, getOrderTaxAmount(order), order);
};

export const collectOrderTaxRows = (
  order: Order,
  orderTax?: Tax | null,
): Array<{ tax: Tax; amount: number }> => {
  const breakdownMap = new Map<string, { tax: Tax; amount: number }>();
  const resolvedOrderTax = orderTax ?? order.tax ?? null;

  (getOrderFilteredItems(order) ?? []).forEach((item) => {
    getOrderItemPaymentTaxBreakdown(item, resolvedOrderTax).forEach(({ tax, amount }) => {
      const key = tax.id?.toString() ?? `${tax.name}-${tax.rate}`;
      const existing = breakdownMap.get(key) ?? { tax, amount: 0 };
      existing.amount += amount;
      breakdownMap.set(key, existing);
    });
  });

  return Array.from(breakdownMap.values()).map((entry) => ({
    ...entry,
    amount: roundTax(entry.amount),
  }));
};

export const getOrdersTaxBreakdown = (orders: Order[]): OrderTaxBreakdownEntry[] => {
  const breakdownMap = new Map<string, OrderTaxBreakdownEntry>();

  orders.forEach((order) => {
    getOrderTaxBreakdown(order).forEach(({ name, rate, amount }) => {
      const key = `${name} ${rate}%`;
      const existing = breakdownMap.get(key) ?? { name, rate, amount: 0 };
      existing.amount += amount;
      breakdownMap.set(key, existing);
    });
  });

  return Array.from(breakdownMap.values()).map((entry) => ({
    ...entry,
    amount: roundTax(entry.amount),
  }));
};

export const getOrdersTaxTotal = (orders: Order[]): number => {
  return roundTax(orders.reduce((sum, order) => sum + getOrderTaxAmount(order), 0));
};

// Re-export taxable base helpers for consumers that import from tax-calculator
export {getOrderItemTaxableUnitBase, getCartItemTaxableUnitBase} from "@/lib/cart.ts";
