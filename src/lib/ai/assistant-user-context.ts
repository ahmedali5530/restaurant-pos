import {Tables} from "@/api/db/tables.ts";
import type {User, UserRole, UserShift} from "@/api/model/user.ts";
import type {Employee} from "@/api/model/employee.ts";
import {ACCESS_RULE_MODULES, normalizeModules} from "@/lib/access.rules.ts";
import {recordIdToString, toQueryRecordId} from "@/api/reports/shared/records.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import {formatDateTime} from "@/lib/datetime.ts";
import {toRecordId} from "@/lib/utils.ts";

type DbQuery = {
  query: (sql: string, vars?: Record<string, unknown>) => Promise<unknown>;
};

/** Safe, credential-free snapshot of who the assistant is talking to. */
export type AssistantUserContext = {
  user: {
    id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    clock_in_at?: string | null;
    clock_out_at?: string | null;
    branch_ids?: string[] | null;
  };
  role?: {
    id?: string;
    name: string;
    /** Top-level access areas from the role (reports, admin, …) — not every leaf module. */
    access_areas: string[];
  };
  shift?: {
    id?: string;
    name: string;
    start_time: string;
    end_time: string;
    ends_next_day?: boolean;
  };
  employee?: {
    id: string;
    employee_number: string;
    first_name: string;
    last_name: string;
    department?: string | null;
    position?: string | null;
    cost_center?: string | null;
    manager?: string | null;
    employment_status?: string | null;
    employment_type?: string | null;
    hire_date?: string | null;
  };
};

const CREDENTIAL_KEYS = new Set([
  "login",
  "password",
  "pin",
  "password_hash",
  "pass",
  "pin_code",
  "token",
  "secret",
  "api_key",
]);

const nameOf = (value: unknown): string | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as {name?: unknown; first_name?: unknown; last_name?: unknown};
  if (row.name != null && String(row.name).trim()) return String(row.name).trim();
  const full = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return full || null;
};

const formatOptionalStamp = (value: unknown): string | null => {
  if (value == null || value === "") return null;
  try {
    return formatDateTime(value as any);
  } catch {
    const text = String(value).trim();
    return text && text !== "[object Object]" ? text : null;
  }
};

/** Collapse granted modules to parent ACCESS_RULE_MODULES keys for a short prompt. */
export const summarizeAccessAreas = (modules: string[] | undefined | null): string[] => {
  const normalized = new Set(normalizeModules(modules));
  if (!normalized.size) return [];
  const areas: string[] = [];
  for (const [section, config] of Object.entries(ACCESS_RULE_MODULES)) {
    const hit = normalized.has(section)
      || config.children.some((child) =>
        normalized.has(child)
        || [...normalized].some((mod) => mod === child || mod.startsWith(`${child}.`) || child.startsWith(`${mod}.`))
      );
    if (hit) areas.push(section);
  }
  return areas;
};

export const buildAssistantUserContextFromSnapshot = (
  user: User,
  employee?: Employee | null,
): AssistantUserContext => {
  const first = String(user.first_name ?? "").trim();
  const last = String(user.last_name ?? "").trim();
  const display_name = [first, last].filter(Boolean).join(" ") || "User";
  const role = user.user_role && typeof user.user_role === "object"
    ? user.user_role as UserRole
    : undefined;
  const shift = user.user_shift && typeof user.user_shift === "object"
    ? user.user_shift as UserShift
    : undefined;

  const context: AssistantUserContext = {
    user: {
      id: recordIdToString(user.id),
      first_name: first,
      last_name: last,
      display_name,
      clock_in_at: formatOptionalStamp(user.clock_in_at),
      clock_out_at: formatOptionalStamp(user.clock_out_at),
      branch_ids: Array.isArray(user.branch_ids) ? user.branch_ids.map(String) : user.branch_ids ?? null,
    },
  };

  if (role?.name) {
    context.role = {
      id: role.id ? recordIdToString(role.id) : undefined,
      name: String(role.name),
      access_areas: summarizeAccessAreas(role.roles ?? user.roles),
    };
  } else if (user.roles?.length) {
    context.role = {
      name: "Custom",
      access_areas: summarizeAccessAreas(user.roles),
    };
  }

  if (shift?.name) {
    context.shift = {
      id: shift.id ? recordIdToString(shift.id) : undefined,
      name: String(shift.name),
      start_time: String(shift.start_time ?? ""),
      end_time: String(shift.end_time ?? ""),
      ends_next_day: Boolean(shift.ends_next_day),
    };
  }

  if (employee?.id) {
    context.employee = {
      id: recordIdToString(employee.id),
      employee_number: String(employee.employee_number ?? ""),
      first_name: String(employee.first_name ?? first),
      last_name: String(employee.last_name ?? last),
      department: nameOf(employee.department),
      position: nameOf(employee.position),
      cost_center: nameOf(employee.cost_center),
      manager: nameOf(employee.manager),
      employment_status: employee.employment_status ? String(employee.employment_status) : null,
      employment_type: employee.employment_type ? String(employee.employment_type) : null,
      hire_date: formatOptionalStamp(employee.hire_date),
    };
  }

  return context;
};

/**
 * Load a fresh credential-free user + linked HR employee for the assistant.
 * Never selects login/password/pin.
 */
export const resolveAssistantUserContext = async (
  db: DbQuery,
  user?: User | null,
): Promise<AssistantUserContext | null> => {
  if (!user?.id) return null;
  const userId = recordIdToString(user.id);
  if (!userId) return null;

  let freshUser = user;
  try {
    const rows = unwrapQueryResult<User>(
      await db.query(
        `SELECT id, first_name, last_name, clock_in_at, clock_out_at, branch_ids, user_role, user_shift, roles
         FROM ONLY ${toRecordId(userId)}
         WHERE deleted_at = none
         FETCH user_role, user_shift`,
      ),
    );
    if (rows[0]) {
      freshUser = {...user, ...rows[0]};
    }
  } catch {
    // fall back to the in-memory login snapshot
  }

  // Defense: never leak credential fields even if a future query adds them.
  for (const key of CREDENTIAL_KEYS) {
    delete (freshUser as any)[key];
  }

  let employee: Employee | null = null;
  try {
    const rows = unwrapQueryResult<Employee>(
      await db.query(
        `SELECT id, employee_number, first_name, last_name, employment_status, employment_type, hire_date,
                department, position, cost_center, manager
         FROM ${Tables.employees}
         WHERE user = $user AND deleted_at = NONE
         LIMIT 1
         FETCH department, position, cost_center, manager`,
        {user: toQueryRecordId(userId, "user")},
      ),
    );
    employee = rows[0] ?? null;
  } catch {
    employee = null;
  }

  return buildAssistantUserContextFromSnapshot(freshUser, employee);
};

/** System-prompt block: who the assistant is talking to (no credentials). */
export const formatAssistantUserContext = (context: AssistantUserContext | null | undefined): string => {
  if (!context?.user) return "";

  const lines: string[] = [
    "## Logged-in user (personalize to this person)",
    `You are talking to **${context.user.display_name}** (POS user \`${context.user.id}\`).`,
  ];

  if (context.role?.name) {
    const areas = context.role.access_areas.length
      ? ` Access areas: ${context.role.access_areas.join(", ")}.`
      : "";
    lines.push(`Role: **${context.role.name}**.${areas}`);
  }

  if (context.shift?.name) {
    const window = [context.shift.start_time, context.shift.end_time].filter(Boolean).join("–");
    const next = context.shift.ends_next_day ? " (ends next day)" : "";
    lines.push(`Assigned shift: **${context.shift.name}**${window ? ` ${window}` : ""}${next}.`);
  }

  if (context.user.clock_in_at && !context.user.clock_out_at) {
    lines.push(`Currently clocked in since ${context.user.clock_in_at}.`);
  } else if (context.user.clock_out_at) {
    lines.push(`Last clock-out: ${context.user.clock_out_at}.`);
  }

  if (context.employee) {
    const emp = context.employee;
    const bits = [
      emp.employee_number ? `#${emp.employee_number}` : null,
      emp.position,
      emp.department,
      emp.cost_center ? `cost center ${emp.cost_center}` : null,
      emp.employment_type,
      emp.employment_status,
    ].filter(Boolean);
    lines.push(
      `Linked HR employee: **${emp.first_name} ${emp.last_name}**`
        + (bits.length ? ` (${bits.join(" · ")})` : "")
        + (emp.manager ? `; manager: ${emp.manager}` : "")
        + (emp.hire_date ? `; hired ${emp.hire_date}` : "")
        + ".",
    );
  }

  if (context.user.branch_ids?.length) {
    lines.push(`Branch scope: ${context.user.branch_ids.join(", ")}.`);
  }

  lines.push(
    "Use their first name when natural. Tailor tone and suggestions to their role and shift. "
      + "Never ask for or repeat login, password, PIN, or other credentials. "
      + "Do not invent other people's identity or HR details beyond this block; use tools for live data.",
  );

  return lines.join("\n");
};
