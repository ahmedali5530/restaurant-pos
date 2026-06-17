import {Order as OrderModel, OrderStatus} from "@/api/model/order.ts";
import {OrderItem} from "@/api/model/order_item.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {calculateOrderItemPrice, calculateOrderTotal} from "@/lib/cart.ts";
import {formatNumber, withCurrency} from "@/lib/utils.ts";
import React, {useMemo, useState} from "react";
import {faCheck, faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toast} from "sonner";
import {RecordId, StringRecordId} from "surrealdb";
import {nanoid} from "nanoid";
import {getOrderFilteredItems} from "@/lib/order.ts";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
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
  amount: number;
  number: number;
}

export const SplitAmount = ({
  order, onClose
}: Props) => {
  const {t} = useTranslation('orders');
  const db = useDB();
  const [page] = useAtom(appPage);

  // Calculate total order amount (same as order.box.tsx)
  const itemsTotal = useMemo(() => calculateOrderTotal(order), [order]);
  const orderTotal = useMemo(() => {
    const extrasTotal = order?.extras ? order?.extras?.reduce((prev, item) => prev + item.value, 0) : 0;
    return itemsTotal + extrasTotal + Number(order?.tax_amount ?? 0) - Number(order?.discount_amount ?? 0) + Number(order.service_charge_amount ?? 0) + Number(order?.tip_amount ?? 0);
  }, [itemsTotal, order]);

  const allItems = useMemo(() => getOrderFilteredItems(order), [order]);

  // Initialize with two empty splits
  const [splits, setSplits] = useState<Split[]>([
    {id: nanoid(), name: t('split.splitName', {number: 1}), amount: 0, number: 1},
    {id: nanoid(), name: t('split.splitName', {number: 2}), amount: 0, number: 2}
  ]);
  const [isSaving, setIsSaving] = useState(false);

  // Calculate total assigned amount and remaining
  const assignedTotal = useMemo(() => {
    return splits.reduce((sum, split) => sum + (split.amount || 0), 0);
  }, [splits]);

  const remainingAmount = useMemo(() => {
    return Math.max(0, orderTotal - assignedTotal);
  }, [orderTotal, assignedTotal]);

  const isValid = useMemo(() => {
    return splits.length >= 2 &&
      splits.every(split => split.amount > 0) &&
      Math.abs(assignedTotal - orderTotal) < 0.01; // Allow small rounding differences
  }, [splits, assignedTotal, orderTotal]);

  // Calculate adjusted prices for each split based on ratio
  const getSplitRatio = (splitAmount: number) => {
    if (orderTotal === 0) return 1;
    return splitAmount / orderTotal;
  };

  // Calculate adjusted item price for a split
  const getAdjustedItemPrice = (item: OrderItem, ratio: number) => {
    return calculateOrderItemPrice(item) * ratio;
  };

  // Calculate split totals with adjusted prices
  const splitTotals = useMemo(() => {
    return splits.map(split => {
      const ratio = getSplitRatio(split.amount);
      return allItems.reduce((total, item) => {
        return total + getAdjustedItemPrice(item, ratio);
      }, 0);
    });
  }, [splits, allItems, orderTotal]);

  const updateSplitAmount = (splitId: string, amount: number) => {
    const newAmount = Math.max(0, Math.min(amount, orderTotal));
    setSplits(prev => prev.map(split =>
      split.id === splitId ? {...split, amount: newAmount} : split
    ));
  };

  const distributeEvenly = () => {
    const splitCount = splits.length;
    const amountPerSplit = orderTotal / splitCount;
    setSplits(prev => prev.map(split => ({
      ...split,
      amount: amountPerSplit
    })));
  };

  const autoFillRemaining = () => {
    if (remainingAmount > 0) {
      // Find the first split with amount 0 and fill it with remaining
      const emptySplit = splits.find(split => split.amount === 0);
      if (emptySplit) {
        updateSplitAmount(emptySplit.id, remainingAmount);
      } else {
        // If no empty split, distribute remaining evenly
        const splitCount = splits.length;
        const additionalPerSplit = remainingAmount / splitCount;
        setSplits(prev => prev.map(split => ({
          ...split,
          amount: split.amount + additionalPerSplit
        })));
      }
    }
  };

  const addSplit = () => {
    const newSplitId = nanoid();
    setSplits(prev => [...prev, {
      id: newSplitId,
      name: t('split.splitName', {number: prev.length + 1}),
      amount: 0,
      number: prev.length + 1
    }]);
  };

  const removeSplit = (splitId: string) => {
    if (splits.length > 2) {
      setSplits(prev => {
        const filtered = prev.filter(split => split.id !== splitId);
        return filtered.map((split, index) => ({
          ...split,
          name: t('split.splitName', {number: index + 1}),
          number: index + 1
        }));
      });
    }
  };

  // Recursively adjust modifier prices
  const adjustModifierPrice = (modifier: any, ratio: number): any => {
    if (!modifier) return modifier;

    if (modifier.price !== undefined) {
      modifier = {
        ...modifier,
        price: modifier.price * ratio
      };
    }

    if (modifier.selectedModifiers && Array.isArray(modifier.selectedModifiers)) {
      modifier = {
        ...modifier,
        selectedModifiers: modifier.selectedModifiers.map((sm: any) => adjustModifierPrice(sm, ratio))
      };
    }

    if (modifier.modifiers && Array.isArray(modifier.modifiers)) {
      modifier = {
        ...modifier,
        modifiers: modifier.modifiers.map((m: any) => adjustModifierPrice(m, ratio))
      };
    }

    return modifier;
  };

  const handleSaveSplits = async () => {
    if (!isValid) return;

    setIsSaving(true);
    try {
      await assertOrderMutationsAllowed(db);
      let nextInvoiceNumber = await generateNextInvoiceNumber(db);
      let nextAutoId = await getNextAutoId(db);
      const createdAt = new Date();
      const createdOrders = [];
      const oldOrderId = order.id.toString();
      const oldItems: Record<string, string[]> = {
        [oldOrderId]: allItems.map(item => item.id.toString())
      };
      const newItems: Record<string, string[]> = {};

      for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        if (split.amount <= 0) continue;

        // Calculate proportional values for tax, discount, etc.
        const splitRatio = split.amount / orderTotal;
        const splitTaxAmount = order.tax_amount ? Number(order.tax_amount) * splitRatio : 0;
        const splitDiscountAmount = order.discount_amount ? Number(order.discount_amount) * splitRatio : 0;
        const splitServiceChargeAmount = order.service_charge_amount ? Number(order.service_charge_amount) * splitRatio : 0;
        const splitTipAmount = order.tip_amount ? Number(order.tip_amount) * splitRatio : 0;

        // Create new order items with adjusted prices for this split
        const newItemIds = [];

        for (const originalItem of allItems) {
          // Get the base price to adjust from (current price)
          const basePrice = originalItem.price;
          const newPrice = basePrice * splitRatio;

          // Set original_price: use current price if original_price is empty, otherwise keep existing
          const originalPrice = originalItem.original_price ?? basePrice;

          // Prepare item data with adjusted price
          const itemData: any = {
            item: new StringRecordId(originalItem.item.id.toString()),
            price: newPrice,
            quantity: originalItem.quantity,
            position: originalItem.position,
            comments: originalItem.comments || undefined,
            service_charges: originalItem.service_charges ? (originalItem.service_charges * splitRatio) : 0,
            discount: originalItem.discount ? (originalItem.discount * splitRatio) : 0,
            modifiers: originalItem.modifiers ? originalItem.modifiers.map((mod: any) => adjustModifierPrice(mod, splitRatio)) : undefined,
            seat: originalItem.seat || undefined,
            is_suspended: originalItem.is_suspended || false,
            level: originalItem.level,
            category: originalItem.category || undefined,
            is_addition: false,
            tax: originalItem.tax ? (originalItem.tax * splitRatio) : 0,
            created_at: nowSurrealDateTime(),
            // Set original_price: use current price if empty, otherwise keep existing original_price
            original_price: originalPrice
          };

          // Create the new order item
          const [createdItem] = await db.create(Tables.order_items, itemData);
          newItemIds.push(createdItem.id);

          // Create kitchen entries if needed
          // const kitchen: any = await db.query(`SELECT * from ${Tables.kitchens} where items ?= ${originalItem.item.id.toString()}`);
          // if (kitchen[0] && kitchen[0].length > 0) {
          //   for (const k of kitchen[0]) {
          //     await db.create(Tables.order_items_kitchen, {
          //       created_at: DateTime.now().toJSDate(),
          //       kitchen: new StringRecordId(k.id.toString()),
          //       order_item: new StringRecordId(createdItem.id.toString())
          //     });
          //   }
          // }
        }

        // Create the split order
        const orderData = {
          floor: new RecordId('floor', order.floor.id),
          covers: Math.ceil(order.covers / splits.length) || 1,
          tags: [OrderStatus['Spilt']],
          order_type: order.order_type.id,
          status: OrderStatus["In Progress"],
          auto_id: nextAutoId,
          invoice_number: nextInvoiceNumber,
          items: newItemIds,
          table: order.table.id,
          user: order.user.id,
          created_at: createdAt,
          split: split.number,
          tax_amount: splitTaxAmount,
          discount_amount: splitDiscountAmount,
          service_charge_amount: splitServiceChargeAmount,
          tip_amount: splitTipAmount,
          // Distribute extras proportionally if any
          extras: order.extras?.map(extra => ({
            name: extra.name,
            value: extra.value * splitRatio
          }))
        };

        const splitOrder = await db.create(Tables.orders, orderData);
        createdOrders.push(splitOrder[0]);
        newItems[splitOrder[0].id.toString()] = newItemIds.map(item => item.toString());
        nextAutoId += 1;
        nextInvoiceNumber += 1;
      }

      // Mark original order as split
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
        module: "Split order by amount",
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

  const canSave = isValid && splits.length >= 2;

  return (
    <>
      <Modal
        title={t('split.titleByAmount', {invoice: order.invoice_number})}
        open={true}
        size="full"
        onClose={onClose}
      >
        <div className="flex flex-col h-full gap-6 p-6 bg-gradient-to-br from-gray-50 to-white">
          {/* Header with Order Total */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-gray-800 mb-1">
                  {t('split.byAmount.orderTotal')}
                </h3>
                <p className="text-sm text-gray-500">
                  {t('split.byAmount.assignHint')}
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-green-600">
                  {withCurrency(orderTotal)}
                </div>
                <div className="text-sm text-gray-500 mt-1">
                  {t('split.byAmount.assigned', {amount: withCurrency(assignedTotal)})}
                </div>
                <div className={`text-sm font-medium mt-1 ${
                  remainingAmount === 0 ? 'text-green-600' : 'text-orange-600'
                }`}>
                  {t('split.byAmount.remaining', {amount: withCurrency(remainingAmount)})}
                </div>
              </div>
            </div>
          </div>

          {/* Splits Grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {splits.map((split, index) => {
                const ratio = getSplitRatio(split.amount);
                const percentage = orderTotal > 0 ? ((split.amount / orderTotal) * 100).toFixed(1) : '0';

                return (
                  <div
                    key={split.id}
                    className="bg-white rounded-xl shadow-lg border border-gray-200 hover:shadow-xl transition-all duration-300 flex flex-col"
                  >
                    <div
                      className="p-4 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-blue-50 to-transparent flex-shrink-0">
                      <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        {split.name}
                      </h4>
                      {splits.length > 2 && (
                        <Button
                          variant="danger"
                          icon={faTrash}
                          iconButton
                          size="sm"
                          onClick={() => removeSplit(split.id)}
                        />
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col gap-4">
                      {/* Amount Input */}
                      <div>
                        <Input
                          type="number"
                          label={t('split.byAmount.amount')}
                          value={split.amount > 0 ? split.amount : ''}
                          onChange={(e) => {
                            const inputValue = e.target.value;
                            // Handle empty string or numeric input
                            if (inputValue === '' || inputValue === null || inputValue === undefined) {
                              updateSplitAmount(split.id, 0);
                              return;
                            }
                            const value = parseFloat(String(inputValue)) || 0;
                            updateSplitAmount(split.id, value);
                          }}
                          placeholder="0.00"
                          inputSize="lg"
                          enableKeyboard
                        />
                        {split.amount > 0 && (
                          <div className="mt-2 text-sm text-gray-600">
                            {t('split.byAmount.percentage', {value: percentage})}
                          </div>
                        )}
                      </div>

                      {/* All Items Display */}
                      <div className="flex-1 min-h-[100px]">
                        <div className="text-xs font-medium text-gray-500 mb-2">
                          {t('split.byAmount.itemsCount', {count: allItems.length})}
                        </div>
                        <div className="max-h-[300px] overflow-y-auto space-y-1">
                          {allItems.length === 0 ? (
                            <div className="text-center py-4 text-gray-400 text-sm">
                              {t('split.byAmount.noItemsInOrder')}
                            </div>
                          ) : (
                            allItems.map(item => {
                              const originalPrice = calculateOrderItemPrice(item);
                              const adjustedPrice = getAdjustedItemPrice(item, ratio);
                              const priceChange = adjustedPrice - originalPrice;
                              const priceChangePercent = originalPrice > 0 ? ((priceChange / originalPrice) * 100) : 0;

                              return (
                                <div
                                  key={item.id}
                                  className="p-2 border border-gray-100 rounded-lg bg-gradient-to-r from-gray-50 to-transparent text-sm"
                                >
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="flex-1 truncate">{item.item?.name || t('split.byAmount.itemFallback')}</span>
                                    <span className="text-gray-400 text-xs line-through ml-2">
                                      {formatNumber(originalPrice)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-500">
                                      {priceChangePercent !== 0 && (
                                        <span className={priceChangePercent > 0 ? 'text-green-600' : 'text-orange-600'}>
                                          {priceChangePercent > 0 ? '+' : ''}{priceChangePercent.toFixed(1)}%
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-sm font-bold text-green-600">
                                      {formatNumber(adjustedPrice)}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                        {split.amount > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium text-gray-700">{t('split.byAmount.subtotal')}</span>
                              <span className="text-sm font-bold text-green-600">
                                {formatNumber(splitTotals[index])}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div
            className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                icon={faPlus}
                onClick={addSplit}
                size="lg"
                className="shadow-lg"
              >
                {t('split.byAmount.addSplit')}
              </Button>
              {remainingAmount > 0 && (
                <Button
                  variant="primary"
                  onClick={autoFillRemaining}
                  size="lg"
                  className="shadow-lg"
                  flat
                >
                  {t('split.byAmount.autoFillRemaining')}
                </Button>
              )}
              {assignedTotal === 0 && (
                <Button
                  variant="primary"
                  onClick={distributeEvenly}
                  size="lg"
                  className="shadow-lg"
                  flat
                >
                  {t('split.byAmount.distributeEvenly')}
                </Button>
              )}
            </div>

            <div className="flex-1 flex items-center justify-end gap-4">
              {!isValid && (
                <div className="text-sm text-red-600">
                  {assignedTotal < orderTotal
                    ? t('split.byAmount.assignRemaining', {amount: withCurrency(remainingAmount)})
                    : t('split.byAmount.exceedsTotal', {amount: withCurrency(assignedTotal - orderTotal)})
                  }
                </div>
              )}
              <Button
                variant="success"
                icon={faCheck}
                onClick={handleSaveSplits}
                disabled={!canSave || isSaving}
                isLoading={isSaving}
                size="lg"
                className="shadow-lg hover:shadow-green-200 transition-all duration-300"
                filled
              >
                {isSaving ? t('split.byAmount.creating') : t('split.byAmount.save', {count: splits.length})}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
