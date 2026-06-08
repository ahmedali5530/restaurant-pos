import {Category} from "@/api/model/category.ts";
import {Dish} from "@/api/model/dish.ts";
import {Menu, MenuMenuItem} from "@/api/model/menu.ts";
import {DateInput, getAppTimezone, toLuxonDateTime, toJsDate} from "@/lib/datetime.ts";

type MenuCollection = Menu[] | Menu[][] | unknown;

export interface ResolvedMenuData {
  hasActiveMenus: boolean
  activeMenus: Menu[]
  dishes: Dish[]
  categories: Category[]
}

const toMenuRows = (value: MenuCollection): Menu[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  if (value.length > 0 && Array.isArray(value[0])) {
    return value[0] as Menu[];
  }

  return value as Menu[];
};

const toMinutes = (value?: unknown): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = toJsDate(value as DateInput);
  if (isNaN(parsed.getTime())) {
    return undefined;
  }

  return (parsed.getHours() * 60) + parsed.getMinutes();
};

const isInsideWindow = (
  nowMinutes: number,
  startMinutes?: number,
  endMinutes?: number,
  endsOnNextDay?: boolean
): boolean => {
  if (startMinutes === undefined && endMinutes === undefined) {
    return true;
  }

  if (startMinutes !== undefined && endMinutes !== undefined) {
    const isOvernight = endsOnNextDay ?? endMinutes <= startMinutes;
    if (isOvernight) {
      return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
    }

    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }

  if (startMinutes !== undefined) {
    return nowMinutes >= startMinutes;
  }

  return nowMinutes <= (endMinutes ?? nowMinutes);
};

export const normalizeMenus = (menus: MenuCollection): Menu[] => {
  return toMenuRows(menus).filter((menu): menu is Menu => {
    return Boolean(menu && menu.id && menu.active !== false && !menu.deleted_at);
  });
};

export const isMenuActiveNow = (menu: Menu, value?: DateInput): boolean => {
  const timezone = getAppTimezone();
  const now = toLuxonDateTime(value).setZone(timezone);
  const nowMinutes = (now.hour * 60) + now.minute;

  const startMinutes = toMinutes(menu.start_from);
  const endMinutes = toMinutes(menu.end_time);

  return isInsideWindow(nowMinutes, startMinutes, endMinutes, menu.ends_on_next_day);
};

const getMenuItemDishId = (menuItem: MenuMenuItem): string | undefined => {
  return menuItem?.menu_item?.id?.toString();
};

const resolveMenuItemMap = (menus: Menu[]): Map<string, {menuItem: MenuMenuItem, menuName: string}> => {
  const resolved = new Map<string, {menuItem: MenuMenuItem, menuName: string}>();

  menus.forEach((menu) => {
    (menu.items || []).forEach((menuItem) => {
      const dishId = getMenuItemDishId(menuItem);
      if (!dishId || menuItem.active === false || resolved.has(dishId)) {
        return;
      }

      resolved.set(dishId, {menuItem, menuName: menu.name});
    });
  });

  return resolved;
};

const resolveMenuDish = (baseDish: Dish | undefined, menuItem: MenuMenuItem, menuName: string): Dish | null => {
  const sourceDish = baseDish ?? menuItem.menu_item;
  if (!sourceDish) {
    return null;
  }

  const resolvedPrice = menuItem.price ?? sourceDish.price;

  return {
    ...sourceDish,
    price: resolvedPrice,
    menu_name: menuName
  };
};

const resolveMenuCategories = (categories: Category[], dishes: Dish[]): Category[] => {
  const categoryIds = new Set<string>();
  dishes.forEach((dish) => {
    (dish.categories || []).forEach((category) => {
      categoryIds.add(category.id.toString());
    });
  });

  return categories.filter((category) => categoryIds.has(category.id.toString()));
};

export const resolveMenuAwareData = ({
  categories,
  dishes,
  menus,
  now
}: {
  categories: Category[]
  dishes: Dish[]
  menus: MenuCollection
  now?: DateInput
}): ResolvedMenuData => {
  const normalizedMenus = normalizeMenus(menus);
  const activeMenus = normalizedMenus.filter((menu) => isMenuActiveNow(menu, now));
  if (activeMenus.length === 0) {
    return {
      hasActiveMenus: false,
      activeMenus: [],
      dishes,
      categories
    };
  }

  const baseDishMap = new Map<string, Dish>();
  dishes.forEach((dish) => {
    baseDishMap.set(dish.id.toString(), dish);
  });

  const menuItemMap = resolveMenuItemMap(activeMenus);
  const resolvedDishes: Dish[] = [];
  menuItemMap.forEach((data, dishId) => {
    const dish = resolveMenuDish(baseDishMap.get(dishId), data.menuItem, data.menuName);
    if (!dish) {
      return;
    }

    resolvedDishes.push(dish);
  });

  return {
    hasActiveMenus: true,
    activeMenus,
    dishes: resolvedDishes,
    categories: resolveMenuCategories(categories, resolvedDishes)
  };
};
