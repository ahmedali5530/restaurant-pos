import {useMemo, useState} from "react";
import {useAtom} from "jotai";
import {toast} from "sonner";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {appSettings} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Table, TABLE_FETCHES} from "@/api/model/table.ts";
import {Dish, DISH_FETCHES} from "@/api/model/dish.ts";
import {Kitchen, KITCHEN_FETCHES} from "@/api/model/kitchen.ts";
import {PAYMENT_TYPE_FETCHES, PaymentType} from "@/api/model/payment_type.ts";
import {OrderType} from "@/api/model/order_type.ts";
import {Category} from "@/api/model/category.ts";
import {ModifierGroup} from "@/api/model/modifier_group.ts";
import {DishModifierGroup} from "@/api/model/dish_modifier_group.ts";
import {Floor} from "@/api/model/floor.ts";
import {Menu} from "@/api/model/menu.ts";
import {toRecordId} from "@/lib/utils.ts";
import {RecordId} from "surrealdb";
import {useTranslation} from 'react-i18next';

const toRows = <T, >(result: unknown): T[] => {
  return Array.isArray(result) ? result as T[] : [];
};

export const CacheSettings = () => {
  const db = useDB();
  const [settings, setSettings] = useAtom(appSettings);
  const [isReloading, setIsReloading] = useState(false);
  const { t } = useTranslation('settings');

  const cacheStats = useMemo(() => ([
    {label: t('cache.orderTypes'), count: settings.order_types.length},
    {label: t('cache.categories'), count: settings.categories.length},
    {label: t('cache.dishes'), count: settings.dishes.length},
    {label: t('cache.modifierGroups'), count: settings.modifier_groups.length},
    {label: t('cache.groupDishes'), count: settings.groups_dishes.length},
    {label: t('cache.floors'), count: settings.floors.length},
    {label: t('cache.tables'), count: settings.tables.length},
    {label: t('cache.kitchens'), count: settings.kitchens.length},
    {label: t('cache.paymentTypes'), count: settings.payment_types.length},
  ]), [settings, t]);

  const reloadCache = async () => {
    try {
      setIsReloading(true);

      const [
        orderTypesResult,
        categoriesResult,
        dishesResult,
        modifierGroupsResult,
        groupsDishesResult,
        floorsResult,
        tablesResult,
        kitchensResult,
        paymentTypesResult,
        menuSettingsResult,
      ] = await Promise.all([
        db.query(`SELECT *
                  FROM ${Tables.order_types}
                  WHERE deleted_at = none
                  ORDER BY priority ASC`),
        db.query(`SELECT *
                  FROM ${Tables.categories}
                  WHERE deleted_at = none
                  ORDER BY priority ASC`),
        db.query(`SELECT *
                  FROM ${Tables.dishes}
                  WHERE deleted_at = none
                  ORDER BY priority ASC FETCH ${DISH_FETCHES.join(', ')}`),
        db.query(`SELECT *
                  FROM ${Tables.modifier_groups}
                  WHERE deleted_at = none
                  ORDER BY priority ASC FETCH modifiers, modifiers.modifier, modifiers.allowed_next_groups, modifiers.next_group_overrides`),
        db.query(`SELECT *
                  FROM ${Tables.dish_modifier_groups}
                  ORDER BY priority ASC FETCH in, out, out.modifiers, out.modifiers.modifier, out.modifiers.allowed_next_groups, out.modifiers.next_group_overrides`),
        db.query(`SELECT *
                  FROM ${Tables.floors}
                  WHERE deleted_at = none
                  ORDER BY priority ASC`),
        db.query(`SELECT *
                  FROM ${Tables.tables}
                  WHERE deleted_at = none
                  ORDER BY priority ASC FETCH ${TABLE_FETCHES.join(', ')}`),
        db.query(`SELECT *
                  FROM ${Tables.kitchens}
                  WHERE deleted_at = none
                  ORDER BY priority ASC FETCH ${KITCHEN_FETCHES.join(', ')}`),
        db.query(`SELECT *
                  FROM ${Tables.payment_types}
                  WHERE deleted_at = none
                  ORDER BY priority ASC FETCH ${PAYMENT_TYPE_FETCHES.join(', ')}`)
        ,
        db.query(`SELECT values
                  FROM ${Tables.settings}
                  WHERE key = 'menus' AND is_global = true
                  FETCH values`)
      ]);

      const selectedMenuIds = Array.isArray(menuSettingsResult?.[0]?.[0]?.values)
        ? (menuSettingsResult[0][0].values as Array<{ id?: string } | string>).map((value) => {
          if (typeof value === "string") {
            return toRecordId(value) as RecordId;
          }

          return toRecordId(value?.id) as RecordId;
        }).filter(Boolean)
        : [];

      const menusResult = selectedMenuIds.length > 0
        ? await db.query(`SELECT * FROM ${Tables.menus}
                          WHERE id INSIDE $ids
                          FETCH items, items.menu_item, items.menu_item.categories, items.tax`, {
          ids: selectedMenuIds
        })
        : [[]];

      setSettings(prev => ({
        ...prev,
        order_types: toRows<OrderType>(orderTypesResult?.[0]),
        categories: toRows<Category>(categoriesResult?.[0]),
        dishes: toRows<Dish>(dishesResult?.[0]),
        modifier_groups: toRows<ModifierGroup>(modifierGroupsResult?.[0]),
        groups_dishes: toRows<DishModifierGroup>(groupsDishesResult?.[0]),
        floors: toRows<Floor>(floorsResult?.[0]),
        tables: toRows<Table>(tablesResult?.[0]),
        kitchens: toRows<Kitchen>(kitchensResult?.[0]),
        payment_types: toRows<PaymentType>(paymentTypesResult?.[0]),
        menus: toRows<Menu>(menusResult?.[0]),
      }));

      toast.success(t('cache.reloaded'));
    } catch (error) {
      console.error("Failed to reload cache:", error);
      toast.error(t('cache.reloadFailed'));
    } finally {
      setIsReloading(false);
    }
  };

  return (
    <div className="shadow p-5 rounded bg-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t('cache.title')}</h2>
          <p className="text-sm text-neutral-500">{t('cache.description')}</p>
        </div>
        <Button variant="primary" size="lg" onClick={reloadCache} isLoading={isReloading}>
          {t('cache.reload')}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1">
        {cacheStats.map((item) => (
          <div key={item.label} className="rounded border border-neutral-200 p-3 flex justify-between items-center">
            <p className="text-sm text-neutral-500">{item.label}</p>
            <p className="text-lg font-semibold">{item.count}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
