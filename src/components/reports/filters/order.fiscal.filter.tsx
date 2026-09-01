import {useTranslation} from 'react-i18next';
import {REPORTS_ORDER_FISCAL} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";

export const OrderFiscalFilter = () => {
  const {t} = useTranslation('reports');

  const providerOptions = [
    {label: 'FBR', value: 'provider:fbr'},
    {label: 'PRA', value: 'provider:pra'},
  ];

  const statusOptions = [
    {label: t('orderFiscal.statusCompleted'), value: 'completed'},
    {label: t('orderFiscal.statusFailed'), value: 'failed'},
    {label: t('orderFiscal.statusSkipped'), value: 'skipped'},
  ];

  return (
    <form
      action={REPORTS_ORDER_FISCAL}
      className="flex flex-col gap-4 items-start w-full"
      target="_blank"
    >
      <DateRange isRequired label={t('filters.selectRange')} />

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="order-fiscal-providers">{t('filters.provider')}</label>
          <div className="w-full">
            <ReactSelect
              id="order-fiscal-providers"
              name="providers[]"
              isMulti
              isClearable
              className="w-full"
              options={providerOptions}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="order-fiscal-statuses">{t('filters.status')}</label>
          <div className="w-full">
            <ReactSelect
              id="order-fiscal-statuses"
              name="statuses[]"
              isMulti
              isClearable
              className="w-full"
              options={statusOptions}
            />
          </div>
        </div>
      </div>

      <Button variant="primary" filled type="submit">{t('filters.generate')}</Button>
    </form>
  );
};
