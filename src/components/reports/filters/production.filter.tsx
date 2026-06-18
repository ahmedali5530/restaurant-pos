import {useTranslation} from "react-i18next";
import {REPORTS_PRODUCTION} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Recipe} from "@/api/model/recipe.ts";
import {recordToString} from "@/api/reports/shared/records.ts";

export const ProductionReportFilter = () => {
  const {t} = useTranslation("reports");

  const {data: storesData, isLoading: loadingStores} = useApi<SettingsData<InventoryStore>>(
    Tables.inventory_stores,
    [],
    ["name asc"],
    0,
    9999
  );

  const {data: recipesData, isLoading: loadingRecipes} = useApi<SettingsData<Recipe>>(
    Tables.recipes,
    [],
    ["name asc"],
    0,
    9999
  );

  return (
    <form
      action={REPORTS_PRODUCTION}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <DateRange isRequired label={t("filters.selectRange")} />

      <div className="w-full flex flex-col gap-2">
        <label>{t("labels.store")}</label>
        <ReactSelect
          name="store"
          isClearable
          isLoading={loadingStores}
          className="w-full"
          options={(storesData?.data ?? []).map((store) => ({
            label: store.name,
            value: recordToString(store.id) ?? "",
          }))}
        />
      </div>

      <div className="w-full flex flex-col gap-2">
        <label>{t("labels.recipe")}</label>
        <ReactSelect
          name="recipe"
          isClearable
          isLoading={loadingRecipes}
          className="w-full"
          options={(recipesData?.data ?? []).map((recipe) => ({
            label: recipe.name,
            value: recordToString(recipe.id) ?? "",
          }))}
        />
      </div>

      <Button type="submit">{t("filters.generate")}</Button>
    </form>
  );
};
