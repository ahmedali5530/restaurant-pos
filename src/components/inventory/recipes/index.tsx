import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import {Recipe} from "@/api/model/recipe.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {RecipeForm} from "@/components/inventory/recipes/form.tsx";
import {useRecipeList} from "@/hooks/useRecipeList.ts";
import {useDB} from "@/api/db/db.ts";
import {deleteRecipe} from "@/lib/inventory/production.service.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {toast} from "sonner";
import classNames from "classnames";

export const InventoryRecipes = () => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const loadHook = useRecipeList(0, 10);
  const [data, setData] = useState<Recipe>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Recipe>();

  const columns: any = [
    columnHelper.accessor("name", {header: t("columns.name")}),
    columnHelper.accessor("code", {header: t("columns.code")}),
    columnHelper.accessor("base_batch_qty", {header: t("production.baseBatchQty")}),
    columnHelper.accessor("cost_allocation", {header: t("production.costAllocation")}),
    columnHelper.accessor("is_active", {
      header: t("columns.status"),
      cell: (info) => (
        <span
          className={classNames(
            "tag",
            info.getValue() ? "bg-success-100 text-success-800" : "bg-neutral-100"
          )}
        >
          {info.getValue() ? t("production.active") : t("production.inactive")}
        </span>
      ),
    }),
    columnHelper.accessor("items", {
      header: t("production.inputs"),
      cell: (info) => info.getValue()?.length ?? 0,
    }),
    columnHelper.accessor("outputs", {
      header: t("production.outputs"),
      cell: (info) => info.getValue()?.length ?? 0,
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      cell: (info) => (
        <div className="flex gap-2">
          <Button
            variant="primary"
            iconButton
            onClick={() => {
              setData(info.row.original);
              setFormModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPencil} />
          </Button>
          <Button
            variant="danger"
            iconButton
            onClick={async () => {
              if (!confirm(t("production.confirmDeleteRecipe"))) return;
              try {
                await deleteRecipe(db, recordToString(info.getValue())!);
                toast.success(t("production.recipeDeleted"));
                loadHook.fetchData();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : t("production.recipeDeleteFailed"));
              }
            }}
          >
            <FontAwesomeIcon icon={faTrash} />
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        enableSearch={false}
        buttons={[
          <Button
            key="recipe-create"
            variant="primary"
            onClick={() => setFormModal(true)}
            icon={faPlus}
          >
            {t("production.createRecipe")}
          </Button>,
        ]}
      />

      {formModal && (
        <RecipeForm
          open
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}
    </>
  );
};
