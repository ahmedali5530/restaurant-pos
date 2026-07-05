import {ChangeEvent, ReactNode} from 'react';
import {Control, Controller, FieldValues, Path} from 'react-hook-form';
import {DateValue} from 'react-aria-components';
import {ReactSelect} from '@/components/common/input/custom.react.select.tsx';
import {InputError} from '@/components/common/input/input.tsx';
import {Checkbox} from '@/components/common/input/checkbox.tsx';
import {DatePicker} from '@/components/common/antd/datepicker.tsx';
import {DateTimePicker} from '@/components/common/antd/datetime.picker.tsx';
import {TimePicker} from '@/components/common/antd/time.picker.tsx';
import type {Dayjs} from 'dayjs';
import type {SelectOption} from '@/components/common/form/types.ts';

interface FormFieldProps {
  label?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}

export const FormField = ({label, error, children, className = ''}: FormFieldProps) => (
  <div className={`flex flex-col gap-1 ${className}`.trim()}>
    {label && <label>{label}</label>}
    {children}
    {error && <InputError error={error}/>}
  </div>
);

interface SelectFieldProps<T extends FieldValues = FieldValues> {
  label?: string;
  name: Path<T>;
  control: Control<T>;
  options: SelectOption[];
  error?: string;
  isClearable?: boolean;
  isLoading?: boolean;
  className?: string;
  stringValue?: boolean;
}

export const SelectField = <T extends FieldValues = FieldValues>({
  label,
  name,
  control,
  options,
  error,
  isClearable,
  isLoading,
  className,
  stringValue = false,
}: SelectFieldProps<T>) => (
  <FormField label={label} error={error} className={className}>
    <Controller
      control={control}
      name={name}
      render={({field}) => (
        <ReactSelect
          options={options as never}
          value={stringValue ? options.find((o) => o.value === field.value) ?? null : field.value}
          onChange={(opt) => field.onChange(stringValue ? (opt as SelectOption | null)?.value : opt)}
          isClearable={isClearable ?? !stringValue}
          isLoading={isLoading}
        />
      )}
    />
  </FormField>
);

interface DateFieldProps<T extends FieldValues = FieldValues> {
  label?: string;
  name: Path<T>;
  control: Control<T>;
  error?: string;
  isClearable?: boolean;
  className?: string;
}

export const DateField = <T extends FieldValues = FieldValues>({
  label,
  name,
  control,
  error,
  isClearable = true,
  className,
}: DateFieldProps<T>) => (
  <FormField label={label} error={error} className={className}>
    <Controller
      control={control}
      name={name}
      render={({field}) => (
        <DatePicker
          value={field.value as DateValue | null}
          onChange={field.onChange}
          isClearable={isClearable}
        />
      )}
    />
  </FormField>
);

interface DateTimeFieldProps<T extends FieldValues = FieldValues> {
  label?: string;
  name: Path<T>;
  control: Control<T>;
  error?: string;
  isClearable?: boolean;
  className?: string;
}

export const DateTimeField = <T extends FieldValues = FieldValues>({
  label,
  name,
  control,
  error,
  isClearable = true,
  className,
}: DateTimeFieldProps<T>) => (
  <FormField label={label} error={error} className={className}>
    <Controller
      control={control}
      name={name}
      render={({field}) => (
        <DateTimePicker
          value={field.value as Dayjs | null}
          onChange={field.onChange}
          isClearable={isClearable}
        />
      )}
    />
  </FormField>
);

interface TimeFieldProps<T extends FieldValues = FieldValues> {
  label?: string;
  name: Path<T>;
  control: Control<T>;
  error?: string;
  isClearable?: boolean;
  className?: string;
}

export const TimeField = <T extends FieldValues = FieldValues>({
  label,
  name,
  control,
  error,
  isClearable = false,
  className,
}: TimeFieldProps<T>) => (
  <FormField label={label} error={error} className={className}>
    <Controller
      control={control}
      name={name}
      render={({field}) => (
        <TimePicker
          value={field.value as string | null}
          onChange={field.onChange}
          isClearable={isClearable}
        />
      )}
    />
  </FormField>
);

interface CheckboxFieldProps<T extends FieldValues = FieldValues> {
  label?: string;
  name: Path<T>;
  control: Control<T>;
  className?: string;
}

export const CheckboxField = <T extends FieldValues = FieldValues>({
  label,
  name,
  control,
  className,
}: CheckboxFieldProps<T>) => (
  <div className={className}>
    <Controller
      control={control}
      name={name}
      render={({field}) => (
        <Checkbox
          checked={!!field.value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => field.onChange(e.target.checked)}
          label={label}
        />
      )}
    />
  </div>
);
