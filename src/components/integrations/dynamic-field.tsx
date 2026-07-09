import { ProviderManifestField } from '@/integrations/core/types.ts';
import { Input } from '@/components/common/input/input.tsx';
import { Textarea } from '@/components/common/input/textarea.tsx';
import { Switch } from '@/components/common/input/switch.tsx';
import { Checkbox } from '@/components/common/input/checkbox.tsx';
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx';

type SelectOption = { label: string; value: string | number | boolean };

interface DynamicFieldProps {
  field: ProviderManifestField;
  value: unknown;
  onChange: (next: unknown) => void;
}

export const DynamicField = ({ field, value, onChange }: DynamicFieldProps) => {
  switch (field.type) {
    case 'number':
      return (
        <Input
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(event) => onChange(Number(event.target.value))}
          placeholder={field.placeholder}
        />
      );
    case 'password':
      return (
        <Input
          type="password"
          value={(value as string | undefined) ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
        />
      );
    case 'checkbox':
      return (
        <Checkbox
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          label={field.label}
        />
      );
    case 'switch':
      return (
        <Switch checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)}>
          {field.label}
        </Switch>
      );
    case 'dropdown':
      return (
        <ReactSelect<SelectOption, false>
          options={(field.options ?? []).map((option) => ({
            label: option.label,
            value: option.value,
          }))}
          value={
            (field.options ?? [])
              .map((option) => ({ label: option.label, value: option.value }))
              .find((option) => String(option.value) === String(value)) ?? null
          }
          onChange={(option) => onChange(option?.value ?? '')}
          placeholder={field.placeholder ?? 'Select'}
        />
      );
    case 'json':
      return (
        <Textarea
          rows={4}
          enableKeyboard={false}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
        />
      );
    case 'certificate':
      return (
        <Input
          type="text"
          value={(value as string | undefined) ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder ?? 'Paste certificate content or reference'}
        />
      );
    case 'dynamic':
    case 'text':
    default:
      return (
        <Input
          type="text"
          value={(value as string | undefined) ?? ''}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
        />
      );
  }
};
