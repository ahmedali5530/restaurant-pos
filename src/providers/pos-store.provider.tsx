import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';
import { posStore } from '@/infrastructure/pos-store/pos-store.ts';
import { appSettings, type AppSettingsInterface } from '@/store/jotai.ts';

type PosStoreContextValue = {
  isReady: boolean;
  isHydrated: boolean;
  error: string | null;
};

const PosStoreContext = createContext<PosStoreContextValue>({
  isReady: false,
  isHydrated: false,
  error: null,
});

export function usePosStoreReady(): PosStoreContextValue {
  return useContext(PosStoreContext);
}

/**
 * Merge Dexie-hydrated catalog into jotai settings without letting a transient
 * empty read (Reload cache race) blank floors/dishes/categories that were already good.
 */
export function mergeHydratedCatalogIntoSettings(
  prev: AppSettingsInterface,
  catalog: Partial<AppSettingsInterface>,
): AppSettingsInterface {
  const nextFloors = catalog.floors ?? [];
  const nextTables = catalog.tables ?? [];
  const nextDishes = catalog.dishes ?? [];
  const nextCategories = catalog.categories ?? [];

  const keepFloors = nextFloors.length === 0 && (prev.floors?.length ?? 0) > 0;
  const keepDishes = nextDishes.length === 0 && (prev.dishes?.length ?? 0) > 0;
  const keepCategories = nextCategories.length === 0 && (prev.categories?.length ?? 0) > 0;

  return {
    ...prev,
    ...catalog,
    floors: keepFloors ? prev.floors : nextFloors,
    tables: keepFloors
      ? (prev.tables?.length ? prev.tables : nextTables)
      : nextTables,
    dishes: keepDishes ? prev.dishes : nextDishes,
    categories: keepCategories ? prev.categories : nextCategories,
  };
}

/**
 * Boots Dexie PosStore and projects catalog into jotai when hydrated.
 * Screens must not branch on connectivity — they read/write via posStore.
 */
export function PosStoreProvider({ children }: { children: ReactNode }) {
  const [isReady, setReady] = useState(false);
  const [isHydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setAppSettings = useSetAtom(appSettings);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await posStore.initialize();
        if (cancelled) return;
        setReady(true);
        const cursor = await posStore.getSyncCursor();
        if (cursor.catalogReady || cursor.hydrated) {
          const catalog = await posStore.loadHydratedCatalog();
          setAppSettings((prev: AppSettingsInterface) =>
            mergeHydratedCatalogIntoSettings(prev, catalog),
          );
          setHydrated(!!cursor.hydrated);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAppSettings]);

  return (
    <PosStoreContext.Provider value={{ isReady, isHydrated, error }}>
      {children}
    </PosStoreContext.Provider>
  );
}

export async function refreshCatalogIntoSettings(
  setAppSettings: (updater: (prev: AppSettingsInterface) => AppSettingsInterface) => void,
): Promise<void> {
  const epoch = posStore.getCatalogEpoch();
  const cursor = await posStore.getSyncCursor();
  // Project once catalog tables are in Dexie — do not wait for operational
  // orders. Never project an empty wipe before catalogReady.
  if (!cursor.catalogReady && !cursor.hydrated) return;
  const catalog = await posStore.loadHydratedCatalog();
  // Stale across Reload cache wipe, or wipe still in progress.
  if (epoch !== posStore.getCatalogEpoch()) return;
  const after = await posStore.getSyncCursor();
  if (!after.catalogReady && !after.hydrated) return;

  setAppSettings((prev) => mergeHydratedCatalogIntoSettings(prev, catalog));
}
