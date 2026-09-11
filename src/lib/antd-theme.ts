import type { ThemeConfig } from "antd/es/config-provider";
import antdTheme from "antd/es/theme";
import { getBrandPalette } from "@/lib/brand-palettes.ts";
import {
  paletteRgb,
  rgbChannelsToHex,
  type BrandPalette,
} from "@/lib/theme.ts";

/** Matches app `tailwind` neutral scale and input chrome (border-2 neutral-900, h-40). */
const neutral900 = "#171717";
const neutral800 = "#262626";
const neutral700 = "#404040";
const neutral500 = "#737373";
const neutral400 = "#a3a3a3";
const neutral200 = "#e5e5e5";
const neutral100 = "#f5f5f5";

function accentsFromPalette(palette: BrandPalette) {
  return {
    primary: paletteRgb(palette.primary),
    primaryHex: rgbChannelsToHex(palette.primary, "#0046FE"),
    warning: paletteRgb(palette.warning),
    warningHex: rgbChannelsToHex(palette.warning, "#FFA514"),
    danger: paletteRgb(palette.danger),
    success: paletteRgb(palette.success),
    info: paletteRgb(palette.info),
    canvas: paletteRgb(palette.canvas),
    surface: paletteRgb(palette.surface),
    surfaceElevated: paletteRgb(palette.surfaceElevated),
    foreground: paletteRgb(palette.foreground),
    muted: paletteRgb(palette.muted),
    border: paletteRgb(palette.border),
    primaryFg: paletteRgb(palette.primaryFg),
  };
}

export function getAppAntdTheme(isDark: boolean, palette?: BrandPalette): ThemeConfig {
  const resolved = palette ?? getBrandPalette("classic", isDark ? "dark" : "light");
  const accents = accentsFromPalette(resolved);
  const warningColor = accents.warningHex;

  const lightToken: ThemeConfig["token"] = {
    colorPrimary: accents.primaryHex,
    colorInfo: rgbChannelsToHex(resolved.info),
    colorSuccess: rgbChannelsToHex(resolved.success),
    colorWarning: accents.warningHex,
    colorError: rgbChannelsToHex(resolved.danger),
    colorText: accents.foreground,
    colorTextSecondary: accents.muted,
    colorTextPlaceholder: accents.muted,
    colorBgContainer: accents.surfaceElevated,
    colorBgElevated: accents.surfaceElevated,
    colorBgLayout: accents.surface,
    colorBorder: accents.border,
    colorSplit: accents.border,
    borderRadius: 8,
    borderRadiusLG: 8,
    fontFamily: '"Urbanist", sans-serif',
    fontFamilyCode: '"Urbanist", sans-serif',
    controlHeight: 40,
    controlHeightLG: 48,
    controlOutline: "transparent",
    controlOutlineWidth: 0,
    lineWidth: 2,
    lineWidthFocus: 2,
  };

  const darkToken: ThemeConfig["token"] = {
    ...lightToken,
    colorPrimary: accents.primaryHex,
    colorInfo: rgbChannelsToHex(resolved.info),
    colorText: accents.foreground,
    colorTextSecondary: accents.muted,
    colorTextPlaceholder: neutral500,
    colorBgContainer: accents.surfaceElevated,
    colorBgElevated: accents.surfaceElevated,
    colorBgLayout: accents.canvas,
    colorBorder: accents.border,
    colorSplit: accents.border,
  };

  const lightComponents: ThemeConfig["components"] = {
    DatePicker: {
      colorPrimary: accents.primaryHex,
      colorBgElevated: accents.surfaceElevated,
      colorBorder: accents.border,
      hoverBorderColor: accents.primaryHex,
      activeBorderColor: accents.primaryHex,
      activeShadow: "none",
      errorActiveShadow: "none",
      warningActiveShadow: "none",
      cellHoverBg: neutral100,
      cellActiveWithRangeBg: neutral200,
      cellHoverWithRangeBg: warningColor,
      cellRangeBorderColor: accents.primaryHex,
      cellBgDisabled: neutral100,
      multipleItemBg: neutral100,
      presetsMaxWidth: 200,
    },
    Calendar: {
      fullBg: "transparent",
      fullPanelBg: accents.surfaceElevated,
      itemActiveBg: accents.primaryHex,
      colorPrimary: accents.primaryHex,
    },
    Select: {
      optionSelectedBg: accents.primaryHex,
      optionSelectedColor: accents.primaryFg,
    },
    Button: {
      primaryColor: accents.primaryFg,
      ghostBg: accents.primaryHex,
    },
  };

  const darkComponents: ThemeConfig["components"] = {
    DatePicker: {
      colorPrimary: accents.primaryHex,
      colorBgElevated: accents.surfaceElevated,
      colorBorder: accents.border,
      hoverBorderColor: neutral400,
      activeBorderColor: accents.primaryHex,
      activeShadow: "none",
      errorActiveShadow: "none",
      warningActiveShadow: "none",
      cellHoverBg: neutral700,
      cellActiveWithRangeBg: neutral700,
      cellHoverWithRangeBg: warningColor,
      cellRangeBorderColor: accents.primaryHex,
      cellBgDisabled: neutral900,
      multipleItemBg: neutral700,
      presetsMaxWidth: 200,
    },
    Calendar: {
      fullBg: "transparent",
      fullPanelBg: accents.surfaceElevated,
      itemActiveBg: accents.primaryHex,
      colorPrimary: accents.primaryHex,
    },
    Select: {
      optionSelectedBg: accents.primaryHex,
      optionSelectedColor: accents.primaryFg,
    },
    Button: {
      primaryColor: accents.primaryFg,
      ghostBg: accents.surfaceElevated,
    },
  };

  if (isDark) {
    return {
      algorithm: antdTheme.darkAlgorithm,
      token: darkToken,
      components: darkComponents,
    };
  }

  return {
    token: lightToken,
    components: lightComponents,
  };
}

/** @deprecated Prefer getAppAntdTheme(false, palette) */
export const appAntdTheme: ThemeConfig = getAppAntdTheme(false);

/** @deprecated Prefer getAppAntdTheme(true, palette) */
export const appAntdDarkTheme: ThemeConfig = getAppAntdTheme(true);
