import { Tables } from '@/api/db/tables.ts';
import type { Employee } from '@/api/model/employee.ts';
import { EntityMappingRepository } from '@/integrations/accounting/external/entity-mapping-repository.ts';
import { HIKVISION_PROVIDER_ID } from '@/integrations/providers/hardware/hikvision/isapi-types.ts';
import type {
  HikvisionDeviceConfig,
  HikvisionProviderConfig,
} from '@/integrations/providers/hardware/hikvision/isapi-types.ts';
import {
  createUserInfo,
  deleteUserInfo,
  modifyUserInfo,
} from '@/integrations/providers/hardware/hikvision/client-bridge.ts';
import type { HikvisionDb } from '@/integrations/providers/hardware/hikvision/event-poller.ts';
import type { EntityChangedPayload } from '@/integrations/events/payloads/entity-changed.ts';

const TENANT_ID = 'default';

function unwrapRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) return [];
  const first = result[0];
  return Array.isArray(first) ? (first as T[]) : (result as T[]);
}

function employeeDisplayName(employee: Pick<Employee, 'first_name' | 'last_name'>): string {
  return `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim() || employee.first_name || 'Employee';
}

function isActiveEmployee(employee: Partial<Employee>): boolean {
  if (employee.deleted_at) return false;
  const status = String(employee.employment_status ?? 'active').toLowerCase();
  return status === 'active' || status === 'on_leave';
}

function toUserInfoPayload(employee: Employee) {
  const employeeNo = String(employee.employee_number ?? '').trim();
  return {
    employeeNo,
    name: employeeDisplayName(employee),
    userType: 'normal',
    Valid: {
      enable: true,
      beginTime: '2020-01-01T00:00:00',
      endTime: '2037-12-31T23:59:59',
      timeType: 'local',
    },
    doorRight: '1',
    RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
  };
}

export async function upsertEmployeeOnDevices(params: {
  db: HikvisionDb;
  config: HikvisionProviderConfig;
  devices: HikvisionDeviceConfig[];
  employee: Employee;
}): Promise<{ pushed: number; errors: string[] }> {
  const mappingRepo = new EntityMappingRepository(params.db);
  const employeeNo = String(params.employee.employee_number ?? '').trim();
  const errors: string[] = [];
  let pushed = 0;

  if (!employeeNo) {
    return { pushed: 0, errors: ['Employee number is required'] };
  }

  const shouldDelete = !isActiveEmployee(params.employee);
  const existing = await mappingRepo.findByPosrId(
    HIKVISION_PROVIDER_ID,
    TENANT_ID,
    'employee',
    String(params.employee.id)
  );
  const existingExternalId =
    existing?.externalId ?? (existing as { external_id?: string } | null)?.external_id;

  const deviceIds: string[] = [];

  for (const device of params.devices) {
    try {
      if (shouldDelete) {
        await deleteUserInfo(device, employeeNo);
        continue;
      }

      const payload = toUserInfoPayload(params.employee);
      if (existingExternalId) {
        try {
          await modifyUserInfo(device, payload);
        } catch {
          await createUserInfo(device, payload);
        }
      } else {
        try {
          await createUserInfo(device, payload);
        } catch {
          await modifyUserInfo(device, payload);
        }
      }
      deviceIds.push(device.id);
      pushed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${device.name}: ${message}`);
    }
  }

  if (shouldDelete) {
    await mappingRepo.delete(HIKVISION_PROVIDER_ID, TENANT_ID, 'employee', String(params.employee.id));
  } else if (deviceIds.length > 0 || existing) {
    await mappingRepo.save({
      providerId: HIKVISION_PROVIDER_ID,
      tenantId: TENANT_ID,
      entityType: 'employee',
      posrId: String(params.employee.id),
      externalId: employeeNo,
      externalPayload: {
        deviceIds: deviceIds.length ? deviceIds : (existing?.externalPayload as any)?.deviceIds ?? [],
        lastSyncedAt: new Date().toISOString(),
        name: employeeDisplayName(params.employee),
      },
    });
  }

  return { pushed, errors };
}

export async function handleEmployeeEntityChanged(params: {
  db: HikvisionDb;
  config: HikvisionProviderConfig;
  devices: HikvisionDeviceConfig[];
  payload: EntityChangedPayload;
}): Promise<void> {
  if (!params.config.autoSyncEmployees) return;
  if (params.payload.domain !== 'hr') return;
  if (params.payload.table !== 'employee' && params.payload.table !== Tables.employees) return;

  const after = params.payload.after as Employee | null | undefined;
  const before = params.payload.before as Employee | null | undefined;
  const employee = after ?? before;
  if (!employee?.id && !params.payload.entityId) return;

  let record = employee;
  if (!record?.employee_number) {
    const rows = unwrapRows<Employee>(
      await params.db.query(
        `SELECT * FROM ${Tables.employees} WHERE id = $id LIMIT 1`,
        { id: params.payload.entityId }
      )
    );
    record = rows[0];
  }
  if (!record) return;

  const action = params.payload.action;
  if (action === 'delete' || action === 'deactivate') {
    record = { ...record, employment_status: 'terminated', deleted_at: record.deleted_at ?? (new Date() as any) };
  }

  await upsertEmployeeOnDevices({
    db: params.db,
    config: params.config,
    devices: params.devices,
    employee: record,
  });
}

export async function pushAllActiveEmployees(params: {
  db: HikvisionDb;
  config: HikvisionProviderConfig;
  devices: HikvisionDeviceConfig[];
}): Promise<{ total: number; pushed: number; errors: string[] }> {
  const rows = unwrapRows<Employee>(
    await params.db.query(
      `SELECT * FROM ${Tables.employees}
       WHERE deleted_at = NONE
         AND (employment_status = NONE OR employment_status = 'active' OR employment_status = 'on_leave')`
    )
  );

  let pushed = 0;
  const errors: string[] = [];

  for (const employee of rows) {
    const result = await upsertEmployeeOnDevices({
      db: params.db,
      config: params.config,
      devices: params.devices,
      employee,
    });
    pushed += result.pushed;
    errors.push(...result.errors.map((e) => `${employee.employee_number}: ${e}`));
  }

  return { total: rows.length, pushed, errors };
}
