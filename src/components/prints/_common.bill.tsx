import {Order} from "@/api/model/order.ts";
import {withCurrency} from "@/lib/utils.ts";
import React from "react";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";
import {getOrderTaxBreakdown} from "@/lib/tax-calculator.ts";

interface Props {
  order: Order
  itemsTotal: number
  total: number
}

export const CommonBillParts = ({
  order, itemsTotal, total
}: Props) => {
  const taxes = getOrderTaxBreakdown(order);
  
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span>Invoice# {order.invoice_number}</span>
        <span>{toLuxonDateTime(order.created_at).toFormat('y-MM-dd hh:mm a')}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span>{order?.table?.name}{order?.table?.number}</span>
        <span>{order?.user?.first_name} {order?.user?.last_name}</span>
      </div>
      <hr/>
      <div>
        {getOrderFilteredItems(order)?.map((it, idx: number) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{it.item.name} x{it.quantity}</span>
            <span>{withCurrency(calculateOrderItemPrice(it))}</span>
          </div>
        ))}
      </div>
      <hr/>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex',
          fontWeight: 'bold'
        }}>
          <div style={{ flex: 1 }}>Items ({getOrderFilteredItems(order).length})</div>
          <div style={{ textAlign: 'right' }}>{withCurrency(itemsTotal)}</div>
        </div>
        {taxes.length > 0 && taxes.map((tax, idx) => (
          <div key={idx} style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>
              Tax ({tax.name} {tax.rate}%)
            </div>
            <div style={{ textAlign: 'right' }}>{withCurrency(tax.amount)}</div>
          </div>
        ))}
        {taxes.length === 0 && order?.tax && (
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>
              Tax {order?.tax && <>({order?.tax?.name} {order?.tax?.rate}%)</>}
            </div>
            <div style={{ textAlign: 'right' }}>{withCurrency(order?.tax_amount)}</div>
          </div>
        )}
        {((order as Order & { order_discounts?: { name: string; applied_amount: number; removed_at?: unknown }[] }).order_discounts || [])
          .filter(od => !od.removed_at)
          .map((od, idx) => (
          <div key={idx} style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>{od.name}</div>
            <div style={{ textAlign: 'right' }}>-{withCurrency(od.applied_amount)}</div>
          </div>
        ))}
        {!(order as Order & { order_discounts?: unknown[] }).order_discounts?.length && order?.discount && (
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>Discount</div>
            <div style={{ textAlign: 'right' }}>{withCurrency(order?.discount_amount)}</div>
          </div>
        )}
        {order?.service_charge && order?.service_charge > 0 ? (
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>Service charges ({order?.service_charge}{order?.service_charge_type === DiscountType.Percent ? '%' : ''})</div>
            <div style={{ textAlign: 'right' }}>{withCurrency(order?.service_charge_amount)}</div>
          </div>
        ) : ''}
        {order?.extras && order?.extras?.map((item, idx: number) => (
          <div key={idx} style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>{item.name}</div>
            <div style={{ textAlign: 'right' }}>{withCurrency(item.value)}</div>
          </div>
        ))}
        {order?.tip_amount > 0 && (
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>Tip {order?.tip_type === DiscountType.Percent ? '%' : ''}</div>
            <div style={{ textAlign: 'right' }}>{withCurrency(order?.tip_amount)}</div>
          </div>
        )}
        <hr/>
        <div style={{display: 'flex', fontWeight: 'bold'}}>
          <div style={{flex: 1}}>Total</div>
          <div style={{textAlign: 'right'}}>{withCurrency(total)}</div>
        </div>
      </div>
    </>
  );
}