import {useMemo} from "react";
import {useTranslation} from "react-i18next";
import {REPORTS_BUFFET} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {recordToString} from "@/api/reports/shared/records.ts";

export const BuffetReportFilter = () => {
  const {t} = useTranslation("reports");

  const sessionTypeOptions = useMemo(
    () => [
      {label: t("buffet.sessionTypes.breakfast"), value: "breakfast"},
      {label: t("buffet.sessionTypes.lunch"), value: "lunch"},
      {label: t("buffet.sessionTypes.dinner"), value: "dinner"},
    ],
    [t]
  );

  const {data: storesData, isLoading: loadingStores} = useApi<SettingsData<InventoryStore>>(
    Tables.inventory_stores,
    [],
    ["name asc"],
    0,
    9999
  );

  return (
    <form
      action={REPORTS_BUFFET}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <DateRange isRequired label={t("filters.selectRange")} />

      <div className="w-full flex flex-col gap-2">
        <label>{t("labels.store")}</label>
        <ReactSelect
          name="store"
          isClearable
          isLoading={loadingStores}
          className="w-full"
          options={(storesData?.data ?? []).map((store) => ({
            label: store.name,
            value: recordToString(store.id) ?? "",
          }))}
        />
        <p className="text-sm text-neutral-600 mt-1">{t("buffet.help.store")}</p>
      </div>

      <div className="w-full flex flex-col gap-2">
        <label>{t("buffet.sessionType")}</label>
        <ReactSelect
          name="sessionType"
          isClearable
          className="w-full"
          options={sessionTypeOptions}
        />
        <p className="text-sm text-neutral-600 mt-1">{t("buffet.help.sessionType")}</p>
      </div>

      <Button type="submit">{t("filters.generate")}</Button>
    </form>
  );
};
