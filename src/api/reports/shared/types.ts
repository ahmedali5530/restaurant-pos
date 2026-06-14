import type {useDB} from "@/api/db/db.ts";
import type {DayPartLabel} from "@/utils/dayParts";

export type DbClient = ReturnType<typeof useDB>;

export interface DateRangeFilter {
  startDate?: string;
  endDate?: string;
}

export interface TopSellingDish {
  dishId?: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface OrderFigures {
  exclusiveSales: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  serviceCharge: number;
  tax: number;
  tips: number;
  totalRevenue: number;
  grandTotal: number;
  couponDiscount: number;
  voidAmount: number;
  isRefundedOrder: boolean;
}

export interface SalesSummaryResult {
  totalNetSales: number;
  paymentSummary: {
    amountDue: number;
    amountCollected: number;
    cashPayments: number;
    nonCashPayments: number;
    nonCashBreakdown: Record<string, number>;
  };
  roundingBenefit: number;
  serviceCharges: number;
  taxes: number;
  totalDiscounts: number;
  totalCoupons: number;
  totalVoids: number;
  dayPartTotals: Record<DayPartLabel, {checks: number; guests: number; sales: number}>;
  orderTypeBreakdown: {label: string; value: number}[];
  discountRows: {type: string; quantity: number; amount: number}[];
}

export interface ModifierDetail {
  modifierKey: string;
  modifierId: string;
  modifierName: string;
  depth: number;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  serviceCharges: number;
  total: number;
  ratio: number;
  mealPrice: number;
}

export interface ModifierSummaryMetrics {
  rowKey: string;
  modifierId: string;
  modifierName: string;
  depth: number;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface MenuItemMetrics {
  dishId: string;
  itemNumber: string;
  name: string;
  numSold: number;
  priceSold: number;
  amount: number;
  cost: number;
  profit: number;
  foodCostPercent: number;
  salePercent: number;
  discount: number;
  tax: number;
  serviceCharges: number;
  totalCollected: number;
  hasModifiers: boolean;
  modifiers: ModifierDetail[];
}

export interface CategoryGroup {
  categoryId: string;
  categoryName: string;
  items: MenuItemMetrics[];
  totals: {
    numSold: number;
    priceSold: number;
    amount: number;
    cost: number;
    profit: number;
    foodCostPercent: number;
    salePercent: number;
    discount: number;
    tax: number;
    serviceCharges: number;
    totalCollected: number;
  };
}

export interface ProductMixFilters {
  categoryIds?: string[];
  menuItemIds?: string[];
  modifierIds?: string[];
}
