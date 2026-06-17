import { useTranslation } from 'react-i18next';
import {REPORTS_TAX} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Tax} from "@/api/model/tax.ts";

const toOption = <T extends {id?: any}>(item: T | undefined, label: string) => {
  if (!item?.id) return null;
  const value = typeof item.id === "string" ? item.id : item.id.toString?.() ?? String(item.id);
  return {label, value};
};

const notNull = <T,>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export const TaxFilter = () => {
  const { t } = useTranslation('reports');
  const {data: taxesData, isLoading: loadingTaxes} = useApi<SettingsData<Tax>>(Tables.taxes, [], ["name asc"], 0, 9999);

  return (
    <form action={REPORTS_TAX} className="flex flex-col gap-3 items-start w-full" target="_blank">
      <DateRange isRequired label="Select a range" />
      <div className="w-full flex flex-col gap-2">
        <label htmlFor="tax-filter-tax">{t('reports.tax')}</label>
        <ReactSelect
          id="tax-filter-tax"
          name="tax_id"
          isLoading={loadingTaxes}
          isClearable
          className="w-full"
          options={(taxesData?.data || [])
            .map(tax => toOption(tax, `${tax.name} (${tax.rate}%)`))
            .filter(notNull)}
        />
      </div>
      <Button variant="primary" filled type="submit">{t('filters.generate')}</Button>
    </form>
  );
};
