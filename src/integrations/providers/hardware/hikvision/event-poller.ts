import { Tables } from '@/api/db/tables.ts';
import type { Employee } from '@/api/model/employee.ts';
import type { TimeEntry } from '@/api/model/time_entry.ts';
import type { User } from '@/api/model/user.ts';
import type { DbClient } from '@/lib/labor-engine/types.ts';
import {
  clockIn,
  clockOut,
  createManualEntry,
} from '@/lib/labor-engine/attendance/attendance.service.ts';
import { nowSurrealDateTime, toSurrealDateTime } from '@/lib/datetime.ts';
import { toEntityRecordId } from '@/lib/labor-engine/record-id.ts';
import {
  assignOddEvenDirections,
  calendarDayKey,
  eventDedupeKey,
  isDuplicateWithinWindow,
  resolvePunchDirection,
  type PunchDirection,
} from '@/integrations/providers/hardware/hikvision/attendance-mapper.ts';
import type {
  HikvisionAcsEvent,
  HikvisionDeviceConfig,
  HikvisionProviderConfig,
} from '@/integrations/providers/hardware/hikvision/isapi-types.ts';
import { syncEvents } from '@/integrations/providers/hardware/hikvision/client-bridge.ts';

export type HikvisionDb = {
  query: <R extends unknown[] = any[]>(sql: string, parameters?: Record<string, unknown>) => Promise<R>;
  create: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  merge: (thing: string, data: Record<string, unknown>) => Promise<unknown>;
  select?: (thing: string) => Promise<unknown>;
};

type PendingPunch = {
  event: HikvisionAcsEvent;
  dedupeKey: string;
  employeeNo: string;
  timeMs: number;
  direction: PunchDirection;
};

function unwrapRows<T>(result: unknown): T[] {
  if (!Array.isArray(result)) return [];
  const first = result[0];
  return Array.isArray(first) ? (first as T[]) : (result as T[]);
}

async function alreadyImported(db: HikvisionDb, dedupeKey: string): Promise<boolean> {
  const rows = unwrapRows<{ id: string }>(
    await db.query(
      `SELECT id FROM ${Tables.integration_hikvision_events} WHERE dedupe_key = $dedupeKey LIMIT 1`,
      { dedupeKey }
    )
  );
  return Boolean(rows[0]?.id);
}

async function storeRawEvent(
  db: HikvisionDb,
  params: {
    deviceId: string;
    event: HikvisionAcsEvent;
    dedupeKey: string;
    timeEntryId?: string | null;
  }
) {
  const eventTime = params.event.time ? toSurrealDateTime(params.event.time) : null;
  try {
    await db.create(Tables.integration_hikvision_events, {
      device_id: params.deviceId,
      serial_no: params.event.serialNo ?? null,
      employee_no: params.event.employeeNoString ?? null,
      event_time: eventTime,
      attendance_status: params.event.attendanceStatus ?? null,
      verify_mode: params.event.currentVerifyMode ?? null,
      dedupe_key: params.dedupeKey,
      raw: params.event,
      imported_at: nowSurrealDateTime(),
      time_entry: params.timeEntryId ?? null,
    });
  } catch {
    // Unique index race — treat as already imported
  }
}

async function updateDeviceState(
  db: HikvisionDb,
  deviceId: string,
  patch: Record<string, unknown>
) {
  const existing = unwrapRows<{ id: string }>(
    await db.query(
      `SELECT id FROM ${Tables.integration_hikvision_device_states} WHERE device_id = $deviceId LIMIT 1`,
      { deviceId }
    )
  );

  const data = {
    device_id: deviceId,
    updated_at: nowSurrealDateTime(),
    ...patch,
  };

  if (existing[0]?.id) {
    await db.merge(existing[0].id, data);
  } else {
    await db.create(Tables.integration_hikvision_device_states, data);
  }
}

async function findEmployeeByNumber(
  db: HikvisionDb,
  employeeNo: string
): Promise<(Employee & { user?: User }) | null> {
  const rows = unwrapRows<Employee & { user?: User }>(
    await db.query(
      `SELECT * FROM ${Tables.employees}
       WHERE employee_number = $employeeNo AND deleted_at = NONE
       LIMIT 1 FETCH user`,
      { employeeNo }
    )
  );
  return rows[0] ?? null;
}

async function findOpenEntry(
  db: HikvisionDb,
  employeeId: string
): Promise<TimeEntry | null> {
  const rows = unwrapRows<TimeEntry>(
    await db.query(
      `SELECT * FROM ${Tables.time_entries}
       WHERE employee = $employeeId AND clock_out = NONE
       ORDER BY clock_in DESC
       LIMIT 1`,
      { employeeId: toEntityRecordId(employeeId) }
    )
  );
  return rows[0] ?? null;
}

async function lastPunchMsForEmployee(
  db: HikvisionDb,
  deviceId: string,
  employeeNo: string
): Promise<number | null> {
  const rows = unwrapRows<{ event_time?: string }>(
    await db.query(
      `SELECT event_time FROM ${Tables.integration_hikvision_events}
       WHERE device_id = $deviceId AND employee_no = $employeeNo
       ORDER BY event_time DESC
       LIMIT 1`,
      { deviceId, employeeNo }
    )
  );
  const value = rows[0]?.event_time;
  if (!value) return null;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function applyPunch(
  db: HikvisionDb,
  params: {
    employee: Employee & { user?: User };
    direction: PunchDirection;
    at: Date;
    notes?: string;
  }
): Promise<string | null> {
  const linkedUser = params.employee.user;
  if (!linkedUser?.id) {
    return null;
  }

  if (params.direction === 'in') {
    const open = await findOpenEntry(db, params.employee.id);
    if (open) {
      return open.id;
    }
    const entry = await clockIn(db as DbClient, {
      user: linkedUser,
      employeeId: params.employee.id,
      clockInAt: params.at,
      platform: 'hikvision',
      source: 'device',
      notes: params.notes,
    });
    return entry.id;
  }

  if (params.direction === 'out') {
    const open = await findOpenEntry(db, params.employee.id);
    if (open?.id) {
      const entry = await clockOut(db as DbClient, {
        timeEntryId: open.id,
        clockOutAt: params.at,
        user: linkedUser,
      });
      return entry.id;
    }
    // No open shift — create a short closed pair ending at this punch
    const clockInAt = new Date(params.at.getTime() - 60_000);
    const entry = await createManualEntry(db as DbClient, {
      user: linkedUser,
      employeeId: params.employee.id,
      clockIn: clockInAt,
      clockOut: params.at,
      notes: params.notes ?? 'Hikvision checkout without open shift',
      source: 'device',
    });
    return entry.id;
  }

  return null;
}

export async function importDeviceEvents(
  db: HikvisionDb,
  config: HikvisionProviderConfig,
  device: HikvisionDeviceConfig,
  events: HikvisionAcsEvent[]
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const withMeta: PendingPunch[] = [];
  for (const event of events) {
    const employeeNo = String(event.employeeNoString ?? '').trim();
    if (!employeeNo || !event.time) {
      skipped += 1;
      continue;
    }
    const timeMs = new Date(event.time).getTime();
    if (!Number.isFinite(timeMs)) {
      skipped += 1;
      continue;
    }
    const dedupeKey = eventDedupeKey(device.id, event);
    if (await alreadyImported(db, dedupeKey)) {
      skipped += 1;
      continue;
    }
    withMeta.push({
      event,
      dedupeKey,
      employeeNo,
      timeMs,
      direction: resolvePunchDirection(event),
    });
  }

  // Apply odd/even fallback per employee per calendar day for unknown directions
  const byDay = new Map<string, PendingPunch[]>();
  for (const punch of withMeta) {
    if (punch.direction !== 'unknown') continue;
    const day = calendarDayKey(new Date(punch.timeMs), config.timezone);
    const key = `${punch.employeeNo}:${day}`;
    const list = byDay.get(key) ?? [];
    list.push(punch);
    byDay.set(key, list);
  }
  for (const list of byDay.values()) {
    const assigned = assignOddEvenDirections(list);
    const byKey = new Map(assigned.map((item) => [item.dedupeKey, item.direction]));
    for (const punch of list) {
      punch.direction = byKey.get(punch.dedupeKey) ?? punch.direction;
    }
  }

  withMeta.sort((a, b) => a.timeMs - b.timeMs);

  for (const punch of withMeta) {
    try {
      const lastMs = await lastPunchMsForEmployee(db, device.id, punch.employeeNo);
      if (isDuplicateWithinWindow(lastMs, punch.timeMs, 60)) {
        await storeRawEvent(db, {
          deviceId: device.id,
          event: punch.event,
          dedupeKey: punch.dedupeKey,
        });
        skipped += 1;
        continue;
      }

      const employee = await findEmployeeByNumber(db, punch.employeeNo);
      if (!employee?.id) {
        await storeRawEvent(db, {
          deviceId: device.id,
          event: punch.event,
          dedupeKey: punch.dedupeKey,
        });
        skipped += 1;
        continue;
      }

      if (!config.autoImportPunches) {
        await storeRawEvent(db, {
          deviceId: device.id,
          event: punch.event,
          dedupeKey: punch.dedupeKey,
        });
        skipped += 1;
        continue;
      }

      const direction =
        punch.direction === 'unknown'
          ? resolvePunchDirection(punch.event, 'in')
          : punch.direction;

      const timeEntryId = await applyPunch(db, {
        employee,
        direction,
        at: new Date(punch.timeMs),
        notes: `Hikvision ${device.name}`,
      });

      await storeRawEvent(db, {
        deviceId: device.id,
        event: punch.event,
        dedupeKey: punch.dedupeKey,
        timeEntryId,
      });

      if (timeEntryId) imported += 1;
      else skipped += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${punch.employeeNo}: ${message}`);
      try {
        await storeRawEvent(db, {
          deviceId: device.id,
          event: punch.event,
          dedupeKey: punch.dedupeKey,
        });
      } catch {
        // ignore
      }
    }
  }

  return { imported, skipped, errors };
}

export async function pollDeviceAttendance(
  db: HikvisionDb,
  config: HikvisionProviderConfig,
  device: HikvisionDeviceConfig
): Promise<{ imported: number; skipped: number; errors: string[]; count: number }> {
  const end = new Date();
  const start = new Date(end.getTime() - config.eventLookbackMinutes * 60_000);

  try {
    const result = await syncEvents({
      device,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });

    const imported = await importDeviceEvents(db, config, device, result.events ?? []);

    const lastEvent = [...(result.events ?? [])]
      .map((e) => (e.time ? new Date(e.time).getTime() : 0))
      .filter((n) => n > 0)
      .sort((a, b) => b - a)[0];

    await updateDeviceState(db, device.id, {
      last_poll_at: nowSurrealDateTime(),
      last_success_at: nowSurrealDateTime(),
      last_error: null,
      last_event_time: lastEvent ? toSurrealDateTime(new Date(lastEvent)) : null,
    });

    return { ...imported, count: result.count ?? result.events?.length ?? 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateDeviceState(db, device.id, {
      last_poll_at: nowSurrealDateTime(),
      last_error: message,
    });
    throw error;
  }
}

export async function pollAllDevices(
  db: HikvisionDb,
  config: HikvisionProviderConfig,
  devices: HikvisionDeviceConfig[]
) {
  const summary = {
    devices: 0,
    imported: 0,
    skipped: 0,
    errors: [] as string[],
  };

  for (const device of devices) {
    summary.devices += 1;
    try {
      const result = await pollDeviceAttendance(db, config, device);
      summary.imported += result.imported;
      summary.skipped += result.skipped;
      summary.errors.push(...result.errors.map((e) => `${device.name}: ${e}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${device.name}: ${message}`);
    }
  }

  return summary;
}
