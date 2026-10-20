import {useMemo, useState} from "react";
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
import {Input} from "@/components/common/input/input.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {InventoryUomForm} from "@/components/inventory/units/form.tsx";
import {useInventoryUomCatalog} from "@/hooks/useInventoryUomCatalog.ts";
import {convertQuantity, normalizeUom} from "@/utils/inventoryUom.ts";

export const InventoryUnits = () => {
  const {t} = useTranslation(["inventory", "common"]);
  const {activeUnits, refresh: refreshCatalog} = useInventoryUomCatalog();
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

  const [previewQty, setPreviewQty] = useState<number | string>(5);
  const [previewFrom, setPreviewFrom] = useState<{label: string; value: string} | null>({
    label: "L",
    value: "L",
  });
  const [previewTo, setPreviewTo] = useState<{label: string; value: string} | null>({
    label: "GAL",
    value: "GAL",
  });

  const uomOptions = useMemo(
    () => activeUnits.map((u) => ({label: u.name || u.code, value: u.code})),
    [activeUnits]
  );

  const previewResult = useMemo(() => {
    const qty = Number(previewQty);
    if (!Number.isFinite(qty) || !previewFrom?.value || !previewTo?.value) return null;
    try {
      const result = convertQuantity(qty, previewFrom.value, previewTo.value);
      return Number.isFinite(result) ? result : null;
    } catch {
      return null;
    }
  }, [previewQty, previewFrom, previewTo]);

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
        <div className="text-sm font-medium mb-2">{t("uom.preview.title")}</div>
        <p className="text-sm text-neutral-500 mb-3">{t("uom.preview.hint")}</p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="w-28">
            <Input
              type="number"
              step="any"
              label={t("forms.quantity")}
              value={previewQty}
              onChange={(e) => setPreviewQty(e.target.value)}
            />
          </div>
          <div className="w-36">
            <label className="text-sm">{t("uom.preview.from")}</label>
            <ReactSelect
              options={uomOptions}
              value={previewFrom}
              onChange={(opt) => setPreviewFrom(opt as {label: string; value: string} | null)}
            />
          </div>
          <div className="w-36">
            <label className="text-sm">{t("uom.preview.to")}</label>
            <ReactSelect
              options={uomOptions}
              value={previewTo}
              onChange={(opt) => setPreviewTo(opt as {label: string; value: string} | null)}
            />
          </div>
          <div className="pb-2 text-sm">
            {previewResult != null ? (
              <span>
                = <strong>{previewResult}</strong>{" "}
                {normalizeUom(previewTo?.value) ?? previewTo?.value}
              </span>
            ) : (
              <span className="text-neutral-500">{t("uom.preview.unavailable")}</span>
            )}
          </div>
        </div>
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
