import type {ComponentProps} from 'react';
import {FieldValues} from 'react-hook-form';
import {SelectField} from '@/components/common/form/rhf-fields.tsx';

export {
  FormField as HrFormField,
  SelectField as HrSelectField,
  DateField as HrDateField,
  DateTimeField as HrDateTimeField,
  CheckboxField as HrCheckboxField,
  TimeField as HrTimeField,
  InputField as HrInputField,
} from '@/components/common/form/rhf-fields.tsx';

type StringSelectFieldProps<T extends FieldValues = FieldValues> = Omit<
  ComponentProps<typeof SelectField<T>>,
  'stringValue'
>;

export const HrStringSelectField = <T extends FieldValues = FieldValues>(
  props: StringSelectFieldProps<T>,
) => <SelectField {...props} stringValue />;
