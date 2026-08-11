import { Button } from "@/components/common/input/button.tsx";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useAtom } from "jotai";
import { StringRecordId } from "surrealdb";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Printer } from "@/api/model/printer.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { Switch } from "@/components/common/input/switch.tsx";
import { toast } from "sonner";
import { appPage, systemPrinterSettings, type SystemPrinterSettings } from "@/store/jotai.ts";
import {toRecordId} from "@/lib/utils.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {useTranslation} from 'react-i18next';

const PRINTER_SETTING_KEYS = {
  temp_print_printers: "temp_print_printers",
  final_print_printers: "final_print_printers",
  refund_print_printers: "refund_print_printers",
  delivery_print_printers: "delivery_print_printers",
  summary_print_printers: "summary_print_printers",
} as const;

const SYSTEM_PRINTER_KEYS = [
  "temp_print_printers",
  "final_print_printers",
  "refund_print_printers",
  "summary_print_printers",
] as const;

type SystemPrinterKey = (typeof SYSTEM_PRINTER_KEYS)[number];

type PrinterOption = { label: string; value: string };

interface PrinterSettingsForm {
  temp_print_printers: PrinterOption[];
  final_print_printers: PrinterOption[];
  refund_print_printers: PrinterOption[];
  delivery_print_printers: PrinterOption[];
  summary_print_printers: PrinterOption[];
}

const defaultFormValues: PrinterSettingsForm = {
  temp_print_printers: [],
  final_print_printers: [],
  refund_print_printers: [],
  delivery_print_printers: [],
  summary_print_printers: [],
};

/** Normalize record ids to "table:id" strings (never bare RecordId.id alone). */
function toIdString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  const o = v as Record<string, unknown>;
  if (typeof o?.toString === "function") {
    const s = o.toString();
    if (typeof s === "string" && s !== "[object Object]") return s;
  }
  if (typeof o?.tb === "string" && o?.id != null) return `${o.tb}:${String(o.id)}`;
  if (o?.id != null) return String(o.id);
  return String(v);
}

/** Convert a record id / link (from DB or app) to a plain string for comparison. */
function recordIdToCompareString(v: unknown): string {
  return toIdString(v);
}

function getQueryRows<T = unknown>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw != null && typeof raw === "object" && "result" in raw && Array.isArray((raw as { result: unknown[] }).result)) return (raw as { result: unknown[] }).result as T[];
  return [];
}

function idsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const aKey = a.includes(":") ? a.slice(a.indexOf(":") + 1) : a;
  const bKey = b.includes(":") ? b.slice(b.indexOf(":") + 1) : b;
  return aKey !== "" && aKey === bKey;
}

function idsToOptions(ids: string[], printers: Printer[]): PrinterOption[] {
  return ids
    .map((id) => {
      const idStr = toIdString(id);
      const p = printers.find((x) => idsMatch(toIdString(x.id), idStr));
      return p ? { label: p.name, value: toIdString(p.id) } : { label: idStr, value: idStr };
    })
    .filter((o) => o.value);
}

export const Printersettings = () => {
  const db = useDB();
  const [page] = useAtom(appPage);
  const [systemSettings, setSystemSettings] = useAtom(systemPrinterSettings);
  const [loading, setLoading] = useState(true);
  const userId = page?.user?.id != null ? toIdString(page.user.id) : null;
  const {protectFormSubmit} = useSecurity();
  const { t } = useTranslation(['settings', 'common']);

  const { data: printersData } = useApi<SettingsData<Printer>>(
    Tables.printers,
    [],
    ["priority asc"],
    0,
    99999
  );
  const printers = printersData?.data ?? [];

  const { control, handleSubmit, reset, formState: { isSubmitting } } = useForm<PrinterSettingsForm>({
    defaultValues: defaultFormValues,
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const keys = Object.values(PRINTER_SETTING_KEYS);
        const loaded: Partial<PrinterSettingsForm> = {};

        for (const key of keys) {
          const [raw] = await db.query(
            `SELECT * FROM ${Tables.settings} WHERE key = $key`,
            { key }
          );
          const rows = getQueryRows<{ values?: unknown; user?: unknown; is_global?: boolean }>(raw);
          const userRow = userId ? rows.find((r) => recordIdToCompareString(r?.user) === recordIdToCompareString(userId)) : undefined;
          const globalRow = rows.find((r) => r?.is_global === true);
          const row = userRow ?? globalRow;
          const values = row?.values;
          const ids: string[] = Array.isArray(values)
            ? values.map((v: unknown) => toIdString(v))
            : [];
          loaded[key as keyof PrinterSettingsForm] = idsToOptions(ids, printers);
        }

        reset({
          ...defaultFormValues,
          ...loaded,
        });
      } catch (e) {
        console.error("Error loading printer settings:", e);
        toast.error(t('settings:printers.loadFailed'));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [printers.length, userId]);

  // Upgrade bare system printer ids (e.g. "abc") to full "printer:abc" once printers load.
  useEffect(() => {
    if (!printers.length) return;
    setSystemSettings((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of SYSTEM_PRINTER_KEYS) {
        const normalized = (prev[key] ?? []).map((id) => {
          const full = toIdString(
            printers.find((x) => idsMatch(toIdString(x.id), toIdString(id)))?.id ?? id
          );
          if (full !== id) changed = true;
          return full;
        });
        next[key] = normalized;
      }
      return changed ? next : prev;
    });
  }, [printers.length]);

  const onSubmit = async (values: PrinterSettingsForm) => {
    if (!userId) {
      toast.error(t('settings:printers.loginRequired'));
      return;
    }
    try {
      const keys = Object.keys(PRINTER_SETTING_KEYS) as (keyof typeof PRINTER_SETTING_KEYS)[];
      const userRecordId = new StringRecordId(userId);
      for (const formKey of keys) {
        const key = PRINTER_SETTING_KEYS[formKey];
        const options = values[formKey];
        const value = Array.isArray(options) ? options.map((o) => toIdString(o.value)) : [];

        const [raw] = await db.query(
          `SELECT * FROM ${Tables.settings} WHERE key = $key`,
          { key }
        );
        const rows = getQueryRows<{ id?: unknown; user?: unknown }>(raw);
        const existing = rows.find((r) => (r?.user?.toString()) === recordIdToCompareString(userId.toString()));

        if (existing?.id) {
          await db.merge(toRecordId(existing.id), { values: value });
        } else {
          await db.create(Tables.settings, {
            key,
            user: toRecordId(userRecordId),
            values: value,
          });
        }
      }

      toast.success(t('settings:printers.saved'));
    } catch (e) {
      console.error("Error saving printer settings:", e);
      toast.error(t('settings:printers.saveFailed'));
    }
  };

  const printerOptions = printers.map((p) => ({
    label: p.name,
    value: toIdString(p.id),
  }));

  const updateSystemPrinters = (key: SystemPrinterKey, options: readonly PrinterOption[] | null) => {
    const ids = Array.isArray(options) ? options.map((o) => toIdString(o.value)) : [];
    setSystemSettings((prev: SystemPrinterSettings) => ({
      ...prev,
      [key]: ids,
    }));
  };

  const systemFieldLabels: Record<SystemPrinterKey, string> = {
    temp_print_printers: t('settings:printers.tempPrint'),
    final_print_printers: t('settings:printers.finalPrint'),
    refund_print_printers: t('settings:printers.refundPrint'),
    summary_print_printers: t('settings:printers.summaryPrint'),
  };

  return (
    <div className="shadow p-5 rounded-xl bg-white" data-testid="settings-card-printers">
      <h2 className="text-xl font-semibold mb-1">{t('settings:printers.title')}</h2>
      <p className="text-sm text-neutral-500 mb-4">
        {t('settings:printers.description')}
      </p>

      <div className="mb-6 pb-4 border-b border-neutral-200">
        <Switch
          checked={!!systemSettings.useSystemPrinters}
          onChange={(e) => {
            setSystemSettings((prev) => ({
              ...prev,
              useSystemPrinters: e.target.checked,
            }));
          }}
        >
          {t('settings:printers.useSystemPrinters')}
        </Switch>
        <p className="text-sm text-neutral-500 mt-2">
          {t('settings:printers.useSystemPrintersDescription')}
        </p>
      </div>

      <div className="mb-6 pb-4 border-b border-neutral-200">
        <h3 className="text-lg font-medium mb-1">{t('settings:printers.systemTitle')}</h3>
        <p className="text-sm text-neutral-500 mb-4">
          {t('settings:printers.systemDescription')}
        </p>
        <div className="flex flex-col gap-4 max-w-xl">
          {SYSTEM_PRINTER_KEYS.map((key) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-1">{systemFieldLabels[key]}</label>
              <ReactSelect<PrinterOption, true>
                isMulti
                value={idsToOptions(systemSettings[key] ?? [], printers)}
                onChange={(opts) => updateSystemPrinters(key, opts)}
                options={printerOptions}
                placeholder={t('settings:printers.selectPrinters')}
              />
            </div>
          ))}
        </div>
      </div>

      <h3 className="text-lg font-medium mb-1">{t('settings:printers.userTitle')}</h3>
      <p className="text-sm text-neutral-500 mb-4">
        {t('settings:printers.userDescription')}
      </p>

      {loading ? (
        <div className="text-center py-6 text-neutral-500">{t('settings:printers.loading')}</div>
      ) : (
        <form onSubmit={protectFormSubmit((handleSubmit(onSubmit)), {
          description: t('settings:printers.saveDescription'),
          module: 'settings.printers'
        })} className="flex flex-col gap-4 max-w-xl">

          <div>
            <label className="block text-sm font-medium mb-1">{t('settings:printers.tempPrint')}</label>
            <Controller
              name="temp_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder={t('settings:printers.selectPrinters')}
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('settings:printers.finalPrint')}</label>
            <Controller
              name="final_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder={t('settings:printers.selectPrinters')}
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('settings:printers.refundPrint')}</label>
            <Controller
              name="refund_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder={t('settings:printers.selectPrinters')}
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('settings:printers.deliveryPrint')}</label>
            <Controller
              name="delivery_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder={t('settings:printers.selectPrinters')}
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('settings:printers.summaryPrint')}</label>
            <Controller
              name="summary_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder={t('settings:printers.selectPrinters')}
                />
              )}
            />
          </div>

          <div>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? t('settings:printers.saving') : t('settings:printers.save')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
