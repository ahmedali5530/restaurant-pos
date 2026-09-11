import type { AppBrandId, BrandPalette, ResolvedAppTheme } from '@/lib/theme.ts';

/** Default app palette — matches historical primary/warning/success scales. */
const classicLight: BrandPalette = {
  canvas: '245 232 211',
  surface: '250 244 235',
  surfaceElevated: '255 255 255',
  foreground: '55 38 20',
  muted: '115 91 61',
  border: '230 211 181',
  primary: '255 165 20',
  primaryFg: '45 28 5',
  warning: '180 83 9',
  danger: '185 28 28',
  success: '21 128 61',
  info: '13 148 136',
};

const classicDark: BrandPalette = {
  canvas: '20 15 9',
  surface: '30 23 14',
  surfaceElevated: '43 32 18',
  foreground: '250 239 218',
  muted: '194 166 121',
  border: '72 55 31',
  primary: '255 165 20',
  primaryFg: '35 22 4',
  warning: '251 191 36',
  danger: '252 165 165',
  success: '134 239 172',
  info: '45 212 191',
};

const oceanLight: BrandPalette = {
  canvas: '207 232 237',
  surface: '240 249 251',
  surfaceElevated: '255 255 255',
  foreground: '15 55 70',
  muted: '71 110 125',
  border: '186 220 228',
  primary: '8 145 178',
  primaryFg: '255 255 255',
  warning: '217 119 6',
  danger: '220 38 38',
  success: '5 150 105',
  info: '14 165 233',
};

const oceanDark: BrandPalette = {
  canvas: '8 18 24',
  surface: '15 32 40',
  surfaceElevated: '22 45 55',
  foreground: '226 242 247',
  muted: '148 196 210',
  border: '35 70 85',
  primary: '34 211 238',
  primaryFg: '8 18 24',
  warning: '251 191 36',
  danger: '248 113 113',
  success: '52 211 153',
  info: '56 189 248',
};

const forestLight: BrandPalette = {
  canvas: '220 228 214',
  surface: '245 247 240',
  surfaceElevated: '255 255 255',
  foreground: '30 45 28',
  muted: '90 110 85',
  border: '210 220 200',
  primary: '22 101 52',
  primaryFg: '255 255 255',
  warning: '180 83 9',
  danger: '185 28 28',
  success: '21 128 61',
  info: '13 148 136',
};

const forestDark: BrandPalette = {
  canvas: '12 16 11',
  surface: '22 28 20',
  surfaceElevated: '32 40 28',
  foreground: '236 242 230',
  muted: '180 200 170',
  border: '50 65 45',
  primary: '74 222 128',
  primaryFg: '12 16 11',
  warning: '251 191 36',
  danger: '252 165 165',
  success: '134 239 172',
  info: '45 212 191',
};

const creamLight: BrandPalette = {
  canvas: '244 239 220',
  surface: '251 248 236',
  surfaceElevated: '255 254 248',
  foreground: '58 52 32',
  muted: '125 116 82',
  border: '228 220 193',
  primary: '190 157 54',
  primaryFg: '255 252 235',
  warning: '180 83 9',
  danger: '185 28 28',
  success: '21 128 61',
  info: '13 148 136',
};

const creamDark: BrandPalette = {
  canvas: '22 20 13',
  surface: '32 29 19',
  surfaceElevated: '45 41 27',
  foreground: '247 241 218',
  muted: '190 180 140',
  border: '70 64 40',
  primary: '232 204 112',
  primaryFg: '48 40 14',
  warning: '251 191 36',
  danger: '252 165 165',
  success: '134 239 172',
  info: '45 212 191',
};

const rubyLight: BrandPalette = {
  canvas: '242 224 226',
  surface: '250 242 243',
  surfaceElevated: '255 255 255',
  foreground: '58 27 32',
  muted: '120 79 85',
  border: '228 201 205',
  primary: '157 23 57',
  primaryFg: '255 255 255',
  warning: '194 116 10',
  danger: '185 28 28',
  success: '21 128 61',
  info: '13 148 136',
};

const rubyDark: BrandPalette = {
  canvas: '21 10 14',
  surface: '32 16 21',
  surfaceElevated: '46 22 30',
  foreground: '248 232 235',
  muted: '193 151 160',
  border: '70 38 46',
  primary: '244 63 94',
  primaryFg: '45 10 19',
  warning: '251 191 36',
  danger: '252 165 165',
  success: '134 239 172',
  info: '45 212 191',
};

const sapphireLight: BrandPalette = {
  canvas: '225 229 245',
  surface: '244 246 252',
  surfaceElevated: '255 255 255',
  foreground: '28 35 65',
  muted: '88 98 130',
  border: '205 211 232',
  primary: '67 56 202',
  primaryFg: '255 255 255',
  warning: '202 138 4',
  danger: '190 38 38',
  success: '22 128 80',
  info: '8 145 178',
};

const sapphireDark: BrandPalette = {
  canvas: '12 14 27',
  surface: '21 24 42',
  surfaceElevated: '31 35 58',
  foreground: '235 237 250',
  muted: '165 170 198',
  border: '51 57 88',
  primary: '129 120 255',
  primaryFg: '18 15 35',
  warning: '250 204 21',
  danger: '248 113 113',
  success: '74 222 128',
  info: '56 189 248',
};

export const BRAND_PALETTES: Record<AppBrandId, Record<ResolvedAppTheme, BrandPalette>> = {
  classic: { light: classicLight, dark: classicDark },
  ocean: { light: oceanLight, dark: oceanDark },
  forest: { light: forestLight, dark: forestDark },
  cream: { light: creamLight, dark: creamDark },
  ruby: { light: rubyLight, dark: rubyDark },
  sapphire: { light: sapphireLight, dark: sapphireDark },
};

export function getBrandPalette(brand: AppBrandId, mode: ResolvedAppTheme): BrandPalette {
  return BRAND_PALETTES[brand]?.[mode] ?? BRAND_PALETTES.classic[mode];
}
