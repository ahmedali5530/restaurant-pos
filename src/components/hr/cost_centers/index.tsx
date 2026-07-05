import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {CostCenter} from "@/api/model/cost_center.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {CostCenterForm} from "@/components/hr/cost_centers/form.tsx";

export const HrCostCenters = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<CostCenter>>(Tables.cost_centers, [], [], 0, 10, []);

  const [data, setData] = useState<CostCenter>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<CostCenter>();

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
          <Button key="cost-center-create" variant="primary" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.costCenter")}
          </Button>,
        ]}
      />
      {formModal && (
        <CostCenterForm
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
