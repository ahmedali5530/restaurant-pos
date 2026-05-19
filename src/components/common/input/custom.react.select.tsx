import React from "react";
import Select, {components as selectComponents, GroupBase, Props} from "react-select";
import {Theme} from "react-select/dist/declarations/src/";
import Spinner from "@/assets/images/spinner.svg";

const primaryColor = "23 23 23";
const focusRingColor = "152 189 254";

export const themeConfig = (theme: Theme) => ({
  ...theme,
  borderRadius: 8,
  colors: {
    ...theme.colors,
    primary: `rgb(${primaryColor})`,
    primary25: `rgb(${primaryColor} / 25%)`,
    primary50: `rgb(${primaryColor} / 50%)`,
    primary75: `rgb(${primaryColor} / 75%)`,
  },
});

export const styleConfig = {
  control: (base: any, props: any) => {
    return {
      ...base,
      '--min-height': props.selectProps.size === 'lg' ? '48px' : '40px',
      minHeight: 'var(--min-height)',
      borderColor: `rgb(${primaryColor})`,
      borderWidth: 2,
      ":hover": {
        borderColor: `rgb(${primaryColor})`,
      },
      boxShadow: "none",
    }
  },
};

export const classNamePrefix = "rs-";

const LoadingIndicator = () => {
  return <img alt="loading..." src={Spinner} className="w-[18px] mr-2"/>;
};

const menuPortalZIndex = 1100;

const defaultMenuPortalTarget =
  typeof document !== "undefined" ? document.body : undefined;

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

  const menuPortalTarget =
    menuPortalTargetProp !== undefined
      ? menuPortalTargetProp
      : defaultMenuPortalTarget;

  return (
    <Select
      closeMenuOnSelect={!isMulti}
      {...restProps}
      isMulti={isMulti}
      theme={themeConfig}
      styles={{
        ...styleConfig,
        ...stylesProp,
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
        MenuPortal: (menuPortalProps) => {
          const Portal =
            componentsProp?.MenuPortal ?? selectComponents.MenuPortal;
          return (
            <Portal
              {...menuPortalProps}
              innerProps={{
                ...menuPortalProps.innerProps,
                "data-react-aria-top-layer": "true",
              } as typeof menuPortalProps.innerProps}
            />
          );
        },
        LoadingIndicator: componentsProp?.LoadingIndicator ?? LoadingIndicator,
      }}
    />
  );
}
