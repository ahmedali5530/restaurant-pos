export type AppThemePreference = 'light' | 'dark' | 'system';
export type ResolvedAppTheme = 'light' | 'dark';
export type AppBrandId = 'classic' | 'ocean' | 'forest' | 'cream' | 'ruby' | 'sapphire';

/** RGB channel triples without `rgb()` — e.g. "0 70 254" */
export type BrandPalette = {
  canvas: string;
  surface: string;
  surfaceElevated: string;
  foreground: string;
  muted: string;
  border: string;
  primary: string;
  primaryFg: string;
  warning: string;
  danger: string;
  success: string;
  info: string;
};

export const DEFAULT_THEME: AppThemePreference = 'system';
export const DEFAULT_BRAND: AppBrandId = 'classic';

export const THEME_PREFERENCES: AppThemePreference[] = ['light', 'dark', 'system'];
export const BRAND_IDS: AppBrandId[] = ['classic', 'ocean', 'forest', 'cream', 'ruby', 'sapphire'];

export const BRAND_PALETTE_KEYS: (keyof BrandPalette)[] = [
  'canvas',
  'surface',
  'surfaceElevated',
  'foreground',
  'muted',
  'border',
  'primary',
  'primaryFg',
  'warning',
  'danger',
  'success',
  'info',
];

const CSS_VAR_BY_KEY: Record<keyof BrandPalette, string> = {
  canvas: '--canvas',
  surface: '--surface',
  surfaceElevated: '--surface-elevated',
  foreground: '--foreground',
  muted: '--muted',
  border: '--border',
  primary: '--primary',
  primaryFg: '--primary-fg',
  warning: '--warning',
  danger: '--danger',
  success: '--success',
  info: '--info',
};

export function isAppThemePreference(value: unknown): value is AppThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function isAppBrandId(value: unknown): value is AppBrandId {
  return typeof value === 'string' && (BRAND_IDS as string[]).includes(value);
}

export function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveAppTheme(preference: AppThemePreference = DEFAULT_THEME): ResolvedAppTheme {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return getSystemPrefersDark() ? 'dark' : 'light';
}

export function applyDocumentTheme(resolved: ResolvedAppTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.dataset.theme = resolved;
}

export function applyBrandPalette(palette: BrandPalette): void {
  const root = document.documentElement;
  for (const key of BRAND_PALETTE_KEYS) {
    root.style.setProperty(CSS_VAR_BY_KEY[key], palette[key]);
  }
}

export function applyBrandId(brand: AppBrandId): void {
  document.documentElement.dataset.brand = brand;
}

/** Read a CSS RGB-channel var as `rgb(r g b)` for libraries that need full color strings. */
export function cssVarRgb(varName: string, fallback = '115 115 115'): string {
  if (typeof window === 'undefined') return `rgb(${fallback})`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return `rgb(${raw || fallback})`;
}

/** Convert `"r g b"` channel string to `#rrggbb` (for Ant Design tokens). */
export function rgbChannelsToHex(channels: string, fallback = '#000000'): string {
  const parts = channels.trim().split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return fallback;
  return `#${parts
    .slice(0, 3)
    .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
    .join('')}`;
}

export function paletteRgb(channels: string): string {
  return `rgb(${channels})`;
}
