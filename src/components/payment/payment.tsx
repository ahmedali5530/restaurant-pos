import {Button} from "@/components/common/input/button.tsx";
import {faCancel, faCheck, faCreditCard, faTimes} from "@fortawesome/free-solid-svg-icons";
import React, {useMemo, useState} from "react";
import {useAtom} from "jotai";
import {appPage, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {calculateCartItemPrice} from "@/lib/cart.ts";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order, ORDER_FETCHES, OrderStatus} from "@/api/model/order.ts";
import {OrderPayment} from "@/components/orders/order.payment.tsx";
import {toRecordId, withCurrency} from "@/lib/utils.ts";
import {StringRecordId} from "surrealdb";
import {MenuItemType} from "@/api/model/cart_item.ts";
import {dispatchPrint} from "@/lib/print.service.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {DateTime} from "luxon";
import {assertOrderTakingAllowed} from "@/lib/closing.guard.ts";
import {toast} from "sonner";
import {generateNextInvoiceNumber, getNextAutoId} from "@/lib/invoice.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {createStageRows} from "@/lib/kitchen/workflow.service.ts";
import {useTranslation} from "react-i18next";

export const Payment = () => {
  const {t} = useTranslation(["payment", "toast"]);
  const db = useDB();
  const [state, setState] = useAtom(appState);
  const [page] = useAtom(appPage);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const orderTakingBlocked = enforcement.orderTakingBlocked;

  const [isLoading, setLoading] = useState(false);

  const total = useMemo(() => {
    return state.cart.reduce((prev, item) => {
      if (!item.deleted_at) {
        return prev + calculateCartItemPrice(item);
      }

      return prev;
    }, 0);
  }, [state.cart]);

  const createOrder = async () => {
    await assertOrderTakingAllowed(db);

    setLoading(true);
    const date = DateTime.now().toJSDate();

    const isNewOrder = state?.order?.id === 'new';

    let invoiceNumber = 1;

    if (isNewOrder) {
      invoiceNumber = await generateNextInvoiceNumber(db);
    } else {
      invoiceNumber = state?.order?.order?.invoice_number;
    }

    const kitchenItems = {};

    // create items and store their ids
    const items = [];
    for (const item of state.cart) {
      const itemData: any = {
        tax: 0,
        item: new StringRecordId(item.dish.id.toString()),
        price: item.dish.price,
        quantity: item.quantity,
        position: 0,
        comments: item.comments,
        service_charges: 0,
        discount: 0,
        modifiers: item.selectedGroups,
        seat: item.seat,
        is_suspended: item.isHold,
        level: item.level,
        category: item.category,
        is_addition: false,
        menu: item.menu_name,
      };

      if (!isNewOrder && typeof item.id === 'string') {
        itemData.is_addition = true
      }

      if (item.id.toString().includes('order_item:')) {
        itemData.updated_at = date;

        await db.merge(item.id, itemData);
        items.push(new StringRecordId(item.id.toString()));
      } else {
        itemData.created_at = date;
        itemData.created_by = toRecordId(page?.user?.id);

        const record = await db.create(Tables.order_items, itemData);
        items.push(record[0].id);

        // Route the item through its production workflow (or legacy parallel kitchens).
        await createStageRows(db, {
          orderItem: record[0],
          dish: item.dish,
          fireDate: date,
          kitchenItems,
        });
      }
    }

    let customer = null;
    if(state?.customer && state.customer.id){
      customer = toRecordId(state.customer.id);
    }

    if(state?.customer && state.customer.id === undefined){
      // create customer and get id
      const [cus] = await db.insert(Tables.customers, {
        ...state.customer
      });

      customer = cus.id
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
    }

    let orderObj: any;

    try {
      if (isNewOrder) {
        data.created_at = date;
        orderObj = await db.create(Tables.orders, data);

        // add order back in items
        for (const item of items) {
          await db.merge(item, {
            order: orderObj[0].id
          });
        }
      } else {
        data.updated_at = date;

        orderObj = await db.merge(toRecordId(state?.order?.id), data);

        // add order back in items
        for (const item of items) {
          await db.merge(item, {
            order: orderObj.id
          });
        }
      }

      const normalizedOrder = isNewOrder ? orderObj[0] : orderObj;
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

      const [kitchens]: any = await db.query(`SELECT *
                                              from ${Tables.kitchens}
                                              where deleted_at = none FETCH printers`);
      if (kitchens.length > 0) {
        for (const k of kitchens) {
          if (kitchenItems[k.id.toString()]) {
            void dispatchPrint(db, 'kitchen', {
              items: kitchenItems[k.id.toString()],
              order: normalizedOrder,
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

    } catch (e) {
      throw e;
    } finally {
      setLoading(false);
    }

    return orderObj;
  }

  const createOrderAndBack = async () => {
    try {
      await createOrder();
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

  const [payment, setPayment] = useState(false);
  const [order, setOrder] = useState<Order>();
  const openPayment = async () => {
    try {
      const result = await createOrder();
      if (result) {
        let orderId = result?.id;
        if (result[0]?.id) {
          orderId = result[0].id;
        }

        const freshOrder = await db.query(
          `SELECT *
           FROM ${orderId} FETCH ${ORDER_FETCHES.join(", ")}`
        );
        setOrder(freshOrder[0][0]);
        setPayment(true);
      }
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
        <div className="p-3">
          <div className="flex justify-between items-center">
            <span>{t("payment:labels.subTotal", {count: state.cart.length})}</span>
            <span>{withCurrency(total)}</span>
          </div>
        </div>
        <div className="h-[2px] separator"></div>
        <div className="p-3">
          <div className="flex justify-between items-center text-success-500 text-3xl">
            <span>{t("payment:labels.total")}</span>
            <span>{withCurrency(total)}</span>
          </div>
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
      {payment && (
        <OrderPayment
          order={order}
          onClose={async () => {
            await reset();
            setPayment(false);
          }}
        />
      )}
    </>
  )
}
