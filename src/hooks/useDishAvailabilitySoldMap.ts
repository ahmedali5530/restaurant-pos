import {useCallback, useEffect} from "react";
import {useAtom, useSetAtom} from "jotai";
import {appSettings, appState} from "@/store/jotai.ts";
import {dishSoldMapAtom, getSoldQtyMapForDishes, soldFromMap} from "@/lib/dish-availability.ts";

/**
 * Mount once on Menu / Quick Order. Refreshes sold qty map when enforce is on.
 */
export function useDishAvailabilitySoldMap() {
  const [state] = useAtom(appState);
  const [settings] = useAtom(appSettings);
  const setSoldMap = useSetAtom(dishSoldMapAtom);
  const [soldMap] = useAtom(dishSoldMapAtom);
  // Default on: only an explicit false disables sale-limit tracking.
  const enforce = state.enforceItemAvailability !== false;

  const refresh = useCallback(async () => {
    if (!enforce) {
      setSoldMap(new Map());
      return;
    }
    const map = await getSoldQtyMapForDishes(settings.dishes ?? []);
    setSoldMap(map);
  }, [enforce, setSoldMap, settings.dishes]);

  useEffect(() => {
    void refresh();
  }, [refresh, state.cart]);

  useEffect(() => {
    if (!enforce) {
      return;
    }
    const onWrite = () => {
      void refresh();
    };
    window.addEventListener("posr-posstore-write", onWrite);
    window.addEventListener("posr-operational-orders-updated", onWrite);
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.removeEventListener("posr-posstore-write", onWrite);
      window.removeEventListener("posr-operational-orders-updated", onWrite);
      window.clearInterval(id);
    };
  }, [enforce, refresh]);

  return {
    enforce,
    soldMap,
    soldFor: (dishId: unknown) => soldFromMap(soldMap, dishId),
    refreshSoldMap: refresh,
  };
}
