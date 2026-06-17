import {useEffect, useMemo, useState} from "react";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Order as OrderModel, OrderStatus} from "@/api/model/order.ts";
import {OrderItem} from "@/api/model/order_item.ts";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {StringRecordId} from "surrealdb";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {toast} from "sonner";
import {OrderItemName} from "@/components/common/order/order.item.tsx";
import {calculateOrderItemPrice, calculateOrderTotal} from "@/lib/cart.ts";
import {withCurrency} from "@/lib/utils.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";
import {dispatchPrint} from "@/lib/print.service.ts";
import {PRINT_TYPE} from "@/lib/print.registry.tsx";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {useTranslation} from "react-i18next";

interface OrderRefundModalProps {
  order: OrderModel
  open: boolean
  onClose: () => void
}

export const OrderRefundModal = ({
  order,
  open,
  onClose,
}: OrderRefundModalProps) => {
  const {t} = useTranslation('orders');
  const db = useDB();
  const [page] = useAtom(appPage);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedItems(new Set());
      setReason('');
    }
  }, [open]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  }

  const toggleItem = (itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  const selectedItemsList = getOrderFilteredItems(order).filter(item => selectedItems.has(item.id));
  const selectedItemsTotal = selectedItemsList.reduce((sum, item) => sum + calculateOrderItemPrice(item), 0);
  const originalOrderTotal = calculateOrderTotal(order);

  // Calculate proportional charges based on selected items ratio
  const refundCharges = useMemo(() => {
    if (selectedItemsList.length === 0 || originalOrderTotal === 0) {
      return {
        itemsTotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        serviceChargeAmount: 0,
        extras: [] as Array<{ name: string; value: number }>,
        tipAmount: 0,
        total: 0,
      };
    }

    const ratio = selectedItemsTotal / originalOrderTotal;
    const taxAmount = order.tax_amount ? Number(order.tax_amount) * ratio : 0;
    const discountAmount = order.discount_amount ? Number(order.discount_amount) * ratio : 0;
    const serviceChargeAmount = order.service_charge_amount ? Number(order.service_charge_amount) * ratio : 0;
    const tipAmount = order.tip_amount ? Number(order.tip_amount) * ratio : 0;
    const extras = order.extras ? order.extras.map(extra => ({
      name: extra.name,
      value: extra.value * ratio
    })) : [];

    const extrasTotal = extras.reduce((sum, extra) => sum + extra.value, 0);
    const total = selectedItemsTotal + taxAmount + serviceChargeAmount + tipAmount + extrasTotal - discountAmount;

    return {
      itemsTotal: selectedItemsTotal,
      taxAmount,
      discountAmount,
      serviceChargeAmount,
      extras,
      tipAmount,
      total,
    };
  }, [selectedItemsList, selectedItemsTotal, originalOrderTotal, order]);

  const refundTotal = refundCharges.total;

  const handleRefund = async () => {
    if (selectedItems.size === 0) {
      toast.error(t('refund.selectAtLeastOne'));
      return;
    }

    if (!page?.user?.id) {
      toast.error(t('refund.cannotIdentifyUser'));
      return;
    }

    setIsSubmitting(true);
    try {
      const userId = new StringRecordId(page.user.id.toString());
      const orderId = new StringRecordId(order.id.toString());
      const itemIds = selectedItemsList.map(item => new StringRecordId(item.id.toString()));

      await db.create(Tables.order_refunds, {
        order: orderId,
        items: itemIds,
        created_at: nowSurrealDateTime(),
        manager: userId,
        logged_in_user: userId,
        reason: reason || undefined,
      });

      for(const itemId of itemIds) {
        await db.merge(itemId, {
          is_refunded: true
        })
      }

      // add a tag in original table
      await db.merge(orderId, {
        tags: Array.from(new Set([...(order.tags || []), OrderStatus.Refunded])),
      });

      postOrderTracking({
        module: "Refund order",
        page: page?.page,
        orderId: order.id,
        payload: {
          refunded_items: selectedItemsList.map((item) => item.id.toString()),
          reason: reason || undefined,
          refunded_total: refundTotal,
        },
        user: page?.user,
      });

      // Create refund order object for printing
      const refundOrder: OrderModel = {
        ...order,
        items: selectedItemsList,
        tax_amount: refundCharges.taxAmount,
        discount_amount: refundCharges.discountAmount,
        service_charge_amount: refundCharges.serviceChargeAmount,
        tip_amount: refundCharges.tipAmount,
        extras: refundCharges.extras.map((extra, idx) => ({
          id: `refund-extra-${idx}`,
          name: extra.name,
          value: extra.value
        })),
      };

      toast.success(t('refund.success', {count: selectedItems.size}));
      onClose();

      // Trigger refund print
      setTimeout(() => {
        void dispatchPrint(db, PRINT_TYPE.refund_bill, {
          order: refundOrder,
          originalOrder: order,
        }, { userId: page?.user?.id });
      }, 300);
    } catch (error) {
      console.error('Failed to refund order', error);
      toast.error(t('refund.failed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('refund.title')}
      size="full"
    >
      <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left side - Order items */}
          <div className="flex-1 flex flex-col min-w-0">
            <label className="block text-sm font-semibold mb-2">{t('refund.selectItems')}</label>
            <div className="flex-1 overflow-auto border border-neutral-200 rounded-lg p-3 bg-neutral-50" style={{ minHeight: 0 }}>
              {getOrderFilteredItems(order).map(item => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg mb-2 cursor-pointer transition ${
                    selectedItems.has(item.id)
                      ? 'bg-primary-50 border-2 border-neutral-900'
                      : 'bg-white border-2 border-transparent hover:bg-neutral-100'
                  }`}
                  onClick={() => toggleItem(item.id)}
                >
                  <Checkbox
                    checked={selectedItems.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <OrderItemName item={item} showPrice showQuantity />
                  </div>
                </div>
              ))}
            </div>
            {selectedItems.size > 0 && (
              <div className="mt-3 p-3 bg-primary-50 rounded-lg flex-shrink-0 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">{t('refund.itemsTotal')}</span>
                  <span className="font-semibold">{withCurrency(refundCharges.itemsTotal)}</span>
                </div>
                {order.tax && refundCharges.taxAmount > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span>{t('refund.tax', {name: order.tax.name, rate: order.tax.rate})}</span>
                    <span>{withCurrency(refundCharges.taxAmount)}</span>
                  </div>
                )}
                {order.discount && refundCharges.discountAmount > 0 ? (
                  <div className="flex justify-between items-center text-sm">
                    <span>{t('refund.discount')}</span>
                    <span>{withCurrency(refundCharges.discountAmount)}</span>
                  </div>
                ) : null}
                {order.service_charge && order.service_charge > 0 && refundCharges.serviceChargeAmount > 0 ? (
                  <div className="flex justify-between items-center text-sm">
                    <span>{t('refund.serviceCharges', {value: order.service_charge, unit: order.service_charge_type === 'Percent' ? '%' : ''})}</span>
                    <span>{withCurrency(refundCharges.serviceChargeAmount)}</span>
                  </div>
                ) : null}
                {refundCharges.extras.length > 0 && refundCharges.extras.map((extra, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <span>{extra.name}:</span>
                    <span>{withCurrency(extra.value)}</span>
                  </div>
                ))}
                {order.tip_amount && refundCharges.tipAmount > 0 ? (
                  <div className="flex justify-between items-center text-sm">
                    <span>{t('refund.tip')}</span>
                    <span>{withCurrency(refundCharges.tipAmount)}</span>
                  </div>
                ) : null}
                <div className="border-t border-neutral-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">{t('refund.refundTotal')}</span>
                    <span className="font-bold text-lg">{withCurrency(refundTotal)}</span>
                  </div>
                </div>
                <div className="text-sm text-neutral-600 mt-1">
                  {t('refund.itemsSelected', {count: selectedItems.size})}
                </div>
              </div>
            )}
          </div>

          {/* Right side - Reason */}
          <div className="flex-1 flex flex-col min-w-0">
            <label className="block text-sm font-semibold mb-2">{t('refund.reason')}</label>
            <div className="flex-1" style={{ minHeight: 0 }}>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                rows={12}
                placeholder={t('refund.reasonPlaceholder')}
                enableKeyboard
                className="w-full h-full"
                style={{ minHeight: '400px' }}
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
          <Button
            flat
            variant="primary"
            onClick={handleClose}
            disabled={isSubmitting}
            size="xl"
          >
            {t('common:actions.close')}
          </Button>
          <Button
            variant="danger"
            onClick={handleRefund}
            isLoading={isSubmitting}
            disabled={isSubmitting || selectedItems.size === 0}
            size="xl"
          >
            {selectedItems.size > 0
              ? t('refund.refundButtonWithCount', {count: selectedItems.size})
              : t('refund.refundButton')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

