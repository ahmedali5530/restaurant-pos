import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Setting } from "@/api/model/setting.ts";
import { Switch } from "@/components/common/input/switch.tsx";
import { toast } from "sonner";
import { useSecurity } from "@/hooks/useSecurity.ts";
import {
  CURRENCY_SYMBOL_KEY,
  CurrencySymbolSettings,
  DEFAULT_CURRENCY_SYMBOL,
} from "@/api/model/currency_symbol.ts";
import { setShowCurrencySymbolInUi } from "@/lib/currency-format.ts";
import { useTranslation } from "react-i18next";

interface FormValues {
  ui: boolean;
  receipts: boolean;
}

export const CurrencySymbolSettingsCard = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const { protectFormSubmit } = useSecurity();
  const { t } = useTranslation(["settings", "common"]);

  const { control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      ui: DEFAULT_CURRENCY_SYMBOL.ui,
      receipts: DEFAULT_CURRENCY_SYMBOL.receipts,
    },
  });

  const loadSettings = async () => {
    const [rows] = await db.query<Setting[]>(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true`,
      { key: CURRENCY_SYMBOL_KEY }
    );
    setSettings(rows?.[0]);
  };

  const saveSettings = async (values: FormValues) => {
    const payload: CurrencySymbolSettings = {
      ui: values.ui,
      receipts: values.receipts,
    };

    if (settings?.id) {
      await db.merge(settings.id, { values: payload });
    } else {
      await db.create(Tables.settings, {
        key: CURRENCY_SYMBOL_KEY,
        is_global: true,
        values: payload,
      });
    }

    setShowCurrencySymbolInUi(payload.ui);
    toast.success(t("settings:currencySymbol.updated"));
    await loadSettings();
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const values = {
      ...DEFAULT_CURRENCY_SYMBOL,
      ...(settings.values as CurrencySymbolSettings),
    };

    reset({
      ui: values.ui,
      receipts: values.receipts,
    });
    setShowCurrencySymbolInUi(values.ui);
  }, [settings, reset]);

  return (
    <div className="shadow p-5 rounded-xl bg-white">
      <h2 className="text-xl font-semibold mb-1">{t("settings:currencySymbol.title")}</h2>
      <p className="text-sm text-neutral-500 mb-5">
        {t("settings:currencySymbol.description")}
      </p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: "settings.currency_symbol",
          description: t("settings:currencySymbol.saveDescription"),
        })}
      >
        <div className="grid grid-cols-1 gap-5 mb-5">
          <Controller
            name="ui"
            control={control}
            render={({ field }) => (
              <div>
                <Switch checked={!!field.value} onChange={field.onChange}>
                  {t("settings:currencySymbol.showInUi")}
                </Switch>
              </div>
            )}
          />
          <Controller
            name="receipts"
            control={control}
            render={({ field }) => (
              <div>
                <Switch checked={!!field.value} onChange={field.onChange}>
                  {t("settings:currencySymbol.showOnReceipts")}
                </Switch>
              </div>
            )}
          />
        </div>
        <button className="btn btn-primary" type="submit">
          {t("common:actions.save")}
        </button>
      </form>
    </div>
  );
};
