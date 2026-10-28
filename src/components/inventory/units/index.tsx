import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {
  UOM_FAMILY_BASE_CODE,
  type InventoryUomRecord,
} from "@/api/model/inventory_uom.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {InventoryUomForm} from "@/components/inventory/units/form.tsx";
import {useInventoryUomCatalog} from "@/hooks/useInventoryUomCatalog.ts";

export const InventoryUnits = () => {
  const {t} = useTranslation(["inventory", "common"]);
  const {refresh: refreshCatalog} = useInventoryUomCatalog();
  const loadHook = useApi<SettingsData<InventoryUomRecord>>(
    Tables.inventory_uoms,
    [],
    ["sort ASC"],
    0,
    50,
    []
  );

  const [data, setData] = useState<InventoryUomRecord>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<InventoryUomRecord>();

  const columns: any = [
    columnHelper.accessor("code", {
      header: t("columns.code"),
    }),
    columnHelper.accessor("name", {
      header: t("columns.name"),
    }),
    columnHelper.accessor("family", {
      header: t("uom.columns.family"),
      cell: (info) => t(`uom.families.${info.getValue()}`),
    }),
    columnHelper.accessor("base_factor", {
      header: t("uom.columns.baseFactor"),
      cell: (info) => {
        const row = info.row.original;
        const base = UOM_FAMILY_BASE_CODE[row.family];
        return t("uom.factorHint", {code: row.code, factor: row.base_factor, base});
      },
    }),
    columnHelper.accessor("is_active", {
      header: t("uom.columns.active"),
      cell: (info) => (info.getValue() ? t("common:yes") : t("common:no")),
    }),
    columnHelper.accessor("is_system", {
      header: t("uom.columns.system"),
      cell: (info) => (info.getValue() ? t("common:yes") : t("common:no")),
    }),
    columnHelper.accessor("code", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <IconTooltipButton
          label={t("common:actions.edit")}
          variant="primary"
          onClick={() => {
            setData(info.row.original);
            setFormModal(true);
          }}
        >
          <FontAwesomeIcon icon={faPencil} />
        </IconTooltipButton>
      ),
    }),
  ];

  const onSaved = async () => {
    await refreshCatalog();
    loadHook.fetchData();
  };

  return (
    <>
      <div className="p-3 mb-3 border-b border-neutral-200 dark:border-neutral-700">
        <p className="text-sm text-neutral-500">
          {t("uom.preview.toolbarHint", {
            defaultValue:
              "Use the Unit converter button beside the sync status indicator on the bottom bar to convert quantities between units.",
          })}
        </p>
      </div>

      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button
            key="uom-create"
            variant="primary"
            onClick={() => {
              setData(undefined);
              setFormModal(true);
            }}
            icon={faPlus}
          >
            {t("uom.actions.add")}
          </Button>,
        ]}
      />

      <InventoryUomForm
        open={formModal}
        data={data}
        onClose={() => {
          setFormModal(false);
          setData(undefined);
        }}
        onSaved={onSaved}
      />
    </>
  );
};
