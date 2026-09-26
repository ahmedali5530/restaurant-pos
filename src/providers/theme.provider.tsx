import React, {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { useAtomValue } from 'jotai';
import { appPage } from '@/store/jotai.ts';
import { resolveBrandPalette } from '@/lib/brand-palettes.ts';
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
import { DEFAULT_CUSTOM_PRIMARY, normalizeHex } from '@/lib/derive-brand-palette.ts';

interface ThemeContextValue {
  preference: AppThemePreference;
  brand: AppBrandId;
  customPrimary: string;
  resolvedTheme: ResolvedAppTheme;
  isDark: boolean;
  palette: BrandPalette;
}

const defaultPalette = resolveBrandPalette(DEFAULT_BRAND, 'light');

const ThemeContext = createContext<ThemeContextValue>({
  preference: DEFAULT_THEME,
  brand: DEFAULT_BRAND,
  customPrimary: DEFAULT_CUSTOM_PRIMARY,
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

function syncDocumentTheme(
  resolved: ResolvedAppTheme,
  brand: AppBrandId,
  palette: BrandPalette,
  customPrimary: string,
): void {
  if (typeof document === 'undefined') return;
  const key = `${resolved}|${brand}|${customPrimary}|${palette.primary}|${palette.canvas}`;
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
  const customPrimary = normalizeHex(page.customPrimary) ?? DEFAULT_CUSTOM_PRIMARY;
  const systemPrefersDark = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemThemeSnapshot,
    () => false,
  );

  const resolvedTheme: ResolvedAppTheme =
    preference === 'system'
      ? (systemPrefersDark ? 'dark' : 'light')
      : resolveAppTheme(preference);

  const palette = resolveBrandPalette(brand, resolvedTheme, customPrimary);

  // Apply before children render so CSS vars / consumers see the current brand immediately.
  syncDocumentTheme(resolvedTheme, brand, palette, customPrimary);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      brand,
      customPrimary,
      resolvedTheme,
      isDark: resolvedTheme === 'dark',
      palette,
    }),
    [preference, brand, customPrimary, resolvedTheme, palette],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
