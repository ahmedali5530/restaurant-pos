import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {ProductionBatch} from "@/api/model/production_batch.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Recipe} from "@/api/model/recipe.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile} from "@fortawesome/free-solid-svg-icons";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useProductionBatchList} from "@/hooks/useProductionBatchList.ts";
import {ProductionBatchViewModal} from "@/components/inventory/production_history/view.modal.tsx";
import {recordToString} from "@/api/reports/shared/records.ts";
import {toJsDate} from "@/lib/datetime.ts";

export const InventoryProductionHistory = () => {
  const {t} = useTranslation("inventory");
  const loadHook = useProductionBatchList(0, 10);

  const {data: stores, fetchData: fetchStores} = useApi<SettingsData<InventoryStore>>(
    Tables.inventory_stores,
    [],
    [],
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

  const [filterStore, setFilterStore] = useState<{label: string; value: string} | null>(null);
  const [filterRecipe, setFilterRecipe] = useState<{label: string; value: string} | null>(null);
  const [viewBatchId, setViewBatchId] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  useEffect(() => {
    fetchStores();
    fetchRecipes();
  }, [fetchStores, fetchRecipes]);

  const storeOptions = useMemo(
    () =>
      stores?.data?.map((store) => ({
        label: store.name,
        value: recordToString(store.id) ?? "",
      })) ?? [],
    [stores]
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
      storeId: filterStore?.value,
      recipeId: filterRecipe?.value,
    });
    loadHook.handlePageChange(0);
    loadHook.fetchData();
  };

  const clearFilters = () => {
    setFilterStore(null);
    setFilterRecipe(null);
    loadHook.resetFilters();
    loadHook.fetchData();
  };

  const columnHelper = createColumnHelper<ProductionBatch>();

  const columns: any = [
    columnHelper.accessor("batch_number", {header: t("production.batchNumber")}),
    columnHelper.accessor("created_at", {
      header: t("columns.createdAt"),
      cell: (info) => toJsDate(info.getValue() as any).toLocaleString(),
    }),
    columnHelper.accessor((row) => row.recipe?.name ?? "", {
      id: "recipe",
      header: t("production.recipe"),
    }),
    columnHelper.accessor((row) => row.store?.name ?? "", {
      id: "store",
      header: t("columns.stores"),
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
        <Button
          variant="secondary"
          iconButton
          onClick={() => {
            setViewBatchId(recordToString(info.getValue()));
            setViewOpen(true);
          }}
        >
          <FontAwesomeIcon icon={faFile} />
        </Button>
      ),
    }),
  ];

  return (
    <>
      <div className="flex flex-wrap gap-3 items-end px-4 py-3 border-b border-neutral-200">
        <div className="w-56">
          <label className="text-sm text-neutral-600">{t("columns.stores")}</label>
          <ReactSelect value={filterStore} onChange={setFilterStore} options={storeOptions} isClearable />
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
