import {useTranslation} from "react-i18next";
import {REPORTS_PRODUCTION} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {Recipe} from "@/api/model/recipe.ts";
import {recordToString} from "@/api/reports/shared/records.ts";

export const ProductionReportFilter = () => {
  const {t} = useTranslation("reports");

  const {data: locationsData, isLoading: loadingLocations} = useApi<SettingsData<InventoryLocation>>(
    Tables.inventory_locations,
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
        <label>{t("inventory:columns.location")}</label>
        <ReactSelect
          name="store"
          isClearable
          isLoading={loadingLocations}
          className="w-full"
          options={(locationsData?.data ?? []).map((location) => ({
            label: location.name,
            value: recordToString(location.id) ?? "",
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
