import { useEffect, useMemo, useRef, useState } from 'react';
import { ProviderManifestField } from '@/integrations/core/types.ts';
import { Input } from '@/components/common/input/input.tsx';
import { Textarea } from '@/components/common/input/textarea.tsx';
import { Switch } from '@/components/common/input/switch.tsx';
import { Checkbox } from '@/components/common/input/checkbox.tsx';
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx';
import { Button } from '@/components/common/input/button.tsx';
import { useDB } from '@/api/db/db.ts';
import { Tables } from '@/api/db/tables.ts';
import { Account } from '@/api/model/account.ts';
import {
  assertFileWithinLimit,
  formatFileSize,
  MAX_UPLOAD_BYTES,
} from '@/utils/files.ts';
import { toast } from 'sonner';

type SelectOption = { label: string; value: string | number | boolean };

interface DynamicFieldProps {
  field: ProviderManifestField;
  value: unknown;
  onChange: (next: unknown) => void;
  providerId?: string;
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

const ExternalEntityField = ({
  field,
  value,
  onChange,
  providerId,
}: DynamicFieldProps) => {
  const db = useDB();
  const [options, setOptions] = useState<SelectOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!providerId) {
      setLoading(false);
      return;
    }
    let mounted = true;
    const load = async () => {
      try {
        const [rows] = await db.query<Array<{ external_id: string; external_payload?: { name?: string; code?: string; type?: string } }>>(
          `SELECT external_id, external_payload FROM ${Tables.integration_entity_mappings}
           WHERE provider_id = $providerId AND entity_type = $entityType
           ORDER BY external_id ASC`,
          { providerId, entityType: field.entityType ?? 'account' }
        );
        if (!mounted) return;
        const items = Array.isArray(rows) ? rows : [];
        setOptions(
          items.map((item) => {
            const payload = item.external_payload;
            const name = payload?.name ?? payload?.code ?? item.external_id;
            const code = payload?.code ?? '';
            const label = code ? `${code} — ${name}` : name;
            return { label: label || item.external_id, value: item.external_id };
          })
        );
      } catch (error) {
        console.warn('Failed loading external entities for integration config', error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [providerId, field.entityType]);

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
      placeholder={field.placeholder ?? `Select ${field.entityType ?? 'entity'}`}
    />
  );
};

const fileToDataUri = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });

const ImageField = ({ value, onChange, field }: DynamicFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview =
    typeof value === 'string' && value.trim().startsWith('data:') ? value.trim() : null;

  const onFile = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      assertFileWithinLimit(file);
      const dataUri = await fileToDataUri(file);
      onChange(dataUri);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `File exceeds the maximum size of ${formatFileSize(MAX_UPLOAD_BYTES)}.`
      );
    }
  };

  return (
    <div className="space-y-2">
      {preview && (
        <div className="flex items-start gap-3">
          <img
            src={preview}
            alt={field.label}
            className="h-20 w-20 object-contain rounded border border-neutral-200 bg-white"
          />
          <Button type="button" variant="secondary" size="lg" onClick={() => onChange('')}>
            Remove
          </Button>
        </div>
      )}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded file:border-0 file:bg-neutral-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-neutral-200"
          onChange={(event) => {
            const file = event.target.files?.[0];
            void onFile(file);
            if (inputRef.current) inputRef.current.value = '';
          }}
        />
      </div>
    </div>
  );
};

export const DynamicField = ({ field, value, onChange, providerId }: DynamicFieldProps) => {
  switch (field.type) {
    case 'image':
      return <ImageField field={field} value={value} onChange={onChange} providerId={providerId} />;
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
    case 'externalEntity':
      return <ExternalEntityField field={field} value={value} onChange={onChange} providerId={providerId} />;
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
