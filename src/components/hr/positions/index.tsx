import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Position} from "@/api/model/position.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {PositionForm} from "@/components/hr/positions/form.tsx";
import {entityLabel} from "@/components/hr/shared/form.utils.ts";

export const HrPositions = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<Position>>(
    Tables.positions,
    [],
    [],
    0,
    10,
    ["department", "default_cost_center"],
  );

  const [data, setData] = useState<Position>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Position>();

  const columns: any = [
    columnHelper.accessor("code", {header: t("columns.code")}),
    columnHelper.accessor("name", {header: t("columns.name")}),
    columnHelper.accessor((row) => entityLabel(row.department), {id: "department", header: t("columns.department")}),
    columnHelper.accessor((row) => entityLabel(row.default_cost_center), {
      id: "cost_center",
      header: t("columns.costCenter"),
    }),
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
          <Button key="position-create" variant="primary" data-testid="hr-add-positions" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.position")}
          </Button>,
        ]}
      />
      {formModal && (
        <PositionForm
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
