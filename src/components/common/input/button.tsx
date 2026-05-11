import { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { Button as AriaButton, ButtonProps as BaseProps } from 'react-aria-components';

type Variant =
  |'primary' | 'danger' | 'warning' | 'success' | 'custom' | 'gradient' | 'secondary' | string;

interface ButtonProps extends BaseProps {
  size?: "lg" | "xl" | "sm"
  active?: boolean;
  variant?: Variant
  iconButton?: boolean;
  flat?: boolean;
  icon?: IconProp;
  rightIcon?: IconProp;
  isLoading?: boolean;
  disabled?: boolean;
  tabIndex?: number;
  onClick?: (event: any) => void;
  filled?: boolean;
}

export const Button = (props: ButtonProps) => {
  const { active, variant, size, iconButton, flat, icon, isLoading, disabled, children, filled, onClick, rightIcon, ...rest } = props;

  return (
    <AriaButton
      excludeFromTabOrder={true}
      {...rest}
      onPress={onClick}
      className={
        cn(
          'btn',
          variant && 'btn-' + variant,
          props.active ? 'active' : '',
          size && size,
          iconButton && 'btn-square',
          props.className && props.className,
          flat && 'btn-flat',
          filled && 'btn-filled'
        )
      }
      isDisabled={props.disabled || isLoading}
    >
      {icon && (
        <span className={children === undefined ? '' : 'mr-2'}>
          <FontAwesomeIcon icon={icon}/>
        </span>
      )}
      {isLoading && (
        <FontAwesomeIcon icon={faSpinner} spin/>
      )}
      {children as ReactNode}
      {rightIcon && (
        <span className={children === undefined ? '' : 'ml-2'}>
          <FontAwesomeIcon icon={rightIcon}/>
        </span>
      )}
    </AriaButton>
  );
};
