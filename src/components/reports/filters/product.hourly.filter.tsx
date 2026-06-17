import { useTranslation } from 'react-i18next';
import {REPORTS_PRODUCT_HOURLY} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Dish} from "@/api/model/dish.ts";
import _ from "lodash";

const toOption = <T extends { id?: any }>(
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

export const ProductHourlyFilter = () => {
  const { t } = useTranslation('reports');
  const {data: dishesData, isLoading: loadingDishes} = useApi<SettingsData<Dish>>(Tables.dishes, [], ['name asc'], 0, 9999, ['categories']);

  return (
    <form
      action={REPORTS_PRODUCT_HOURLY}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <DateRange isRequired label="Select a range" />

      <div className="flex flex-col gap-2">
        <label htmlFor="product-hourly-menu-items">{t('filters.menuItems')}</label>
        <ReactSelect
          id="product-hourly-menu-items"
          name="menu_items[]"
          isMulti
          isLoading={loadingDishes}
          className="w-full"
          options={(dishesData?.data || [])
            .map(dish => toOption(dish, dish.name))
            .filter(notNull)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="product-hourly-hours">{t('metrics.hours')}</label>
        <ReactSelect
          name="hours[]"
          isMulti
          options={_.range(0, 24).map(item => ({
            label: item === 0 ? '12am' : 
                   item === 12 ? '12pm' :
                   item < 12 ? `${item}am` : `${item - 12}pm`,
            value: item.toString()
          }))}
          id="product-hourly-hours"
          className="flex-1 self-stretch"
        />
      </div>

      <Button
        variant="primary"
        filled
        type="submit"
      >{t('filters.generate')}</Button>
    </form>
  );
}