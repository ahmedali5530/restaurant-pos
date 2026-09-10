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
        if (cursor.hydrated) {
          const catalog = await posStore.loadHydratedCatalog();
          setAppSettings((prev: AppSettingsInterface) => ({
            ...prev,
            ...catalog,
          }));
          setHydrated(true);
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
  const cursor = await posStore.getSyncCursor();
  // Never project an empty wipe over a populated jotai cache mid-hydrate /
  // mid Reload cache — wait until the snapshot has finished.
  if (!cursor.hydrated) return;
  const catalog = await posStore.loadHydratedCatalog();
  setAppSettings((prev) => {
    const nextFloors = catalog.floors ?? [];
    const nextTables = catalog.tables ?? [];
    if (
      nextFloors.length === 0
      && (prev.floors?.length ?? 0) > 0
    ) {
      // Keep prior floors/tables if Dexie returned empty unexpectedly after hydrate.
      return {
        ...prev,
        ...catalog,
        floors: prev.floors,
        tables: prev.tables?.length ? prev.tables : nextTables,
      };
    }
    return { ...prev, ...catalog };
  });
}
