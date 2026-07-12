import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCopy, faSquareCheck} from "@fortawesome/free-regular-svg-icons";
import {faPause, faPlay, faTrash} from "@fortawesome/free-solid-svg-icons";
import {Dropdown, DropdownItem} from "@/components/common/react-aria/dropdown.tsx";
import React, {useMemo, useState} from "react";
import {useAtom} from "jotai";
import {appPage, appState} from "@/store/jotai.ts";
import {nanoid} from "nanoid";
import {MenuItemType} from "@/api/model/cart_item.ts";
import {useTranslation} from "react-i18next";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toRecordId} from "@/lib/utils.ts";
import {createStageRows} from "@/lib/kitchen/workflow.service.ts";
import {dispatchPrint} from "@/lib/print.service.ts";

export const CartActions = () => {
  const db = useDB();
  const [state, setState] = useAtom(appState);
  const [page] = useAtom(appPage);
  const { t } = useTranslation(['cart', 'payment']);
  const [selected, setSelected] = useState(false);

  const hasNewItems = useMemo(() => {
    return state.cart.filter(item => item.newOrOld === MenuItemType.new && item.isSelected).length > 0
  }, [state.cart]);

  const hasHoldItems = useMemo(() => {
    return state.cart.some(item => item.isSelected && item.isHold)
  }, [state.cart]);

  const onClickSeatItem = (seat: string) => {
    if( seat === 'new' ) {
      seat = nanoid();
      setState(prev => ({
        ...prev,
        seats: [
          ...prev.seats,
          seat
        ],
        seat: seat
      }));
    }

    setState(prev => ({
      ...prev,
      cart: prev.cart.map(cartItem => {
        if( cartItem.isSelected ) {
          cartItem.seat = seat;
          cartItem.isSelected = false;
        }

        return cartItem;
      })
    }))
  }

  const deleteSelectedCartItems = () => {
    setState(prev => ({
      ...prev,
      cart: prev.cart.filter(item => {
        if(item.newOrOld === 'new' && item.isSelected){
          return false;
        }

        return true;
      })
    }))
  }

  const copySelectedCartItems = () => {
    const prevItems = [...state.cart];
    const newItems = [];
    prevItems.forEach(item => {
      if( item.isSelected ) {
        item.isSelected = false;
        if(item.newOrOld === MenuItemType.new){
          item.id = nanoid();
          newItems.push(item);
        }
      }
    });

    setState(prev => ({
      ...prev,
      cart: [
        ...prevItems.map(item => ({
          ...item,
          isSelected: false,
          id: item.newOrOld === MenuItemType.old ? item.id : nanoid()
        })),
        ...newItems,
      ]
    }))
  }

  const toggleCartItems = () => {
    setState(prev => ({
      ...prev,
      cart: prev.cart.map(cartItem => {
        if(cartItem.newOrOld === MenuItemType.new || cartItem.isHold) {
          cartItem.isSelected = !selected;
        }

        return cartItem
      })
    }))

    setSelected(!selected);
  }

  const toggleHoldSelectedCartItems = () => {
    setState(prev => ({
      ...prev,
      cart: prev.cart.map(cartItem => {
        if( cartItem.isSelected ) {
          cartItem.isHold = !cartItem.isHold;
          cartItem.isSelected = false;
        }

        return cartItem;
      })
    }))
  }

  const fireSelectedCartItems = async () => {
    const heldSelected = state.cart.filter((item) => item.isSelected && item.isHold);
    if (heldSelected.length === 0) {
      return;
    }

    const kitchenItems: Record<string, any[]> = {};
    const firedIds = new Set(heldSelected.map((item) => item.id?.toString()));

    for (const item of heldSelected) {
      const itemId = item.id?.toString();
      if (!itemId?.includes('order_item:')) {
        continue;
      }

      const orderItemRef = toRecordId(itemId);
      await db.merge(orderItemRef, { is_suspended: false });

      const [countResult]: any = await db.query(
        `SELECT count() AS count FROM ${Tables.order_items_kitchen} WHERE order_item = $oi GROUP ALL`,
        { oi: orderItemRef }
      );
      const kitchenRowCount = Number(countResult?.[0]?.count ?? 0);

      if (kitchenRowCount === 0) {
        await createStageRows(db, {
          orderItem: {
            id: orderItemRef,
            quantity: item.quantity,
            comments: item.comments,
            seat: item.seat,
            price: item.price,
            modifiers: item.selectedGroups,
          },
          dish: item.dish,
          kitchenItems,
        });
      }
    }

    const hasKitchenPrintItems = Object.keys(kitchenItems).length > 0;
    if (hasKitchenPrintItems) {
      const order =
        state.order?.order ??
        (state.order?.id && state.order.id !== 'new'
          ? { id: state.order.id }
          : undefined);

      const [kitchens]: any = await db.query(
        `SELECT * FROM ${Tables.kitchens} WHERE deleted_at = none FETCH printers`
      );

      for (const k of kitchens ?? []) {
        const kitchenId = k.id.toString();
        if (!kitchenItems[kitchenId]) {
          continue;
        }

        void dispatchPrint(
          db,
          'kitchen',
          {
            items: kitchenItems[kitchenId],
            order: {
              ...order,
              order_type: state?.orderType ?? order?.order_type,
              user: page?.user ?? order?.user,
            },
            kitchenName: k.name,
            table: state?.table,
            isAddOn: true,
          },
          {
            title: t('payment:print.kitchenTitle'),
            copies: 1,
            userId: page?.user?.id,
            printers: k.printers,
          }
        ).catch((error) => {
          console.error('Kitchen print dispatch failed', error);
        });
      }
    }

    setState((prev) => ({
      ...prev,
      cart: prev.cart.map((cartItem) => {
        if (!firedIds.has(cartItem.id?.toString())) {
          return cartItem;
        }

        return {
          ...cartItem,
          isHold: false,
          isSelected: false,
        };
      }),
    }));
  }

  return (
    <div className="flex gap-3">
      <Button size="lg" iconButton variant="primary" onClick={toggleCartItems}>
        <FontAwesomeIcon icon={faSquareCheck} size="lg"/>
      </Button>
      {hasNewItems && (
        <>
          <span className="bg-neutral-400 h-[48px] w-[2px]"></span>
          <Button size="lg" iconButton variant="primary" onClick={copySelectedCartItems}>
            <FontAwesomeIcon icon={faCopy} size="lg"/>
          </Button>
          <Button size="lg" iconButton variant="danger" onClick={deleteSelectedCartItems}>
            <FontAwesomeIcon icon={faTrash} size="lg"/>
          </Button>
        </>
      )}


      {hasHoldItems ? (
        <Button size="lg" iconButton variant="success" onClick={fireSelectedCartItems}>
          <FontAwesomeIcon icon={faPlay} size="lg"/>
        </Button>
      ) : (
        <Button size="lg" iconButton variant="warning" onClick={toggleHoldSelectedCartItems}>
          <FontAwesomeIcon icon={faPause} size="lg"/>
        </Button>
      )}

      {hasNewItems && (
        <Dropdown label={t('seats.seat')} btnSize="lg" onAction={onClickSeatItem}>
          {state.seats.map((seat, index) => (
            <DropdownItem id={seat} key={seat} className="min-w-[50px]">{index + 1}</DropdownItem>
          ))}
          <DropdownItem id="new" key="new" className="min-w-[50px]">{t('seats.newSeat')}</DropdownItem>
        </Dropdown>
      )}

    </div>
  )
}
