import {Order as OrderModel} from "@/api/model/order.ts";
import {MenuItem} from "@/api/model/cart_item.ts";
import React, {CSSProperties, useMemo} from "react";
import {calculateOrderExtrasTotal, calculateOrderTotal, calculateOrderTotalsPreview} from "@/lib/cart.ts";
import {
  calculateCartItemsBaseTotal,
  calculateCartTotalsWithTaxes,
  getOrderTaxAmount,
  getOrderTaxBreakdown,
} from "@/lib/tax-calculator.ts";
import {withCurrency, cn} from "@/lib/utils.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {getActiveOrderDiscounts, getOrderFilteredItems} from "@/lib/order.ts";
import {useTranslation} from "react-i18next";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Tax} from "@/api/model/tax.ts";
import {formatTaxLabel} from "@/lib/tax-label.ts";

const separatorStyle = {'--size': '10px', '--space': '5px'} as CSSProperties;

interface CartTotalsProps {
  cart: MenuItem[]
  itemCount: number
  className?: string
}

export const CartTotals = ({cart, itemCount, className}: CartTotalsProps) => {
  const {t} = useTranslation('orders');
  const {data: taxesData} = useApi<SettingsData<Tax>>(
    Tables.taxes,
    ['deleted_at = none'],
    ['priority asc'],
    0,
    99999,
  );

  const itemsBase = useMemo(() => calculateCartItemsBaseTotal(cart), [cart]);
  const taxPreviewTotals = useMemo(
    () => calculateCartTotalsWithTaxes(cart, taxesData?.data ?? []),
    [cart, taxesData?.data],
  );

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex font-bold">
        <div className="flex-1">{t('totals.items', {count: itemCount})}</div>
        <div className="text-right">{withCurrency(itemsBase)}</div>
      </div>
      <div className="separator h-[2px]" style={separatorStyle}></div>
      {taxPreviewTotals.length > 0 ? (
        taxPreviewTotals.map(({tax, total}) => (
          <div className="flex font-bold text-2xl text-success-900" key={tax.id?.toString() ?? `${tax.name}-${tax.rate}`}>
            <div className="flex-1">{t('totals.totalWithTax', {label: formatTaxLabel(tax.name, tax.rate)})}</div>
            <div className="text-right">{withCurrency(total)}</div>
          </div>
        ))
      ) : (
        <div className="flex font-bold text-2xl text-success-900">
          <div className="flex-1">{t('totals.total')}</div>
          <div className="text-right">{withCurrency(itemsBase)}</div>
        </div>
      )}
    </div>
  );
};

interface Props {
  order: OrderModel
  cart?: MenuItem[]
  className?: string
}

export const OrderTotals = ({order, cart, className}: Props) => {
  const {t} = useTranslation('orders');

  const preview = useMemo(() => {
    if (cart) {
      return calculateOrderTotalsPreview(order, cart);
    }

    const itemsTotal = calculateOrderTotal(order);
    const extrasTotal = calculateOrderExtrasTotal(order);
    const taxAmount = getOrderTaxAmount(order);
    const total = itemsTotal + extrasTotal + taxAmount - Number(order?.discount_amount ?? 0) + Number(order.service_charge_amount ?? 0) + Number(order?.tip_amount ?? 0);

    return {
      itemsTotal,
      itemCount: getOrderFilteredItems(order).length,
      taxAmount,
      serviceChargeAmount: Number(order?.service_charge_amount ?? 0),
      discountAmount: Number(order?.discount_amount ?? 0),
      tipAmount: Number(order?.tip_amount ?? 0),
      total,
    };
  }, [order, cart]);

  const taxBreakdown = useMemo(() => {
    if (cart) {
      return [];
    }
    return getOrderTaxBreakdown(order);
  }, [order, cart]);

  const changeDue = useMemo(() => {
    return order?.payments
      ?.filter(item => item !== null)
      ?.reduce((prev, item) => Number(prev) + Number(item.payable ?? 0) - Number(item.amount ?? 0), 0)
  }, [order?.payments]);

  /** Detail label for a discount line: "Summer Sale (10%)" or "Summer Sale" */
  const formatDiscountDetail = (name: string | undefined | null, valueType?: string | null, rate?: number | null) => {
    const base = name || '';
    const n = Number(rate ?? 0);
    const isPercent = valueType === 'percent' || (!valueType && n > 0);
    if (isPercent && n > 0) {
      return base ? `${base} (${n}%)` : `${n}%`;
    }
    return base;
  };

  /** Single-discount header: "Discount (Summer Sale 10%)" — matches tax style */
  const formatDiscountMinimal = (name: string | undefined | null, valueType?: string | null, rate?: number | null) => {
    const label = t('totals.discount');
    const n = Number(rate ?? 0);
    const isPercent = valueType === 'percent' || (!valueType && n > 0);
    if (name && isPercent && n > 0) {
      return `${label} (${name} ${n}%)`;
    }
    if (name) {
      return `${label} (${name})`;
    }
    if (isPercent && n > 0) {
      return `${label} (${n}%)`;
    }
    return label;
  };

  const activeDiscountLines = getActiveOrderDiscounts(order);
  const showLegacyDiscount = activeDiscountLines.length === 0 && (!!order?.discount || preview.discountAmount > 0);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex font-bold">
        <div className="flex-1">{t('totals.items', {count: preview.itemCount})}</div>
        <div className="text-right">{withCurrency(preview.itemsTotal)}</div>
      </div>
      {preview.taxAmount > 0 && (
        taxBreakdown.length > 0 ? taxBreakdown.map((entry, index) => (
          <div className="flex" key={`${entry.name}-${entry.rate}-${index}`}>
            <div className="flex-1">
              {t('totals.tax')} ({formatTaxLabel(entry.name, entry.rate)})
            </div>
            <div className="text-right">{withCurrency(entry.amount)}</div>
          </div>
        )) : (
          <div className="flex">
            <div className="flex-1">
              {t('totals.tax')}
              {order?.tax && <> ({formatTaxLabel(order.tax.name, order.tax.rate)})</>}
            </div>
            <div className="text-right">{withCurrency(preview.taxAmount)}</div>
          </div>
        )
      )}
      {activeDiscountLines.length === 1 ? (
        <div className="flex">
          <div className="flex-1">
            {formatDiscountMinimal(
              activeDiscountLines[0].name,
              activeDiscountLines[0].value_type,
              activeDiscountLines[0].applied_rate
            )}
          </div>
          <div className="text-right">{withCurrency(Number(activeDiscountLines[0].applied_amount ?? 0))}</div>
        </div>
      ) : activeDiscountLines.length > 1 ? (
        <>
          <div className="flex">
            <div className="flex-1">{t('totals.discount')}</div>
            <div className="text-right">{withCurrency(preview.discountAmount)}</div>
          </div>
          {activeDiscountLines.map((od, index) => (
            <div className="flex pl-3" key={od.id?.toString?.() ?? `${od.name}-${index}`}>
              <div className="flex-1">{formatDiscountDetail(od.name, od.value_type, od.applied_rate) || t('totals.discount')}</div>
              <div className="text-right">{withCurrency(Number(od.applied_amount ?? 0))}</div>
            </div>
          ))}
        </>
      ) : showLegacyDiscount ? (
        <div className="flex">
          <div className="flex-1">{formatDiscountMinimal(order?.discount?.name, null, order?.discount_rate)}</div>
          <div className="text-right">{withCurrency(preview.discountAmount)}</div>
        </div>
      ) : null}
      {preview.serviceChargeAmount > 0 ? (
        <div className="flex">
          <div className="flex-1">{t('totals.serviceCharges', {
            value: order?.service_charge,
            unit: order?.service_charge_type === DiscountType.Percent ? '%' : ''
          })}</div>
          <div className="text-right">{withCurrency(preview.serviceChargeAmount)}</div>
        </div>
      ) : null}
      {order?.extras && order?.extras?.filter(item => item !== undefined)
        ?.map((item, index) => (
        <div className="flex" key={index}>
          <div className="flex-1">{item.name}</div>
          <div className="text-right">{withCurrency(item.value)}</div>
        </div>
      ))}
      {preview.tipAmount > 0 && (
        <div className="flex">
          <div
            className="flex-1">{order?.tip_type === DiscountType.Percent ? t('totals.tipPercent') : t('totals.tip')}</div>
          <div className="text-right">{withCurrency(preview.tipAmount)}</div>
        </div>
      )}
      {order?.payments?.length > 0 && (
        <div className="separator h-[2px]" style={separatorStyle}></div>
      )}
      {order?.payments?.filter(item => item != null)
        ?.map((item, index) => (
        <div key={index} className="flex">
          <div className="flex-1">{item.payment_type?.name ?? 'Payment'}</div>
          <div className="text-right">{withCurrency(item.amount)}</div>
        </div>
      ))}
      <div className="separator h-[2px]" style={separatorStyle}></div>
      <div className="flex font-bold text-2xl text-success-900">
        <div className="flex-1">{t('totals.total')}</div>
        <div className="text-right">{withCurrency(preview.total)}</div>
      </div>
      {order?.payments?.length > 0 && changeDue !== 0 && (
        <>
          <div className="separator h-[2px]" style={separatorStyle}></div>
          <div className="flex">
            <div className="flex-1">{t('totals.change')}</div>
            <div className="text-right">{withCurrency(changeDue)}</div>
          </div>
        </>
      )}
    </div>
  );
};
