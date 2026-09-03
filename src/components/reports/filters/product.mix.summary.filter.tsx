import { useTranslation } from 'react-i18next';
import {REPORTS_PRODUCT_MIX_SUMMARY} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {User} from "@/api/model/user.ts";
import {OrderType} from "@/api/model/order_type.ts";
import {Category} from "@/api/model/category.ts";
import {Dish} from "@/api/model/dish.ts";
import {Modifier} from "@/api/model/modifier.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";

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

export const ProductMixSummaryFilter = () => {
  const { t } = useTranslation('reports');
  const {data: usersData, isLoading: loadingUsers} = useApi<SettingsData<User>>(Tables.users, [], ['first_name asc'], 0, 9999);
  const {data: orderTypesData, isLoading: loadingOrderTypes} = useApi<SettingsData<OrderType>>(Tables.order_types, [], ['name asc'], 0, 9999);
  const {data: categoriesData, isLoading: loadingCategories} = useApi<SettingsData<Category>>(Tables.categories, [], ['name asc'], 0, 9999);
  const {data: dishesData, isLoading: loadingDishes} = useApi<SettingsData<Dish>>(Tables.dishes, [], ['name asc'], 0, 9999, ['categories']);
  const {data: modifiersData, isLoading: loadingModifiers} = useApi<SettingsData<Modifier>>(Tables.modifiers, [], ['id asc'], 0, 99999, ['modifier']);

  const modifierOptions = Array.from(
    (modifiersData?.data || []).reduce((map, modifier) => {
      const dish = modifier.modifier;
      if (!dish?.id) {
        return map;
      }
      const dishId = typeof dish.id === "string" ? dish.id : String(dish.id);
      if (!map.has(dishId)) {
        map.set(dishId, toOption(dish, dish.name || "Unknown"));
      }
      return map;
    }, new Map<string, {label: string; value: string} | null>())
      .values()
  ).filter(notNull);

  return (
    <form
      action={REPORTS_PRODUCT_MIX_SUMMARY}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <DateRange isRequired label="Select a range" />

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="product-mix-summary-order-takers">{t('filters.orderTakers')}</label>
          <ReactSelect
            id="product-mix-summary-order-takers"
            name="order_takers[]"
            isMulti
            isLoading={loadingUsers}
            className="w-full"
            options={(usersData?.data || [])
              .map(user =>
                toOption(user, `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.login || 'Unnamed user')
              )
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="product-mix-summary-order-types">{t('filters.orderTypes')}</label>
          <ReactSelect
            id="product-mix-summary-order-types"
            name="order_types[]"
            isMulti
            isLoading={loadingOrderTypes}
            className="w-full"
            options={(orderTypesData?.data || [])
              .map(orderType => toOption(orderType, orderType.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="product-mix-summary-categories">{t('filters.categories')}</label>
          <ReactSelect
            id="product-mix-summary-categories"
            name="categories[]"
            isMulti
            isLoading={loadingCategories}
            className="w-full"
            options={(categoriesData?.data || [])
              .map(category => toOption(category, category.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="product-mix-summary-menu-items">{t('filters.menuItems')}</label>
          <ReactSelect
            id="product-mix-summary-menu-items"
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
          <label htmlFor="product-mix-summary-modifiers">{t('filters.modifiers')}</label>
          <ReactSelect
            id="product-mix-summary-modifiers"
            name="modifiers[]"
            isMulti
            isLoading={loadingModifiers}
            className="w-full"
            options={modifierOptions}
          />
        </div>
      </div>

      <Button
        variant="primary"
        filled
        type="submit"
      >
        Generate
      </Button>
    </form>
  );
}
