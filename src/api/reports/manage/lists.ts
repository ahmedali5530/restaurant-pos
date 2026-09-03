import {Tables} from "@/api/db/tables.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";

type ListOptions = {search?: string; limit?: number};
type TableListOptions = ListOptions & {floor_name?: string};
type DiscountListOptions = ListOptions & {active_only?: boolean};
type MenuItemsOptions = {menu_name?: string; search?: string; limit?: number};

const normalizeSearch = (search?: string) => search?.trim().toLowerCase() || "";
const matchesSearch = (haystack: string, search: string) =>
  !search || haystack.toLowerCase().includes(search);

const mapNameId = (rows: Array<{id: unknown; name?: string}>) =>
  rows.map(row => ({
    id: recordIdToString(row.id),
    name: row.name ?? "Unknown",
  }));

export const listFloors = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, priority FROM ${Tables.floors}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{id: unknown; name?: string; priority?: number}>(await db.query(query));
  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "Unknown",
      priority: row.priority ?? 0,
    }))
    .filter(row => matchesSearch(row.name, search));
};

export const listTables = async (db: DbClient, options: TableListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const floorName = normalizeSearch(options.floor_name);
  const query = `
    SELECT id, name, number, floor.name AS floor_name FROM ${Tables.tables}
    WHERE deleted_at = NONE
    ORDER BY number ASC
    LIMIT ${limit}
    FETCH floor
  `;
  const rows = unwrapQueryResult<{
    id: unknown;
    name?: string;
    number?: string | number;
    floor_name?: string;
    floor?: {name?: string};
  }>(await db.query(query));

  return rows
    .map(row => {
      const floor = row.floor_name ?? row.floor?.name ?? "";
      return {
        id: recordIdToString(row.id),
        name: row.name ?? "",
        number: String(row.number ?? ""),
        floor_name: floor,
      };
    })
    .filter(row => {
      if (floorName && !row.floor_name.toLowerCase().includes(floorName)) return false;
      if (!search) return true;
      return (
        matchesSearch(row.name, search)
        || matchesSearch(row.number, search)
        || matchesSearch(row.floor_name, search)
      );
    });
};

export const listModifierGroups = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, priority FROM ${Tables.modifier_groups}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  return mapNameId(unwrapQueryResult(await db.query(query))).filter(row => matchesSearch(row.name, search));
};

export const listKitchens = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, priority FROM ${Tables.kitchens}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  return mapNameId(unwrapQueryResult(await db.query(query))).filter(row => matchesSearch(row.name, search));
};

export const listTaxes = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, rate, priority FROM ${Tables.taxes}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{id: unknown; name?: string; rate?: number; priority?: number}>(
    await db.query(query),
  );
  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "Unknown",
      rate: row.rate ?? 0,
      priority: row.priority ?? 0,
    }))
    .filter(row => matchesSearch(row.name, search));
};

export const listDiscounts = async (db: DbClient, options: DiscountListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const activeOnly = options.active_only ?? false;
  const query = `
    SELECT id, name, type, category, scope, application_mode, is_active, priority FROM ${Tables.discounts}
    WHERE deleted_at = NONE
    ${activeOnly ? "AND is_active = true" : ""}
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{
    id: unknown;
    name?: string;
    type?: string;
    category?: string;
    scope?: string;
    application_mode?: string;
    is_active?: boolean;
    priority?: number;
  }>(await db.query(query));

  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "Unknown",
      type: row.type ?? "",
      category: row.category ?? "",
      scope: row.scope ?? "",
      application_mode: row.application_mode ?? "",
      is_active: row.is_active ?? true,
      priority: row.priority ?? 0,
    }))
    .filter(row => matchesSearch(row.name, search));
};

export const listOrderTypes = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, priority FROM ${Tables.order_types}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  return mapNameId(unwrapQueryResult(await db.query(query))).filter(row => matchesSearch(row.name, search));
};

export const listPaymentTypes = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, type, priority FROM ${Tables.payment_types}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{id: unknown; name?: string; type?: string; priority?: number}>(
    await db.query(query),
  );
  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "Unknown",
      type: row.type ?? "",
      priority: row.priority ?? 0,
    }))
    .filter(row => matchesSearch(row.name, search) || matchesSearch(row.type ?? "", search));
};

export const listExtras = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, priority FROM ${Tables.extras}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  return mapNameId(unwrapQueryResult(await db.query(query))).filter(row => matchesSearch(row.name, search));
};

export const listCoupons = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, code, description, coupon_type, is_active, priority FROM ${Tables.coupons}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, code ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{
    id: unknown;
    code?: string;
    description?: string;
    coupon_type?: string;
    is_active?: boolean;
    priority?: number;
  }>(await db.query(query));

  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      code: row.code ?? "",
      description: row.description ?? "",
      coupon_type: row.coupon_type ?? "",
      is_active: row.is_active ?? true,
      priority: row.priority ?? 0,
    }))
    .filter(row =>
      matchesSearch(row.code, search)
      || matchesSearch(row.description ?? "", search),
    );
};

export const listMenus = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, priority FROM ${Tables.menus}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  return mapNameId(unwrapQueryResult(await db.query(query))).filter(row => matchesSearch(row.name, search));
};

export const getMenuItems = async (db: DbClient, options: MenuItemsOptions = {}) => {
  const limit = options.limit ?? 100;
  const search = normalizeSearch(options.search);
  const menuName = normalizeSearch(options.menu_name);

  if (menuName) {
    const query = `
      SELECT
        menu_item.id AS id,
        menu_item.name AS name,
        menu_item.number AS number,
        menu.name AS menu_name
      FROM ${Tables.menu_menu_items}
      WHERE menu.deleted_at = NONE AND menu_item.deleted_at = NONE
        AND string::lowercase(menu.name) CONTAINS $menuName
      ORDER BY menu_menu_item.priority ASC
      LIMIT ${limit}
      FETCH menu, menu_item
    `;
    const rows = unwrapQueryResult<{
      id: unknown;
      name?: string;
      number?: string | number;
      menu_name?: string;
      menu?: {name?: string};
      menu_item?: {id?: unknown; name?: string; number?: string | number};
    }>(await db.query(query, {menuName}));

    return rows
      .map(row => {
        const item = row.menu_item;
        return {
          id: recordIdToString(item?.id ?? row.id),
          name: item?.name ?? row.name ?? "",
          number: String(item?.number ?? row.number ?? ""),
          menu_name: row.menu_name ?? row.menu?.name ?? "",
        };
      })
      .filter(row => !search || matchesSearch(row.name, search) || matchesSearch(row.number, search));
  }

  const query = `
    SELECT id, name, number FROM ${Tables.dishes}
    WHERE deleted_at = NONE
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{id: unknown; name?: string; number?: string | number}>(
    await db.query(query),
  );
  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "",
      number: String(row.number ?? ""),
      menu_name: "",
    }))
    .filter(row => !search || matchesSearch(row.name, search) || matchesSearch(row.number, search));
};

export const listWorkflows = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name FROM ${Tables.workflows}
    WHERE deleted_at = NONE
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  return mapNameId(unwrapQueryResult(await db.query(query))).filter(row => matchesSearch(row.name, search));
};

export const listPrinters = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, type, priority FROM ${Tables.printers}
    WHERE deleted_at = NONE
    ORDER BY priority ASC, name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{id: unknown; name?: string; type?: string; priority?: number}>(
    await db.query(query),
  );
  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "Unknown",
      type: row.type ?? "",
      priority: row.priority ?? 0,
    }))
    .filter(row => matchesSearch(row.name, search));
};

export const listUsers = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, first_name, last_name, login, login_method, user_role.name AS role_name FROM ${Tables.users}
    WHERE deleted_at = NONE
    ORDER BY first_name ASC, last_name ASC
    LIMIT ${limit}
    FETCH user_role
  `;
  const rows = unwrapQueryResult<{
    id: unknown;
    first_name?: string;
    last_name?: string;
    login?: string;
    login_method?: string;
    role_name?: string;
    user_role?: {name?: string};
  }>(await db.query(query));

  return rows
    .map(row => {
      const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
      return {
        id: recordIdToString(row.id),
        name,
        login: row.login ?? "",
        login_method: row.login_method ?? "pin",
        role_name: row.role_name ?? row.user_role?.name ?? "",
      };
    })
    .filter(row =>
      matchesSearch(row.name, search)
      || matchesSearch(row.login ?? "", search)
      || matchesSearch(row.role_name ?? "", search),
    );
};

export const listRoles = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name FROM ${Tables.user_roles}
    WHERE deleted_at = NONE
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  return mapNameId(unwrapQueryResult(await db.query(query))).filter(row => matchesSearch(row.name, search));
};

export const listShifts = async (db: DbClient, options: ListOptions = {}) => {
  const limit = options.limit ?? 50;
  const search = normalizeSearch(options.search);
  const query = `
    SELECT id, name, start_time, end_time FROM ${Tables.shifts}
    WHERE deleted_at = NONE
    ORDER BY name ASC
    LIMIT ${limit}
  `;
  const rows = unwrapQueryResult<{
    id: unknown;
    name?: string;
    start_time?: string;
    end_time?: string;
  }>(await db.query(query));

  return rows
    .map(row => ({
      id: recordIdToString(row.id),
      name: row.name ?? "Unknown",
      start_time: row.start_time ?? "",
      end_time: row.end_time ?? "",
    }))
    .filter(row => matchesSearch(row.name, search));
};
