import {ReactNode} from "react";
import {TooltipTrigger} from "react-aria-components";
import {Button} from "@/components/common/input/button.tsx";
import {Tooltip} from "@/components/common/react-aria/tooltip.tsx";
import {IconProp} from "@fortawesome/fontawesome-svg-core";
import type {ComponentProps} from "react";

type ButtonProps = ComponentProps<typeof Button>;

interface Props extends Omit<ButtonProps, "children" | "aria-label"> {
  label: string;
  children?: ReactNode;
  icon?: IconProp;
}

/** Icon-only button wrapped with a localized tooltip and aria-label. */
export const IconTooltipButton = ({
  label,
  children,
  icon,
  iconButton = true,
  ...buttonProps
}: Props) => (
  <TooltipTrigger delay={0} closeDelay={0}>
    <Button
      {...buttonProps}
      icon={icon}
      iconButton={iconButton}
      aria-label={label}
    >
      {children}
    </Button>
    <Tooltip>{label}</Tooltip>
  </TooltipTrigger>
);
