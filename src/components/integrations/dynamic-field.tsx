import { useEffect, useMemo, useState } from 'react';
import { ProviderManifestField } from '@/integrations/core/types.ts';
import { Input } from '@/components/common/input/input.tsx';
import { Textarea } from '@/components/common/input/textarea.tsx';
import { Switch } from '@/components/common/input/switch.tsx';
import { Checkbox } from '@/components/common/input/checkbox.tsx';
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx';
import { useDB } from '@/api/db/db.ts';
import { Tables } from '@/api/db/tables.ts';
import { Account } from '@/api/model/account.ts';

type SelectOption = { label: string; value: string | number | boolean };

interface DynamicFieldProps {
  field: ProviderManifestField;
  value: unknown;
  onChange: (next: unknown) => void;
}

const AccountField = ({
  field,
  value,
  onChange,
}: DynamicFieldProps) => {
  const db = useDB();
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [rows] = await db.query(
          `SELECT id, code, name FROM ${Tables.accounts}
           WHERE is_active = true
           ORDER BY code ASC`
        );
        if (!mounted) {
          return;
        }
        const accounts = (Array.isArray(rows) ? rows : []) as Account[];
        setOptions(
          accounts.map((account) => ({
            label: `${account.code} — ${account.name}`,
            value: String(account.id),
          }))
        );
      } catch (error) {
        console.warn('Failed loading accounts for integration config', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const selected = useMemo(
    () => options.find((option) => String(option.value) === String(value)) ?? null,
    [options, value]
  );

  return (
    <ReactSelect<SelectOption, false>
      options={options}
      value={selected}
      isLoading={loading}
      isClearable={!field.required}
      onChange={(option) => onChange(option?.value ?? '')}
      placeholder={field.placeholder ?? 'Select account'}
    />
  );
};

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
          onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
          label={field.label}
        />
      );
    case 'switch':
      return (
        <Switch
          checked={Boolean(value)}
          onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
        >
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
    case 'account':
      return <AccountField field={field} value={value} onChange={onChange} />;
    case 'json':
      return (
        <Textarea
          rows={4}
          enableKeyboard={false}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
          onChange={(event) => onChange((event.target as HTMLTextAreaElement).value)}
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
