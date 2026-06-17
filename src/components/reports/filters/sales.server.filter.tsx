import { useTranslation } from 'react-i18next';
import {REPORTS_SALES_SERVER} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {User} from "@/api/model/user.ts";
import {OrderType} from "@/api/model/order_type.ts";
import {Category} from "@/api/model/category.ts";
import {Dish} from "@/api/model/dish.ts";
import {Floor} from "@/api/model/floor.ts";
import {Table} from "@/api/model/table.ts";

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

export const SalesServerFilter = () => {
  const { t } = useTranslation('reports');
  const {data: usersData, isLoading: loadingUsers} = useApi<SettingsData<User>>(Tables.users, [], ['first_name asc'], 0, 9999);
  const {data: orderTypesData, isLoading: loadingOrderTypes} = useApi<SettingsData<OrderType>>(Tables.order_types, [], ['name asc'], 0, 9999);
  const {data: categoriesData, isLoading: loadingCategories} = useApi<SettingsData<Category>>(Tables.categories, [], ['name asc'], 0, 9999);
  const {data: dishesData, isLoading: loadingDishes} = useApi<SettingsData<Dish>>(Tables.dishes, [], ['name asc'], 0, 9999, ['categories']);
  const {data: floorsData, isLoading: loadingFloors} = useApi<SettingsData<Floor>>(Tables.floors, [], ['name asc'], 0, 9999);
  const {data: tablesData, isLoading: loadingTables} = useApi<SettingsData<Table>>(Tables.tables, [], ['name asc'], 0, 9999, ['floor']);

  return (
    <form
      action={REPORTS_SALES_SERVER}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <DateRange isRequired label="Select a range" />

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="sales-server-users">Users</label>
          <ReactSelect
            id="sales-server-users"
            name="users[]"
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
          <label htmlFor="sales-server-order-types">Order types</label>
          <ReactSelect
            id="sales-server-order-types"
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
          <label htmlFor="sales-server-categories">{t('filters.categories')}</label>
          <ReactSelect
            id="sales-server-categories"
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
          <label htmlFor="sales-server-dishes">{t('metrics.dishes')}</label>
          <ReactSelect
            id="sales-server-dishes"
            name="dishes[]"
            isMulti
            isLoading={loadingDishes}
            className="w-full"
            options={(dishesData?.data || [])
              .map(dish => toOption(dish, dish.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="sales-server-floors">{t('metrics.floors')}</label>
          <ReactSelect
            id="sales-server-floors"
            name="floors[]"
            isMulti
            isLoading={loadingFloors}
            className="w-full"
            options={(floorsData?.data || [])
              .map(floor => toOption(floor, floor.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="sales-server-tables">Tables</label>
          <ReactSelect
            id="sales-server-tables"
            name="tables[]"
            isMulti
            isLoading={loadingTables}
            className="w-full"
            options={(tablesData?.data || [])
              .map(table => toOption(table, table.name ? `${table.name}${table.number ?? ''}` : `Table ${table.number ?? ''}`))
              .filter(notNull)}
          />
        </div>
      </div>

      <Button
        variant="primary"
        filled
        type="submit"
      >{t('filters.generate')}</Button>
    </form>
  );
}