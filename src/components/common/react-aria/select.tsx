import {
  Label,
  ListBox,
  ListBoxItemProps,
  SelectProps,
  SelectValue,
  ValidationResult,
  Select,
  ListBoxItem
} from 'react-aria-components';
import {FieldError, Text} from 'react-aria-components';
import { Button } from "@/components/common/input/button.tsx";
import React from "react";
import { Popover } from "@/components/common/react-aria/popover.tsx";

interface RASelectProps<T extends object>
  extends Omit<SelectProps<T>, 'children'> {
  label?: string;
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  items?: Iterable<T>;
  children: React.ReactNode | ((item: T) => React.ReactNode);
}

export function RASelect<T extends object>(
  { label, description, errorMessage, children, items, ...props }:
    RASelectProps<T>
) {
  return (
    <Select className="flex flex-col gap-1" {...props}>
      <Label className="cursor-default">{label}</Label>
      <Button>
        <SelectValue className="flex-1 truncate placeholder-shown:italic" />
        <span aria-hidden="true">▼</span>
      </Button>
      {description && <Text slot="description">{description}</Text>}
      <FieldError>{errorMessage}</FieldError>
      <Popover>
        <ListBox className="outline-none p-1" items={items}>
          {children}
        </ListBox>
      </Popover>
    </Select>
  );
}

export function RASelectItem(props: ListBoxItemProps) {
  return (
    <ListBoxItem
      {...props}
      className="group flex items-center gap-2 cursor-default select-none py-2 px-4 outline-none rounded text-gray-900 focus:bg-rose-600 focus:text-white"
    />
  );
}
