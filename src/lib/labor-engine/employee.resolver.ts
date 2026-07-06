import {Tables} from '@/api/db/tables.ts';
import type {Employee} from '@/api/model/employee.ts';
import type {User} from '@/api/model/user.ts';
import type {DbClient} from '@/lib/labor-engine/types.ts';
import {recordIdToString, toQueryRecordId} from '@/api/reports/shared/records.ts';
import {nowSurrealDateTime} from '@/lib/datetime.ts';

export const unwrapRows = <T>(result: unknown): T[] => {
  if (!result) {
    return [];
  }

  if (!Array.isArray(result)) {
    return [];
  }

  const first = result[0];
  if (Array.isArray(first)) {
    return first as T[];
  }

  if (first && typeof first === 'object' && 'result' in first) {
    const inner = (first as {result: unknown}).result;
    if (Array.isArray(inner)) {
      return inner as T[];
    }
    if (inner && typeof inner === 'object') {
      return [inner as T];
    }
    return [];
  }

  if (first && typeof first === 'object' && 'id' in first) {
    return result as T[];
  }

  return [];
};

export const extractFirstRecord = <T>(result: unknown): T | undefined =>
  unwrapRows<T>(result)[0];

export const generateEmployeeNumber = (login: string): string =>
  `EMP-${String(login).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}-${Date.now().toString(36).slice(-4)}`.toUpperCase();

export interface CreateLinkedEmployeeParams {
  userId: string;
  employeeNumber: string;
  first_name: string;
  last_name: string;
}

export const createLinkedEmployee = async (
  db: DbClient,
  params: CreateLinkedEmployeeParams,
): Promise<Employee> => {
  const userId = recordIdToString(params.userId);
  if (!userId) {
    throw new Error('Cannot create employee without a linked user id');
  }

  const created = await db.create(Tables.employees, {
    employee_number: params.employeeNumber.trim(),
    user: toQueryRecordId(userId, 'user'),
    first_name: params.first_name,
    last_name: params.last_name,
    employment_status: 'active',
    employment_type: 'hourly',
    hire_date: nowSurrealDateTime(),
  });

  const record = (Array.isArray(created) ? created[0] : created) as unknown as Employee;
  return record;
};

export const findEmployeeByUser = async (
  db: DbClient,
  user: User,
): Promise<Employee | undefined> => {
  const userId = recordIdToString(user.id);
  if (!userId) {
    return undefined;
  }

  const rows = unwrapRows<Employee>(
    await db.query(
      `SELECT * FROM ${Tables.employees} WHERE user = $user AND deleted_at = NONE LIMIT 1`,
      {user: toQueryRecordId(userId, 'user')},
    ),
  );
  return rows[0];
};

export const ensureEmployeeForUser = async (
  db: DbClient,
  user: User,
): Promise<Employee> => {
  const existing = await findEmployeeByUser(db, user);
  if (existing) {
    return existing;
  }

  const userId = recordIdToString(user.id);
  if (!userId) {
    throw new Error('Cannot create employee without a user id');
  }

  return createLinkedEmployee(db, {
    userId,
    employeeNumber: generateEmployeeNumber(String(user.login ?? userId)),
    first_name: user.first_name,
    last_name: user.last_name,
  });
};
