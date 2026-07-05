import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {PayrollPeriod} from "@/api/model/payroll_period.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {PayrollPeriodForm} from "@/components/hr/payroll_periods/form.tsx";
import {formatDisplayDate} from "@/components/hr/shared/form.utils.ts";

export const HrPayrollPeriods = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<PayrollPeriod>>(
    Tables.payroll_periods,
    [],
    ["start_date DESC"],
    0,
    10,
    ["locked_by"],
  );

  const [data, setData] = useState<PayrollPeriod>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<PayrollPeriod>();

  const columns: any = [
    columnHelper.accessor("name", {header: t("columns.name")}),
    columnHelper.accessor("period_type", {header: t("columns.periodType")}),
    columnHelper.accessor("start_date", {
      header: t("columns.startDate"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    columnHelper.accessor("end_date", {
      header: t("columns.endDate"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    columnHelper.accessor("status", {
      header: t("columns.status"),
      cell: (info) => {
        const value = info.getValue();
        return value ? t(`status.payroll.${value}`, {defaultValue: value}) : "";
      },
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
          <Button key="payroll-period-create" variant="primary" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.payrollPeriod")}
          </Button>,
        ]}
      />
      {formModal && (
        <PayrollPeriodForm
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
