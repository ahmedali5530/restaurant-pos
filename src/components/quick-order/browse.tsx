import {useMemo, useState, type MouseEvent, type PointerEvent} from "react";
import {useAtom} from "jotai";
import {appSettings, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {resolveMenuAwareData} from "@/lib/menu.resolver.ts";
import {MenuCategories} from "@/components/menu/categories.tsx";
import {MenuDish} from "@/components/menu/dish.tsx";
import {CartModifierGroup, MenuItem} from "@/api/model/cart_item.ts";
import {toast} from "sonner";
import i18n from "@/lib/i18n.ts";
import {useTranslation} from "react-i18next";
import ScrollContainer from "react-indiana-drag-scroll";

interface Props {
  onAdd: (item: MenuItem, selectedGroups?: CartModifierGroup[]) => void;
}

export const QuickOrderBrowse = ({onAdd}: Props) => {
  const {t} = useTranslation("quick-order");
  const [state] = useAtom(appState);
  const [settings] = useAtom(appSettings);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const [expanded, setExpanded] = useState(true);

  const {dishes: allDishes} = useMemo(
    () =>
      resolveMenuAwareData({
        categories: settings.categories,
        dishes: settings.dishes,
        menus: settings.menus,
      }),
    [settings.categories, settings.dishes, settings.menus],
  );

  const dishes = useMemo(() => {
    if (state.category) {
      return (
        allDishes?.filter((item) =>
          (item.categories ?? []).some(
            (cat) => cat.id.toString() === state.category?.id.toString(),
          ),
        ) || []
      );
    }
    return allDishes || [];
  }, [allDishes, state.category]);

  const handleClick = (item: MenuItem, selectedGroups?: CartModifierGroup[]) => {
    if (enforcement.orderTakingBlocked) {
      toast.warning(enforcement.message ?? i18n.t("closing:orderTakingDisabled"));
      return;
    }
    onAdd(item, selectedGroups);
  };

  /** Keep the barcode field focused — USB wedge needs it; click still fires. */
  const keepScanFocus = (event: MouseEvent | PointerEvent) => {
    const target = event.target as HTMLElement | null;
    // React Aria usePress breaks if pointerdown default is prevented
    if (target?.closest(".react-aria-Button, [data-rac]")) {
      return;
    }
    event.preventDefault();
  };

  return (
    <div className="flex flex-col min-h-0 h-full" data-testid="quick-order-browse">
      <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
        <h2 className="text-lg font-semibold text-foreground">{t("browse.title")}</h2>
        <button
          type="button"
          className="text-sm text-primary font-medium"
          onMouseDown={keepScanFocus}
          onClick={() => setExpanded((v) => !v)}
          data-testid="quick-order-browse-toggle"
        >
          {expanded ? t("browse.hide") : t("browse.show")}
        </button>
      </div>
      {expanded && (
        <>
          <div
            className="mb-2 flex-shrink-0 rounded-xl"
            onMouseDown={keepScanFocus}
            onPointerDown={keepScanFocus}
          >
            <MenuCategories />
          </div>
          <ScrollContainer className="flex-1 min-h-0">
            <div
              className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1"
              onMouseDown={keepScanFocus}
              onPointerDown={keepScanFocus}
            >
              {dishes.map((item) => (
                <MenuDish
                  key={item.id?.toString() ?? item.number}
                  onClick={handleClick}
                  item={item}
                  level={0}
                  price={item.price}
                />
              ))}
            </div>
          </ScrollContainer>
        </>
      )}
    </div>
  );
};
