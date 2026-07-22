import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Department} from "@/api/model/department.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {DepartmentForm} from "@/components/hr/departments/form.tsx";

export const HrDepartments = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<Department>>(Tables.departments, [], [], 0, 10, []);

  const [data, setData] = useState<Department>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Department>();

  const columns: any = [
    columnHelper.accessor("code", {header: t("columns.code")}),
    columnHelper.accessor("name", {header: t("columns.name")}),
    columnHelper.accessor("description", {header: t("columns.description")}),
    columnHelper.accessor("is_active", {
      header: t("columns.isActive"),
      cell: (info) => (info.getValue() !== false ? t("status.employment.active") : t("status.employment.inactive")),
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
          <Button key="department-create" variant="primary" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.department")}
          </Button>,
        ]}
      />
      {formModal && (
        <DepartmentForm
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
