import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {EmployeePayProfile} from "@/api/model/employee_pay_profile.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {PayProfileForm} from "@/components/hr/pay_profiles/form.tsx";
import {entityLabel, formatDisplayDate} from "@/components/hr/shared/form.utils.ts";
import {formatNumber} from "@/lib/utils.ts";

export const HrPayProfiles = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<EmployeePayProfile>>(
    Tables.employee_pay_profiles,
    [],
    [],
    0,
    10,
    ["employee"],
  );

  const [data, setData] = useState<EmployeePayProfile>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<EmployeePayProfile>();

  const columns: any = [
    columnHelper.accessor((row) => entityLabel(row.employee), {id: "employee", header: t("columns.employee")}),
    columnHelper.accessor("pay_type", {header: t("columns.payType")}),
    columnHelper.accessor("base_rate", {
      header: t("columns.baseRate"),
      cell: (info) => formatNumber(info.getValue()),
    }),
    columnHelper.accessor("currency", {header: t("columns.currency")}),
    columnHelper.accessor("effective_from", {
      header: t("columns.effectiveFrom"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    columnHelper.accessor("effective_to", {
      header: t("columns.effectiveTo"),
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
          <Button key="pay-profile-create" variant="primary" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.payProfile")}
          </Button>,
        ]}
      />
      {formModal && (
        <PayProfileForm
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
