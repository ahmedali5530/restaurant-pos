import { Order } from '@/api/model/order.ts';
import { calculateOrderItemPrice } from '@/lib/cart.ts';
import { nowSurrealDateTime, toLuxonDateTime } from '@/lib/datetime.ts';
import { getOrderFilteredItems, getOrderSettlementFigures } from '@/lib/order.ts';
import { getOrderItemTaxAmount, getOrderTaxAmount } from '@/lib/tax-calculator.ts';
import { safeNumber } from '@/lib/utils.ts';

export type PkFiscalAuthority = 'fbr' | 'pra';

export interface PkFiscalSerializeConfig {
  posId: string;
  defaultPctCode: string;
  invoiceType?: number;
  /** FBR only: when true, line TotalAmount = Quantity * SaleValue */
  punjabMode?: boolean;
}

export interface PkFiscalInvoiceItem {
  PCTCode: string;
  Quantity: string;
  SaleValue: string;
  TaxRate: string;
  TaxCharged: string;
  Discount: string;
  FurtherTax: number;
  InvoiceType: number;
  RefUSIN: string;
  TotalAmount: string;
}

export interface PkFiscalInvoicePayload {
  InvoiceNumber: string;
  POSID: string;
  USIN: string;
  DateTime: string;
  BuyerNTN: string;
  BuyerCNIC: string;
  BuyerName: string;
  BuyerPhoneNumber: string;
  TotalBillAmount: string;
  TotalQuantity: string;
  TotalSaleValue: string;
  TotalTaxCharged: string;
  Discount: string;
  FurtherTax: number;
  PaymentMode: number;
  Items: PkFiscalInvoiceItem[];
  RefUSIN: string;
  InvoiceType: number;
}

export const formatPkFiscalAmount = (value: number): string => {
  return safeNumber(value).toFixed(2);
};

export const mapPkPaymentMode = (order: Order): number => {
  const payment = order.payments?.[0];
  const paymentType = payment?.payment_type;
  const typeName =
    typeof paymentType === 'object' && paymentType
      ? String((paymentType as { type?: string; name?: string }).type ?? (paymentType as { name?: string }).name ?? '')
      : '';
  const normalized = typeName.toLowerCase();
  if (normalized === 'card') return 2;
  return 1;
};

const resolveTaxRate = (order: Order, item: Order['items'][number], unitSale: number, unitTax: number): number => {
  if (item.tax_mode === 'inclusive' && item.taxes?.length) {
    return item.taxes.reduce((sum, tax) => sum + safeNumber(tax.rate), 0);
  }
  if (order.tax?.rate != null) {
    return safeNumber(order.tax.rate);
  }
  if (item.taxes?.length) {
    return item.taxes.reduce((sum, tax) => sum + safeNumber(tax.rate), 0);
  }
  if (unitSale > 0) {
    return (unitTax / unitSale) * 100;
  }
  return 0;
};

/** Pakistan FBR/PRA invoice JSON body (not used by ZATCA/KRA). */
export const serializePkFiscalInvoice = (
  order: Order,
  authority: PkFiscalAuthority,
  config: PkFiscalSerializeConfig
): PkFiscalInvoicePayload => {
  const invoiceType = safeNumber(config.invoiceType ?? 1) || 1;
  const items = getOrderFilteredItems(order);
  const usePunjabTotal = authority === 'fbr' && Boolean(config.punjabMode);
  const settlement = getOrderSettlementFigures(order);
  const totalBillAmount = Math.max(0, settlement.grandTotalDue - settlement.tips - settlement.serviceCharges);
  const discountTotal = settlement.discounts;

  let totalSaleValue = 0;
  const serializedItems: PkFiscalInvoiceItem[] = items.map((item) => {
    const quantity = safeNumber(item.quantity || 1) || 1;
    const lineSale = safeNumber(calculateOrderItemPrice(item));
    const lineTax = safeNumber(getOrderItemTaxAmount(item, order));
    const unitSale = lineSale / quantity;
    const unitTax = lineTax / quantity;
    const taxRate = resolveTaxRate(order, item, unitSale, unitTax);
    const lineDiscount = safeNumber(item.discount);
    const totalAmount = usePunjabTotal
      ? quantity * unitSale
      : quantity * (unitSale + unitTax);

    totalSaleValue += lineSale;

    return {
      PCTCode: config.defaultPctCode,
      Quantity: formatPkFiscalAmount(quantity),
      SaleValue: formatPkFiscalAmount(unitSale),
      TaxRate: formatPkFiscalAmount(taxRate),
      TaxCharged: formatPkFiscalAmount(unitTax),
      Discount: formatPkFiscalAmount(lineDiscount),
      FurtherTax: 0,
      InvoiceType: invoiceType,
      RefUSIN: '',
      TotalAmount: formatPkFiscalAmount(totalAmount),
    };
  });

  return {
    InvoiceNumber: '',
    POSID: String(config.posId),
    USIN: String(order.invoice_number ?? ''),
    DateTime: toLuxonDateTime(nowSurrealDateTime()).toFormat('yyyy-MM-dd HH:mm:ss'),
    BuyerNTN: '',
    BuyerCNIC: '',
    BuyerName: order.customer?.name ?? '',
    BuyerPhoneNumber: order.customer?.phone != null ? String(order.customer.phone) : '',
    TotalBillAmount: formatPkFiscalAmount(totalBillAmount),
    TotalQuantity: formatPkFiscalAmount(items.length),
    TotalSaleValue: formatPkFiscalAmount(totalSaleValue),
    TotalTaxCharged: formatPkFiscalAmount(getOrderTaxAmount(order)),
    Discount: formatPkFiscalAmount(discountTotal),
    FurtherTax: 0.0,
    PaymentMode: mapPkPaymentMode(order),
    Items: serializedItems,
    RefUSIN: '',
    InvoiceType: invoiceType,
  };
};
