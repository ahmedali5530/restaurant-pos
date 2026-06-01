import {Layout} from "@/screens/partials/layout.tsx";
import {MenuCategories} from "@/components/menu/categories.tsx";
import {MenuDishes} from "@/components/menu/dishes.tsx";
import {MenuActions} from "@/components/menu/actions.tsx";
import {MenuCart} from "@/components/cart/cart.tsx";
import {useEffect, useMemo} from "react";
import {FloorLayout} from "@/components/floor/floor.layout.tsx";
import {MenuHeader} from "@/components/menu/header.tsx";
import {useAtom} from "jotai";
import {appAlert, appState, closingEnforcementAtom} from "@/store/jotai.ts";
import {MenuPersons} from "@/components/menu/persons.tsx";
import {useDB} from "@/api/db/db.ts";
import {toRecordId} from "@/lib/utils.ts";

import 'swiper/css';

export const Menu = () => {
  const [state, setState] = useAtom(appState);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const [, setAlert] = useAtom(appAlert);
  const db = useDB();

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
        orders: [],
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
    setAlert,
    setState,
    state.showFloor,
    state.table?.id,
  ]);

  const screen = useMemo(() => {
    if (state.showFloor) {
      return <FloorLayout/>;
    }

    if (state.showPersons) {
      return <MenuPersons/>;
    }

    return (
      <div className="grid grid-cols-[minmax(0,1fr)_440px] gap-3 pl-3">
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
        <div className="bg-white rounded-xl">
          <MenuCart/>
        </div>
      </div>
    )

  }, [state.showFloor, state.showPersons]);

  return (
    <Layout showSidebar={state.showFloor === true || state.showPersons === true}>
      {screen}
    </Layout>
  );
}
