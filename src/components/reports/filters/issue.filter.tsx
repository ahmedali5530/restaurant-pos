import { useTranslation } from 'react-i18next';
import {REPORTS_ISSUE} from "@/routes/posr.ts";
import {DateRange} from "@/components/reports/filters/date.range.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {User} from "@/api/model/user.ts";
import {Kitchen} from "@/api/model/kitchen.ts";

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

export const IssueFilter = () => {
  const { t } = useTranslation('reports');
  const {data: storesData, isLoading: loadingStores} = useApi<SettingsData<InventoryStore>>(Tables.inventory_stores, [], ['name asc'], 0, 9999);
  const {data: itemsData, isLoading: loadingItems} = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], ['name asc'], 0, 9999);
  const {data: usersData, isLoading: loadingUsers} = useApi<SettingsData<User>>(Tables.users, [], ['first_name asc'], 0, 9999);
  const {data: kitchensData, isLoading: loadingKitchens} = useApi<SettingsData<Kitchen>>(Tables.kitchens, [], ['name asc'], 0, 9999);

  return (
    <form
      action={REPORTS_ISSUE}
      className="flex flex-col gap-4 items-start w-full"
      target="_blank"
    >
      <DateRange isRequired label="Select a range" />

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="issue-stores">Stores</label>
          <ReactSelect
            id="issue-stores"
            name="stores[]"
            isMulti
            isLoading={loadingStores}
            className="w-full"
            options={(storesData?.data || [])
              .map(store => toOption(store, store.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="issue-items">{t('columns.items')}</label>
          <ReactSelect
            id="issue-items"
            name="items[]"
            isMulti
            isLoading={loadingItems}
            className="w-full"
            options={(itemsData?.data || [])
              .map(item => toOption(item, item.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="issue-kitchens">{t('metrics.kitchens')}</label>
          <ReactSelect
            id="issue-kitchens"
            name="kitchens[]"
            isMulti
            isLoading={loadingKitchens}
            className="w-full"
            options={(kitchensData?.data || [])
              .map(kitchen => toOption(kitchen, kitchen.name))
              .filter(notNull)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="issue-users">{t('columns.createdBy')}</label>
          <ReactSelect
            id="issue-users"
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
      </div>

      <Button
        variant="primary"
        filled
        type="submit"
      >{t('filters.generate')}</Button>
    </form>
  );
};

