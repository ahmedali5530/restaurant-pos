import React, {useMemo} from "react";
import {Button} from "@/components/common/input/button.tsx";
import {faTrash} from "@fortawesome/free-solid-svg-icons";
import {useAtom} from "jotai";
import {appState} from "@/store/jotai.ts";
import ScrollContainer from "react-indiana-drag-scroll";
import {CartItem} from "@/components/cart/cart.item.tsx";
import {Payment} from "@/components/payment/payment.tsx";
import {Seats} from "@/components/cart/seats.tsx";
import {CartActions} from "@/components/cart/cart.actions.tsx";
import {MenuItemType} from "@/api/model/cart_item.ts";
import {useTranslation} from "react-i18next";

export const MenuCart = () => {
  const [state, setState] = useAtom(appState);
  const { t } = useTranslation('cart');

  const cartItems = useMemo(() => {
    return state.cart.filter(item => item.seat === state.seat);
  }, [state.cart, state.seat]);

  const isSelected = useMemo(() => {
    return state.cart.find(item => item.isSelected) !== undefined;
  }, [state.cart]);

  const newItems = useMemo(() => {
    return cartItems.filter(item => item.newOrOld === MenuItemType.new);
  }, [cartItems]);

  const oldItems = useMemo(() => {
    return cartItems.filter(item => item.newOrOld === MenuItemType.old);
  }, [cartItems]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="p-3">
          {isSelected ? (
            <CartActions/>
          ) : (
            <Seats/>
          )}
        </div>
        <div className="flex flex-col gap-1 h-[calc(100vh_-_216px_-_50px)] overflow-auto">
          {state.seat && cartItems.length === 0 && state.seats.length > 0 && (
            <div className="items-center flex justify-center h-[100px]">
              <Button variant="danger" size="lg" icon={faTrash} onClick={() => {
                setState(prev => ({
                  ...prev,
                  seats: prev.seats.filter(s => s !== state.seat),
                }));
                setState(prev => ({
                  ...prev,
                  seat: prev.seats.at(-1)
                }))
              }}>{t('seats.deleteSeat')}</Button>
            </div>
          )}
          <ScrollContainer className="gap-[4px] flex flex-col select-none">
            {newItems.map((item, index) => (
              <CartItem item={item} key={index} index={index}/>
            ))}
            {newItems.length > 0 && oldItems.length > 0 && (
              <div className="h-[3px] bg-neutral-900 my-2 rounded-full"></div>
            )}
            {oldItems.map((item, index) => (
              <CartItem item={item} key={index} index={index}/>
            ))}
          </ScrollContainer>
        </div>
      </div>
      <div className="">
        <div className="h-[2px] separator"></div>
        <Payment/>
      </div>
    </>
  );
}
