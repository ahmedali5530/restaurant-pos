import React, {useMemo} from "react";
import {Order} from "@/api/model/order.ts";
import {withCurrency} from "@/lib/utils.ts";
import {calculateOrderTotal} from "@/lib/cart.ts";
import { useShowInclusivePrices } from "@/hooks/useShowInclusivePrices.ts";
import { getOrderItemDisplayLineTotal } from "@/lib/order-item-display.ts";

type Props = {
  order: Order
  originalOrder?: Order
}

export const PrintRefundBill: React.FC<Props> = ({order, originalOrder}) => {
  const itemsTotal = calculateOrderTotal(order);
  const { enabled: showInclusive } = useShowInclusivePrices();

  const total = useMemo(() => {
    // Items are positive, all charges (tax, service charge, tip, extras) are negative
    // Discount is also negative, and adding it reduces the refund total (correct behavior)
    const extrasTotal = order?.extras ? order?.extras?.reduce((prev, item) => prev + item.value, 0) : 0;
    const taxAmount = Number(order?.tax_amount ?? 0);
    const discountAmount = Number(order?.discount_amount ?? 0);
    const serviceChargeAmount = Number(order?.service_charge_amount ?? 0);
    const tipAmount = Number(order?.tip_amount ?? 0);
    
    // All charges are negative, so adding them reduces the total
    // Discount is negative, so adding it also reduces the refund (correct)
    return itemsTotal + taxAmount + serviceChargeAmount + tipAmount + extrasTotal + discountAmount;
  }, [itemsTotal, order]);

  return (
    <div style={{padding: 12, fontFamily: 'monospace', width: 280}}>
      <div style={{textAlign: 'center', marginBottom: 8}}>
        <strong>REFUND RECEIPT</strong>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span>Original Invoice# {originalOrder?.invoice_number ?? order.invoice_number}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span>Refund Date: {new Date().toLocaleString()}</span>
      </div>
      <hr/>
      <div>
        {order.items?.map((it, idx: number) => (
          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{it.item.name} x{it.quantity}</span>
            <span>{withCurrency(getOrderItemDisplayLineTotal(it, showInclusive))}</span>
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
          <div style={{ flex: 1 }}>Items ({order.items?.length ?? 0})</div>
          <div style={{ textAlign: 'right' }}>{withCurrency(itemsTotal)}</div>
        </div>
        {order?.tax && order?.tax_amount !== undefined && order?.tax_amount !== 0 ? (
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>
              Tax {order?.tax && <>({order?.tax?.name} {order?.tax?.rate}%)</>}
            </div>
            <div style={{ textAlign: 'right' }}>{withCurrency(order?.tax_amount)}</div>
          </div>
        ) : null}
        {order?.discount && order?.discount_amount !== undefined && order?.discount_amount !== 0 ? (
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>Discount</div>
            <div style={{ textAlign: 'right' }}>{withCurrency(order?.discount_amount)}</div>
          </div>
        ) : null}
        {order?.service_charge && order?.service_charge > 0 && order?.service_charge_amount !== undefined && order?.service_charge_amount !== 0 ? (
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>Service charges ({order?.service_charge}{order?.service_charge_type === 'Percent' ? '%' : ''})</div>
            <div style={{ textAlign: 'right' }}>{withCurrency(order?.service_charge_amount)}</div>
          </div>
        ) : null}
        {order?.extras && order?.extras?.map((item, idx: number) => (
          <div key={idx} style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>{item.name}</div>
            <div style={{ textAlign: 'right' }}>{withCurrency(item.value)}</div>
          </div>
        ))}
        {order?.tip_amount !== undefined && order?.tip_amount !== 0 ? (
          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>Tip {order?.tip_type === 'Percent' ? '%' : ''}</div>
            <div style={{ textAlign: 'right' }}>{withCurrency(order?.tip_amount)}</div>
          </div>
        ) : null}
        <hr/>
        <div style={{display: 'flex', fontWeight: 'bold'}}>
          <div style={{flex: 1}}>Refund Total</div>
          <div style={{textAlign: 'right'}}>{withCurrency(total)}</div>
        </div>
      </div>
    </div>
  );
}

