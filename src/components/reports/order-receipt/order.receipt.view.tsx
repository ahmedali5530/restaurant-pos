import {CSSProperties} from "react";
import {useTranslation} from "react-i18next";
import {Order} from "@/api/model/order.ts";
import {OrderHeader} from "@/components/orders/order.header.tsx";
import {OrderTimes} from "@/components/orders/order.times.tsx";
import {OrderItemName} from "@/components/common/order/order.item.tsx";
import {OrderTotals} from "@/components/orders/order.totals.tsx";
import {getOrderFilteredItems} from "@/lib/order.ts";
import {ReactQrCode} from "@/lib/react-qr-code.tsx";
import type {FiscalQrPrintItem} from "@/integrations/providers/fiscal/shared/runtime-config.ts";

const separatorStyle = {'--size': '10px', '--space': '5px'} as CSSProperties;

interface Props {
  order: Order;
  restaurantName?: string;
  restaurantAddress?: string;
  qrcodes?: FiscalQrPrintItem[];
}

export const OrderReceiptView = ({
  order,
  restaurantName = import.meta.env.VITE_RESTAURANT_NAME,
  restaurantAddress = import.meta.env.VITE_RESTAURANT_ADDRESS,
  qrcodes = [],
}: Props) => {
  const {t} = useTranslation("reports");
  const items = getOrderFilteredItems(order);
  const printableQrs = qrcodes.filter((qr) => qr.value);

  return (
    <div
      data-print-document
      data-testid="order-receipt"
      className="mx-auto w-full max-w-md bg-white text-neutral-900 border border-neutral-300 shadow-sm print:shadow-none print:border-0"
    >
      <div className="p-4 flex flex-col gap-4">
        {(restaurantName || restaurantAddress) && (
          <div className="text-center border-b border-neutral-200 pb-3">
            {restaurantName && (
              <div className="text-lg font-semibold tracking-tight text-neutral-900">
                {restaurantName}
              </div>
            )}
            {restaurantAddress && (
              <div className="mt-1 text-xs text-neutral-600 whitespace-pre-line">
                {restaurantAddress}
              </div>
            )}
          </div>
        )}

        <OrderHeader order={order} />
        <OrderTimes order={order} />
        <div className="separator h-[2px]" style={separatorStyle}></div>

        <div>
          {items.length === 0 ? (
            <div className="py-4 text-center text-sm text-neutral-500">
              {t("receipt.noItems")}
            </div>
          ) : (
            items.map((item, index) => (
              <OrderItemName
                item={item}
                key={item.id?.toString?.() ?? index}
                showQuantity
                showPrice
                showTotal
                showModifiers
                showModifierPrice
              />
            ))
          )}
        </div>

        <div className="separator h-[2px]" style={separatorStyle}></div>
        <OrderTotals order={order} />

        {printableQrs.length > 0 && (
          <div className="flex flex-col items-center gap-4 pt-2">
            {printableQrs.map((qr) => (
              <div
                key={`${qr.providerId}-${qr.qrPriority}-${qr.value}`}
                className="flex flex-col items-center gap-1"
              >
                {qr.logo && (
                  <img src={qr.logo} alt="" className="h-10 object-contain" />
                )}
                <ReactQrCode value={qr.value} size={128} />
                {qr.description && (
                  <div className="text-xs text-neutral-600 text-center">
                    {qr.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
