import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Setting } from "@/api/model/setting.ts";
import { Switch } from "@/components/common/input/switch.tsx";
import { toast } from "sonner";
import { useSecurity } from "@/hooks/useSecurity.ts";
import {
  DEFAULT_SHOW_INCLUSIVE_PRICES,
  SHOW_INCLUSIVE_PRICES_KEY,
  ShowInclusivePricesSettings,
} from "@/api/model/show_inclusive_prices.ts";
import { useTranslation } from "react-i18next";

interface FormValues {
  enabled: boolean;
}

export const ShowInclusivePricesSettingsCard = () => {
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const { protectFormSubmit } = useSecurity();
  const { t } = useTranslation(["settings", "common"]);

  const { control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: {
      enabled: DEFAULT_SHOW_INCLUSIVE_PRICES.enabled,
    },
  });

  const loadSettings = async () => {
    const [rows] = await db.query<Setting[]>(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true`,
      { key: SHOW_INCLUSIVE_PRICES_KEY }
    );
    setSettings(rows?.[0]);
  };

  const saveSettings = async (values: FormValues) => {
    const payload: ShowInclusivePricesSettings = {
      enabled: values.enabled,
    };

    if (settings?.id) {
      await db.merge(settings.id, { values: payload });
    } else {
      await db.create(Tables.settings, {
        key: SHOW_INCLUSIVE_PRICES_KEY,
        is_global: true,
        values: payload,
      });
    }

    toast.success(t("settings:showInclusivePrices.updated"));
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
      ...DEFAULT_SHOW_INCLUSIVE_PRICES,
      ...(settings.values as ShowInclusivePricesSettings),
    };

    reset({
      enabled: values.enabled,
    });
  }, [settings, reset]);

  return (
    <div className="shadow p-5 rounded-xl bg-white">
      <h2 className="text-xl font-semibold mb-1">{t("settings:showInclusivePrices.title")}</h2>
      <p className="text-sm text-neutral-500 mb-5">
        {t("settings:showInclusivePrices.description")}
      </p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: "Show inclusive prices",
          description: t("settings:showInclusivePrices.saveDescription"),
        })}
      >
        <div className="grid grid-cols-1 gap-5 mb-5">
          <Controller
            name="enabled"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t("common:actions.enabled")}
              </Switch>
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
