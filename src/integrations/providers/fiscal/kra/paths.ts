export type KraMode = 'oscu' | 'vscu';

export type KraApiAction =
  | 'init'
  | 'saveItem'
  | 'saveSales'
  | 'saveStockIo'
  | 'saveStockMaster';

/** OSCU cloud paths vs VSCU local JAR paths (KRA eTIMS Spec v2.0). */
const PATHS: Record<KraMode, Record<KraApiAction, string>> = {
  oscu: {
    init: '/selectInitOsdcInfo',
    saveItem: '/saveItem',
    saveSales: '/saveTrnsSalesOsdc',
    saveStockIo: '/insertStockIO',
    saveStockMaster: '/saveStockMaster',
  },
  vscu: {
    init: '/initializer/selectInitInfo',
    saveItem: '/items/saveItems',
    saveSales: '/trnsSales/saveSales',
    saveStockIo: '/stock/saveStockItems',
    saveStockMaster: '/stockMaster/saveStockMaster',
  },
};

export const getKraPath = (mode: KraMode, action: KraApiAction): string => {
  return PATHS[mode]?.[action] ?? PATHS.oscu[action];
};

export const joinKraUrl = (baseUrl: string, path: string): string => {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
};
