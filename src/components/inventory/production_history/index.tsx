import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {ProductionBatch} from "@/api/model/production_batch.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {Recipe} from "@/api/model/recipe.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile} from "@fortawesome/free-solid-svg-icons";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useProductionBatchList} from "@/hooks/useProductionBatchList.ts";
import {ProductionBatchViewModal} from "@/components/inventory/production_history/view.modal.tsx";
import {recordToString} from "@/api/reports/shared/records.ts";
import {formatDateTime} from "@/lib/datetime.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";

export const InventoryProductionHistory = () => {
  const {t} = useTranslation(["inventory", 'common']);
  const loadHook = useProductionBatchList(0, 10);

  const {data: locations, fetchData: fetchLocations} = useApi<SettingsData<InventoryLocation>>(
    Tables.inventory_locations,
    ["is_active = true OR is_active = NONE"],
    ["name ASC"],
    0,
    9999,
    [],
    {enabled: false}
  );

  const {data: recipes, fetchData: fetchRecipes} = useApi<SettingsData<Recipe>>(
    Tables.recipes,
    [],
    [],
    0,
    9999,
    [],
    {enabled: false}
  );

  const [filterLocation, setFilterLocation] = useState<{label: string; value: string} | null>(null);
  const [filterRecipe, setFilterRecipe] = useState<{label: string; value: string} | null>(null);
  const [viewBatchId, setViewBatchId] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  useEffect(() => {
    fetchLocations();
    fetchRecipes();
  }, [fetchLocations, fetchRecipes]);

  const locationOptions = useMemo(
    () =>
      locations?.data?.map((location) => ({
        label: location.name,
        value: recordToString(location.id) ?? "",
      })) ?? [],
    [locations]
  );

  const recipeOptions = useMemo(
    () =>
      recipes?.data?.map((recipe) => ({
        label: recipe.name,
        value: recordToString(recipe.id) ?? "",
      })) ?? [],
    [recipes]
  );

  const applyFilters = () => {
    loadHook.setListFilters({
      locationId: filterLocation?.value,
      recipeId: filterRecipe?.value,
    });
    loadHook.handlePageChange(0);
    loadHook.fetchData();
  };

  const clearFilters = () => {
    setFilterLocation(null);
    setFilterRecipe(null);
    loadHook.resetFilters();
    loadHook.fetchData();
  };

  const columnHelper = createColumnHelper<ProductionBatch>();

  const columns: any = [
    columnHelper.accessor("batch_number", {header: t("production.batchNumber")}),
    columnHelper.accessor("created_at", {
      header: t("columns.createdAt"),
      cell: (info) => formatDateTime(info.getValue() as any),
    }),
    columnHelper.accessor((row) => row.recipe?.name ?? "", {
      id: "recipe",
      header: t("production.recipe"),
    }),
    columnHelper.accessor((row) => row.location?.name ?? "", {
      id: "location",
      header: t("columns.location"),
    }),
    columnHelper.accessor("produced_qty", {header: t("production.producedQty")}),
    columnHelper.accessor("yield_loss_percent", {
      header: t("production.yieldLoss"),
      cell: (info) => `${info.getValue()}%`,
    }),
    columnHelper.accessor("total_input_cost", {header: t("production.totalInputCost")}),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      cell: (info) => (
        <IconTooltipButton label={t('common:actions.view')}
          variant="secondary"
         
          onClick={() => {
            setViewBatchId(recordToString(info.getValue()));
            setViewOpen(true);
          }}
        >
          <FontAwesomeIcon icon={faFile} />
        </IconTooltipButton>
      ),
    }),
  ];

  return (
    <>
      <div className="flex flex-wrap gap-3 items-end px-4 py-3 border-b border-neutral-200">
        <div className="w-56">
          <label className="text-sm text-neutral-600">{t("columns.location")}</label>
          <ReactSelect value={filterLocation} onChange={setFilterLocation} options={locationOptions} isClearable />
        </div>
        <div className="w-56">
          <label className="text-sm text-neutral-600">{t("production.recipe")}</label>
          <ReactSelect value={filterRecipe} onChange={setFilterRecipe} options={recipeOptions} isClearable />
        </div>
        <Button variant="primary" onClick={applyFilters}>
          {t("stockTransfer.applyFilters")}
        </Button>
        <Button variant="secondary" onClick={clearFilters}>
          {t("stockTransfer.clearFilters")}
        </Button>
      </div>

      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        enableSearch={false}
      />

      <ProductionBatchViewModal
        open={viewOpen}
        batchId={viewBatchId}
        onClose={() => {
          setViewOpen(false);
          setViewBatchId(null);
        }}
      />
    </>
  );
};
