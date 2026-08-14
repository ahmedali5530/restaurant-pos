import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {EmployeePerformanceNote} from "@/api/model/employee_performance_note.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {PerformanceForm} from "@/components/hr/performance/form.tsx";
import {entityLabel, formatDisplayDate} from "@/components/hr/shared/form.utils.ts";

export const HrPerformance = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<EmployeePerformanceNote>>(
    Tables.employee_performance_notes,
    [],
    ["created_at DESC"],
    0,
    10,
    ["employee", "created_by"],
  );

  const [data, setData] = useState<EmployeePerformanceNote>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<EmployeePerformanceNote>();

  const columns: any = [
    columnHelper.accessor((row) => entityLabel(row.employee), {id: "employee", header: t("columns.employee")}),
    columnHelper.accessor("type", {
      header: t("columns.noteType"),
      cell: (info) => {
        const value = info.getValue();
        return value ? t(`performanceTypes.${value}`, {defaultValue: value}) : "";
      },
    }),
    columnHelper.accessor("title", {header: t("columns.title")}),
    columnHelper.accessor("severity", {
      header: t("columns.severity"),
      cell: (info) => {
        const value = info.getValue();
        return value ? t(`severities.${value}`, {defaultValue: value}) : "";
      },
    }),
    columnHelper.accessor("visible_to_employee", {
      header: t("columns.visibleToEmployee"),
      cell: (info) => (info.getValue() ? "Yes" : "No"),
    }),
    columnHelper.accessor("created_at", {
      header: t("columns.createdAt"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <IconTooltipButton
          label={t("buttons.edit")}
          variant="primary"
          icon={faPencil}
          onClick={() => { setData(info.row.original); setFormModal(true); }}
        />
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
          <Button key="performance-create" variant="primary" data-testid="hr-add-performance" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.performanceNote")}
          </Button>,
        ]}
      />
      {formModal && (
        <PerformanceForm
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
