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
  InventoryAllocationMethod,
  InventoryCostingMethod,
  InventoryPurchaseTaxBehavior,
  InventorySettings,
} from "@/api/model/inventory_settings.ts";

interface FormValues {
  inventory_ledger_enabled: boolean;
  enableBatchTracking: boolean;
  enableExpiryTracking: boolean;
  enableManufacturingDate: boolean;
  costing: { label: string; value: InventoryCostingMethod } | null;
  requireBatchSelection: boolean;
  enable_landed_costs: boolean;
  enable_purchase_discounts: boolean;
  enable_purchase_taxes: boolean;
  default_allocation_method: { label: string; value: InventoryAllocationMethod } | null;
  default_purchase_tax_behavior: { label: string; value: InventoryPurchaseTaxBehavior } | null;
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

  const allocationOptions = useMemo(
    () => [
      { label: t("inventory.allocation.by_value"), value: "by_value" as const },
      { label: t("inventory.allocation.by_quantity"), value: "by_quantity" as const },
      { label: t("inventory.allocation.equal"), value: "equal" as const },
    ],
    [t]
  );

  const taxBehaviorOptions = useMemo(
    () => [
      {
        label: t("inventory.taxBehavior.non_recoverable"),
        value: "non_recoverable" as const,
      },
      {
        label: t("inventory.taxBehavior.recoverable"),
        value: "recoverable" as const,
      },
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
      enable_landed_costs: DEFAULT_INVENTORY_SETTINGS.enable_landed_costs,
      enable_purchase_discounts: DEFAULT_INVENTORY_SETTINGS.enable_purchase_discounts,
      enable_purchase_taxes: DEFAULT_INVENTORY_SETTINGS.enable_purchase_taxes,
      default_allocation_method: allocationOptions[0],
      default_purchase_tax_behavior: taxBehaviorOptions[0],
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
      enable_landed_costs: !!values.enable_landed_costs,
      enable_purchase_discounts: !!values.enable_purchase_discounts,
      enable_purchase_taxes: !!values.enable_purchase_taxes,
      default_allocation_method: values.default_allocation_method?.value ?? "by_value",
      default_purchase_tax_behavior:
        values.default_purchase_tax_behavior?.value ?? "non_recoverable",
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
      enable_landed_costs: values.enable_landed_costs,
      enable_purchase_discounts: values.enable_purchase_discounts,
      enable_purchase_taxes: values.enable_purchase_taxes,
      default_allocation_method:
        allocationOptions.find((o) => o.value === values.default_allocation_method) ??
        allocationOptions[0],
      default_purchase_tax_behavior:
        taxBehaviorOptions.find((o) => o.value === values.default_purchase_tax_behavior) ??
        taxBehaviorOptions[0],
    });
  }, [settings, reset, costingOptions, allocationOptions, taxBehaviorOptions]);

  return (
    <div className="shadow p-5 rounded-xl bg-white">
      <h2 className="text-xl font-semibold mb-1">{t("inventory.title")}</h2>
      <p className="text-sm text-neutral-500 mb-5">{t("inventory.description")}</p>
      <form
        onSubmit={protectFormSubmit(handleSubmit(saveSettings), {
          module: "settings.inventory",
          description: t("inventory.saveDescription"),
        })}
      >
        <div className="flex flex-col gap-4 mb-5">
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

          <hr className="border-neutral-200" />
          <p className="text-sm font-medium">{t("inventory.landedCostsSection")}</p>

          <Controller
            name="enable_landed_costs"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t("inventory.enableLandedCosts")}
              </Switch>
            )}
          />
          <Controller
            name="enable_purchase_discounts"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t("inventory.enablePurchaseDiscounts")}
              </Switch>
            )}
          />
          <Controller
            name="enable_purchase_taxes"
            control={control}
            render={({ field }) => (
              <Switch checked={!!field.value} onChange={field.onChange}>
                {t("inventory.enablePurchaseTaxes")}
              </Switch>
            )}
          />

          <Controller
            name="default_allocation_method"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm mb-1">
                  {t("inventory.defaultAllocationMethod")}
                </label>
                <ReactSelect
                  options={allocationOptions}
                  value={field.value}
                  onChange={field.onChange}
                  isClearable={false}
                />
              </div>
            )}
          />

          <Controller
            name="default_purchase_tax_behavior"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm mb-1">
                  {t("inventory.defaultPurchaseTaxBehavior")}
                </label>
                <ReactSelect
                  options={taxBehaviorOptions}
                  value={field.value}
                  onChange={field.onChange}
                  isClearable={false}
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {t("inventory.defaultPurchaseTaxBehaviorHint")}
                </p>
              </div>
            )}
          />

          <hr className="border-neutral-200" />

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
