import { Order, OrderStatus } from "@/api/model/order.ts";
import { cn } from "@/lib/utils.ts";
import {getInvoiceNumber, translateOrderStatus} from "@/lib/order.ts";
import {useTranslation} from "react-i18next";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPrint} from "@fortawesome/free-solid-svg-icons";
import {formatGuestLabel} from "@/lib/guest-label.ts";

interface Props {
  order: Order
  tempPrinted?: boolean
}

export const OrderHeader = ({
  order,
  tempPrinted = false,
}: Props) => {
  const {t} = useTranslation('orders');

  const colors = {
    [OrderStatus["In Progress"]]: 'bg-warning-100 text-warning-700',
    [OrderStatus["Paid"]]: 'bg-success-100 text-success-700',
    [OrderStatus["Completed"]]: 'bg-success-100 text-success-700',
    [OrderStatus['Merged']]: 'bg-info-100 text-info-700',
    [OrderStatus['Spilt']]: 'bg-info-100 text-info-700',
    [OrderStatus['Cancelled']]: 'bg-danger-100 text-danger-700',
  };

  return (
    <div className="flex justify-between">
      <div className="flex gap-3">
        {order?.table && (
          <span className="p-3 text-lg rounded-xl min-w-[56px] flex justify-center items-center" style={{
            color: order?.table?.color,
            background: order?.table?.background
          }}>{order?.table?.name}{order?.table?.number}</span>
        )}

        <div className="flex flex-col items-start gap-1">
          <span className="font-bold">{t('header.orderNumber', {invoice: getInvoiceNumber(order), orderType: order?.order_type?.name})}</span>
          <span className={
            cn(
              "uppercase p-1 px-3 rounded-lg text-sm font-bold flex-grow-0 flex-shrink",
              colors[order?.status]
            )
          }>{translateOrderStatus(t, order?.status)}</span>

        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          {tempPrinted && (
            <span
              className="text-warning-600 bg-warning-100 px-2 py-1 rounded"
              title={t('print.tempAlreadyPrinted')}
            >
              <FontAwesomeIcon icon={faPrint} />
            </span>
          )}
          <span className="text-lg font-bold bg-neutral-200 px-2 rounded">{order?.user?.first_name}</span>
        </div>
        {order?.customer && (
          <>
            <span>{formatGuestLabel(order.customer)}</span>
            <span>{order?.customer?.phone}</span>
          </>
        )}

      </div>
    </div>
  )
}
