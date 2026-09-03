import {REPORTS_DELIVERY_DENSITY} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {PaymentType} from "@/api/model/payment_type.ts";
import {Dish} from "@/api/model/dish.ts";
import {Coupon} from "@/api/model/coupon.ts";
import {useDB} from "@/api/db/db.ts";
import {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';

const toOption = <T extends {id?: any}>(
  item: T | undefined,
  label: string
) => {
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

const getAddressArea = (address: string): string => {
  const parts = address
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return parts[parts.length - 2];
  }

  return parts[0] || address.trim();
};

export const DeliveryDensityFilter = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const [areas, setAreas] = useState<string[]>([]);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const {data: couponsData, isLoading: loadingCoupons} = useApi<SettingsData<Coupon>>(Tables.coupons, [], ["code asc"], 0, 9999);
  const {data: paymentTypesData, isLoading: loadingPaymentTypes} = useApi<SettingsData<PaymentType>>(Tables.payment_types, [], ["name asc"], 0, 9999);
  const {data: menuItemsData, isLoading: loadingMenuItems} = useApi<SettingsData<Dish>>(Tables.dishes, [], ["name asc"], 0, 9999);

  useEffect(() => {
    const loadAreas = async () => {
      try {
        setLoadingAreas(true);
        const [result] = await db.query(
          `SELECT delivery.address as address
           FROM ${Tables.orders}
           WHERE delivery != NONE AND delivery.address != NONE
           LIMIT 10000`
        );

        const uniqueAreas = Array.from(
          new Set(
            (result || [])
              .map((entry: any) => entry?.address)
              .filter(Boolean)
              .map((address: string) => getAddressArea(address))
              .filter(Boolean)
          )
        ).sort((a, b) => String(a).localeCompare(String(b))) as string[];

        setAreas(uniqueAreas);
      } catch (error) {
        console.error("Failed to load delivery areas", error);
      } finally {
        setLoadingAreas(false);
      }
    };

    loadAreas();
  }, [db]);

  const areaOptions = useMemo(
    () => areas.map(area => ({label: area, value: area})),
    [areas]
  );

  return (
    <form
      action={REPORTS_DELIVERY_DENSITY}
      className="flex flex-col gap-4 items-start w-full"
      target="_blank"
    >
      <DateRange isRequired label="Select a range" />

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="delivery-density-coupons">{t('metrics.coupons')}</label>
          <ReactSelect
            id="delivery-density-coupons"
            name="coupons[]"
            isMulti
            isLoading={loadingCoupons}
            className="w-full"
            options={(couponsData?.data || [])
              .map(coupon => toOption(coupon, coupon.code))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="delivery-density-payment-types">Payment Types</label>
          <ReactSelect
            id="delivery-density-payment-types"
            name="payment_types[]"
            isMulti
            isLoading={loadingPaymentTypes}
            className="w-full"
            options={(paymentTypesData?.data || [])
              .map(paymentType => toOption(paymentType, paymentType.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="delivery-density-menu-items">{t('filters.menuItems')}</label>
          <ReactSelect
            id="delivery-density-menu-items"
            name="menu_items[]"
            isMulti
            isLoading={loadingMenuItems}
            className="w-full"
            options={(menuItemsData?.data || [])
              .map(item => toOption(item, item.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label>Status Filters</label>
          <div className="flex flex-col gap-3">
            <Checkbox name="refund" value="1" label="Refund" />
            <Checkbox name="merged" value="1" label="Merged" />
            <Checkbox name="cancelled" value="1" label="Cancelled" />
            <Checkbox name="split" value="1" label="Split" />
            <Checkbox name="paid" value="1" label="Paid" />
            <Checkbox name="pending" value="1" label="Pending" />
            <Checkbox name="in_progress" value="1" label="In Progress" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label>{t('labels.displayOptions')}</label>
          <div className="flex flex-col gap-3">
            <Checkbox name="show_menu_items" value="1" label="Show Menu Items" />
            <Checkbox name="show_details" value="1" label="Show Details" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="delivery-density-sort-by">Sort result by</label>
          <select
            id="delivery-density-sort-by"
            name="sortBy"
            className="form-control"
            defaultValue=""
          >
            <option value="">{t('labels.default')}</option>
            {["Invoice", "Date", "Status", "Total", "Area"].map(item => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="delivery-density-sort-direction">Sort direction</label>
          <select
            id="delivery-density-sort-direction"
            name="sortDirection"
            className="form-control"
            defaultValue="Descending"
          >
            {["Ascending", "Descending"].map(item => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="delivery-density-areas">Areas</label>
          <ReactSelect
            id="delivery-density-areas"
            name="areas[]"
            isMulti
            isLoading={loadingAreas}
            className="w-full"
            options={areaOptions}
          />
        </div>
      </div>

      <Button variant="primary" filled type="submit">{t('filters.generate')}</Button>
    </form>
  );
};
