import {Order as OrderModel, OrderStatus} from "@/api/model/order.ts";
import {OrderItem} from "@/api/model/order_item.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {OrderItemName} from "@/components/common/order/order.item.tsx";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import React, {useEffect, useMemo, useState} from "react";
import {faArrowLeft, faCheck, faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toast} from "sonner";
import {RecordId, StringRecordId} from "surrealdb";
import ScrollContainer from "react-indiana-drag-scroll";
import {nanoid} from "nanoid";
import {getInvoiceNumber, getOrderFilteredItems} from "@/lib/order.ts";
import {assertOrderMutationsAllowed} from "@/lib/closing.guard.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {toRecordId} from "@/lib/utils.ts";
import {generateNextInvoiceNumber, getNextAutoId} from "@/lib/invoice.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {useTranslation} from "react-i18next";

interface Props {
  order: OrderModel
  onClose?: () => void;
}

interface Split {
  id: string;
  name: string;
  items: OrderItem[];
  number: number;
}

export const SplitBySeats = ({
  order, onClose
}: Props) => {
  const {t} = useTranslation('orders');
  const db = useDB();
  const [page] = useAtom(appPage);
  // Initialize with one split containing all items
  const [splits, setSplits] = useState<Split[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [draggedItem, setDraggedItem] = useState<OrderItem | null>(null);
  const [dragOverSplit, setDragOverSplit] = useState<string | null>(null);

  // Calculate total for each split
  const splitTotals = useMemo(() => {
    return splits.map(split => {
      return split.items.reduce((total, item) => {
        return total + calculateOrderItemPrice(item);
      }, 0);
    });
  }, [splits]);

  // Get all splits
  const actualSplits = useMemo(() => {
    return splits;
  }, [splits]);

  const moveItemToSplit = (item: OrderItem, splitId: string) => {
    setSplits(prev => {
      // Find which split currently contains this item
      const currentSplit = prev.find(split => split.items.some(splitItem => splitItem.id === item.id));

      // If the item is already in the target split, do nothing
      if (currentSplit && currentSplit.id === splitId) {
        return prev;
      }

      // Move the item to the target split
      return prev.map(split => {
        if (split.id === splitId) {
          // Add item to this split
          return {
            ...split,
            items: [...split.items, item]
          };
        } else {
          // Remove item from other splits
          return {
            ...split,
            items: split.items.filter(splitItem => splitItem.id !== item.id)
          };
        }
      });
    });
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, item: OrderItem) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', item.id);
  };

  const handleDragOver = (e: React.DragEvent, splitId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSplit(splitId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSplit(null);
  };

  const handleDrop = (e: React.DragEvent, splitId: string) => {
    e.preventDefault();
    if (draggedItem) {
      moveItemToSplit(draggedItem, splitId);
    }
    setDraggedItem(null);
    setDragOverSplit(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverSplit(null);
  };

  const handleSaveSplits = async () => {
    if (!canSave) return;

    setIsSaving(true);
    try {
      await assertOrderMutationsAllowed(db);
      let nextInvoiceNumber = await generateNextInvoiceNumber(db);
      let nextAutoId = await getNextAutoId(db);
      const createdAt = new Date();
      const createdOrders = [];
      const oldOrderId = order.id.toString();
      const oldItems: Record<string, string[]> = {
        [oldOrderId]: getOrderFilteredItems(order).map(item => item.id.toString())
      };
      const newItems: Record<string, string[]> = {};

      for (let i = 0; i < actualSplits.length; i++) {
        const split = actualSplits[i];
        if (split.items.length === 0) continue;

        // Create order items for this split
        const items = split.items.map(item => item.id);

        // Create the split order
        const orderData = {
          floor: new RecordId('floor', order.floor.id),
          covers: Math.ceil(order.covers / actualSplits.length) || 1, // Distribute covers
          // tax: order.tax ? new StringRecordId(order.tax.id.toString()) : null,
          // tax_amount: 0, // Will be calculated per split
          tags: [OrderStatus['Spilt']],
          // discount: order.discount ? new StringRecordId(order.discount.id.toString()) : null,
          // discount_amount: 0, // Will be calculated per split
          // customer: order.customer ? new StringRecordId(order.customer.id.toString()) : null,
          order_type: order.order_type.id,
          status: OrderStatus["In Progress"],
          auto_id: nextAutoId,
          invoice_number: nextInvoiceNumber,
          items: items,
          table: order.table.id,
          user: order.user.id,
          created_at: createdAt,
          split: split.number
        };

        const splitOrder = await db.create(Tables.orders, orderData);
        createdOrders.push(splitOrder[0]);
        newItems[splitOrder[0].id.toString()] = items.map(item => item.toString());
        nextAutoId += 1;
        nextInvoiceNumber += 1;

        for ( const item of items ) {
          await db.merge(item, {
            order: splitOrder[0].id,
            seat: split.number
          });
        }
      }

      // // Mark original order as cancelled or completed
      await db.merge(order.id, {
        status: OrderStatus['Spilt'],
        items: [], // items moved to new orders
        tags: [...(order.tags || []), OrderStatus['Spilt']]
      });

      await db.create(Tables.order_split, {
        created_at: new Date(),
        created_by: toRecordId(page.user.id),
        old_order: order.id,
        new_orders: createdOrders.map(item => item.id),
        old_items: oldItems,
        new_items: newItems,
      });

      postOrderTracking({
        module: "Split order by seats",
        page: page?.page,
        orderId: order.id,
        payload: {
          split_count: createdOrders.length,
          new_orders: createdOrders.map((item) => item.id.toString()),
        },
        user: page?.user,
      });

      toast.success(t('split.toast.success', {count: createdOrders.length}));
      onClose?.();
    } catch (error) {
      console.error('Error creating split orders:', error);
      toast.error(t('split.toast.failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = actualSplits.length > 1 && actualSplits.every(split => split.items.length > 0);

  useEffect(() => {
    // Group items by their seat and initialize splits
    // Only initialize if not already populated or when order changes
    if (!order?.items) return;

    // Build groups: seat label -> items
    const seatToItems: Record<string, OrderItem[]> = {};
    for (const item of getOrderFilteredItems(order)) {
      const seatKey = item.seat ?? t('split.noSeat');
      if (!seatToItems[seatKey]) seatToItems[seatKey] = [];
      seatToItems[seatKey].push(item);
    }

    // Create deterministic ordering: put numeric seats sorted asc, then others, with 'No Seat' last
    const seatKeys = Object.keys(seatToItems).sort((a, b) => {
      const aNum = Number(a);
      const bNum = Number(b);
      const aIsNum = !isNaN(aNum);
      const bIsNum = !isNaN(bNum);

      // Push 'No Seat' to the end
      if (a === 'No Seat' && b !== 'No Seat') return 1;
      if (b === 'No Seat' && a !== 'No Seat') return -1;

      // Numeric seats come before non-numeric
      if (aIsNum && bIsNum) return aNum - bNum;
      if (aIsNum && !bIsNum) return -1;
      if (!aIsNum && bIsNum) return 1;

      return a.localeCompare(b);
    });

    const initialSplits: Split[] = seatKeys.map((seatKey, index) => ({
      id: nanoid(),
      name: t('split.seatName', {number: index + 1}),
      number: index + 1,
      items: seatToItems[seatKey]
    }));

    setSplits(initialSplits);
  }, [order, t]);

  return (
    <>
      <Modal
        title={t('split.title', {invoice: getInvoiceNumber(order)})}
        open={true}
        size="full"
        onClose={onClose}
      >
        <div className="flex h-full gap-6 p-6 bg-gradient-to-br from-gray-50 to-white select-none">
          {/* Right Side - Other Splits (Scrollable) */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                  {t('split.bySeats.heading')}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  {t('split.bySeats.scrollHint')}
                </p>
              </div>
            </div>

            {/* Scrollable Splits Container */}
            <div className="flex-1 min-h-0">
              {actualSplits.length > 0 ? (
                <ScrollContainer className="h-full overflow-x-auto overflow-y-hidden">
                  <div className="flex flex-row gap-5 pb-4 h-full">
                    {actualSplits.map((split, index) => (
                      <div
                        key={split.id}
                        className={`bg-white rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300 flex-shrink-0 w-[400px] h-full flex flex-col ${
                          dragOverSplit === split.id ? 'border-green-400 bg-green-50 scale-105' : ''
                        }`}
                        onDragOver={(e) => handleDragOver(e, split.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, split.id)}
                      >
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-transparent flex-shrink-0">
                          <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                            {split.name}
                          </h4>
                          <div className="flex items-center gap-2">
                             <span className="text-sm font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                               {t('split.bySeats.total', {amount: withCurrency(splitTotals[index])})}
                             </span>
                          </div>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto">
                          {split.items.length === 0 ? (
                            <div className="text-center py-6 text-gray-400">
                              <p>{t('split.bySeats.noItems')}</p>
                              <p className="text-xs mt-1">{t('split.bySeats.dragItemsHere')}</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {split.items.map(item => (
                                <div
                                  key={item.id}
                                  className="p-2 border border-gray-100 rounded-lg bg-gradient-to-r from-gray-50 to-transparent flex justify-between items-center hover:from-green-50 transition-all duration-200"
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, item)}
                                  onDragEnd={handleDragEnd}
                                >
                                  <div className="flex-1">
                                    <OrderItemName
                                      item={item}
                                      showQuantity={true}
                                      showPrice={true}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <p className="text-lg">{t('split.bySeats.noAdditionalSplits')}</p>
                    <p className="text-sm">{t('split.bySeats.addSplitHint')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Save Button - Fixed at bottom */}
            <div className="pt-4 border-t border-gray-200 mt-4 flex-shrink-0">
              <Button
                variant="success"
                icon={faCheck}
                onClick={handleSaveSplits}
                disabled={!canSave || isSaving}
                isLoading={isSaving}
                size="lg"
                className="w-full shadow-lg hover:shadow-green-200 transition-all duration-300"
                filled
              >
                {isSaving ? t('split.bySeats.creating') : t('split.bySeats.save', {count: actualSplits.length})}
              </Button>
              {!canSave && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  {actualSplits.length <= 1
                    ? t('split.bySeats.addMoreSplits')
                    : t('split.bySeats.allSplitsNeedItems')
                  }
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}