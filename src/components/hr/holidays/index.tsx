import {useState} from "react";
import {useTranslation} from "react-i18next";
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {PublicHoliday} from "@/api/model/public_holiday.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {HolidayForm} from "@/components/hr/holidays/form.tsx";
import {formatDisplayDate} from "@/components/hr/shared/form.utils.ts";

export const HrHolidays = () => {
  const {t} = useTranslation("hr");
  const loadHook = useApi<SettingsData<PublicHoliday>>(Tables.public_holidays, [], ["date DESC"], 0, 10, []);

  const [data, setData] = useState<PublicHoliday>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<PublicHoliday>();

  const columns: any = [
    columnHelper.accessor("name", {header: t("columns.name")}),
    columnHelper.accessor("date", {
      header: t("columns.holidayDate"),
      cell: (info) => formatDisplayDate(info.getValue()),
    }),
    columnHelper.accessor("country_code", {header: t("columns.countryCode")}),
    columnHelper.accessor("is_recurring", {
      header: t("columns.isRecurring"),
      cell: (info) => (info.getValue() ? t("columns.isRecurring") : "—"),
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
          <Button key="holiday-create" variant="primary" data-testid="hr-add-holidays" onClick={() => { setData(undefined); setFormModal(true); }} icon={faPlus}>
            {t("buttons.holiday")}
          </Button>,
        ]}
      />
      {formModal && (
        <HolidayForm
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
