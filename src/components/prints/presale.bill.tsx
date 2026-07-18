import React, {useMemo} from "react";
import {Order} from "@/api/model/order.ts";
import {calculateOrderTotal} from "@/lib/cart.ts";
import {CommonBillParts} from "@/components/prints/_common.bill.tsx";
import { useTranslateReceipts } from "@/hooks/useTranslateReceipts.ts";
import { useTranslation } from "react-i18next";

type Props = {
  order: Order
}

export const PrintPresaleBill: React.FC<Props> = ({order}) => {
  const itemsTotal = calculateOrderTotal(order);
  const { enabled: translateReceipts } = useTranslateReceipts();
  const { t } = useTranslation("receipts");
  const rt = (key: string) => (translateReceipts ? t(key) : t(key, { lng: "en" }));

  const total = useMemo(() => {
    const extrasTotal = order?.extras ? order?.extras?.reduce((prev, item) => prev + item.value, 0) : 0;
    return itemsTotal + extrasTotal + Number(order?.tax_amount ?? 0) - Number(order?.discount_amount ?? 0) + Number(order.service_charge_amount ?? 0) + Number(order?.tip_amount ?? 0);
  }, [itemsTotal, order]);

  return (
    <div style={{padding: 12, fontFamily: 'monospace', width: 280}}>
      <div style={{textAlign: 'center', marginBottom: 8}}>
        <strong>{rt("preSaleBill")}</strong>
      </div>
      <CommonBillParts order={order} itemsTotal={itemsTotal} total={total}/>
    </div>
  );
}
