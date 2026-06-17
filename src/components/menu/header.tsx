import {useAtom} from "jotai";
import {appSettings, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {faArrowLeft, faPlus, faTable, faTimes, faUser, faUsers} from "@fortawesome/free-solid-svg-icons";
import {cn, toRecordId} from "@/lib/utils.ts";
import React, {useEffect, useState} from "react";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {MenuItemType} from "@/api/model/cart_item.ts";
import {Payment} from "@/components/payment/payment.tsx";
import {Customers} from "@/components/customer/customer.tsx";
import {getInvoiceNumber} from "@/lib/order.ts";
import ScrollContainer from "react-indiana-drag-scroll";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import {toast} from "sonner";
import {useTranslation} from "react-i18next";
import i18n from "@/lib/i18n.ts";

export const MenuHeader = () => {
  const db = useDB();
  const { t } = useTranslation('menu');

  const [state, setState] = useAtom(appState);
  const [setting] = useAtom(appSettings);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const orderTakingBlocked = enforcement.orderTakingBlocked;
  const hideTableSelection = state.hideTableSelection === true;
  const [customerModal, setCustomerModal] = useState(false);
  const [confirmCartAction, setConfirmCartAction] = useState(false);

  useEffect(() => {
    if (!state.orderType) {
      setState(prev => ({
        ...prev,
        orderType: setting?.order_types[0]
      }))
    }
  }, [setting?.order_types, state.orderType]);

  useEffect(() => {
    // load old items into cart
    if (state?.order?.id !== 'new' && state.orders.length > 0) {
      onOrderClick(state?.order?.id);
    }
  }, [state.orders, state?.order?.id]);

  useEffect(() => {
    if (!state.table?.id) {
      return;
    }

    const heartBeat = async () => {
      await db.merge(toRecordId(state.table.id), {
        locked_at: nowSurrealDateTime()
      })
    }

    const timer = setInterval(heartBeat, 10000);

    return () => clearInterval(timer);
  }, [state.table?.id])

  const reset = async () => {
    // check if cart has any new items

    if (state.cart.filter(item => item.newOrOld === MenuItemType.new).length > 0) {
      setConfirmCartAction(true);
      return false;
    }

    if (state.table?.id) {
      await db.merge(state.table.id, {
        is_locked: false,
        locked_at: null,
        locked_by: null
      });
    }

    setState(prev => ({
      ...prev,
      orderType: undefined,
      showFloor: true,
      persons: '1',
      cart: [],
      order: undefined,
      orders: [],
      customer: undefined,
      table: undefined
    }));
  }

  const onOrderClick = (key: string) => {
    if (key === 'new') {
      if (orderTakingBlocked) {
        toast.warning(enforcement.message ?? i18n.t('closing:orderTakingDisabled'));
        return;
      }

      setState(prev => ({
        ...prev,
        order: {
          id: 'new',
          order: undefined
        },
        cart: []
      }))
    } else {
      const order = state.orders.find(item => item.id === key);
      const seats = new Map();
      order?.items.forEach(item => {
        if (item.seat) {
          seats.set(item.seat, item.seat);
        }
      });

      const seatsArray = Array.from(seats.values());

      const noSeat = state.cart.some(item => item.seat === undefined);

      setState(prev => ({
        ...prev,
        order: {
          order,
          id: order?.id ?? MenuItemType.new,
        },
        cart: order?.items?.map(item => ({
          dish: item.item,
          level: item.level,
          quantity: item.quantity,
          seat: item.seat,
          id: item.id,
          selectedGroups: item.modifiers || [] as any,
          newOrOld: MenuItemType.old,
          price: item.price,
          updated_at: item.updated_at,
          deleted_at: item.deleted_at,
          category: item.category,
          comments: item.comments,
        })) ?? [],
        seats: seatsArray,
        seat: noSeat ? undefined : (seatsArray.length > 0 ? seatsArray[0] : undefined)
      }));
    }
  }

  const switchTable = async () => {
    setState(prev => ({
      ...prev,
      showFloor: true,
      switchTable: true
    }));

    // release table
    await db.merge(state.table.id, {
      is_locked: false,
      locked_at: null,
      locked_by: null
    });
  }

  const openPersons = async () => {
    setState(prev => ({
      ...prev,
      showPersons: true,
    }));
  }

  const newCartItems = state?.cart?.filter(item => item.newOrOld === MenuItemType.new).length;

  const clear = async () => {
    setState(prev => ({
      ...prev,
      seats: [],
      cart: prev.cart.filter(item => item.newOrOld === MenuItemType.old),
      seat: undefined
    }));
  }

  return (
    <>
      <div className="flex justify-between items-center w-full">
        <div className="flex items-center gap-2">
          {!hideTableSelection && (
            <Button variant="primary" icon={faArrowLeft} onClick={reset} size="lg">{state?.floor?.name}</Button>
          )}
          {state?.orders?.length > 0 ? (
            <>
              <ScrollContainer className="max-w-[380px] flex flex-nowrap gap-3">
                <div className="input-group">
                  {state?.orders?.map((order, index) => (
                    <Button
                      key={index}
                      variant="primary"
                      onClick={() => onOrderClick(order.id)}
                      flat
                      size="lg"
                      active={state?.order?.id?.toString() === order?.id.toString()}
                    >
                      {t('header.orderNumber', { number: getInvoiceNumber(order) })}
                    </Button>
                  ))}
                </div>
              </ScrollContainer>
              <Button
                active={state?.order?.id === MenuItemType.new}
                variant="primary"
                flat
                size="lg"
                disabled={orderTakingBlocked}
                onClick={() => onOrderClick('new')}
                icon={faPlus}
              >{t('header.newOrder')}</Button>
            </>
          ) : null}

          {!hideTableSelection && (
            <Button
              type="button"
              className="btn btn-primary lg btn-flat min-w-[50px]"
              onClick={switchTable}
              icon={faTable}
            >{state?.table?.name}{state?.table?.number}</Button>
          )}
          <Button type="button"
                  className="btn btn-primary lg btn-flat"
                  onClick={openPersons}
                  icon={faUsers}
          >
            {t('header.pax', { count: Number(state?.persons) || 0 })}
          </Button>

          <div className="input-group">
            <Button flat variant="primary" size="lg" icon={faUser} onClick={() => setCustomerModal(true)}>
              {state?.customer ? state.customer?.name : t('header.customer')}
            </Button>
          </div>
          {state.cart.filter(item => item.newOrOld === MenuItemType.new).length > 0 && (
            <Button variant="danger" className="flex-1" size="lg" icon={faTimes} onClick={clear}
            >{t('header.clear')}</Button>
          )}
        </div>

        <div className="flex input-group rounded-full">
          {setting?.order_types?.map((item, index) => (
            <Button
              variant="primary"
              size="lg"
              className={cn(
                "flex-1",
                index === 0 && '!rounded-l-lg',
                index === setting?.order_types?.length - 1 && ' !rounded-r-lg'
              )}
              active={item.id.toString() === state?.orderType?.id?.toString()}
              onClick={() => {
                setState(prev => ({
                  ...prev,
                  orderType: item
                }))
              }}
              key={index}
              flat
            >
              {item.name}
            </Button>
          ))}
        </div>
      </div>
      <Modal
        open={customerModal}
        onClose={() => {
          setCustomerModal(false)
        }}
        title={state?.customer?.name || t('header.selectCustomer')}
        size="md"
      >
        <Customers onAttach={() => {
          setCustomerModal(false)
        }}/>
      </Modal>

      {confirmCartAction && (
        <Modal
          open={confirmCartAction}
          onClose={() => {
            setConfirmCartAction(false)
          }}
          title={t('header.confirmTitle')}
          size="sm"
        >
          <div className="alert alert-danger">
            {t('header.confirmCartMessage', { count: newCartItems })}
          </div>
          <Payment/>
        </Modal>
      )}
    </>
  )
}
