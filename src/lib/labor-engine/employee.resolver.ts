import {Tables} from '@/api/db/tables.ts';
import type {Employee} from '@/api/model/employee.ts';
import type {User} from '@/api/model/user.ts';
import type {DbClient} from '@/lib/labor-engine/types.ts';
import {toUserRecordId} from '@/lib/labor-engine/record-id.ts';

const unwrapRows = <T>(result: unknown): T[] => {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) {
      return result[0] as T[];
    }
    return result as T[];
  }
  return [];
};

export const findEmployeeByUser = async (
  db: DbClient,
  user: User,
): Promise<Employee | undefined> => {
  const rows = unwrapRows<Employee>(
    await db.query(
      `SELECT * FROM ${Tables.employees} WHERE user = $user AND deleted_at = NONE LIMIT 1`,
      {user: user.id},
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

  const employeeNumber = `EMP-${String(user.login ?? user.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}-${Date.now().toString(36).slice(-4)}`.toUpperCase();

  const created = await db.create(Tables.employees, {
    employee_number: employeeNumber,
    user: toUserRecordId(user),
    first_name: user.first_name,
    last_name: user.last_name,
    employment_status: 'active',
    employment_type: 'hourly',
    hire_date: new Date().toISOString(),
  });

  const record = (Array.isArray(created) ? created[0] : created) as unknown as Employee;
  return record;
};
