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
import { toast } from "sonner";
import { appPage } from "@/store/jotai.ts";
import {toRecordId} from "@/lib/utils.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";

const PRINTER_SETTING_KEYS = {
  temp_print_printers: "temp_print_printers",
  final_print_printers: "final_print_printers",
  refund_print_printers: "refund_print_printers",
  delivery_print_printers: "delivery_print_printers",
  summary_print_printers: "summary_print_printers",
} as const;

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

function toIdString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v != null && typeof (v as { id?: string }).id === "string") return (v as { id: string }).id;
  if (v != null && typeof (v as { toString?: () => string }).toString === "function") return (v as { toString: () => string }).toString();
  return String(v);
}

/** Convert a record id / link (from DB or app) to a plain string for comparison. */
function recordIdToCompareString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  const o = v as Record<string, unknown>;
  if (typeof o?.toString === "function") {
    const s = o.toString();
    if (typeof s === "string" && s !== "[object Object]") return s;
  }
  if (o?.id != null) return String(o.id);
  if (typeof o?.tb === "string" && o?.id != null) return `${o.tb}:${o.id}`;
  return String(v);
}

function getQueryRows<T = unknown>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw != null && typeof raw === "object" && "result" in raw && Array.isArray((raw as { result: unknown[] }).result)) return (raw as { result: unknown[] }).result as T[];
  return [];
}

export const Printersettings = () => {
  const db = useDB();
  const [page] = useAtom(appPage);
  const [loading, setLoading] = useState(true);
  const userId = page?.user?.id != null ? toIdString(page.user.id) : null;
  const {protectFormSubmit} = useSecurity();

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
            ? values.map((v: unknown) => v.toString())
            : [];
          const options: PrinterOption[] = ids
            .map((id) => {
              const p = printers.find((x) => x.id.toString() === id);
              return p ? { label: p.name, value: p.id } : { label: id, value: id };
            })
            .filter((o) => o.value);

          loaded[key as keyof PrinterSettingsForm] = options;
        }

        reset({
          ...defaultFormValues,
          ...loaded,
        });
      } catch (e) {
        console.error("Error loading printer settings:", e);
        toast.error("Failed to load printer settings");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [printers.length, userId]);

  const onSubmit = async (values: PrinterSettingsForm) => {
    if (!userId) {
      toast.error("Please log in to save printer settings.");
      return;
    }
    try {
      const keys = Object.keys(PRINTER_SETTING_KEYS) as (keyof typeof PRINTER_SETTING_KEYS)[];
      const userRecordId = new StringRecordId(userId);
      for (const formKey of keys) {
        const key = PRINTER_SETTING_KEYS[formKey];
        const options = values[formKey];
        const value = Array.isArray(options) ? options.map((o) => o.value) : [];

        const [raw] = await db.query(
          `SELECT * FROM ${Tables.settings} WHERE key = $key`,
          { key }
        );
        const rows = getQueryRows<{ id?: unknown; user?: unknown }>(raw);
        const existing = rows.find((r) => (r?.user?.toString()) === recordIdToCompareString(userId.toString()));

        if (existing?.id) {
          console.log(value)
          await db.merge(toRecordId(existing.id), { values: value });
        } else {
          await db.create(Tables.settings, {
            key,
            user: toRecordId(userRecordId),
            values: value,
          });
        }
      }

      toast.success("Printer settings saved");
    } catch (e) {
      console.error("Error saving printer settings:", e);
      toast.error("Failed to save printer settings");
    }
  };

  const printerOptions = printers.map((p) => ({
    label: p.name,
    value: p.id,
  }));

  return (
    <div className="shadow p-5 rounded bg-white">
      <h2 className="text-xl font-semibold mb-1">Default printers</h2>
      <p className="text-sm text-neutral-500 mb-4">
        Printer assignments are stored per user. Each user can assign printers for temp, final, refund, delivery, and summary. If you have not set any, global settings are used as fallback.
      </p>

      {loading ? (
        <div className="text-center py-6 text-neutral-500">Loading printer settings…</div>
      ) : (
        <form onSubmit={protectFormSubmit((handleSubmit(onSubmit)), {
          description: 'Save printers',
          module: 'Printers'
        })} className="flex flex-col gap-4 max-w-xl">

          <div>
            <label className="block text-sm font-medium mb-1">Printers for temp print</label>
            <Controller
              name="temp_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder="Select printers…"
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Printers for final print</label>
            <Controller
              name="final_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder="Select printers…"
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Printers for refund print</label>
            <Controller
              name="refund_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder="Select printers…"
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Printers for delivery print</label>
            <Controller
              name="delivery_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder="Select printers…"
                />
              )}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Printers for summary print</label>
            <Controller
              name="summary_print_printers"
              control={control}
              render={({ field }) => (
                <ReactSelect<PrinterOption, true>
                  isMulti
                  value={field.value}
                  onChange={field.onChange}
                  options={printerOptions}
                  placeholder="Select printers…"
                />
              )}
            />
          </div>

          <div>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save printer settings"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}