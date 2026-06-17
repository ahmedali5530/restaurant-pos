import { useTranslation } from 'react-i18next';
import {REPORTS_VOIDS} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {User} from "@/api/model/user.ts";
import {Dish} from "@/api/model/dish.ts";
import {OrderVoidReason} from "@/api/model/order_void.ts";

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

export const VoidsFilter = () => {
  const { t } = useTranslation('reports');
  const {data: usersData, isLoading: loadingUsers} = useApi<SettingsData<User>>(Tables.users, [], ['first_name asc'], 0, 9999);
  const {data: dishesData, isLoading: loadingDishes} = useApi<SettingsData<Dish>>(Tables.dishes, [], ['name asc'], 0, 9999);

  const reasonOptions = Object.values(OrderVoidReason).map((reason) => ({
    label: reason,
    value: reason,
  }));

  return (
    <form
      action={REPORTS_VOIDS}
      className="flex flex-col gap-4 items-start w-full"
      target="_blank"
    >
      <DateRange isRequired label="Select a range" />

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="voids-reasons">Reasons</label>
          <ReactSelect
            id="voids-reasons"
            name="reasons[]"
            isMulti
            className="w-full"
            options={reasonOptions}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="voids-managers">Managers</label>
          <ReactSelect
            id="voids-managers"
            name="managers[]"
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
          <label htmlFor="voids-cashiers">{t('metrics.cashiers')}</label>
          <ReactSelect
            id="voids-cashiers"
            name="cashiers[]"
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
          <label htmlFor="voids-menu-items">{t('filters.menuItems')}</label>
          <ReactSelect
            id="voids-menu-items"
            name="menu_items[]"
            isMulti
            isLoading={loadingDishes}
            className="w-full"
            options={(dishesData?.data || [])
              .map(dish => toOption(dish, dish.name))
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