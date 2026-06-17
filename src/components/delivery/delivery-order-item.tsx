import React, { useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { Order, OrderStatus } from "@/api/model/order.ts";
import { getInvoiceNumber, getOrderFilteredItems } from "@/lib/order.ts";
import { calculateOrderTotal } from "@/lib/cart.ts";
import { withCurrency } from "@/lib/utils.ts";
import { cn } from "@/lib/utils.ts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMapMarkerAlt, faClock, faShoppingBag, faBiking, faUser, faCheck } from "@fortawesome/free-solid-svg-icons";
import { toLuxonDateTime } from "@/lib/datetime.ts";

interface DeliveryOrderItemProps {
  order: Order;
  onClick: () => void;
}

export const DeliveryOrderItem: React.FC<DeliveryOrderItemProps> = ({
  order,
  onClick,
}) => {
  const { t } = useTranslation('delivery');
  const customer = order.customer;
  const delivery = order.delivery as any;

  const items = useMemo(() => getOrderFilteredItems(order), [order]);
  const itemsTotal = useMemo(() => calculateOrderTotal(order), [order]);

  const total = useMemo(() => {
    const extrasTotal = order?.extras ? order.extras.reduce((prev, item) => prev + Number(item.value), 0) : 0;
    return itemsTotal + extrasTotal + Number(order?.tax_amount || 0) - Number(order?.discount_amount || 0) + Number(order.service_charge_amount ?? 0);
  }, [itemsTotal, order]);

  // Get address from delivery or customer
  const address = delivery?.address || customer?.address || "No address";
  const secondaryAddress = delivery?.secondary_address || customer?.secondary_address;

  // Status colors
  const statusColors = {
    [OrderStatus.Pending]: "bg-warning-100 text-warning-700 border-warning-300",
    [OrderStatus["In Progress"]]: "bg-primary-100 text-primary-700 border-primary-300",
  };

  // Get delivery state display
  const getDeliveryStateDisplay = () => {
    const state = delivery?.state;
    if (!state) return null;

    switch (state) {
      case 'accepted':
        return {
          text: 'Accepted - Waiting for rider',
          icon: faCheck,
          className: 'bg-info-100 text-info-700 border-info-300'
        };
      case 'rider_assigned':
        return {
          text: delivery?.rider 
            ? `Rider assigned: ${delivery.rider.first_name} ${delivery.rider.last_name}`
            : 'Rider assigned',
          icon: faUser,
          className: 'bg-primary-100 text-primary-700 border-primary-300'
        };
      case 'on_the_way':
        return {
          text: 'Out for delivery',
          icon: faBiking,
          className: 'bg-success-100 text-success-700 border-success-300'
        };
      default:
        return null;
    }
  };

  const deliveryState = getDeliveryStateDisplay();

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg p-4 mb-3 shadow-md hover:shadow-lg transition-shadow cursor-pointer border-2 border-neutral-200 hover:border-primary-400"
    >
      {deliveryState && (
        <div className={`${deliveryState.className} border-2 p-2 rounded text-sm mb-2 flex items-center gap-2`}>
          <FontAwesomeIcon icon={deliveryState.icon} />
          <span className="font-medium">{deliveryState.text}</span>
        </div>
      )}
      {/* Header with Invoice Number and Status */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-neutral-800">
            #{getInvoiceNumber(order)}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <FontAwesomeIcon icon={faClock} className="text-xs text-neutral-500" />
            <span className="text-xs text-neutral-500">
              {toLuxonDateTime(order.created_at).toFormat("hh:mm a")}
            </span>
          </div>
        </div>
        <span
          className={cn(
            "px-3 py-1 rounded-lg text-xs font-bold uppercase border",
            statusColors[order.status] || "bg-neutral-100 text-neutral-700 border-neutral-300"
          )}
        >
          {order.status}
        </span>
      </div>

      {/* Customer Name */}
      {customer?.name && (
        <div className="mb-2">
          <p className="text-base font-semibold text-neutral-800">
            {customer.name}
          </p>
          {customer.phone && (
            <p className="text-sm text-neutral-600 mt-1">
              <a href={`tel:${customer.phone}`} className="hover:text-primary-600" onClick={(e) => e.stopPropagation()}>
                {customer.phone}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Delivery Address */}
      <div className="mb-3 flex items-start gap-2">
        <FontAwesomeIcon
          icon={faMapMarkerAlt}
          className="text-primary-600 mt-1 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-700 line-clamp-2">{address}</p>
          {secondaryAddress && (
            <p className="text-xs text-neutral-500 mt-1">{secondaryAddress}</p>
          )}
        </div>
      </div>

      {/* Order Summary */}
      <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faShoppingBag} className="text-neutral-500 text-sm" />
          <span className="text-sm text-neutral-600">
            {items.length} {items.length === 1 ? "item" : "items"}
          </span>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-primary-700">
            {withCurrency(total)}
          </p>
        </div>
      </div>
    </div>
  );
};
