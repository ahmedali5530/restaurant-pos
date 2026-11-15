import {useMemo, type MouseEvent, type PointerEvent} from "react";
import {useAtom} from "jotai";
import {appState} from "@/store/jotai.ts";
import ScrollContainer from "react-indiana-drag-scroll";
import {CartItem} from "@/components/cart/cart.item.tsx";
import {Payment} from "@/components/payment/payment.tsx";
import {MenuItemType} from "@/api/model/cart_item.ts";
import {useTranslation} from "react-i18next";

export const QuickOrderCart = () => {
  const [state] = useAtom(appState);
  const {t} = useTranslation("quick-order");

  const cartItems = useMemo(
    () => state.cart.filter((item) => !item.deleted_at),
    [state.cart],
  );

  const newItems = useMemo(
    () => cartItems.filter((item) => item.newOrOld === MenuItemType.new),
    [cartItems],
  );

  const oldItems = useMemo(
    () => cartItems.filter((item) => item.newOrOld === MenuItemType.old),
    [cartItems],
  );

  /** Keep scan armed on payment chrome only — never on the cart list (breaks drag-scroll). */
  const keepScanFocus = (event: MouseEvent | PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }
    if (target?.closest(".react-aria-Button, [data-rac]")) {
      return;
    }
    if (target?.closest(".indiana-scroll-container")) {
      return;
    }
    event.preventDefault();
  };

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="quick-order-cart">
      <div className="px-3 pt-3 pb-1 flex-shrink-0">
        <h2 className="text-lg font-semibold text-foreground">{t("cart.title")}</h2>
        <p className="text-sm text-muted">{t("cart.hint")}</p>
      </div>
      <div
        className="flex-1 min-h-0 overflow-hidden"
        data-testid="quick-order-cart-items"
      >
        {cartItems.length === 0 ? (
          <div className="flex items-center justify-center h-full px-4 text-center text-muted">
            {t("cart.empty")}
          </div>
        ) : (
          <ScrollContainer className="h-full gap-[4px] flex flex-col select-none px-1 indiana-scroll-container">
            {newItems.map((item, index) => (
              <CartItem item={item} key={item.id} index={index} selectable={false} />
            ))}
            {newItems.length > 0 && oldItems.length > 0 && (
              <div className="h-[3px] bg-neutral-900 my-2 rounded-full" />
            )}
            {oldItems.map((item, index) => (
              <CartItem item={item} key={item.id} index={index} selectable={false} />
            ))}
          </ScrollContainer>
        )}
      </div>
      <div
        className="flex-shrink-0"
        data-testid="quick-order-payment"
        onMouseDown={keepScanFocus}
        onPointerDown={keepScanFocus}
      >
        <div className="h-[2px] separator" />
        <Payment variant="quick" />
      </div>
    </div>
  );
};
