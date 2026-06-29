import {Order as OrderModel} from "@/api/model/order.ts";
import {MenuItem} from "@/api/model/cart_item.ts";
import React, {CSSProperties, useMemo} from "react";
import {calculateOrderExtrasTotal, calculateOrderTotal, calculateOrderTotalsPreview} from "@/lib/cart.ts";
import {withCurrency, cn} from "@/lib/utils.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";
import {useTranslation} from "react-i18next";

const separatorStyle = {'--size': '10px', '--space': '5px'} as CSSProperties;

interface CartTotalsProps {
  itemCount: number
  total: number
  className?: string
}

export const CartTotals = ({itemCount, total, className}: CartTotalsProps) => {
  const {t} = useTranslation('orders');

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex font-bold">
        <div className="flex-1">{t('totals.items', {count: itemCount})}</div>
        <div className="text-right">{withCurrency(total)}</div>
      </div>
      <div className="separator h-[2px]" style={separatorStyle}></div>
      <div className="flex font-bold text-2xl text-success-900">
        <div className="flex-1">{t('totals.total')}</div>
        <div className="text-right">{withCurrency(total)}</div>
      </div>
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
    const total = itemsTotal + extrasTotal + Number(order?.tax_amount ?? 0) - Number(order?.discount_amount ?? 0) + Number(order.service_charge_amount ?? 0) + Number(order?.tip_amount ?? 0);

    return {
      itemsTotal,
      itemCount: getOrderFilteredItems(order).length,
      taxAmount: Number(order?.tax_amount ?? 0),
      serviceChargeAmount: Number(order?.service_charge_amount ?? 0),
      discountAmount: Number(order?.discount_amount ?? 0),
      tipAmount: Number(order?.tip_amount ?? 0),
      total,
    };
  }, [order, cart]);

  const changeDue = useMemo(() => {
    return order?.payments?.reduce((prev, item) => Number(prev) + Number(item.payable ?? 0) - Number(item.amount ?? 0), 0)
  }, [order?.payments]);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex font-bold">
        <div className="flex-1">{t('totals.items', {count: preview.itemCount})}</div>
        <div className="text-right">{withCurrency(preview.itemsTotal)}</div>
      </div>
      {order?.tax && (
        <div className="flex">
          <div className="flex-1">
            {t('totals.tax')} {order?.tax && <>({order?.tax?.name} {order?.tax?.rate}%)</>}
          </div>
          <div className="text-right">{withCurrency(preview.taxAmount)}</div>
        </div>
      )}
      {order?.discount ? (
        <div className="flex">
          <div className="flex-1">{t('totals.discount')}</div>
          <div className="text-right">{withCurrency(preview.discountAmount)}</div>
        </div>
      ) : ''}
      {order?.service_charge && order?.service_charge > 0 ? (
        <div className="flex">
          <div className="flex-1">{t('totals.serviceCharges', {
            value: order?.service_charge,
            unit: order?.service_charge_type === DiscountType.Percent ? '%' : ''
          })}</div>
          <div className="text-right">{withCurrency(preview.serviceChargeAmount)}</div>
        </div>
      ) : ''}
      {order?.extras && order?.extras?.filter(item => item !== undefined)
        ?.map((item, index) => (
        <div className="flex" key={index}>
          <div className="flex-1">{item.name}</div>
          <div className="text-right">{withCurrency(item.value)}</div>
        </div>
      ))}
      {order?.tip_amount > 0 && (
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
