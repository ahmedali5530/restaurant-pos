import {Order as OrderModel, OrderStatus} from "@/api/model/order.ts";
import {calculateOrderTotal} from "@/lib/cart.ts";
import React, {useMemo, useState} from "react";
import {cn, withCurrency} from "@/lib/utils.ts";
import {OrderPayment} from "@/components/orders/order.payment.tsx";
import {getInvoiceNumber, getOrderFilteredItems, translateOrderStatus} from "@/lib/order.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";
import {useTranslation} from "react-i18next";

interface Props {
  order: OrderModel
}

export const OrderRow = ({
  order
}: Props) => {
  const {t} = useTranslation('orders');
  const itemsTotal = calculateOrderTotal(order);
  const [payment, setPayment] = useState(false);

  const colors = {
    [OrderStatus["In Progress"]]: 'bg-warning-100 text-warning-700',
    [OrderStatus["Paid"]]: 'bg-success-100 text-success-700',
    [OrderStatus["Completed"]]: 'bg-success-100 text-success-700',
  };

  const total = useMemo(() => {
    const extrasTotal = order?.extras ? order?.extras?.reduce((prev, item) => prev + Number(item.value), 0) : 0;
    return itemsTotal + extrasTotal + Number(order?.tax_amount || 0) - Number(order?.discount_amount || 0) + Number(order.service_charge_amount ?? 0);
  }, [itemsTotal, order]);

  return (
    <>
      <div
        onClick={() => {
          if(order.status === OrderStatus["In Progress"]) {
            setPayment(true)
          }
        }}
        className="flex flex-1 odd:bg-white even:bg-neutral-300 gap-1 select-none">
        <div className="basis-[140px] flex-shrink flex-grow-0 p-4">{getInvoiceNumber(order)} - {order?.order_type?.name}</div>
        <div className="basis-[100px] flex flex-col justify-center items-center" style={{
          color: order?.table.color,
          background: order.table?.background
        }}>
          {order?.table?.name}{order?.table?.number}
        </div>
        <div className="flex justify-center items-center px-3 basis-[120px]">{order?.user?.first_name}</div>
        <div className="basis-[150px] p-4">
        <span className={
          cn(
            "uppercase p-1 px-3 rounded-lg text-sm font-bold flex-grow-0 flex-shrink",
            colors[order?.status]
          )
        }>{translateOrderStatus(t, order?.status)}</span>
        </div>
        <div className="flex basis-[200px] items-center px-3">
          {toLuxonDateTime(order.created_at).toFormat('yyyy-MM-dd hh:mm a')}
        </div>
        <div className="flex items-center px-3 gap-1">
          <span className="inline-flex h-[24px] min-w-[24px] rounded-full bg-gray-900 text-white justify-center items-center">
            {getOrderFilteredItems(order).length}
          </span> {t('totals.itemsShort')}
        </div>
        <div className="flex px-3 gap-1 items-center basis-[150px]">
          {withCurrency(itemsTotal)}
        </div>
        <div className="flex items-center px-3 basis-[180px] border-x border-neutral-500">
          {order?.tax && (
            <>
              <div className="flex-1">
                {order?.tax?.name} {order?.tax?.rate}%
              </div>
              <div className="text-right">{withCurrency(order?.tax_amount)}</div>
            </>
          )}
        </div>
        <div className="flex items-center px-3 basis-[180px]">
          {order?.service_charge_amount && (
            <>
              <div className="flex-1">{t('totals.sc', {value: order?.service_charge})}</div>
              <div className="text-right">{withCurrency(order?.service_charge_amount)}</div>
            </>
          )}
        </div>

        <div className="flex items-center px-3 basis-[180px] border-x border-neutral-500">
          {order?.extras && (
            <>
              <div className="flex-1">{t('totals.extras')}</div>
              <div
                className="text-right">{withCurrency(order?.extras?.reduce((prev, item) => prev + Number(item.value), 0))}</div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end px-3 flex-1">
          <div className="text-right font-bold text-lg text-danger-700">{withCurrency(total)}</div>
        </div>
      </div>

      {payment && (
        <OrderPayment order={order} onClose={() => {
          setPayment(false)
        }}/>
      )}
    </>
  );
}