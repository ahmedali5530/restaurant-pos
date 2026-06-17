import {useEffect, useMemo, useState} from "react";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Order as OrderModel, OrderStatus} from "@/api/model/order.ts";
import {OrderVoidReason} from "@/api/model/order_void.ts";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {StringRecordId} from "surrealdb";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {toast} from "sonner";
import {getOrderFilteredItems, translateVoidReason} from "@/lib/order.ts";
import {dispatchPrint} from "@/lib/print.service.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import ScrollContainer from "react-indiana-drag-scroll";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {assertOrderMutationsAllowed} from "@/lib/closing.guard.ts";
import {cancelItemStages} from "@/lib/kitchen/workflow.service.ts";
import {useTranslation} from "react-i18next";

interface OrderCancelModalProps {
  order: OrderModel
  open: boolean
  onClose: () => void
}

type ReasonOption = {
  label: string
  value: OrderVoidReason
}

export const OrderCancelModal = ({
  order,
  open,
  onClose,
}: OrderCancelModalProps) => {
  const {t} = useTranslation('orders');
  const db = useDB();
  const [page] = useAtom(appPage);

  const reasonOptions = useMemo<ReasonOption[]>(() => {
    return Object.values(OrderVoidReason).map((reason) => ({
      label: translateVoidReason(t, reason),
      value: reason as OrderVoidReason,
    }));
  }, [t]);

  const filteredItems = useMemo(() => getOrderFilteredItems(order), [order]);

  const [selectedReason, setSelectedReason] = useState<OrderVoidReason | null>(reasonOptions[0]?.value ?? null);
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});

  const allSelected = useMemo(() => {
    return filteredItems.length > 0 && filteredItems.every(
      (item) => selectedItems[item.id.toString()] === item.quantity
    );
  }, [filteredItems, selectedItems]);

  useEffect(() => {
    if (open) {
      setSelectedReason(reasonOptions[0]?.value ?? null);
      setComments('');
      // select all or no selection on start up

      // const all: Record<string, number> = {};
      // for (const item of filteredItems) {
      //   all[item.id.toString()] = item.quantity;
      // }
      // setSelectedItems(all);
    }
  }, [open, reasonOptions, filteredItems]);

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedItems({});
    } else {
      const all: Record<string, number> = {};
      for (const item of filteredItems) {
        all[item.id.toString()] = item.quantity;
      }
      setSelectedItems(all);
    }
  };

  const toggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => {
      const next = {...prev};
      if (next[itemId]) {
        delete next[itemId];
      } else {
        next[itemId] = maxQty;
      }
      return next;
    });
  };

  const setItemQty = (itemId: string, qty: number, maxQty: number) => {
    const clamped = Math.max(0, Math.min(qty, maxQty));
    setSelectedItems((prev) => {
      const next = {...prev};
      if (clamped === 0) {
        delete next[itemId];
      } else {
        next[itemId] = clamped;
      }
      return next;
    });
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  }

  const handleConfirm = async () => {
    if (!selectedReason) {
      toast.error(t('cancel.chooseReason'));
      return;
    }

    if (Object.keys(selectedItems).length === 0) {
      toast.error(t('cancel.selectAtLeastOne'));
      return;
    }

    if (!page?.user?.id) {
      toast.error(t('cancel.cannotIdentifyUser'));
      return;
    }

    setIsSubmitting(true);
    try {
      await assertOrderMutationsAllowed(db);

      const userId = new StringRecordId(page.user.id.toString());
      const orderId = new StringRecordId(order.id.toString());
      const now = nowSurrealDateTime();

      if (allSelected) {
        await db.merge(orderId, {
          status: OrderStatus.Cancelled,
          tags: Array.from(new Set([...(order.tags || []), OrderStatus.Cancelled])),
        });
      }

      for (const item of filteredItems) {
        const key = item.id.toString();
        const qty = selectedItems[key];
        if (!qty) continue;

        const itemId = new StringRecordId(key);

        if (qty >= item.quantity) {
          await db.merge(itemId, {deleted_at: now});
          // Cancel any pending/waiting kitchen stages so the item stops
          // surfacing downstream.
          await cancelItemStages(db, key);
        } else {
          await db.merge(itemId, {quantity: item.quantity - qty});
        }

        await db.create(Tables.order_voids, {
          comments: comments || undefined,
          created_at: now,
          deleted_by: userId,
          logged_in_user: userId,
          order: orderId,
          // order_item: itemId,
          quantity: qty,
          reason: selectedReason,
          items: [itemId],
        });
      }

      // Dispatch deletion prints grouped by kitchen
      try {
        const [kitchens]: any = await db.query(`SELECT *
                                                FROM ${Tables.kitchens}
                                                WHERE deleted_at = none FETCH printers, items`);
        const kitchenItemsMap: Record<string, { kitchen: Kitchen; items: any[] }> = {};

        for (const item of filteredItems) {
          const key = item.id.toString();
          const qty = selectedItems[key];
          if (!qty) continue;

          for (const k of kitchens) {
            const kitchenDishIds = (k.items || []).map((d: any) => d.id?.toString() ?? d.toString());
            const itemDishId = item.item?.id?.toString();
            if (itemDishId && kitchenDishIds.includes(itemDishId)) {
              const kId = k.id.toString();
              if (!kitchenItemsMap[kId]) {
                kitchenItemsMap[kId] = {kitchen: k, items: []};
              }
              kitchenItemsMap[kId].items.push({...item, quantity: qty});
            }
          }
        }

        for (const {kitchen, items} of Object.values(kitchenItemsMap)) {
          void dispatchPrint(db, 'deletion', {
            items,
            order,
            kitchenName: kitchen.name,
            table: order.table,
            reason: selectedReason,
            comments: comments || undefined,
          }, {
            title: 'Deletion print',
            copies: 1,
            userId: page?.user?.id,
            printers: kitchen.printers,
          });
        }
      } catch (e) {
        console.error('Failed to dispatch deletion prints', e);
      }

      postOrderTracking({
        module: allSelected ? "Cancel order" : "Cancel order items",
        page: page?.page,
        orderId: order.id,
        payload: {
          all_selected: allSelected,
          items_count: Object.keys(selectedItems).length,
          reason: selectedReason,
          comments: comments || undefined,
        },
        user: page?.user,
      });

      toast.success(allSelected ? t('cancel.successOrder') : t('cancel.successItems'));
      onClose();
    } catch (error) {
      console.error('Failed to cancel order', error);
      toast.error(t('cancel.failed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('cancel.title')}
      size="md"
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-semibold mb-2">{t('cancel.reason')}</label>
          <div className="grid grid-cols-4 gap-3">
            {reasonOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`rounded-xl border-2 px-3 py-4 text-base font-semibold transition text-center ${
                  selectedReason === option.value
                    ? 'border-danger-500 bg-danger-100/30 text-danger-600'
                    : 'border-neutral-200 bg-white hover:border-neutral-400'
                }`}
                onClick={() => setSelectedReason(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center mb-2 gap-5">
            <label className="block text-sm font-semibold">{t('cancel.items')}</label>
            <button
              type="button"
              className="text-sm font-medium text-primary-600 hover:text-primary-700"
              onClick={toggleSelectAll}
            >
              {allSelected ? t('common:actions.deselectAll') : t('common:actions.selectAll')}
            </button>
          </div>
          <ScrollContainer className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 max-h-[400px] overflow-y-auto">
            <>
              {filteredItems.map((item) => {
                const key = item.id.toString();
                const isSelected = !!selectedItems[key];
                const currentQty = selectedItems[key] ?? 0;
                return (
                  <div
                    key={key}
                    role="button"
                    onClick={() => toggleItem(key, item.quantity)}
                    className={`flex items-center gap-3 px-3 py-2.5 transition cursor-pointer select-none ${
                      isSelected ? 'bg-danger-200' : 'bg-white hover:bg-neutral-50'
                    }`}
                  >
                    <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition ${
                      isSelected ? 'border-danger-500 bg-danger-500' : 'border-neutral-300'
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <span className="flex-1 font-medium truncate">
                    {item.item?.name ?? t('cancel.unknownItem')}
                  </span>
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={!isSelected || currentQty <= 1}
                        className="btn btn-secondary btn-flat btn-square btn-lg"
                        onClick={() => setItemQty(key, currentQty - 1, item.quantity)}
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-semibold tabular-nums">
                      {isSelected ? currentQty : 0}
                    </span>
                      <button
                        type="button"
                        disabled={!isSelected || currentQty >= item.quantity}
                        className="btn btn-secondary btn-flat btn-square btn-lg"
                        onClick={() => setItemQty(key, currentQty + 1, item.quantity)}
                      >
                        +
                      </button>
                      <span className="text-neutral-400 w-8 text-right">
                      / {item.quantity}
                    </span>
                    </div>
                  </div>
                );
              })}
            </>
          </ScrollContainer>
        </div>

        <div>
          <label className="block text-sm font-semibold mb-2">{t('cancel.comments')}</label>
          <Textarea
            value={comments}
            onChange={(event) => setComments(event.currentTarget.value)}
            rows={4}
            placeholder={t('cancel.commentsPlaceholder')}
            enableKeyboard
          />
        </div>

        <div className="flex justify-end gap-3">
          {/*<Button flat variant="primary" onClick={handleClose} disabled={isSubmitting} size="lg">Close</Button>*/}
          <Button
            variant="danger"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            disabled={isSubmitting}
            size="lg"
          >
            {t('cancel.confirmCancellation')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

