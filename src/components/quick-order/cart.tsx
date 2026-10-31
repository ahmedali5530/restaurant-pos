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

  const keepScanFocus = (event: MouseEvent | PointerEvent) => {
    const target = event.target as HTMLElement | null;
    // Allow real text inputs (qty field) to take focus when tapped.
    if (target?.closest("input, textarea, select, [contenteditable='true']")) {
      return;
    }
    // React Aria usePress breaks if pointerdown default is prevented
    if (target?.closest(".react-aria-Button, [data-rac]")) {
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
        onMouseDown={keepScanFocus}
        onPointerDown={keepScanFocus}
      >
        {cartItems.length === 0 ? (
          <div className="flex items-center justify-center h-full px-4 text-center text-muted">
            {t("cart.empty")}
          </div>
        ) : (
          <ScrollContainer className="h-full gap-[4px] flex flex-col select-none px-1">
            {newItems.map((item, index) => (
              <CartItem item={item} key={item.id} index={index} />
            ))}
            {newItems.length > 0 && oldItems.length > 0 && (
              <div className="h-[3px] bg-neutral-900 my-2 rounded-full" />
            )}
            {oldItems.map((item, index) => (
              <CartItem item={item} key={item.id} index={index} />
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
