import { useTranslation } from 'react-i18next';
import {REPORTS_COUPON} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Coupon} from "@/api/model/coupon.ts";

const toOption = <T extends {id?: any}>(item: T | undefined, label: string) => {
  if (!item?.id) return null;
  const value = typeof item.id === "string" ? item.id : item.id.toString?.() ?? String(item.id);
  return {label, value};
};

const notNull = <T,>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

export const CouponFilter = () => {
  const { t } = useTranslation('reports');
  const {data: couponsData, isLoading: loadingCoupons} = useApi<SettingsData<Coupon>>(Tables.coupons, [], ["code asc"], 0, 9999);

  return (
    <form action={REPORTS_COUPON} className="flex flex-col gap-3 items-start w-full" target="_blank">
      <DateRange isRequired label="Select a range" />
      <div className="w-full flex flex-col gap-2">
        <label htmlFor="coupon-filter-coupon">{t('reports.coupon')}</label>
        <ReactSelect
          id="coupon-filter-coupon"
          name="coupon_id"
          isLoading={loadingCoupons}
          isClearable
          className="w-full"
          options={(couponsData?.data || [])
            .map(coupon => toOption(coupon, coupon.code))
            .filter(notNull)}
        />
      </div>
      <Button variant="primary" filled type="submit">{t('filters.generate')}</Button>
    </form>
  );
};
