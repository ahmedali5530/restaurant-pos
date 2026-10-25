import {Layout} from "@/screens/partials/layout.tsx";
import {DocumentTitle} from "@/components/common/document-title.tsx";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {appSettings, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {QuickOrderCart} from "@/components/quick-order/cart.tsx";
import {QuickOrderBrowse} from "@/components/quick-order/browse.tsx";
import {useBarcodeScan} from "@/hooks/useBarcodeScan.ts";
import {useQuickOrderScanFocus} from "@/hooks/useQuickOrderScanFocus.ts";
import {findDishByScanCode, parseScanQty} from "@/lib/quick-order-scan.ts";
import {resolveMenuAwareData} from "@/lib/menu.resolver.ts";
import {
  buildCartModifierGroupsForDish,
  dishNeedsModifierPrompt,
  mergeOrAppendCartLine,
} from "@/lib/quick-order-cart.ts";
import {CartModifierGroup, MenuItem} from "@/api/model/cart_item.ts";
import {Dish} from "@/api/model/dish.ts";
import {MenuDishModifiers} from "@/components/menu/modifiers.tsx";
import {toast} from "sonner";
import i18n from "@/lib/i18n.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faBarcode, faDisplay} from "@fortawesome/free-solid-svg-icons";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {useDishAvailabilitySoldMap} from "@/hooks/useDishAvailabilitySoldMap.ts";
import {canAddDishQty, withLiveAvailability} from "@/lib/dish-availability.ts";
import {
  openCustomerDisplayWindow,
  useCustomerDisplayPublisher,
} from "@/hooks/useCustomerDisplayPublisher.ts";

export const QuickOrder = () => {
  const {t} = useTranslation(["quick-order", "navigation", "closing", "menu"]);
  const [state, setState] = useAtom(appState);
  const [settings] = useAtom(appSettings);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const [pendingDish, setPendingDish] = useState<Dish | null>(null);
  const [pendingGroups, setPendingGroups] = useState<CartModifierGroup[]>([]);
  const [pendingQty, setPendingQty] = useState(1);
  const [lastScan, setLastScan] = useState<string>("");
  const [scanValue, setScanValue] = useState("");
  const [lastAddedDishId, setLastAddedDishId] = useState<string | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);

  const scanArmed = !enforcement.orderTakingBlocked;
  const focusScanInput = useQuickOrderScanFocus(scanInputRef, scanArmed);
  useCustomerDisplayPublisher();
  const {enforce, soldFor} = useDishAvailabilitySoldMap();

  const assertCanAdd = useCallback(
    (dish: Dish, addQty = 1): boolean => {
      const live = withLiveAvailability(settings.dishes, dish) ?? dish;
      const check = canAddDishQty({
        dish: live,
        sold: soldFor(dish.id),
        cart: state.cart,
        addQty,
        enforceLimits: enforce,
      });
      if (check.ok) {
        return true;
      }
      if (check.reason === "unavailable") {
        toast.warning(t("menu:availability.unavailable", {name: dish.name}));
      } else {
        toast.warning(
          t("menu:availability.onlyNLeft", {
            name: dish.name,
            count: check.remaining ?? 0,
          }),
        );
      }
      return false;
    },
    [enforce, soldFor, state.cart, settings.dishes, t],
  );

  // Seed tableless context for createOrderWithItems (no table).
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      showFloor: false,
      showPersons: false,
      table: undefined,
      hideTableSelection: true,
      posMode: prev.posMode ?? "retail",
      floor: prev.floor ?? settings.floors[0],
      orderType: prev.orderType ?? settings.order_types[0],
      order: prev.order?.id ? prev.order : {id: "new", order: undefined},
    }));
  }, [setState, settings.floors, settings.order_types]);

  const {dishes: sellableDishes} = useMemo(
    () =>
      resolveMenuAwareData({
        categories: settings.categories,
        dishes: settings.dishes,
        menus: settings.menus,
      }),
    [settings.categories, settings.dishes, settings.menus],
  );

  const addLine = useCallback(
    (item: MenuItem, selectedGroups?: CartModifierGroup[]) => {
      if (enforcement.orderTakingBlocked) {
        toast.warning(enforcement.message ?? i18n.t("closing:orderTakingDisabled"));
        return;
      }
      if (!assertCanAdd(item.dish, 1)) {
        return;
      }
      setState((prev) => ({
        ...prev,
        cart: mergeOrAppendCartLine(prev.cart, item.dish, {
          selectedGroups: selectedGroups ?? item.selectedGroups,
          categoryName: item.category,
          categoryId: item.category_id,
          quantity: 1,
        }),
      }));
      setLastAddedDishId(String(item.dish?.id ?? ""));
      focusScanInput();
    },
    [
      assertCanAdd,
      enforcement.message,
      enforcement.orderTakingBlocked,
      focusScanInput,
      setState,
    ],
  );

  const addDish = useCallback(
    (dish: Dish, selectedGroups?: CartModifierGroup[], quantity = 1): boolean => {
      if (enforcement.orderTakingBlocked) {
        toast.warning(enforcement.message ?? i18n.t("closing:orderTakingDisabled"));
        return false;
      }

      const qty = Math.max(1, Math.floor(Number(quantity) || 1));
      if (!assertCanAdd(dish, qty)) {
        return false;
      }

      if (!selectedGroups && dishNeedsModifierPrompt(dish, settings.groups_dishes ?? [])) {
        const groups = buildCartModifierGroupsForDish(
          dish,
          settings.groups_dishes ?? [],
          state.category?.name,
        );
        if (groups.length > 0) {
          setPendingDish(dish);
          setPendingGroups(groups);
          setPendingQty(qty);
          return true;
        }
      }

      setState((prev) => ({
        ...prev,
        cart: mergeOrAppendCartLine(prev.cart, dish, {
          selectedGroups,
          categoryName: state.category?.name,
          categoryId: state.category?.id?.toString(),
          quantity: qty,
        }),
      }));
      setLastAddedDishId(String(dish.id ?? ""));
      focusScanInput();
      return true;
    },
    [
      assertCanAdd,
      enforcement.message,
      enforcement.orderTakingBlocked,
      focusScanInput,
      setState,
      settings.groups_dishes,
      state.category?.id,
      state.category?.name,
    ],
  );

  const onScan = useCallback(
    (code: string) => {
      const parsed = parseScanQty(code);
      if (parsed.mode === "empty") {
        return;
      }
      if (parsed.mode === "invalid_qty") {
        toast.error(t("quick-order:scan.invalidQty"));
        focusScanInput();
        return;
      }

      setLastScan(code.trim());
      setScanValue("");

      let dish: Dish | undefined;
      if (parsed.mode === "use_last") {
        if (!lastAddedDishId) {
          toast.warning(t("quick-order:scan.noLastItem"));
          focusScanInput();
          return;
        }
        dish = sellableDishes.find(
          (d) => String(d.id) === lastAddedDishId || String(d.id) === `menu_item:${lastAddedDishId}`,
        );
        if (!dish) {
          toast.warning(t("quick-order:scan.noLastItem"));
          focusScanInput();
          return;
        }
      } else {
        dish = findDishByScanCode(sellableDishes, parsed.code ?? "");
        if (!dish) {
          toast.error(t("quick-order:scan.unknown", {code: parsed.code}));
          focusScanInput();
          return;
        }
      }

      const added = addDish(dish, undefined, parsed.qty);
      if (added) {
        toast.success(
          parsed.qty > 1
            ? t("quick-order:scan.addedQty", {name: dish.name, count: parsed.qty})
            : t("quick-order:scan.added", {name: dish.name}),
          {duration: 1200},
        );
      }
      focusScanInput();
    },
    [addDish, focusScanInput, lastAddedDishId, sellableDishes, t],
  );

  // Ignore wedge while a modifier modal is open (focus is in the dialog).
  useBarcodeScan(onScan, {
    enabled: scanArmed && !pendingDish,
  });

  const submitScanValue = () => {
    onScan(scanValue);
  };

  const openCustomerDisplay = () => {
    openCustomerDisplayWindow(state.cart);
  };

  return (
    <Layout>
      <DocumentTitle parts={[t("navigation:sidebar.quickOrder")]} />
      <div
        className="flex flex-col lg:flex-row gap-3 h-[calc(100vh_-_var(--app-toolbar-h)_-_1rem)] min-h-0 p-2"
        data-testid="quick-order-screen"
      >
        <div className="flex flex-col flex-1 min-h-0 min-w-0 gap-3">
          <div
            className="rounded-xl bg-surface-elevated border border-border px-4 py-3 flex flex-col gap-2 flex-shrink-0"
            data-testid="quick-order-scan-status"
          >
            <div className="flex items-center gap-3">
              <FontAwesomeIcon icon={faBarcode} className="text-primary text-2xl" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-foreground">{t("quick-order:scan.title")}</div>
                <div className="text-sm text-muted truncate">
                  {lastScan
                    ? t("quick-order:scan.last", {code: lastScan})
                    : t("quick-order:scan.ready")}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={faDisplay}
                onClick={openCustomerDisplay}
                data-testid="quick-order-open-customer-display"
              >
                {t("quick-order:customerDisplay.open")}
              </Button>
            </div>
            <div>
              <Input
                ref={scanInputRef}
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitScanValue();
                  }
                }}
                label={t("quick-order:scan.inputLabel")}
                placeholder={t("quick-order:scan.placeholder")}
                autoFocus
                selectable={false}
                disabled={enforcement.orderTakingBlocked}
                data-testid="quick-order-scan-input"
                data-quick-order-scan="true"
                autoComplete="off"
                inputMode="text"
              />
              <p className="text-xs text-muted mt-1">{t("quick-order:scan.qtyHint")}</p>
            </div>
          </div>
          <div className="flex-1 min-h-0 rounded-xl bg-surface border border-border p-2">
            <QuickOrderBrowse onAdd={addLine} />
          </div>
        </div>
        <div className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 min-h-[280px] lg:min-h-0 rounded-xl bg-surface-elevated border border-border overflow-hidden">
          <QuickOrderCart />
        </div>
      </div>

      {pendingDish && pendingGroups.length > 0 && (
        <MenuDishModifiers
          dish={pendingDish}
          isOpen
          groups={pendingGroups}
          onClose={(payload) => {
            if (payload.length > 0) {
              addDish(pendingDish, payload, pendingQty);
            }
            setPendingDish(null);
            setPendingGroups([]);
            setPendingQty(1);
            focusScanInput();
          }}
          level={1}
        />
      )}
    </Layout>
  );
};
