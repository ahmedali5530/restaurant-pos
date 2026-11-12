import {useTranslation} from 'react-i18next';
import {REPORTS_ORDER_FISCAL} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {BranchScopeFilter} from "@/components/reports/filters/branch.scope.filter.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Tax} from "@/api/model/tax.ts";
import {PaymentType} from "@/api/model/payment_type.ts";

const toOption = <T extends {id?: any}>(item: T | undefined, label: string) => {
  if (!item?.id) {
    return null;
  }

  const value =
    typeof item.id === "string" ? item.id : item.id.toString?.() ?? String(item.id);

  return {
    label,
    value,
  };
};

const notNull = <T,>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export const OrderFiscalFilter = () => {
  const {t} = useTranslation('reports');
  const {data: taxesData, isLoading: loadingTaxes} = useApi<SettingsData<Tax>>(
    Tables.taxes,
    [],
    ['name asc'],
    0,
    9999,
  );
  const {data: paymentTypesData, isLoading: loadingPaymentTypes} = useApi<SettingsData<PaymentType>>(
    Tables.payment_types,
    [],
    ['name asc'],
    0,
    9999,
  );

  const providerOptions = [
    {label: 'FBR', value: 'provider:fbr'},
    {label: 'PRA', value: 'provider:pra'},
    {label: 'KRA', value: 'provider:kra'},
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

      <BranchScopeFilter />

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="order-fiscal-providers" className="form-label">{t('filters.provider')}</label>
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
          <label htmlFor="order-fiscal-statuses" className="form-label">{t('filters.status')}</label>
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

        <div className="flex flex-col gap-2">
          <label htmlFor="order-fiscal-taxes" className="form-label">{t('filters.taxPercent')}</label>
          <div className="w-full">
            <ReactSelect
              id="order-fiscal-taxes"
              name="taxes[]"
              isMulti
              isClearable
              isLoading={loadingTaxes}
              className="w-full"
              placeholder={t('filters.selectSpecificTaxes')}
              options={(taxesData?.data || [])
                .map(tax => toOption(tax, `${tax.name} (${tax.rate}%)`))
                .filter(notNull)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="order-fiscal-payment-types" className="form-label">{t('filters.paymentTypes')}</label>
          <div className="w-full">
            <ReactSelect
              id="order-fiscal-payment-types"
              name="payment_types[]"
              isMulti
              isClearable
              isLoading={loadingPaymentTypes}
              className="w-full"
              options={(paymentTypesData?.data || [])
                .map(paymentType => toOption(paymentType, paymentType.name))
                .filter(notNull)}
            />
          </div>
        </div>
      </div>

      <Button variant="primary" filled type="submit">{t('filters.generate')}</Button>
    </form>
  );
};
