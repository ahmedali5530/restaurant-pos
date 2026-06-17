import React, {useMemo, useState, useEffect} from "react";
import { useTranslation } from 'react-i18next';
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Order, OrderStatus} from "@/api/model/order.ts";
import {Button} from "@/components/common/input/button.tsx";
import {
  faCheck,
  faChevronLeft,
  faChevronRight,
  faMapMarkerAlt,
  faPersonBiking,
  faTimes,
  faCreditCard,
  faUser
} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {calculateOrderTotal} from "@/lib/cart.ts";
import {getInvoiceNumber, getOrderFilteredItems} from "@/lib/order.ts";
import {useDB} from "@/api/db/db.ts";
import {toast} from "sonner";
import {DateTime} from "luxon";
import {useDeliveryOrders} from "@/hooks/useDeliveryOrders.ts";
import {OrderItemName} from "@/components/common/order/order.item.tsx";
import {OrderPayment} from "@/components/orders/order.payment.tsx";
import {User} from "@/api/model/user.ts";
import {Tables} from "@/api/db/tables.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";
import {assertOrderTakingAllowed} from "@/lib/closing.guard.ts";

interface DeliveryOrderPopupProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onOrderUpdate?: () => void;
}

export const DeliveryOrderPopup: React.FC<DeliveryOrderPopupProps> = ({
  order: orderProp,
  open,
  onClose,
  onOrderUpdate,
}) => {
  const { t } = useTranslation('delivery');
  const db = useDB();
  const {deliveryOrders, openOrderPopup, selectedOrder: contextSelectedOrder, isPopupOpen} = useDeliveryOrders();
  const [riders, setRiders] = useState<User[]>([]);
  const [loadingRiders, setLoadingRiders] = useState(false);
  const [selectedRider, setSelectedRider] = useState<User | null>(null);

  // Use context selectedOrder if available (will be updated after refetch), otherwise use prop
  const order = contextSelectedOrder || orderProp;

  const items = useMemo(() => getOrderFilteredItems(order), [order]);
  const itemsTotal = useMemo(() => calculateOrderTotal(order), [order]);

  const total = useMemo(() => {
    const extrasTotal = order?.extras ? order.extras.reduce((prev, item) => prev + Number(item.value), 0) : 0;
    const couponDiscount = order?.coupon ? Number(order.coupon.discount || 0) : 0;

    return (
      itemsTotal +
      extrasTotal +
      Number(order?.tax_amount || 0) -
      Number(order?.discount_amount || 0) -
      couponDiscount +
      Number(order.service_charge_amount ?? 0)
    );
  }, [itemsTotal, order]);

  const customer = order.customer;
  const delivery = order.delivery as any;

  // Fetch riders when order is accepted
  useEffect(() => {
    const fetchRiders = async () => {
      if (order.status === OrderStatus["In Progress"] && !delivery?.rider) {
        try {
          setLoadingRiders(true);
          const [result] = await db.query<any>(
            `SELECT * FROM ${Tables.users} WHERE deleted_at = none AND array::find(user_role.roles, 'Riders') != None ORDER BY first_name ASC, last_name ASC`
          );

          setRiders(result as User[]);
        } catch (error) {
          console.error("Error fetching riders:", error);
          toast.error(t('order.fetchRidersFailed'));
        } finally {
          setLoadingRiders(false);
        }
      } else {
        setRiders([]);
      }
    };

    if (open) {
      fetchRiders();
    }
  }, [order.status, delivery?.rider, open]);

  // Find current order index and get next/previous orders
  const currentIndex = useMemo(() => {
    return deliveryOrders.findIndex(o => o.id.toString() === order.id.toString());
  }, [deliveryOrders, order]);

  const hasNext = currentIndex < deliveryOrders.length - 1;
  const hasPrevious = currentIndex > 0;

  const handleNext = () => {
    if (hasNext) {
      openOrderPopup(deliveryOrders[currentIndex + 1]);
    }
  };

  const handlePrevious = () => {
    if (hasPrevious) {
      openOrderPopup(deliveryOrders[currentIndex - 1]);
    }
  };

  const sendForDelivery = async () => {
    try {
      await db.merge(order.id, {
        delivery: {
          ...order.delivery,
          state: 'on_the_way'
        }
      });

      toast.success(t('order.sentForDelivery', { invoice: getInvoiceNumber(order) }));
      onOrderUpdate?.();
      // onClose();
    } catch (error) {
      console.error("Error sending order:", error);
      toast.error(t('order.sendFailed'));
    }
  }

  const handleAccept = async () => {
    try {
      await assertOrderTakingAllowed(db);
      await db.merge(order.id, {
        status: OrderStatus["In Progress"],
        delivery: {
          ...order.delivery,
          state: 'accepted'
        }
      });

      toast.success(t('order.accepted', { invoice: getInvoiceNumber(order) }));
      onOrderUpdate?.();
      // Don't close, show rider selection
    } catch (error) {
      console.error("Error accepting order:", error);
      toast.error(t('order.acceptFailed'));
    }
  };

  const handleAttachRider = async () => {
    if (!selectedRider) {
      toast.error(t('order.selectRiderFirst'));
      return;
    }

    try {
      await db.merge(order.id, {
        delivery: {
          ...order.delivery,
          rider: selectedRider,
          state: 'rider_assigned'
        }
      });

      toast.success(t('order.riderAttached', {
        name: `${selectedRider.first_name} ${selectedRider.last_name}`.trim(),
      }));
      setSelectedRider(null);
      onOrderUpdate?.();
    } catch (error) {
      console.error("Error attaching rider:", error);
      toast.error(t('order.attachRiderFailed'));
    }
  };

  // Clear selected rider when popup closes or order changes
  useEffect(() => {
    if (!open) {
      setSelectedRider(null);
    }
  }, [open]);

  const handleReject = async () => {
    try {
      // Update order status to cancelled
      await db.merge(order.id, {
        status: OrderStatus.Cancelled,
        tags: Array.from(new Set([...(order.tags || []), OrderStatus.Cancelled])),
      });

      toast.error(t('order.rejected', { invoice: getInvoiceNumber(order) }));
      onOrderUpdate?.();
      onClose();
    } catch (error) {
      console.error("Error rejecting order:", error);
      toast.error(t('order.rejectFailed'));
    }
  };

  const [payment, setPayment] = useState(false);

  // const handleViewDetails = () => {
  //   // Navigate to order details or open a detailed view
  //   // For now, just show a message
  //   // toast.info("View order details - implement navigation as needed");
  // };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`Delivery Order - ${getInvoiceNumber(order)}`}
        size="lg"
        shouldCloseOnOverlayClick={true}
        shouldCloseOnEsc={true}
      >
        <div className="space-y-6">
          {/* Navigation Buttons */}
          {deliveryOrders.length > 1 && (
            <div className="flex justify-between items-center pb-3 border-b border-neutral-200">
              <Button
                variant="primary"
                onClick={handlePrevious}
                icon={faChevronLeft}
                disabled={!hasPrevious}
              >
                Previous
              </Button>
              <span className="text-sm text-neutral-600">
              Order {currentIndex + 1} of {deliveryOrders.length}
            </span>
              <Button
                variant="primary"
                onClick={handleNext}
                rightIcon={faChevronRight}
                disabled={!hasNext}
              >
                Next
              </Button>
            </div>
          )}

          {/* Action Buttons - Moved to Top */}
          <div className="flex gap-3 justify-end pb-4 border-b border-neutral-200">
            {order.status === OrderStatus.Pending && (
              <>
                <Button
                  variant="danger"
                  onClick={handleReject}
                  icon={faTimes}
                  size="lg"
                >
                  Reject
                </Button>
                <Button
                  variant="success"
                  onClick={handleAccept}
                  icon={faCheck}
                  size="lg"
                >
                  Accept
                </Button>
              </>
            )}

            {order.status === OrderStatus["In Progress"] && delivery?.state === 'rider_assigned' && (
              <Button
                variant="success"
                onClick={sendForDelivery}
                icon={faPersonBiking}
                size="lg"
              >
                Send for delivery
              </Button>
            )}

            {order.status === OrderStatus["In Progress"] && delivery?.state === 'on_the_way' && (
              <Button
                variant="success"
                onClick={() => setPayment(true)}
                icon={faCreditCard}
                size="lg"
              >
                Payment
              </Button>
            )}
          </div>

          {/* Rider Selection Section - Show when order is accepted but no rider assigned */}
          {order.status === OrderStatus["In Progress"] && !delivery?.rider && (
            <div className="bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <FontAwesomeIcon icon={faUser} className="text-blue-600"/>
                <span>Select Rider</span>
              </h3>
              {loadingRiders ? (
                <p className="text-sm text-neutral-600">Loading riders...</p>
              ) : riders.length === 0 ? (
                <p className="text-sm text-neutral-600">No riders available</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {riders.map((rider) => (
                      <Button
                        key={rider.id.toString()}
                        variant={selectedRider?.id === rider.id ? "success" : "primary"}
                        onClick={() => setSelectedRider(rider)}
                        className="justify-start"
                      >
                        <div className="text-left font-medium">
                          {rider.first_name} {rider.last_name}
                        </div>
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="success"
                    onClick={handleAttachRider}
                    icon={faUser}
                    size="lg"
                    disabled={!selectedRider}
                    className="w-full"
                  >
                    Attach Selected Rider
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Show attached rider info */}
          {delivery?.rider && (
            <div className="bg-green-50 p-4 rounded-lg border-2 border-green-200">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <FontAwesomeIcon icon={faUser} className="text-green-600"/>
                <span>{t('order.assignedRider')}</span>
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {delivery.rider.first_name} {delivery.rider.last_name}
                  </p>
                  {delivery.rider.login && (
                    <p className="text-sm text-neutral-500">{delivery.rider.login}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-danger-200 p-4 rounded-lg border-2 border-danger-300">
            {order?.created_at && (
              <div className="space-y-2">
                <p className="text-2xl font-medium">Ordered at: {toLuxonDateTime(order.created_at).toFormat(import.meta.env.VITE_TIME_FORMAT)}</p>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-2xl font-medium">
                Delivery time: {
                  !delivery?.deliveryTime || delivery.deliveryTime === 'now' || delivery.deliveryTime === 'asap'
                    ? 'ASAP'
                    : toLuxonDateTime(delivery.deliveryTime).toFormat(import.meta.env.VITE_TIME_FORMAT)
                }
              </p>
            </div>
          </div>

          {/* Customer Information */}
          {customer && (
            <div className="bg-gray-200 p-4 rounded-lg border-2 border-gray-300">
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>{t('order.customerInformation')}</span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-neutral-600">{t('common:actions.name')}</label>
                  <p className="text-base">{customer.name}</p>
                </div>
                {customer.phone && (
                  <div>
                    <label className="text-sm font-medium text-neutral-600">Phone</label>
                    <p className="text-base"><a href={`tel:${customer.phone}`}>{customer.phone}</a></p>
                  </div>
                )}
                {customer.email && (
                  <div>
                    <label className="text-sm font-medium text-neutral-600">Email</label>
                    <p className="text-base"><a href={`mailto:${customer.email}`}>{customer.email}</a></p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Delivery Address Section */}
          <div className="bg-primary-100 p-4 rounded-lg border-2 border-primary-200">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FontAwesomeIcon icon={faMapMarkerAlt} className="text-primary-600"/>
              <span>{t('order.deliveryAddress')}</span>
            </h3>
            <div className="space-y-2">
              {delivery?.place ? (
                <p className="text-base font-medium">{delivery.place}</p>
              ) : delivery?.address ? (
                <p className="text-base font-medium">{delivery.address}</p>
              ) : customer?.address ? (
                <p className="text-base font-medium">{customer.address}</p>
              ) : (
                <p className="text-base text-neutral-500 italic">No delivery address provided</p>
              )}
              {(delivery?.lat && delivery?.lng) && (
                <div className="mt-2 pt-2 border-t border-primary-200">
                  <label className="text-sm font-medium text-neutral-600 flex items-center gap-2">
                    <span>Coordinates</span>
                    <span className="text-xs text-neutral-500">({delivery.lat}, {delivery.lng})</span>
                  </label>
                </div>
              )}
              {(customer?.lat && customer?.lng && !delivery?.lat) && (
                <div className="mt-2 pt-2 border-t border-primary-200">
                  <label className="text-sm font-medium text-primary-600 flex items-center gap-2">
                    <span>Coordinates</span>
                    <span className="text-xs text-neutral-500">({customer.lat}, {customer.lng})</span>
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* Order Information */}
          <div className="bg-success-100 p-4 rounded-lg border-2 border-success-200">
            <h3 className="text-lg font-semibold mb-3">Order Details</h3>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium text-neutral-600">Status:</span>
                <span className="text-base font-semibold">{order.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm font-medium text-neutral-600">Created:</span>
                <span className="text-base">
                {toLuxonDateTime(order.created_at).toFormat("yyyy-MM-dd hh:mm a")}
              </span>
              </div>
            </div>

            {/* Order Items */}
            <div className="mt-4">
              <h4 className="text-md font-semibold mb-2">Items ({items.length})</h4>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <OrderItemName item={item} key={index} showGroups={true} showPrice={true} showQuantity={true}/>
                ))}
              </div>
            </div>

            {/* Order Totals */}
            <div className="mt-4 pt-4 border-t border-success-200">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Subtotal:</span>
                  <span className="text-base">{itemsTotal.toFixed(2)}</span>
                </div>
                {order.discount_amount && order.discount_amount > 0 ? (
                  <div className="flex justify-between text-danger-600">
                    <span className="text-sm font-medium">Discount:</span>
                    <span className="text-base">-{order.discount_amount.toFixed(2)}</span>
                  </div>
                ) : null}
                {order.coupon && order.coupon.discount > 0 ? (
                  <div className="flex justify-between text-danger-600">
                    <span className="text-sm font-medium">
                      Coupon{order.coupon.coupon?.code ? ` (${order.coupon.coupon.code})` : ""}:
                    </span>
                    <span className="text-base">-{order.coupon.discount.toFixed(2)}</span>
                  </div>
                ) : null}
                {order.tax_amount && order.tax_amount > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Tax:</span>
                    <span className="text-base">{order.tax_amount.toFixed(2)}</span>
                  </div>
                ) : null}
                {order.service_charge_amount && order.service_charge_amount > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Service Charge:</span>
                    <span className="text-base">{order.service_charge_amount.toFixed(2)}</span>
                  </div>
                ) : null}
                {order.extras && order.extras.length > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Extras:</span>
                    <span className="text-base">
                    {order.extras.reduce((prev, item) => prev + Number(item.value), 0).toFixed(2)}
                  </span>
                  </div>
                ) : null}
                <div className="flex justify-between pt-2 border-t border-success-200">
                  <span className="text-lg font-bold">Total:</span>
                  <span className="text-lg font-bold">{total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {payment && (
        <OrderPayment
          order={order}
          onClose={async () => {
            onClose();
            setPayment(false);
          }}
        />
      )}
    </>
  );
};

