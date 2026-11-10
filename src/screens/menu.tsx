import {Layout} from "@/screens/partials/layout.tsx";
import {MenuDishes} from "@/components/menu/dishes.tsx";
import {MenuCart} from "@/components/cart/cart.tsx";
import {useEffect, useMemo} from "react";
import {FloorLayout} from "@/components/floor/floor.layout.tsx";
import {MenuHeader} from "@/components/menu/header.tsx";
import {useAtom} from "jotai";
import {appAlert, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {MenuPersons} from "@/components/menu/persons.tsx";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";
import 'swiper/css';
import {useTranslation} from "react-i18next";
import {DocumentTitle} from "@/components/common/document-title.tsx";
import {useSearchParams} from "react-router";
import {useCustomerDisplayPublisher} from "@/hooks/useCustomerDisplayPublisher.ts";

export const Menu = () => {
  const {t: tNav} = useTranslation('navigation');
  const [state, setState] = useAtom(appState);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const [, setAlert] = useAtom(appAlert);
  const [searchParams] = useSearchParams();
  /** Docs capture only — never write this into persisted appState. */
  const docsTableless = searchParams.get('docs_tableless') === '1';

  // Mirror cart to customer display (same channel as Quick Order).
  useCustomerDisplayPublisher();

  // Menu is always floor/table-based. Drop legacy tableless flag and restore floor when no table.
  useEffect(() => {
    setState((prev) => {
      const legacy = prev as typeof prev & {hideTableSelection?: boolean};
      const hadLegacy = legacy.hideTableSelection !== undefined;
      const needsFloor = !prev.table?.id && prev.showFloor !== true;

      if (!hadLegacy && !needsFloor) {
        return prev;
      }

      const next = {...prev} as typeof prev & {hideTableSelection?: boolean};
      delete next.hideTableSelection;
      if (needsFloor) {
        next.showFloor = true;
        next.showPersons = false;
      }
      return next;
    });
  }, [setState]);

  useEffect(() => {
    if (!enforcement.orderTakingBlocked || state.showFloor) {
      return;
    }

    const returnToFloor = async () => {
      const tableId = state.table?.id ? String(state.table.id) : undefined;
      const orderId =
        state.order?.id && state.order.id !== 'new' ? String(state.order.id) : undefined;

      setState(prev => ({
        ...prev,
        showFloor: true,
        showPersons: false,
        orderType: undefined,
        cart: [],
        order: undefined,
        orders: [],
        customer: undefined,
        table: undefined,
        switchTable: false,
      }));

      if (orderId) {
        await posStore.releaseOrder(orderId).catch(() => undefined);
      }
      if (tableId) {
        try {
          await posStore.unlockTable(tableId);
        } catch (error) {
          console.error("Failed to release table lock:", error);
        }
      }

      if (enforcement.message) {
        setAlert(prev => ({
          ...prev,
          message: enforcement.message!,
          type: "warning",
          opened: true,
        }));
      }
    };

    void returnToFloor();
  }, [
    enforcement.message,
    enforcement.orderTakingBlocked,
    setAlert,
    setState,
    state.showFloor,
    state.table?.id,
  ]);

  // Docs capture: never force persisted showFloor/persons off — only branch UI here.
  const showFloorLayout = !docsTableless && state.showFloor === true;
  const showPersonsLayout = !docsTableless && state.showPersons === true;

  const screen = useMemo(() => {
    if (showFloorLayout) {
      return <FloorLayout/>;
    }

    if (showPersonsLayout) {
      return <MenuPersons/>;
    }

    return (
      <div className="grid grid-cols-[minmax(0,1fr)_440px] gap-3 p-3 h-full min-h-0 overflow-hidden" data-testid="menu-page">
        <div className="flex min-h-0 flex-col overflow-hidden">
          <div className="mb-3 flex h-[70px] shrink-0 items-center gap-3">
            <MenuHeader/>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="menu-dishes">
            <MenuDishes/>
          </div>
        </div>
        <div className="bg-surface-elevated rounded-xl flex flex-col h-full min-h-0 overflow-hidden" data-testid="menu-cart">
          <MenuCart/>
        </div>
      </div>
    )

  }, [showFloorLayout, showPersonsLayout]);

  const isMenuOrderingScreen = !showFloorLayout && !showPersonsLayout;

  return (
    <Layout
      overflowHidden={isMenuOrderingScreen}
      containerClassName={isMenuOrderingScreen ? "overflow-hidden" : undefined}
      showSidebar={showFloorLayout || showPersonsLayout || docsTableless}
    >
      <DocumentTitle parts={[tNav('sidebar.menu')]} />
      {screen}
    </Layout>
  );
}
