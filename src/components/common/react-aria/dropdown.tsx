import {
  Menu,
  MenuItem,
  MenuItemProps,
  MenuProps,
  MenuTrigger,
  MenuTriggerProps,
  Popover, Separator
} from 'react-aria-components';
import { ReactNode } from "react";
import { Button } from "@/components/common/input/button.tsx";
import { cn } from "@/lib/utils.ts";

interface DropdownProps<T>
  extends MenuProps<T>, Omit<MenuTriggerProps, 'children'> {
  label?: ReactNode;
  btnSize?: "lg" | "xl" | "sm";
  btnFlat?: boolean
  btnIconButton?: boolean
}

export function Dropdown<T extends object>(
  { label, children, btnSize, btnFlat, btnIconButton, ...props }: DropdownProps<T> & { 'data-testid'?: string }
) {
  const testId = (props as { 'data-testid'?: string })['data-testid'];
  const { ['data-testid']: _omit, ...menuProps } = props as MenuProps<T> & { 'data-testid'?: string };
  return (
    <MenuTrigger {...menuProps}>
      <Button
        className={cn('btn btn-primary', (props as { className?: string }).className)}
        size={btnSize}
        flat={btnFlat}
        iconButton={btnIconButton}
        data-testid={testId}
      >{label}</Button>
      <Popover className="bg-surface-elevated text-foreground p-1 shadow-xl rounded-lg border border-border">
        <Menu {...menuProps}>
          {children}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}

export function DropdownItem(props: MenuItemProps & {isActive?: boolean}) {
  const textValue = props.textValue ||
    (typeof props.children === 'string' ? props.children : undefined);
  return (
    <MenuItem
      {...props}
      textValue={textValue}
      isDisabled={props.isDisabled}
      className={({ isFocused, isOpen }) => {
        return cn(
          'cursor-pointer text-center bg-surface-elevated p-3 rounded-lg',
          isFocused ? 'focused' : '',
          isOpen ? 'open' : '',
          props.isDisabled ? 'text-muted' : 'hover:bg-neutral-900 hover:text-warning dark:hover:bg-neutral-700',
          props.isActive ? 'bg-neutral-900 text-warning dark:bg-neutral-700' : '',
          props.className
        )
      }}
    >
      {({ hasSubmenu }) => (
        <>
          {props.children}
          {hasSubmenu && (
            <svg className="chevron" viewBox="0 0 24 24">
              <path d="m9 18 6-6-6-6" />
            </svg>
          )}
        </>
      )}
    </MenuItem>
  );
}

export function DropdownSeparator(){
  return (
    <Separator className="bg-border h-[1px] mx-3 my-1" />
  );
}