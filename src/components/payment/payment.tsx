import {Button} from "@/components/common/input/button.tsx";
import {faCancel, faCheck, faCreditCard, faTimes} from "@fortawesome/free-solid-svg-icons";
import React, {useEffect, useMemo, useRef, useState} from "react";
import {useAtom} from "jotai";
import {appPage, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {calculateCartItemPrice} from "@/lib/cart.ts";
import {buildOrderItemPayload} from "@/lib/order-item-pricing.ts";
import {syncOrderTaxes} from "@/lib/order-tax.service.ts";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  Order,
  ORDER_FETCHES,
  ORDER_PAYMENT_FETCHES,
  OrderStatus,
  parseOrderQueryResult,
} from "@/api/model/order.ts";
import {OrderPayment} from "@/components/orders/order.payment.tsx";
import {OrderTotals, CartTotals} from "@/components/orders/order.totals.tsx";
import {toRecordId} from "@/lib/utils.ts";
import {StringRecordId} from "surrealdb";
import {MenuItemType} from "@/api/model/cart_item.ts";
import {dispatchPrint} from "@/lib/print.service.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {assertOrderTakingAllowed} from "@/lib/closing.guard.ts";
import {toast} from "sonner";
import {generateNextInvoiceNumber, getNextAutoId} from "@/lib/invoice.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {createStageRows} from "@/lib/kitchen/workflow.service.ts";
import {nowSurrealDateTime} from "@/lib/datetime.ts";
import {useTranslation} from "react-i18next";
import {DateTime} from "luxon";
import {
  publishCustomerCreated,
  publishOrderCreated,
} from "@/integrations/events/index.ts";
import { entityAfterWrite } from "@/integrations/events/publish/entity.ts";

export const Payment = () => {
  const {t} = useTranslation(["payment", "toast"]);
  const db = useDB();
  const [state, setState] = useAtom(appState);
  const [page] = useAtom(appPage);
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

  const fetchOrderForPayment = async (orderId: unknown): Promise<Order | undefined> => {
    const id = toRecordId(orderId);
    const runQuery = async (fetches: string[]) => {
      const onlyResult = await db.query(
        `SELECT * FROM ONLY ${id} FETCH ${fetches.join(", ")}`
      );
      const parsed = parseOrderQueryResult(onlyResult);
      if (parsed?.items) {
        return parsed;
      }

      const legacyResult = await db.query(
        `SELECT * FROM ${id} FETCH ${fetches.join(", ")}`
      );
      return parseOrderQueryResult(legacyResult);
    };

    try {
      const full = await runQuery(ORDER_FETCHES);
      if (full) {
        return full;
      }
    } catch (error) {
      console.warn('Full order fetch failed, retrying with payment fetches', error);
    }

    return runQuery(ORDER_PAYMENT_FETCHES);
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

  const isPersistedCartItem = (item: { id?: unknown; newOrOld?: MenuItemType }) =>
    item.newOrOld === MenuItemType.old || item.id?.toString().includes('order_item:');

  const createOrder = async () => {
    const isNewOrder = state?.order?.id === 'new';
    const hasNewItems = hasNewCartItems();

    // Existing order with only old lines: nothing to persist.
    if (!isNewOrder && !hasNewItems) {
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
      await assertOrderTakingAllowed(db);

      const date = DateTime.now().toJSDate();

      const kitchenItems: Record<string, any[]> = {};
      const items: any[] = [];
      const newItemIds: any[] = [];

      for (const item of state.cart) {
        if (isPersistedCartItem(item)) {
          items.push(toRecordId(item.id));
          continue;
        }

        const pricing = buildOrderItemPayload(item);
        const itemData: any = {
          tax: pricing.tax,
          item: new StringRecordId(item.dish.id.toString()),
          price: pricing.price,
          quantity: item.quantity,
          position: 0,
          comments: item.comments,
          service_charges: 0,
          discount: 0,
          modifiers: pricing.modifiers,
          seat: item.seat,
          is_suspended: item.isHold,
          level: item.level,
          category: item.category,
          category_id: item.category_id ? toRecordId(item.category_id) : null,
          is_addition: !isNewOrder,
          menu: item.menu_name,
          tax_mode: pricing.tax_mode,
          created_at: date,
          created_by: toRecordId(page?.user?.id),
        };

        if (pricing.original_price !== undefined) {
          itemData.original_price = pricing.original_price;
        }

        if (pricing.taxes && pricing.taxes.length > 0) {
          itemData.taxes = pricing.taxes.map(t => toRecordId(t.id));
        }

        const record = await db.create(Tables.order_items, itemData);
        items.push(record[0].id);
        newItemIds.push(record[0].id);

        // Held items stay off kitchen until Fire; route everything else now.
        if (!item.isHold) {
          await createStageRows(db, {
            orderItem: record[0],
            dish: item.dish,
            kitchenItems,
          });
        }
      }

      let customer = null;
      if (state?.customer && state.customer.id) {
        customer = toRecordId(state.customer.id);
      }

      if (state?.customer && state.customer.id === undefined) {
        // create customer and get id
        const [cus] = await db.insert(Tables.customers, {
          ...state.customer
        });

        customer = cus.id
        await publishCustomerCreated(undefined, {
          customerId: String(cus.id),
          name: state.customer.name,
          phone: state.customer.phone != null ? String(state.customer.phone) : undefined,
          email: state.customer.email != null ? String(state.customer.email) : undefined,
        });
        await entityAfterWrite({
          domain: 'pos',
          table: Tables.customers,
          entityId: String(cus.id),
          action: 'create',
          after: state.customer,
          source: 'payment',
        });
      }

      // Allocate numbers immediately before insert so the race window stays minimal.
      let invoiceNumber = state?.order?.order?.invoice_number ?? 1;
      if (isNewOrder) {
        invoiceNumber = await generateNextInvoiceNumber(db);
      }

      const data: any = {
        floor: toRecordId(state?.floor?.id),
        covers: parseInt(state?.persons),
        tax: null,
        tax_amount: 0,
        tags: ['Normal'],
        discount: null,
        discount_amount: 0,
        customer: customer,
        order_type: toRecordId(state?.orderType?.id),
        status: OrderStatus["In Progress"],
        invoice_number: invoiceNumber,
        items: items,
        table: toRecordId(state?.table?.id),
        user: toRecordId(page?.user?.id),
        service_charge: 0,
        service_charge_amount: 0,
        service_charge_type: DiscountType.Percent,
      };

      if (isNewOrder && state?.orderType?.allow_service_charges) {
        const [serviceChargeSettingResult] = await db.query(
          `SELECT *
           FROM ${Tables.settings}
           WHERE key = $key AND is_global = true LIMIT 1 FETCH
           values`,
          {key: "service_charges"}
        );
        const serviceChargeSetting = serviceChargeSettingResult.length > 0 ? serviceChargeSettingResult?.[0]?.values : null;
        const defaultTypeRaw = serviceChargeSetting?.type?.value ?? serviceChargeSetting?.type;
        const defaultValueRaw = serviceChargeSetting?.value?.value ?? serviceChargeSetting?.value;
        const normalizedType = String(defaultTypeRaw || DiscountType.Percent);
        const normalizedValue = Number(defaultValueRaw || 0);

        data.service_charge = normalizedValue;
        data.service_charge_type = normalizedType;
        data.service_charge_amount = normalizedType === DiscountType.Fixed ? normalizedValue : (total * normalizedValue / 100);
      }

      if (isNewOrder) {
        data.auto_id = await getNextAutoId(db);
        data.created_at = date;
        orderObj = await db.create(Tables.orders, data);

        for (const item of newItemIds) {
          await db.merge(item, {
            order: orderObj[0].id
          });
        }
      } else {
        data.updated_at = date;

        orderObj = await db.merge(toRecordId(state?.order?.id), data);

        for (const item of newItemIds) {
          await db.merge(item, {
            order: orderObj.id
          });
        }
      }

      const normalizedOrder = isNewOrder ? orderObj[0] : orderObj;
      await syncOrderTaxes(db, toRecordId(normalizedOrder?.id));

      postOrderTracking({
        module: isNewOrder ? t("payment:tracking.createOrder") : t("payment:tracking.appendOrder"),
        page: page?.page,
        orderId: normalizedOrder?.id,
        payload: {
          table: state?.table?.id?.toString(),
          items_count: items.length,
          is_new_order: isNewOrder,
        },
        user: page?.user,
      });

      if (isNewOrder && normalizedOrder?.id) {
        await publishOrderCreated(undefined, {
          orderId: String(normalizedOrder.id),
          invoiceNumber: normalizedOrder.invoice_number,
          orderTypeId: state?.orderType?.id ? String(state.orderType.id) : undefined,
          tableId: state?.table?.id ? String(state.table.id) : undefined,
          customerId: customer ? String(customer) : undefined,
          itemCount: items.length,
          createdBy: page?.user?.id ? String(page.user.id) : undefined,
        });
        await entityAfterWrite({
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
        });
      }

      const hasKitchenPrintItems = Object.keys(kitchenItems).length > 0;
      if (hasKitchenPrintItems) {
        const [kitchens]: any = await db.query(`SELECT *
                                                from ${Tables.kitchens}
                                                where deleted_at = none FETCH printers`);
        if (kitchens.length > 0) {
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
        }
      }

      return orderObj;
    } catch (e) {
      throw e;
    } finally {
      createInFlightRef.current = false;
      setLoading(false);
    }
  }

  const createOrderAndBack = async () => {
    try {
      if (hasNewCartItems()) {
        const result = await createOrder();
        if (result === 'busy') {
          return;
        }
      }
      await reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : t("payment:errors.createOrder");
      setLoading(false);
      console.error(error);
      toast.error(message);
    }
  }

  const reset = async () => {
    if (state?.table?.id) {
      await db.merge(state.table.id, {
        is_locked: false,
        locked_by: null,
        locked_at: null
      });
    }

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
  }

  const openPayment = async () => {
    try {
      const isExistingOrderOnly =
        state?.order?.id !== 'new' && !hasNewCartItems();

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


        <div className="p-3">
          <div className="flex gap-3 mt-3">
            <Button variant="success" className="flex-1" size="lg" icon={faCheck} onClick={createOrderAndBack}
                    disabled={isLoading || state.cart.length === 0 || orderTakingBlocked} isLoading={isLoading}>{t("payment:actions.toKitchen")}</Button>
            <Button variant="warning" filled className="flex-1" size="lg" icon={faCreditCard} onClick={openPayment}
                    disabled={isLoading || state.cart.length === 0 || orderTakingBlocked} isLoading={isLoading}>{t("payment:actions.payNow")}</Button>
            <Button variant="danger" className="flex-1" size="lg" icon={faCancel} onClick={cancel}
                    disabled={isLoading}>{t("payment:actions.cancel")}</Button>
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
