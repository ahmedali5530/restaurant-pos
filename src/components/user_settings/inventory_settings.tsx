import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Setting } from "@/api/model/setting.ts";
import { Switch } from "@/components/common/input/switch.tsx";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { toast } from "sonner";
import { useSecurity } from "@/hooks/useSecurity.ts";
import {
  DEFAULT_INVENTORY_SETTINGS,
  INVENTORY_SETTINGS_KEY,
  InventoryCostingMethod,
  InventorySettings,
} from "@/api/model/inventory_settings.ts";

interface FormValues {
  inventory_ledger_enabled: boolean;
  enableBatchTracking: boolean;
  enableExpiryTracking: boolean;
  enableManufacturingDate: boolean;
  costing: { label: string; value: InventoryCostingMethod } | null;
  requireBatchSelection: boolean;
}

export const InventorySettingsCard = () => {
  const { t } = useTranslation("settings");
  const db = useDB();
  const [settings, setSettings] = useState<Setting>();
  const { protectFormSubmit } = useSecurity();

  const costingOptions = useMemo(
    () => [
      { label: t("inventory.costing.average"), value: "average" as const },
      { label: t("inventory.costing.fifo"), value: "fifo" as const },
      { label: t("inventory.costing.fefo"), value: "fefo" as const },
    ],
    [t]
  );

  const { control, handleSubmit, reset, watch } = useForm<FormValues>({
    defaultValues: {
      inventory_ledger_enabled: DEFAULT_INVENTORY_SETTINGS.inventory_ledger_enabled,
      enableBatchTracking: DEFAULT_INVENTORY_SETTINGS.enableBatchTracking,
      enableExpiryTracking: DEFAULT_INVENTORY_SETTINGS.enableExpiryTracking,
      enableManufacturingDate: DEFAULT_INVENTORY_SETTINGS.enableManufacturingDate,
      costing: costingOptions[0],
      requireBatchSelection: DEFAULT_INVENTORY_SETTINGS.requireBatchSelection,
    },
  });

  const batchEnabled = watch("enableBatchTracking");

  const loadSettings = async () => {
    const [rows] = await db.query<Setting[]>(
      `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
      { key: INVENTORY_SETTINGS_KEY }
    );
    setSettings(Array.isArray(rows) ? rows[0] : undefined);
  };

  const saveSettings = async (values: FormValues) => {
    const payload: InventorySettings = {
      inventory_ledger_enabled: !!values.inventory_ledger_enabled,
      enableBatchTracking: !!values.enableBatchTracking,
      enableExpiryTracking: !!values.enableExpiryTracking,
      enableManufacturingDate: !!values.enableManufacturingDate,
      costing: values.costing?.value ?? "average",
      requireBatchSelection: !!values.requireBatchSelection,
    };

    if (settings?.id) {
      await db.merge(settings.id, { values: payload });
    } else {
      await db.create(Tables.settings, {
        key: INVENTORY_SETTINGS_KEY,
        is_global: true,
        values: payload,
      });
    }

    toast.success(t("inventory.updated"));
    await loadSettings();
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!settings) return;
    const values = {
      ...DEFAULT_INVENTORY_SETTINGS,
      ...(settings.values as Partial<InventorySettings>),
    };
    reset({
      inventory_ledger_enabled: values.inventory_ledger_enabled,
      enableBatchTracking: values.enableBatchTracking,
      enableExpiryTracking: values.enableExpiryTracking,
      enableManufacturingDate: values.enableManufacturingDate,
      costing:
        costingOptions.find((o) => o.value === values.costing) ?? costingOptions[0],
      requireBatchSelection: values.requireBatchSelection,
    });
  }, [settings, reset, costingOptions]);

  return (
    <div className="shadow p-5 rounded-xl bg-white">
      <h2 className="text-xl font-semibold mb-1">{t("inventory.title")}</h2>
      <p className="text-sm text-neutral-500 mb-5">{t("inventory.description")}</p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: "Inventory Settings",
          description: t("inventory.saveDescription"),
        })}
      >
        <div className="grid grid-cols-1 gap-4 mb-5">
          <Controller
            name="inventory_ledger_enabled"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t("inventory.ledgerEnabled")}
              </Switch>
            )}
          />
          <p className="text-xs text-neutral-500 -mt-2">{t("inventory.ledgerHint")}</p>

          <Controller
            name="costing"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm mb-1">{t("inventory.costingMethod")}</label>
                <ReactSelect
                  options={costingOptions}
                  value={field.value}
                  onChange={field.onChange}
                  isClearable={false}
                />
              </div>
            )}
          />

          <Controller
            name="enableBatchTracking"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t("inventory.enableBatchTracking")}
              </Switch>
            )}
          />
          <Controller
            name="enableExpiryTracking"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t("inventory.enableExpiryTracking")}
              </Switch>
            )}
          />
          <Controller
            name="enableManufacturingDate"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t("inventory.enableManufacturingDate")}
              </Switch>
            )}
          />
          {batchEnabled && (
            <Controller
              name="requireBatchSelection"
              control={control}
              render={({ field }) => (
                <Switch checked={!!field.value} onChange={field.onChange}>
                  {t("inventory.requireBatchSelection")}
                </Switch>
              )}
            />
          )}
        </div>
        <button className="btn btn-primary" type="submit">
          {t("inventory.save")}
        </button>
      </form>
    </div>
  );
};
