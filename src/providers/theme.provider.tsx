import React, {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useAtomValue } from 'jotai';
import { appPage } from '@/store/jotai.ts';
import { getBrandPalette } from '@/lib/brand-palettes.ts';
import {
  applyBrandId,
  applyBrandPalette,
  applyDocumentTheme,
  DEFAULT_BRAND,
  DEFAULT_THEME,
  isAppBrandId,
  isAppThemePreference,
  resolveAppTheme,
  type AppBrandId,
  type AppThemePreference,
  type BrandPalette,
  type ResolvedAppTheme,
} from '@/lib/theme.ts';

interface ThemeContextValue {
  preference: AppThemePreference;
  brand: AppBrandId;
  resolvedTheme: ResolvedAppTheme;
  isDark: boolean;
  palette: BrandPalette;
}

const defaultPalette = getBrandPalette(DEFAULT_BRAND, 'light');

const ThemeContext = createContext<ThemeContextValue>({
  preference: DEFAULT_THEME,
  brand: DEFAULT_BRAND,
  resolvedTheme: 'light',
  isDark: false,
  palette: defaultPalette,
});

function subscribeSystemTheme(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onStoreChange);
  return () => media.removeEventListener('change', onStoreChange);
}

function getSystemThemeSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Last applied signature — skip redundant DOM writes across Strict Mode double-renders. */
let lastAppliedKey = '';

function syncDocumentTheme(resolved: ResolvedAppTheme, brand: AppBrandId, palette: BrandPalette): void {
  if (typeof document === 'undefined') return;
  const key = `${resolved}|${brand}|${palette.primary}|${palette.canvas}`;
  if (key === lastAppliedKey) return;
  lastAppliedKey = key;
  applyDocumentTheme(resolved);
  applyBrandId(brand);
  applyBrandPalette(palette);
}

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const page = useAtomValue(appPage);
  const preference = isAppThemePreference(page.theme) ? page.theme : DEFAULT_THEME;
  const brand = isAppBrandId(page.brand) ? page.brand : DEFAULT_BRAND;
  const systemPrefersDark = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemThemeSnapshot,
    () => false,
  );

  const resolvedTheme: ResolvedAppTheme =
    preference === 'system'
      ? (systemPrefersDark ? 'dark' : 'light')
      : resolveAppTheme(preference);

  const palette = getBrandPalette(brand, resolvedTheme);

  // Apply before children render so CSS vars / consumers see the current brand immediately.
  syncDocumentTheme(resolvedTheme, brand, palette);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      brand,
      resolvedTheme,
      isDark: resolvedTheme === 'dark',
      palette,
    }),
    [preference, brand, resolvedTheme, palette],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
