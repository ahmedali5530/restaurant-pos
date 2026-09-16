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
import { useTranslation } from 'react-i18next';

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
            className="h-20 w-20 object-contain rounded border border-border bg-surface-elevated"
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
          className="block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-surface dark:bg-neutral-700"
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

const createListItemDefaults = (itemFields: ProviderManifestField[] = []): Record<string, unknown> => {
  const item: Record<string, unknown> = {
    id: `device-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
  };
  for (const nested of itemFields) {
    if (nested.key === 'id') continue;
    if (nested.defaultValue !== undefined) {
      item[nested.key] = nested.defaultValue;
    } else if (nested.type === 'switch' || nested.type === 'checkbox') {
      item[nested.key] = false;
    } else if (nested.type === 'number') {
      item[nested.key] = nested.validation?.min ?? 0;
    } else {
      item[nested.key] = '';
    }
  }
  return item;
};

const normalizeListValue = (value: unknown): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
      }
    } catch {
      return [];
    }
  }
  return [];
};

const ListField = ({ field, value, onChange, providerId }: DynamicFieldProps) => {
  const { t } = useTranslation('integrations');
  const items = useMemo(() => normalizeListValue(value), [value]);
  const itemFields = field.itemFields ?? [];
  const itemLabel = field.itemLabel || t('listField.item', { defaultValue: 'Item' });

  const updateItem = (index: number, key: string, next: unknown) => {
    const copy = items.map((item, i) => (i === index ? { ...item, [key]: next } : item));
    onChange(copy);
  };

  const addItem = () => {
    onChange([...items, createListItemDefaults(itemFields)]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {items.length === 0 && (
        <p className="text-sm text-muted">
          {t('listField.empty', { item: itemLabel.toLowerCase(), defaultValue: `No ${itemLabel.toLowerCase()}s yet.` })}
        </p>
      )}

      {items.map((item, index) => {
        const title =
          (typeof item.name === 'string' && item.name.trim()) ||
          (typeof item.host === 'string' && item.host.trim()) ||
          `${itemLabel} ${index + 1}`;

        return (
          <div
            key={String(item.id ?? index)}
            className="rounded-lg border border-border bg-surface p-4 space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-sm truncate">{title}</p>
              <Button type="button" variant="secondary" onClick={() => removeItem(index)}>
                {t('listField.remove', { defaultValue: 'Remove' })}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {itemFields
                .filter((nested) => nested.key !== 'id')
                .filter((nested) => {
                  if (!nested.dependsOn) return true;
                  return item[nested.dependsOn.field] === nested.dependsOn.equals;
                })
                .map((nested) => (
                  <div
                    key={nested.key}
                    className={nested.type === 'switch' || nested.type === 'checkbox' ? 'md:col-span-2' : ''}
                  >
                    {nested.type !== 'switch' && nested.type !== 'checkbox' && (
                      <label className="block text-sm font-medium mb-1">{nested.label}</label>
                    )}
                    <div>
                      <DynamicField
                        field={nested}
                        value={item[nested.key]}
                        providerId={providerId}
                        onChange={(next) => updateItem(index, nested.key, next)}
                      />
                    </div>
                    {nested.helpText && <p className="text-xs text-muted mt-1">{nested.helpText}</p>}
                  </div>
                ))}
            </div>
          </div>
        );
      })}

      <Button type="button" variant="primary" onClick={addItem}>
        {t('listField.add', { item: itemLabel, defaultValue: `Add ${itemLabel}` })}
      </Button>
    </div>
  );
};

export const DynamicField = ({ field, value, onChange, providerId }: DynamicFieldProps) => {
  switch (field.type) {
    case 'image':
      return <ImageField field={field} value={value} onChange={onChange} providerId={providerId} />;
    case 'list':
      return <ListField field={field} value={value} onChange={onChange} providerId={providerId} />;
    case 'number':
      return (
        <div>
          <Input
            type="number"
            value={value === undefined || value === null ? '' : String(value)}
            onChange={(event) => onChange(Number(event.target.value))}
            placeholder={field.placeholder}
          />
        </div>
      );
    case 'password':
      return (
        <div>
          <Input
            type="password"
            value={(value as string | undefined) ?? ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      );
    case 'checkbox':
      return (
        <div>
          <Checkbox
            checked={Boolean(value)}
            onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
            label={field.label}
          />
        </div>
      );
    case 'switch':
      return (
        <div>
          <Switch
            checked={Boolean(value)}
            onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
          >
            {field.label}
          </Switch>
        </div>
      );
    case 'dropdown':
      return (
        <div>
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
        </div>
      );
    case 'account':
      return (
        <div>
          <AccountField field={field} value={value} onChange={onChange} />
        </div>
      );
    case 'externalEntity':
      return (
        <div>
          <ExternalEntityField field={field} value={value} onChange={onChange} providerId={providerId} />
        </div>
      );
    case 'json':
      return (
        <div>
          <Textarea
            rows={4}
            enableKeyboard={false}
            value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
            onChange={(event) => onChange((event.target as HTMLTextAreaElement).value)}
            placeholder={field.placeholder}
          />
        </div>
      );
    case 'certificate':
      return (
        <div>
          <Input
            type="text"
            value={(value as string | undefined) ?? ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder ?? 'Paste certificate content or reference'}
          />
        </div>
      );
    case 'dynamic':
    case 'text':
    default:
      return (
        <div>
          <Input
            type="text"
            value={(value as string | undefined) ?? ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.placeholder}
          />
        </div>
      );
  }
};
