import {REPORTS_PRODUCT_MIX_WEEKLY} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {User} from "@/api/model/user.ts";
import {OrderType} from "@/api/model/order_type.ts";
import {Category} from "@/api/model/category.ts";
import {Dish} from "@/api/model/dish.ts";
import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {useDB} from "@/api/db/db.ts";
import {DateTime} from "luxon";

interface WeekOption {
  label: string;
  value: string;
}

const formatWeekLabel = (date: DateTime) => {
  const start = date.startOf('week');
  const end = start.plus({days: 6});
  return `${start.toFormat('yyyy-LL-dd')} → ${end.toFormat('yyyy-LL-dd')}`;
};

const parseCreatedAt = (value?: string | Date | null) => {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    const parsed = DateTime.fromISO(value);
    return parsed.isValid ? parsed : null;
  }
  const parsed = DateTime.fromJSDate(value);
  return parsed.isValid ? parsed : null;
};

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

export const ProductMixWeeklyReportFilter = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {data: usersData, isLoading: loadingUsers} = useApi<SettingsData<User>>(Tables.users, [], ['first_name asc'], 0, 9999);
  const {data: orderTypesData, isLoading: loadingOrderTypes} = useApi<SettingsData<OrderType>>(Tables.order_types, [], ['name asc'], 0, 9999);
  const {data: categoriesData, isLoading: loadingCategories} = useApi<SettingsData<Category>>(Tables.categories, [], ['name asc'], 0, 9999);
  const {data: dishesData, isLoading: loadingDishes} = useApi<SettingsData<Dish>>(Tables.dishes, [], ['name asc'], 0, 9999, ['categories']);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    let isMounted = true;

    const fetchWeeks = async () => {
      try {
        if (!queryRef.current) {
          return;
        }

        setLoading(true);
        const result: any = await queryRef.current(
          `SELECT created_at FROM ${Tables.orders} WHERE created_at != NONE ORDER BY created_at ASC LIMIT 1`
        );

        const firstOrderRecord = result?.[0]?.[0];
        const firstOrderDate = parseCreatedAt(firstOrderRecord?.created_at);
        const start = firstOrderDate?.startOf('week') || DateTime.now().startOf('week');
        const end = DateTime.now().startOf('week');

        const generatedWeeks: WeekOption[] = [];
        let current = start;
        while (current <= end) {
          generatedWeeks.push({
            value: current.toFormat("yyyy-LL-dd"),
            label: formatWeekLabel(current),
          });
          current = current.plus({weeks: 1});
        }

        if (isMounted) {
          setWeeks(generatedWeeks);
          setSelectedWeek(generatedWeeks.at(-1)?.value);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to load weeks:", err);
        if (isMounted) {
          setError("Unable to load weeks");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchWeeks().catch(() => {
      // already handled inside fetchWeeks
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const weekOptions = useMemo(() => {
    return weeks.map((week) => (
      <option key={week.value} value={week.value}>
        {week.label}
      </option>
    ));
  }, [weeks]);

  return (
    <form
      action={REPORTS_PRODUCT_MIX_WEEKLY}
      className="flex flex-col gap-3 items-start"
      target="_blank"
    >
      <div className="w-full flex flex-col gap-2">
        <label htmlFor="product-mix-weekly-week">Week</label>
        <select
          id="product-mix-weekly-week"
          name="week"
          className="input bg-white min-w-[260px]"
          disabled={loading || !!error}
          value={selectedWeek}
          onChange={(event) => setSelectedWeek(event.target.value)}
          required
        >
          {!loading && !weeks.length && (
            <option>No weeks available</option>
          )}
          {weekOptions}
        </select>
        {loading && <p className="text-sm text-gray-500">Loading weeks...</p>}
        {error && <p className="text-sm text-danger-600">{error}</p>}
      </div>

      <div className="w-full flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="product-mix-weekly-order-takers">{t('filters.orderTakers')}</label>
          <ReactSelect
            id="product-mix-weekly-order-takers"
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
          <label htmlFor="product-mix-weekly-order-types">{t('filters.orderTypes')}</label>
          <ReactSelect
            id="product-mix-weekly-order-types"
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
          <label htmlFor="product-mix-weekly-categories">{t('filters.categories')}</label>
          <ReactSelect
            id="product-mix-weekly-categories"
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
          <label htmlFor="product-mix-weekly-menu-items">{t('filters.menuItems')}</label>
          <ReactSelect
            id="product-mix-weekly-menu-items"
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
        disabled={!selectedWeek}
      >
        Generate
      </Button>
    </form>
  );
}