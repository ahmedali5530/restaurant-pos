import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Setting } from "@/api/model/setting.ts";
import { Input } from "@/components/common/input/input.tsx";
import { toast } from "sonner";
import { useSecurity } from "@/hooks/useSecurity.ts";
import {
  DEFAULT_PRINT_OPTIONS,
  PRINT_OPTIONS_KEY,
  PrintOptions,
} from "@/api/model/print_options.ts";
import { useTranslation } from "react-i18next";
import { transformValue } from "@/lib/utils.ts";

interface FormValues {
  copies_temp: number;
  copies_final: number;
  copies_refund: number;
  copies_kitchen: number;
  copies_delivery: number;
  copies_summary: number;
  max_temp: number;
  max_final: number;
}

function clampCopies(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.floor(v);
}

function clampAttempts(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

export const PrintOptionsSettingsCard = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const { protectFormSubmit } = useSecurity();
  const { t } = useTranslation(["settings", "common"]);

  const { control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      copies_temp: DEFAULT_PRINT_OPTIONS.copies.temp,
      copies_final: DEFAULT_PRINT_OPTIONS.copies.final,
      copies_refund: DEFAULT_PRINT_OPTIONS.copies.refund,
      copies_kitchen: DEFAULT_PRINT_OPTIONS.copies.kitchen,
      copies_delivery: DEFAULT_PRINT_OPTIONS.copies.delivery,
      copies_summary: DEFAULT_PRINT_OPTIONS.copies.summary,
      max_temp: DEFAULT_PRINT_OPTIONS.max_attempts.temp,
      max_final: DEFAULT_PRINT_OPTIONS.max_attempts.final,
    },
  });

  const loadSettings = async () => {
    const [rows] = await db.query<Setting[]>(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true`,
      { key: PRINT_OPTIONS_KEY }
    );
    setSettings(rows?.[0]);
  };

  const saveSettings = async (values: FormValues) => {
    const payload: PrintOptions = {
      copies: {
        temp: clampCopies(values.copies_temp),
        final: clampCopies(values.copies_final),
        refund: clampCopies(values.copies_refund),
        kitchen: clampCopies(values.copies_kitchen),
        delivery: clampCopies(values.copies_delivery),
        summary: clampCopies(values.copies_summary),
      },
      max_attempts: {
        temp: clampAttempts(values.max_temp),
        final: clampAttempts(values.max_final),
      },
    };

    if (settings?.id) {
      await db.merge(settings.id, { values: payload });
    } else {
      await db.create(Tables.settings, {
        key: PRINT_OPTIONS_KEY,
        is_global: true,
        values: payload,
      });
    }

    toast.success(t("settings:printOptions.updated"));
    await loadSettings();
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const values: PrintOptions = {
      copies: {
        ...DEFAULT_PRINT_OPTIONS.copies,
        ...((settings.values as PrintOptions)?.copies ?? {}),
      },
      max_attempts: {
        ...DEFAULT_PRINT_OPTIONS.max_attempts,
        ...((settings.values as PrintOptions)?.max_attempts ?? {}),
      },
    };

    reset({
      copies_temp: clampCopies(values.copies.temp),
      copies_final: clampCopies(values.copies.final),
      copies_refund: clampCopies(values.copies.refund),
      copies_kitchen: clampCopies(values.copies.kitchen),
      copies_delivery: clampCopies(values.copies.delivery),
      copies_summary: clampCopies(values.copies.summary),
      max_temp: clampAttempts(values.max_attempts.temp),
      max_final: clampAttempts(values.max_attempts.final),
    });
  }, [settings, reset]);

  const copyFields: { name: keyof FormValues; labelKey: string }[] = [
    { name: "copies_temp", labelKey: "printOptions.copies.temp" },
    { name: "copies_final", labelKey: "printOptions.copies.final" },
    { name: "copies_refund", labelKey: "printOptions.copies.refund" },
    { name: "copies_kitchen", labelKey: "printOptions.copies.kitchen" },
    { name: "copies_delivery", labelKey: "printOptions.copies.delivery" },
    { name: "copies_summary", labelKey: "printOptions.copies.summary" },
  ];

  return (
    <div className="shadow p-5 rounded-xl bg-white">
      <h2 className="text-xl font-semibold mb-1">{t("settings:printOptions.title")}</h2>
      <p className="text-sm text-neutral-500 mb-5">
        {t("settings:printOptions.description")}
      </p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: "Print options",
          description: t("settings:printOptions.saveDescription"),
        })}
      >
        <h3 className="font-semibold mb-2">{t("settings:printOptions.copiesTitle")}</h3>
        <div className="grid grid-cols-2 gap-3 mb-5">
          {copyFields.map(({ name, labelKey }) => (
            <div key={name}>
              <Controller
                name={name}
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    min={1}
                    label={t(`settings:${labelKey}`)}
                    value={transformValue.input(field.value)}
                    onChange={(e) => field.onChange(transformValue.output(e))}
                  />
                )}
              />
            </div>
          ))}
        </div>

        <h3 className="font-semibold mb-1">{t("settings:printOptions.maxAttemptsTitle")}</h3>
        <p className="text-sm text-neutral-500 mb-3">
          {t("settings:printOptions.unlimitedHint")}
        </p>
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <Controller
              name="max_temp"
              control={control}
              render={({ field }) => (
                <Input
                  type="number"
                  min={0}
                  label={t("settings:printOptions.maxAttempts.temp")}
                  value={transformValue.input(field.value)}
                  onChange={(e) => field.onChange(transformValue.output(e))}
                />
              )}
            />
          </div>
          <div>
            <Controller
              name="max_final"
              control={control}
              render={({ field }) => (
                <Input
                  type="number"
                  min={0}
                  label={t("settings:printOptions.maxAttempts.final")}
                  value={transformValue.input(field.value)}
                  onChange={(e) => field.onChange(transformValue.output(e))}
                />
              )}
            />
          </div>
        </div>

        <button className="btn btn-primary" type="submit">
          {t("common:actions.save")}
        </button>
      </form>
    </div>
  );
};
