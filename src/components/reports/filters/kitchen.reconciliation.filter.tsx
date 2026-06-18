import {useTranslation} from "react-i18next";
import {REPORTS_KITCHEN_RECONCILIATION} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {KitchenReconciliationStatus} from "@/api/model/kitchen_reconciliation.ts";

const toOption = <T extends {id?: unknown}>(item: T | undefined, label: string) => {
  if (!item?.id) return null;
  const value =
    typeof item.id === "string" ? item.id : item.id.toString?.() ?? String(item.id);
  return {label, value};
};

const notNull = <T,>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

const STATUS_OPTIONS: Array<{label: string; value: KitchenReconciliationStatus}> = [
  {label: "Draft", value: "draft"},
  {label: "Verified", value: "verified"},
  {label: "Missed", value: "missed"},
];

export const KitchenReconciliationFilter = () => {
  const {t} = useTranslation("reports");
  const {data: kitchensData, isLoading: loadingKitchens} = useApi<SettingsData<Kitchen>>(
    Tables.kitchens,
    [],
    ["name asc"],
    0,
    9999
  );
  const {data: itemsData, isLoading: loadingItems} = useApi<SettingsData<InventoryItem>>(
    Tables.inventory_items,
    [],
    ["name asc"],
    0,
    9999
  );

  return (
    <form
      action={REPORTS_KITCHEN_RECONCILIATION}
      className="flex flex-col gap-4 items-start w-full"
      target="_blank"
    >
      <DateRange isRequired label={t("filters.selectRange")} />

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="kr-kitchens">{t("filters.kitchen")}</label>
          <ReactSelect
            id="kr-kitchens"
            name="kitchens[]"
            isMulti
            isLoading={loadingKitchens}
            className="w-full"
            options={(kitchensData?.data || [])
              .map((kitchen) => toOption(kitchen, kitchen.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="kr-statuses">{t("filters.status")}</label>
          <ReactSelect
            id="kr-statuses"
            name="statuses[]"
            isMulti
            className="w-full"
            options={STATUS_OPTIONS.map((option) => ({
              label: t(`labels.kitchenReconciliationStatus.${option.value}`, option.label),
              value: option.value,
            }))}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="kr-items">{t("columns.items")}</label>
          <ReactSelect
            id="kr-items"
            name="items[]"
            isMulti
            isLoading={loadingItems}
            className="w-full"
            options={(itemsData?.data || [])
              .map((item) => toOption(item, item.code ? `${item.name} (${item.code})` : item.name))
              .filter(notNull)}
          />
        </div>
      </div>

      <Button variant="primary" filled type="submit">
        {t("filters.generate")}
      </Button>
    </form>
  );
};
