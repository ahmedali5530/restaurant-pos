import type { BrandPalette, ResolvedAppTheme } from '@/lib/theme.ts';

/** Classic-blue fallback when Custom is selected without a saved color. */
export const DEFAULT_CUSTOM_PRIMARY = '#0046FE';

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  return `#${m[1].toLowerCase()}`;
}

export function isValidHexColor(value: unknown): value is string {
  return normalizeHex(value) !== null;
}

function hexToRgb(hex: string): Rgb {
  const n = normalizeHex(hex) ?? DEFAULT_CUSTOM_PRIMARY;
  const v = n.slice(1);
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

function rgbToChannels({ r, g, b }: Rgb): string {
  return `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
      break;
    case gn:
      h = ((bn - rn) / d + 2) / 6;
      break;
    default:
      h = ((rn - gn) / d + 4) / 6;
      break;
  }
  return { h: h * 360, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hh = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hh) * 255),
    b: Math.round(hue2rgb(p, q, hh - 1 / 3) * 255),
  };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** Pick white or near-black foreground for contrast on `bg`. */
export function contrastingForeground(bg: Rgb): string {
  // WCAG-ish: prefer white on dark-ish primaries
  return relativeLuminance(bg) > 0.45 ? '23 23 23' : '255 255 255';
}

/**
 * Build a full light/dark BrandPalette from a single primary hex.
 * Surfaces/muted/border share the primary hue; status colors stay semantic.
 */
export function deriveBrandPalette(
  hex: string,
  mode: ResolvedAppTheme,
): BrandPalette {
  const seed = normalizeHex(hex) ?? DEFAULT_CUSTOM_PRIMARY;
  const base = hexToRgb(seed);
  const { h, s } = rgbToHsl(base);
  const sat = clamp01(Math.max(s, 0.35));

  if (mode === 'light') {
    const primaryRgb = hslToRgb({ h, s: sat, l: clamp01(Math.min(Math.max(rgbToHsl(base).l, 0.38), 0.55)) });
    return {
      canvas: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.25), l: 0.86 })),
      surface: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.12), l: 0.97 })),
      surfaceElevated: '255 255 255',
      foreground: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.35), l: 0.22 })),
      muted: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.2), l: 0.42 })),
      border: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.18), l: 0.88 })),
      primary: rgbToChannels(primaryRgb),
      primaryFg: contrastingForeground(primaryRgb),
      warning: '217 119 6',
      danger: '220 38 38',
      success: '5 150 105',
      info: '14 165 233',
    };
  }

  // Dark: lift primary for readability on dark surfaces
  const primaryRgb = hslToRgb({ h, s: clamp01(sat * 0.85), l: clamp01(Math.max(rgbToHsl(base).l, 0.58)) });
  const elevated = hslToRgb({ h, s: clamp01(sat * 0.25), l: 0.18 });
  return {
    canvas: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.2), l: 0.06 })),
    surface: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.22), l: 0.11 })),
    surfaceElevated: rgbToChannels(elevated),
    foreground: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.15), l: 0.93 })),
    muted: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.25), l: 0.72 })),
    border: rgbToChannels(hslToRgb({ h, s: clamp01(sat * 0.28), l: 0.26 })),
    primary: rgbToChannels(primaryRgb),
    primaryFg: contrastingForeground(primaryRgb),
    warning: '251 191 36',
    danger: '248 113 113',
    success: '52 211 153',
    info: '56 189 248',
  };
}

/** Preview swatches for Settings (does not mutate DOM). */
export function previewCustomSwatches(hex: string): { light: BrandPalette; dark: BrandPalette } {
  return {
    light: deriveBrandPalette(hex, 'light'),
    dark: deriveBrandPalette(hex, 'dark'),
  };
}
