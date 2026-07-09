import React, {useMemo} from "react";
import {Order} from "@/api/model/order.ts";
import {withCurrency} from "@/lib/utils.ts";
import {calculateOrderTotal} from "@/lib/cart.ts";
import {CommonBillParts} from "@/components/prints/_common.bill.tsx";

type Props = {
  order: Order
  duplicate?: boolean
}

export const PrintFinalBill: React.FC<Props> = ({order, duplicate}) => {
  const itemsTotal = calculateOrderTotal(order);

  const total = useMemo(() => {
    const extrasTotal = order?.extras ? order?.extras?.reduce((prev, item) => prev + item.value, 0) : 0;
    return itemsTotal + extrasTotal + Number(order?.tax_amount ?? 0) - Number(order?.discount_amount ?? 0) + Number(order.service_charge_amount ?? 0) + Number(order?.tip_amount ?? 0);
  }, [itemsTotal, order]);

  const payments= useMemo(() => {
    return order?.payments?.reduce((prev, item) => prev + Number(item.amount), 0);
  }, [order]);

  const changeDue = useMemo(() => payments - total, [payments, total]);

  return (
    <div style={{padding: 12, fontFamily: 'monospace', width: 280}}>
      <div style={{textAlign: 'center', marginBottom: 8}}>
        <strong>{duplicate ? 'Duplicate ' : ''}Final Bill</strong>
      </div>
      <CommonBillParts order={order} itemsTotal={itemsTotal} total={total}/>
      <hr/>
      {order?.payments?.map((item, index) => (
        <div key={index} style={{display: 'flex'}}>
          <div style={{flex: 1}}>{item.payment_type.name}</div>
          <div style={{textAlign: 'right'}}>{withCurrency(item.amount)}</div>
        </div>
      ))}
      {changeDue !== 0 && (
        <>
          <hr/>
          <div style={{display: 'flex', fontWeight: 'bold'}}>
            <div style={{flex: 1}}>Change</div>
            <div style={{textAlign: 'right'}}>{withCurrency(changeDue)}</div>
          </div>
        </>
      )}
    </div>
  );
}

