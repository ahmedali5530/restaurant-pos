import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Employee} from "@/api/model/employee.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {EmployeeForm} from "@/components/hr/employees/form.tsx";
import {entityLabel, formatDisplayDate} from "@/components/hr/shared/form.utils.ts";

export const HrEmployees = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<Employee>>(
    Tables.employees,
    [],
    [],
    0,
    10,
    ["user", "department", "position", "cost_center", "manager"],
  );

  const [data, setData] = useState<Employee>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Employee>();

  const columns: any = [
    columnHelper.accessor("employee_number", {header: t("columns.employeeNumber")}),
    columnHelper.accessor((row) => `${row.first_name} ${row.last_name ?? ""}`.trim(), {
      id: "full_name",
      header: t("columns.fullName"),
    }),
    columnHelper.accessor((row) => entityLabel(row.department), {id: "department", header: t("columns.department")}),
    columnHelper.accessor((row) => entityLabel(row.position), {id: "position", header: t("columns.position")}),
    columnHelper.accessor((row) => entityLabel(row.cost_center), {id: "cost_center", header: t("columns.costCenter")}),
    columnHelper.accessor((row) => entityLabel(row.manager), {id: "manager", header: t("columns.manager")}),
    columnHelper.accessor("employment_status", {
      header: t("columns.employmentStatus"),
      cell: (info) => {
        const value = info.getValue();
        if (!value) return "";
        const key = value === "on_leave" ? "onLeave" : value;
        return t(`status.employment.${key}`, {defaultValue: value});
      },
    }),
    columnHelper.accessor("hire_date", {
      header: t("columns.hireDate"),
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
          <Button key="employee-create" variant="primary" data-testid="hr-add-employees" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.employee")}
          </Button>,
        ]}
      />
      {formModal && (
        <EmployeeForm
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
