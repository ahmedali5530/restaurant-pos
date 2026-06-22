import {Layout} from "@/screens/partials/layout.tsx";
import {MenuCategories} from "@/components/menu/categories.tsx";
import {MenuDishes} from "@/components/menu/dishes.tsx";
import {MenuActions} from "@/components/menu/actions.tsx";
import {MenuCart} from "@/components/cart/cart.tsx";
import {useEffect, useMemo, useRef} from "react";
import {FloorLayout} from "@/components/floor/floor.layout.tsx";
import {MenuHeader} from "@/components/menu/header.tsx";
import {useAtom} from "jotai";
import {appAlert, appSettings, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {MenuPersons} from "@/components/menu/persons.tsx";
import {useDB} from "@/api/db/db.ts";
import {toRecordId} from "@/lib/utils.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order, OrderStatus} from "@/api/model/order.ts";
import 'swiper/css';

export const Menu = () => {
  const [state, setState] = useAtom(appState);
  const [settings, setSettings] = useAtom(appSettings);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const [, setAlert] = useAtom(appAlert);
  const db = useDB();
  const hideTableSelection = state.hideTableSelection === true;

  useEffect(() => {
    if (!hideTableSelection || state.showFloor !== true || enforcement.orderTakingBlocked) {
      return;
    }

    setState(prev => ({
      ...prev,
      showFloor: false,
      showPersons: false,
      table: undefined,
      order: {id: 'new', order: undefined},
      cart: [],
      floor: prev.floor ?? settings.floors[0],
      orderType: prev.orderType ?? settings.order_types[0],
    }));

    setSettings(prev => ({
      ...prev,
      categories: prev.categories.filter(item => item.show_in_menu),
    }));
  }, [
    enforcement.orderTakingBlocked,
    hideTableSelection,
    setSettings,
    setState,
    settings.floors,
    settings.order_types,
    state.showFloor,
  ]);

  const tablelessOrdersLiveRef = useRef<{kill: () => Promise<void>} | null>(null);

  useEffect(() => {
    if (!hideTableSelection) {
      return;
    }

    let cancelled = false;

    const fetchTablelessOrders = async () => {
      const [rows] = await db.query<Order[]>(
        `SELECT * FROM ${Tables.orders}
         WHERE status = $status AND table = none
         ORDER BY created_at ASC
         FETCH customer, items, items.item, order_type, table, user`,
        {status: OrderStatus["In Progress"]}
      );

      if (cancelled) {
        return;
      }

      const orders = Array.isArray(rows) ? rows : [];

      setState(prev => {
        const prevIds = prev.orders.map(order => order.id?.toString()).join(',');
        const nextIds = orders.map(order => order.id?.toString()).join(',');
        if (prevIds === nextIds) {
          return prev;
        }

        return {
          ...prev,
          orders,
        };
      });
    };

    const setup = async () => {
      await fetchTablelessOrders();
      if (cancelled) {
        return;
      }

      const subscription = await db.live(Tables.orders, () => {
        void fetchTablelessOrders();
      });

      if (cancelled) {
        await subscription.kill().catch(() => undefined);
        return;
      }

      tablelessOrdersLiveRef.current = subscription;
    };

    void setup();

    return () => {
      cancelled = true;
      tablelessOrdersLiveRef.current?.kill().catch(() => undefined);
      tablelessOrdersLiveRef.current = null;
    };
  }, [db, hideTableSelection, setState]);

  useEffect(() => {
    if (!enforcement.orderTakingBlocked || state.showFloor) {
      return;
    }

    const returnToFloor = async () => {
      if (state.table?.id) {
        try {
          await db.merge(toRecordId(state.table.id), {
            is_locked: false,
            locked_at: null,
            locked_by: null,
          });
        } catch (error) {
          console.error("Failed to release table lock:", error);
        }
      }

      setState(prev => ({
        ...prev,
        showFloor: true,
        showPersons: false,
        orderType: undefined,
        cart: [],
        order: undefined,
        orders: hideTableSelection ? prev.orders : [],
        customer: undefined,
        table: undefined,
        switchTable: false,
      }));

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
    db,
    enforcement.message,
    enforcement.orderTakingBlocked,
    hideTableSelection,
    setAlert,
    setState,
    state.showFloor,
    state.table?.id,
  ]);

  const screen = useMemo(() => {
    if (state.showFloor && !hideTableSelection) {
      return <FloorLayout/>;
    }

    if (state.showPersons) {
      return <MenuPersons/>;
    }

    return (
      <div className="grid grid-cols-[minmax(0,1fr)_440px] gap-3 pl-3 h-[100vh] overflow-hidden">
        <div>
          <div className="h-[70px] flex items-center gap-3 mb-3">
            <MenuHeader/>
          </div>
          <div className="mb-3 rounded-xl">
            <MenuCategories/>
          </div>
          <div className="rounded-xl">
            <MenuDishes/>
          </div>
          <div className="mt-3 hidden">
            <MenuActions/>
          </div>
        </div>
        <div className="bg-white rounded-xl flex flex-col h-full min-h-0 overflow-hidden">
          <MenuCart/>
        </div>
      </div>
    )

  }, [hideTableSelection, state.showFloor, state.showPersons]);

  const isMenuOrderingScreen = !state.showFloor && !state.showPersons;

  return (
    <Layout
      overflowHidden={isMenuOrderingScreen}
      containerClassName={isMenuOrderingScreen ? "overflow-hidden" : undefined}
      showSidebar={state.showFloor === true || state.showPersons === true || hideTableSelection}
    >
      {screen}
    </Layout>
  );
}
