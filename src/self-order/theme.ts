/**
 * Applies the brand/light-dark theme to the public QR self-order page.
 *
 * The page is a separate bundle from the POS, so it can't use ThemeProvider —
 * this maps the same brand palettes (`brand-palettes.ts`) onto the page's
 * `--so-*` tokens so the customer page matches the configured app colors.
 */
import { resolveBrandPalette } from '@/lib/brand-palettes.ts';
import { BRAND_IDS } from '@/lib/theme.ts';
import type { AppBrandId, ResolvedAppTheme } from '@/lib/theme.ts';

export type SelfOrderThemeMode = 'light' | 'dark' | 'system';

const BRAND_SET = new Set<string>(BRAND_IDS);

type Rgb = { r: number; g: number; b: number };

const parseChannels = (value: string): Rgb => {
  const [r, g, b] = value.trim().split(/\s+/).map(Number);
  return { r: r || 0, g: g || 0, b: b || 0 };
};

const toChannels = ({ r, g, b }: Rgb): string =>
  `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;

const toCss = (rgb: Rgb): string => `rgb(${toChannels(rgb)})`;

const mix = (a: Rgb, b: Rgb, weightA: number): Rgb => ({
  r: a.r * weightA + b.r * (1 - weightA),
  g: a.g * weightA + b.g * (1 - weightA),
  b: a.b * weightA + b.b * (1 - weightA),
});

export const normalizeSelfOrderBrand = (brand: string | undefined): AppBrandId =>
  (brand && BRAND_SET.has(brand) ? brand : 'classic') as AppBrandId;

export const isSelfOrderThemeMode = (mode: unknown): mode is SelfOrderThemeMode =>
  mode === 'light' || mode === 'dark' || mode === 'system';

export function resolveSelfOrderTheme(
  mode: string | undefined,
  prefersDark: boolean,
): ResolvedAppTheme {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  return prefersDark ? 'dark' : 'light';
}

export const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;

export function applySelfOrderTheme(
  brandInput: string | undefined,
  modeInput: string | undefined,
  customPrimary?: string | null,
): void {
  if (typeof document === 'undefined') return;

  const brand = normalizeSelfOrderBrand(brandInput);
  const mode = resolveSelfOrderTheme(modeInput, systemPrefersDark());
  const palette = resolveBrandPalette(brand, mode, customPrimary);

  const canvas = parseChannels(palette.canvas);
  const foreground = parseChannels(palette.foreground);
  const primary = parseChannels(palette.primary);
  const primaryFg = parseChannels(palette.primaryFg);
  // Accent readable on the light/dark page surface (for text, dots, prices).
  const accentOnPaper = mix(primary, foreground, 0.55);

  const root = document.documentElement;
  root.dataset.soTheme = mode;
  root.style.colorScheme = mode;

  const setColor = (name: string, rgb: Rgb) =>
    root.style.setProperty(name, toCss(rgb));

  setColor('--so-paper', canvas);
  setColor('--so-card', parseChannels(palette.surfaceElevated));
  setColor('--so-line', parseChannels(palette.border));
  setColor('--so-muted', parseChannels(palette.muted));
  setColor('--so-fg', foreground);
  setColor('--so-ink', primary);
  setColor('--so-on-ink', primaryFg);
  setColor('--so-gold', primary);
  setColor('--so-gold-soft', primaryFg);
  setColor('--so-gold-ink', accentOnPaper);

  // Channel triples so CSS can apply alpha (e.g. rgb(var(--so-on-ink-rgb) / .2)).
  root.style.setProperty('--so-ink-rgb', toChannels(primary));
  root.style.setProperty('--so-on-ink-rgb', toChannels(primaryFg));
  root.style.setProperty('--so-gold-rgb', toChannels(primary));
}

/** Re-applies on OS theme changes while the configured mode is `system`. */
export function watchSelfOrderTheme(
  brand: string | undefined,
  mode: string | undefined,
  customPrimary?: string | null,
  onChange?: (resolved: ResolvedAppTheme) => void,
): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  if (mode !== 'system') {
    applySelfOrderTheme(brand, mode, customPrimary);
    return () => undefined;
  }

  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    applySelfOrderTheme(brand, mode, customPrimary);
    onChange?.(resolveSelfOrderTheme(mode, query.matches));
  };
  applySelfOrderTheme(brand, mode, customPrimary);
  query.addEventListener('change', handler);
  return () => query.removeEventListener('change', handler);
}
