import type { ThemeConfig } from "antd/es/config-provider";

/** Matches app `tailwind` neutral scale and input chrome (border-2 neutral-900, h-40). */
const neutral900 = "#171717";
const neutral800 = "#262626";
const neutral700 = "#404040";
const neutral500 = "#737373";
const neutral200 = "#e5e5e5";
const neutral100 = "#f5f5f5";
const white = "#ffffff";
const warning500 = "#FFA514";

export const appAntdTheme: ThemeConfig = {
  token: {
    colorPrimary: neutral900,
    colorInfo: neutral900,
    colorSuccess: "#3DE567",
    colorWarning: warning500,
    colorError: "#F43A30",
    colorText: neutral700,
    colorTextSecondary: neutral500,
    colorTextPlaceholder: neutral500,
    colorBgContainer: white,
    colorBorder: neutral900,
    colorSplit: neutral200,
    borderRadius: 8,
    borderRadiusLG: 8,
    fontFamily: '"Urbanist", sans-serif',
    fontFamilyCode: '"Urbanist", sans-serif',
    controlHeight: 40,
    controlHeightLG: 48,
    controlOutline: "transparent",
    controlOutlineWidth: 0,
    lineWidth: 2,
    lineWidthFocus: 2
  },
  components: {
    DatePicker: {
      colorPrimary: neutral900,
      colorBgElevated: white,
      colorBorder: neutral900,
      hoverBorderColor: neutral800,
      activeBorderColor: neutral900,
      activeShadow: "none",
      errorActiveShadow: "none",
      warningActiveShadow: "none",
      cellHoverBg: neutral100,
      cellActiveWithRangeBg: neutral200,
      cellHoverWithRangeBg: warning500,
      cellRangeBorderColor: neutral900,
      cellBgDisabled: neutral100,
      multipleItemBg: neutral100,
      presetsMaxWidth: 200,
    },
    Calendar: {
      fullBg: "transparent",
      fullPanelBg: white,
      itemActiveBg: neutral900,
      colorPrimary: neutral900,
    },
    Select: {
      optionSelectedBg: neutral900,
      optionSelectedColor: warning500
    },
    Button: {
      primaryColor: warning500,
      ghostBg: neutral900
    }
  },
};
