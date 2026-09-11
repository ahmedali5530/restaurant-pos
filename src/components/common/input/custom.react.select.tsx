import React, {ComponentProps, useLayoutEffect, useMemo, useRef} from "react";
import Select, {
  components as selectComponents,
  GroupBase,
  Props,
  StylesConfig,
  type Theme,
} from "react-select";
import Spinner from "@/assets/images/spinner.svg";
import {useTheme} from "@/providers/theme.provider.tsx";
import type {BrandPalette} from "@/lib/theme.ts";
import {paletteRgb} from "@/lib/theme.ts";

/**
 * Live CSS-variable styles — always match the current brand after ThemeProvider sync.
 * Avoid getComputedStyle snapshots (those lag one brand change behind).
 */
export const createStyleConfig = (isDark: boolean): StylesConfig => {
  return {
    control: (base, props) => ({
      ...base,
      "--min-height": (props.selectProps as { size?: string }).size === "lg" ? "48px" : "40px",
      minHeight: "var(--min-height)",
      backgroundColor: "rgb(var(--surface-elevated))",
      borderColor: "rgb(var(--border))",
      borderWidth: 2,
      color: "rgb(var(--foreground))",
      ":hover": {
        borderColor: isDark ? "rgb(var(--muted))" : "rgb(var(--primary))",
      },
      boxShadow: "none",
    }),
    dropdownIndicator: (base) => ({
      ...base,
      color: "rgb(var(--muted))",
      ":hover": {
        color: "rgb(var(--foreground))",
      },
    }),
    clearIndicator: (base) => ({
      ...base,
      color: "rgb(var(--muted))",
      ":hover": {
        color: "rgb(var(--foreground))",
      },
    }),
    indicatorSeparator: (base) => ({
      ...base,
      backgroundColor: "rgb(var(--border))",
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: "rgb(var(--surface-elevated))",
      color: "rgb(var(--foreground))",
      border: "1px solid rgb(var(--border))",
      boxShadow: isDark ? "0 8px 24px rgb(0 0 0 / 45%)" : base.boxShadow,
    }),
    menuList: (base) => ({
      ...base,
      backgroundColor: "rgb(var(--surface-elevated))",
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "rgb(var(--primary))"
        : state.isFocused
          ? (isDark ? "rgb(55 55 55)" : "rgb(var(--primary) / 12%)")
          : "transparent",
      color: state.isSelected
        ? "rgb(var(--primary-fg))"
        : "rgb(var(--foreground))",
      ":active": {
        backgroundColor: isDark ? "rgb(82 82 82)" : "rgb(var(--primary) / 20%)",
      },
    }),
    singleValue: (base) => ({
      ...base,
      color: "rgb(var(--foreground))",
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: isDark ? "rgb(64 64 64)" : "rgb(var(--surface))",
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: "rgb(var(--foreground))",
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: "rgb(var(--muted))",
      ":hover": {
        backgroundColor: "rgb(var(--border))",
        color: "rgb(var(--foreground))",
      },
    }),
    input: (base) => ({
      ...base,
      color: "rgb(var(--foreground))",
    }),
    placeholder: (base) => ({
      ...base,
      color: "rgb(var(--muted))",
    }),
  };
};

/** Theme colors from the JS brand palette (no getComputedStyle). */
export const themeConfig = (theme: Theme, palette: BrandPalette, isDark = false) => {
  const focus = isDark ? palette.muted : palette.primary;
  return {
    ...theme,
    borderRadius: 8,
    colors: {
      ...theme.colors,
      primary: paletteRgb(focus),
      primary25: isDark ? paletteRgb("64 64 64") : paletteRgb(`${palette.primary} / 25%`),
      primary50: isDark ? paletteRgb("82 82 82") : paletteRgb(`${palette.primary} / 50%`),
      primary75: isDark ? paletteRgb("115 115 115") : paletteRgb(`${palette.primary} / 75%`),
      neutral0: paletteRgb(palette.surfaceElevated),
      neutral5: paletteRgb(palette.surfaceElevated),
      neutral10: isDark ? paletteRgb("64 64 64") : paletteRgb(palette.surface),
      neutral20: paletteRgb(palette.border),
      neutral30: isDark ? paletteRgb("82 82 82") : paletteRgb("212 212 212"),
      neutral40: paletteRgb(palette.muted),
      neutral50: paletteRgb(palette.muted),
      neutral60: isDark ? paletteRgb("212 212 212") : paletteRgb("82 82 82"),
      neutral70: paletteRgb(palette.foreground),
      neutral80: paletteRgb(palette.foreground),
      neutral90: isDark ? paletteRgb("250 250 250") : paletteRgb("23 23 23"),
    },
  };
};

/** @deprecated Prefer createStyleConfig(isDark); kept for callers that import styleConfig. */
export const styleConfig = createStyleConfig(false);

export const classNamePrefix = "rs-";

const LoadingIndicator = () => {
  return <img alt="loading..." src={Spinner} className="w-[18px] mr-2"/>;
};

const menuPortalZIndex = 1100;

const defaultMenuPortalTarget =
  typeof document !== "undefined" ? document.body : undefined;

const ensureTopLayerInteractive = (element: HTMLElement | null) => {
  if (!element) return;
  element.dataset.reactAriaTopLayer = "true";
  element.inert = false;
  element.removeAttribute("aria-hidden");
};

function TopLayerMenuPortal(props: ComponentProps<typeof selectComponents.MenuPortal> & {
  Portal: typeof selectComponents.MenuPortal;
}) {
  const {Portal, ...menuPortalProps} = props;
  const portalRef = useRef<HTMLDivElement | null>(null);
  const {innerProps, ...rest} = menuPortalProps;

  useLayoutEffect(() => {
    ensureTopLayerInteractive(portalRef.current);
  });

  const setPortalRef = (node: HTMLDivElement | null) => {
    portalRef.current = node;
    const existingRef = innerProps?.ref;
    if (typeof existingRef === "function") {
      existingRef(node);
    } else if (existingRef && typeof existingRef === "object") {
      (existingRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
    if (node) {
      ensureTopLayerInteractive(node);
    }
  };

  return (
    <Portal
      {...rest}
      innerProps={{
        ...innerProps,
        ref: setPortalRef,
        "data-react-aria-top-layer": "true",
      } as typeof innerProps}
    />
  );
}

export function ReactSelect<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>
>(props: Props<Option, IsMulti, Group>) {
  const {
    styles: stylesProp,
    components: componentsProp,
    menuPortalTarget: menuPortalTargetProp,
    isMulti,
    ...restProps
  } = props;

  const { isDark, palette } = useTheme();
  const themedStyles = useMemo(
    () => createStyleConfig(isDark),
    [isDark],
  );

  const menuPortalTarget =
    menuPortalTargetProp !== undefined
      ? menuPortalTargetProp
      : defaultMenuPortalTarget;

  const BaseMenuPortal = componentsProp?.MenuPortal ?? selectComponents.MenuPortal;

  return (
    <Select
      closeMenuOnSelect={!isMulti}
      {...restProps}
      isMulti={isMulti}
      theme={(theme) => themeConfig(theme, palette, isDark)}
      styles={{
        ...themedStyles,
        ...stylesProp,
        control: (base, state) => {
          const themed = themedStyles.control?.(base, state as never) ?? base;
          const overridden = stylesProp?.control?.(themed as typeof base, state as never);
          return overridden ?? themed;
        },
        menuPortal: (base, state) => ({
          ...(stylesProp?.menuPortal?.(base, state) ?? base),
          zIndex: menuPortalZIndex,
        }),
      }}
      menuShouldScrollIntoView={false}
      menuPosition="fixed"
      menuPlacement="auto"
      menuPortalTarget={menuPortalTarget}
      classNamePrefix={classNamePrefix}
      components={{
        ...componentsProp,
        MenuPortal: (menuPortalProps) => (
          <TopLayerMenuPortal
            {...menuPortalProps}
            Portal={BaseMenuPortal as typeof selectComponents.MenuPortal}
          />
        ),
        LoadingIndicator: componentsProp?.LoadingIndicator ?? LoadingIndicator,
      }}
    />
  );
}
