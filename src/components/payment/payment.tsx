import {assertOrderTakingAllowed} from "@/lib/closing.guard.ts";
import {toast} from "sonner";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {nowSurrealDateTime} from "@/lib/datetime.ts";
import {useTranslation} from "react-i18next";
import {DateTime} from "luxon";
import {
  publishCustomerCreated,
  publishOrderCreated,
} from "@/integrations/events/index.ts";
import { entityAfterWrite } from "@/integrations/events/publish/entity.ts";
import { posStore } from "@/infrastructure/pos-store/pos-store.ts";
import { kitchenStagesFromDish } from "@/infrastructure/pos-store/kitchen-from-dish.ts";
import type { CreateOrderItemInput } from "@/infrastructure/pos-store/types.ts";
import { PosStoreError } from "@/infrastructure/pos-store/types.ts";
import { terminalSyncService } from "@/infrastructure/sync/sync-service.ts";
import { useDatabase } from "@/hooks/useDatabase.ts";
import {buildOrderItemPayload} from "@/lib/order-item-pricing.ts";
import {dispatchPrint} from "@/lib/print.service.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {MenuItemType} from "@/api/model/cart_item.ts";
import {OrderPayment} from "@/components/orders/order.payment.tsx";
import {OrderTotals, CartTotals} from "@/components/orders/order.totals.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order, OrderStatus} from "@/api/model/order.ts";
import {fetchOrderFull} from "@/lib/order-fetch.ts";
import {calculateCartItemPrice} from "@/lib/cart.ts";
import {useAtom} from "jotai";
import {appPage, appSettings, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {faCancel, faCheck, faCreditCard, faTimes} from "@fortawesome/free-solid-svg-icons";
import React, {useEffect, useMemo, useRef, useState} from "react";

export const Payment = () => {
  const {t} = useTranslation(["payment", "toast"]);
  const db = useDB();
  const { isEffectivelyConnected } = useDatabase();
  const [state, setState] = useAtom(appState);
  const [page] = useAtom(appPage);
  const [settings] = useAtom(appSettings);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const orderTakingBlocked = enforcement.orderTakingBlocked;

  const [isLoading, setLoading] = useState(false);
  /** Sync re-entry guard: React isLoading alone cannot stop double-click before re-render. */
  const createInFlightRef = useRef(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [order, setOrder] = useState<Order>();
  const [paymentOrder, setPaymentOrder] = useState<Order>();

  const total = useMemo(() => {
    return state.cart.reduce((prev, item) => {
      if (!item.deleted_at) {
        return prev + calculateCartItemPrice(item);
      }

      return prev;
    }, 0);
  }, [state.cart]);

  const cartItemCount = useMemo(() => {
    return state.cart.filter(item => !item.deleted_at).length;
  }, [state.cart]);

  // PosStore hydrate first; Surreal FETCH only for orders Dexie has never seen.
  const fetchOrderForPayment = async (orderId: unknown): Promise<Order | undefined> => {
    return fetchOrderFull(db, orderId);
  };

  useEffect(() => {
    if (paymentOpen) {
      return;
    }

    let cancelled = false;

    (async () => {
      if (state?.order?.id !== 'new') {
        const freshOrder = await fetchOrderForPayment(state?.order?.id);
        if (!cancelled) {
          setOrder(freshOrder);
        }
      } else {
        setOrder(undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state?.order?.id, paymentOpen]);

  const hasNewCartItems = () =>
    state.cart.some((item) => item.newOrOld === MenuItemType.new);

  const orderTypeRefId = (value: unknown): string | null => {
    if (value == null) return null;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return null;
      return raw.includes(':') ? raw : `order_type:${raw}`;
    }
    if (typeof value === 'object' && 'id' in (value as object)) {
      const id = (value as { id?: unknown }).id;
      return id == null ? null : String(id);
    }
    return null;
  };

  /** True when cashier changed order type on an existing check (no new lines required). */
  const hasOrderTypeChange = () => {
    if (state?.order?.id === 'new') return false;
    const selected = orderTypeRefId(state?.orderType);
    if (!selected) return false;
    const current = orderTypeRefId(state?.order?.order?.order_type);
    return selected !== current;
  };

  const isPersistedCartItem = (item: { id?: unknown; newOrOld?: MenuItemType }) =>
    item.newOrOld === MenuItemType.old || item.id?.toString().includes('order_item:');

  /** Cart/menu taxes may be Tax objects, string ids, or FETCH stubs — never assume `.id`. */
  const taxRecordId = (tax: unknown): string | null => {
    if (tax == null) return null;
    if (typeof tax === 'string') {
      const raw = tax.trim();
      if (!raw) return null;
      return raw.includes(':') ? raw : `tax:${raw}`;
    }
    if (typeof tax === 'object' && 'id' in tax) {
      const id = (tax as { id?: unknown }).id;
      if (id == null) return null;
      return String(id);
    }
    return null;
  };

  const createOrder = async () => {
    const isNewOrder = state?.order?.id === 'new';
    const hasNewItems = hasNewCartItems();
    const orderTypeChanged = hasOrderTypeChange();

    // Existing order with only old lines and no meta changes: nothing to persist.
    if (!isNewOrder && !hasNewItems && !orderTypeChanged) {
      return state?.order?.order ?? { id: state?.order?.id };
    }

    // Hard re-entry guard (sync) before any await / setState.
    // Callers must not treat this as success (e.g. do not reset cart).
    if (createInFlightRef.current) {
      return 'busy' as const;
    }
    createInFlightRef.current = true;
    setLoading(true);

    let orderObj: any;

    try {
      // Closing gate comes from local enforcement atom; optional remote assert when online.
      if (isEffectivelyConnected) {
        await assertOrderTakingAllowed(db).catch(() => undefined);
      }

      const date = DateTime.now().toJSDate();
      const kitchenItems: Record<string, any[]> = {};

      const toCreateItems = (): CreateOrderItemInput[] => {
        const lines: CreateOrderItemInput[] = [];
        for (const item of state.cart) {
          if (isPersistedCartItem(item)) continue;
          const pricing = buildOrderItemPayload(item);
          lines.push({
            dishId: item.dish.id.toString(),
            price: pricing.price,
            originalPrice: pricing.original_price,
            quantity: item.quantity,
            comments: item.comments,
            modifiers: pricing.modifiers,
            tax: pricing.tax,
            taxes: (pricing.taxes ?? [])
              .map((tax) => taxRecordId(tax))
              .filter((id): id is string => !!id),
            taxMode: pricing.tax_mode,
            seat: item.seat,
            isHold: item.isHold,
            isAddition: !isNewOrder,
            level: item.level,
            category: item.category,
            categoryId: item.category_id ? String(item.category_id) : null,
            menuName: item.menu_name,
            createdBy: page?.user?.id ? String(page.user.id) : null,
            kitchenStages: item.isHold ? [] : kitchenStagesFromDish(item.dish, settings.kitchens),
          });
        }
        return lines;
      };

      const newLines = toCreateItems();

      // Group kitchen print payload from stages embedded on dishes.
      for (const item of state.cart) {
        if (isPersistedCartItem(item) || item.isHold) continue;
        for (const stage of kitchenStagesFromDish(item.dish, settings.kitchens) ?? []) {
          if (stage.status !== 'pending') continue;
          const list = kitchenItems[stage.kitchenId] ?? [];
          list.push({ ...item, item: item.dish });
          kitchenItems[stage.kitchenId] = list;
        }
      }

      let customerId: string | null = state?.customer?.id
        ? String(state.customer.id)
        : null;

      if (state?.customer && state.customer.id === undefined) {
        // Dexie first; CREATE_RECORD customer drains through the outbox.
        const cus = await posStore.createCustomer({ ...state.customer });
        customerId = String(cus.id);
        setState(prev => ({ ...prev, customer: { ...prev.customer, id: cus.id } as any }));
        // Integrations are side effects — never block the order on them.
        void publishCustomerCreated(undefined, {
          customerId,
          name: state.customer.name,
          phone: state.customer.phone != null ? String(state.customer.phone) : undefined,
          email: state.customer.email != null ? String(state.customer.email) : undefined,
        }).catch(() => undefined);
        void entityAfterWrite({
          domain: 'pos',
          table: Tables.customers,
          entityId: customerId,
          action: 'create',
          after: state.customer,
          source: 'payment',
        }).catch(() => undefined);
      }

      let invoiceNumber: number = Number(state?.order?.order?.invoice_number ?? 1);
      let autoId: number | undefined;
      if (isNewOrder) {
        // Int-only reserved ranges — no provisional strings (Surreal `int` fields).
        invoiceNumber = await posStore.consumeInvoiceNumber();
        autoId = await posStore.consumeAutoId().catch(() => undefined);
      }

      let serviceCharge = 0;
      let serviceChargeAmount = 0;
      let serviceChargeType: string = DiscountType.Percent;
      if (isNewOrder && state?.orderType?.allow_service_charges) {
        // Prefer already-loaded settings; avoid remote mid-write.
        serviceChargeType = DiscountType.Percent;
        serviceCharge = 0;
        serviceChargeAmount = 0;
      }

      if (isNewOrder) {
        const created = await posStore.createOrderWithItems({
          invoiceNumber,
          autoId,
          covers: parseInt(state?.persons) || 1,
          floorId: state?.floor?.id ? String(state.floor.id) : null,
          tableId: state?.table?.id ? String(state.table.id) : null,
          orderTypeId: state?.orderType?.id ? String(state.orderType.id) : null,
          customerId,
          userId: page?.user?.id ? String(page.user.id) : null,
          serviceCharge,
          serviceChargeAmount,
          serviceChargeType,
          items: newLines,
          createdAt: date.toISOString(),
        });
        orderObj = [created.order];
      } else {
        const orderId = String(state?.order?.id);
        const seed = {
          order: state?.order?.order ?? { id: orderId },
          items: state?.order?.order?.items,
        };
        const orderTypeId = state?.orderType?.id ? String(state.orderType.id) : null;
        const metaPatch: Record<string, any> = {};
        if (orderTypeId) {
          metaPatch.order_type = orderTypeId;
        }
        const existingCustomerId = state?.order?.order?.customer
          ? String((state.order.order.customer as any)?.id ?? state.order.order.customer)
          : null;
        if (customerId && customerId !== existingCustomerId) {
          metaPatch.customer = customerId;
        }

        if (newLines.length) {
          const updated = await posStore.addItemsToOrder(orderId, newLines, { seed });
          orderObj = Object.keys(metaPatch).length
            ? await posStore.mergeOrder(orderId, metaPatch, { seed })
            : updated.order;
        } else {
          orderObj = await posStore.mergeOrder(orderId, {
            ...metaPatch,
            updated_at: date.toISOString(),
          }, { seed });
        }

      }

      const normalizedOrder = isNewOrder ? orderObj[0] : orderObj;
      const itemsCount = (state.cart?.length ?? 0);

      // Local-first tax rows (order_taxes + tax_amount) — works offline, drains via outbox.
      if (normalizedOrder?.id) {
        await posStore.recomputeOrderTaxes(String(normalizedOrder.id)).catch(() => undefined);
      }

      // Drain outbox in the background — never hold the cashier on gateway RTT.
      void terminalSyncService.synchronize().catch(() => undefined);
      postOrderTracking({
        module: isNewOrder ? t("payment:tracking.createOrder") : t("payment:tracking.appendOrder"),
        page: page?.page,
        orderId: normalizedOrder?.id,
        payload: {
          table: state?.table?.id?.toString(),
          items_count: itemsCount,
          is_new_order: isNewOrder,
        },
        user: page?.user,
      });

      if (isNewOrder && normalizedOrder?.id) {
        void publishOrderCreated(undefined, {
          orderId: String(normalizedOrder.id),
          invoiceNumber: normalizedOrder.invoice_number,
          orderTypeId: state?.orderType?.id ? String(state.orderType.id) : undefined,
          tableId: state?.table?.id ? String(state.table.id) : undefined,
          customerId: customerId ?? undefined,
          itemCount: itemsCount,
          createdBy: page?.user?.id ? String(page.user.id) : undefined,
        }).catch(() => undefined);
        void entityAfterWrite({
          domain: 'pos',
          table: Tables.orders,
          entityId: String(normalizedOrder.id),
          action: 'create',
          after: {
            invoice_number: normalizedOrder.invoice_number,
            status: OrderStatus["In Progress"],
          },
          source: 'payment',
          changedBy: page?.user?.id ? String(page.user.id) : undefined,
        }).catch(() => undefined);
      }

      const hasKitchenPrintItems = Object.keys(kitchenItems).length > 0;
      if (hasKitchenPrintItems && isEffectivelyConnected) {
        // Printers lookup is a side effect — do not block return-to-floor.
        void db.query(`SELECT *
                                                from ${Tables.kitchens}
                                                where deleted_at = none FETCH printers`).then(([kitchens]: any) => {
          if (!kitchens?.length) return;
          for (const k of kitchens) {
            if (kitchenItems[k.id.toString()]) {
              void dispatchPrint(db, 'kitchen', {
                items: kitchenItems[k.id.toString()],
                order: {
                  ...normalizedOrder,
                  order_type: state?.orderType ?? normalizedOrder.order_type,
                  user: page?.user ?? normalizedOrder.user,
                },
                kitchenName: k.name,
                table: state?.table,
                isAddOn: !isNewOrder,
              }, {
                title: t("payment:print.kitchenTitle"),
                copies: 1,
                userId: page?.user?.id,
                printers: k.printers
              }).catch((error) => {
                console.error('Kitchen print dispatch failed', error);
              });
            }
          }
        }).catch(() => undefined);
      }

      return orderObj;
    } catch (e) {
      if (e instanceof PosStoreError && e.code === 'NOT_OWNER') {
        toast.error(t('payment:errors.notOwner', {
          defaultValue: 'This order is open on another terminal',
        }));
      }
      if (e instanceof PosStoreError && e.code === 'NUMBERS_EXHAUSTED') {
        toast.error(t('payment:errors.numbersExhausted', {
          defaultValue: 'No invoice numbers left offline — reconnect to continue creating orders',
        }));
      }
      throw e;
    } finally {
      createInFlightRef.current = false;
      setLoading(false);
    }
  }

  const createOrderAndBack = async () => {
    try {
      if (hasNewCartItems() || hasOrderTypeChange()) {
        const result = await createOrder();
        if (result === 'busy') {
          return;
        }
      }
      // Floor UI first — release/unlock run in the background inside reset.
      await reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("payment:errors.createOrder");
      setLoading(false);
      console.error(error);
      toast.error(message);
    }
  }

  const reset = async () => {
    // Clear table first so the menu heartbeat interval stops before unlock.
    const tableId = state?.table?.id ? String(state.table.id) : undefined;
    const orderId =
      state?.order?.id && state.order.id !== 'new' ? String(state.order.id) : undefined;

    // clear cart and go back to floor screen
    setState(prev => ({
      ...prev,
      cart: [],
      customer: undefined,
      showFloor: true,
      table: undefined,
      persons: '1',
      orderType: undefined,
      order: {
        id: 'new',
        order: undefined
      }
    }));

    if (orderId) {
      void posStore.releaseOrder(orderId).catch(() => undefined);
    }
    if (tableId) {
      void posStore.unlockTable(tableId).catch(() => undefined);
    }
  }

  const openPayment = async () => {
    try {
      const isExistingOrderOnly =
        state?.order?.id !== 'new' && !hasNewCartItems() && !hasOrderTypeChange();

      let orderId: unknown = state?.order?.id;
      if (!isExistingOrderOnly) {
        const result = await createOrder();
        if (!result || result === 'busy') {
          return;
        }
        orderId = result?.id;
        if (result[0]?.id) {
          orderId = result[0].id;
        }
      }

      const freshOrder = await fetchOrderForPayment(orderId);
      if (!freshOrder?.items?.length) {
        throw new Error(t("payment:errors.openPayment"));
      }

      setPaymentOrder(freshOrder);
      setOrder(freshOrder);
      setPaymentOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("payment:errors.openPayment");
      console.error(error);
      toast.error(message);
    }
  }

  const cancel = async () => {
    setState(prev => ({
      ...prev,
      seats: [],
      cart: prev.cart.filter(item => item.newOrOld === MenuItemType.old),
      seat: undefined
    }));

    await reset();
  }

  return (
    <>
      <div className="font-bold">
        {order && (
          <>
            <div className="p-3">
              <OrderTotals order={order} cart={state.cart} />
            </div>
            <div className="h-[2px] separator"></div>
          </>
        )}
        {!order && (
          <div className="p-3">
            <CartTotals itemCount={cartItemCount} cart={state.cart} />
          </div>
        )}


        <div className="p-3" data-testid="cart-payment-actions">
          <div className="flex gap-3 mt-3">
            <Button variant="success" className="flex-1" size="lg" icon={faCheck} onClick={createOrderAndBack}
                    disabled={isLoading || state.cart.length === 0 || orderTakingBlocked} isLoading={isLoading}
                    data-testid="cart-to-kitchen">{t("payment:actions.toKitchen")}</Button>
            <Button variant="warning" filled className="flex-1" size="lg" icon={faCreditCard} onClick={openPayment}
                    disabled={isLoading || state.cart.length === 0 || orderTakingBlocked} isLoading={isLoading}
                    data-testid="cart-pay-now">{t("payment:actions.payNow")}</Button>
            <Button variant="danger" className="flex-1" size="lg" icon={faCancel} onClick={cancel}
                    disabled={isLoading} data-testid="cart-cancel">{t("payment:actions.cancel")}</Button>
          </div>
        </div>
      </div>
      {paymentOpen && paymentOrder && (
        <OrderPayment
          order={paymentOrder}
          onClose={async () => {
            setPaymentOpen(false);
            setPaymentOrder(undefined);
            await reset();
          }}
        />
      )}
    </>
  )
}
