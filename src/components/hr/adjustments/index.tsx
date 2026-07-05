import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {LaborAdjustment} from "@/api/model/labor_adjustment.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {AdjustmentForm} from "@/components/hr/adjustments/form.tsx";
import {entityLabel, formatDisplayDate} from "@/components/hr/shared/form.utils.ts";
import {formatNumber} from "@/lib/utils.ts";

export const HrAdjustments = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<LaborAdjustment>>(
    Tables.labor_adjustments,
    [],
    ["effective_date DESC"],
    0,
    10,
    ["employee", "payroll_period"],
  );

  const [data, setData] = useState<LaborAdjustment>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<LaborAdjustment>();

  const columns: any = [
    columnHelper.accessor((row) => entityLabel(row.employee), {id: "employee", header: t("columns.employee")}),
    columnHelper.accessor("type", {
      header: t("columns.adjustmentType"),
      cell: (info) => {
        const value = info.getValue();
        if (!value) return "";
        const key = value.charAt(0).toUpperCase() + value.slice(1);
        return t(`adjustmentTypes.${value}`, {defaultValue: value});
      },
    }),
    columnHelper.accessor("amount", {
      header: t("columns.amount"),
      cell: (info) => formatNumber(info.getValue()),
    }),
    columnHelper.accessor("currency", {header: t("columns.currency")}),
    columnHelper.accessor("effective_date", {
      header: t("columns.effectiveDate"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    columnHelper.accessor("description", {header: t("columns.description")}),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <Button variant="primary" onClick={() => { setData(info.row.original); setFormModal(true); }}>
          <FontAwesomeIcon icon={faPencil}/>
        </Button>
      ),
    }),
  ];

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button key="adjustment-create" variant="primary" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.adjustment")}
          </Button>,
        ]}
      />
      {formModal && (
        <AdjustmentForm
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
