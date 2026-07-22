import { Tables } from '@/api/db/tables.ts';
import { Setting } from '@/api/model/setting.ts';
import {
  AUTO_CLOCK_OUT_KEY,
  AutoClockOutSettings,
  DEFAULT_AUTO_CLOCK_OUT,
} from '@/api/model/auto_clock_out.ts';
import {
  SESSION_SECURITY_KEY,
  SessionSecuritySettings,
  normalizeSessionSecurity,
} from '@/api/model/session_security.ts';
import { User, UserShift } from '@/api/model/user.ts';
import { TimeEntry } from '@/api/model/time_entry.ts';
import { ScheduledShift } from '@/api/model/scheduled_shift.ts';
import { findEmployeeByUser } from '@/lib/labor-engine/employee.resolver.ts';
import { isOvernightShift } from '@/lib/shift.utils.ts';
import { getAppTimezone, nowInAppTimezone, toLuxonDateTime } from '@/lib/datetime.ts';
import { toRecordId } from '@/lib/utils.ts';
import { DateTime as LuxonDateTime } from 'luxon';
import type { DbClient } from '@/lib/labor-engine/types.ts';

export const AUTO_CLOCK_OUT_WARNING_TOAST_ID = 'auto-clock-out-warning';
export const WARNING_SECONDS = 60;

const unwrapRows = <T>(raw: unknown): T[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    if (raw.length > 0 && Array.isArray(raw[0])) {
      return raw[0] as T[];
    }
    return raw as T[];
  }
  return [];
};

const recordIdString = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value.includes(':') ? value.split(':').pop() || value : value;
  if (typeof value === 'object' && value !== null) {
    if ('id' in value && (value as { id?: unknown }).id != null) {
      const inner = (value as { id: unknown }).id;
      return recordIdString(inner);
    }
    if ('toString' in value) {
      const s = String((value as { toString: () => string }).toString());
      return s.includes(':') ? s.split(':').pop() || s : s;
    }
  }
  const s = String(value);
  return s.includes(':') ? s.split(':').pop() || s : s;
};

export const loadSessionSecuritySettings = async (
  db: DbClient,
  userId: string
): Promise<SessionSecuritySettings> => {
  const [raw] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key`,
    { key: SESSION_SECURITY_KEY }
  );
  const rows = unwrapRows<Setting>(raw);
  const userRow = rows.find(
    (r) => recordIdString(r?.user) === recordIdString(userId)
  );
  return normalizeSessionSecurity(
    (userRow?.values ?? {}) as Partial<SessionSecuritySettings>
  );
};

export const loadAutoClockOutSettings = async (
  db: DbClient
): Promise<AutoClockOutSettings> => {
  const [raw] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    { key: AUTO_CLOCK_OUT_KEY }
  );
  const rows = unwrapRows<Setting>(raw);
  return {
    ...DEFAULT_AUTO_CLOCK_OUT,
    ...((rows[0]?.values ?? {}) as Partial<AutoClockOutSettings>),
  };
};

const parseTimeOnDate = (date: LuxonDateTime, time: string): LuxonDateTime => {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  return date.set({
    hour: hours || 0,
    minute: minutes || 0,
    second: 0,
    millisecond: 0,
  });
};

/** Resolve template shift end for an open clock-in, preferring the window that covers clock-in. */
export const resolveUserShiftEndAt = (
  shift: UserShift | undefined,
  clockIn: LuxonDateTime,
  now: LuxonDateTime = nowInAppTimezone()
): LuxonDateTime | null => {
  if (!shift?.start_time || !shift?.end_time) {
    return null;
  }

  const overnight =
    shift.ends_next_day ?? isOvernightShift(shift.start_time, shift.end_time);

  // Candidate windows: day of clock-in, and previous day (overnight spill).
  const candidates: LuxonDateTime[] = [];
  for (const dayOffset of [0, -1]) {
    const baseDay = clockIn.startOf('day').plus({ days: dayOffset });
    const start = parseTimeOnDate(baseDay, shift.start_time);
    let end = parseTimeOnDate(baseDay, shift.end_time);
    if (overnight || end <= start) {
      end = end.plus({ days: 1 });
    }
    // Window must cover clock-in (with small grace) and be relevant to now.
    if (clockIn >= start.minus({ minutes: 30 }) && clockIn <= end.plus({ hours: 12 })) {
      candidates.push(end);
    }
  }

  if (candidates.length === 0) {
    // Fallback: end of today's template window relative to now
    const todayStart = parseTimeOnDate(now.startOf('day'), shift.start_time);
    let todayEnd = parseTimeOnDate(now.startOf('day'), shift.end_time);
    if (overnight || todayEnd <= todayStart) {
      todayEnd = todayEnd.plus({ days: 1 });
    }
    if (now < todayStart && overnight) {
      // Before today's start during overnight — use yesterday's end
      return parseTimeOnDate(now.startOf('day').minus({ days: 1 }), shift.end_time);
    }
    return todayEnd;
  }

  // Prefer the earliest end that is still in the future or most recently passed
  candidates.sort((a, b) => a.toMillis() - b.toMillis());
  const upcoming = candidates.find((c) => c >= now);
  return upcoming ?? candidates[candidates.length - 1];
};

export const resolveDefinedTimeEndAt = (
  definedTime: string,
  clockIn: LuxonDateTime,
  now: LuxonDateTime = nowInAppTimezone()
): LuxonDateTime | null => {
  if (!definedTime) return null;

  const todayTarget = parseTimeOnDate(now.startOf('day'), definedTime);
  const yesterdayTarget = todayTarget.minus({ days: 1 });

  // Prefer today's target if clock-in was before it (or shortly after midnight spill).
  if (clockIn <= todayTarget.plus({ hours: 12 })) {
    if (clockIn <= todayTarget || todayTarget >= now.minus({ hours: 24 })) {
      return todayTarget;
    }
  }

  if (clockIn <= yesterdayTarget.plus({ hours: 12 }) && yesterdayTarget >= clockIn.minus({ minutes: 1 })) {
    return yesterdayTarget;
  }

  return todayTarget;
};

export const findOpenTimeEntry = async (
  db: DbClient,
  userId: string
): Promise<TimeEntry | undefined> => {
  const [raw] = await db.query(
    `SELECT * FROM ${Tables.time_entries}
     WHERE user = $userId AND clock_out = NONE
     ORDER BY clock_in DESC
     LIMIT 1`,
    { userId: toRecordId(userId) }
  );
  return unwrapRows<TimeEntry>(raw)[0];
};

export const findCurrentScheduledShiftEnd = async (
  db: DbClient,
  user: User,
  clockIn: LuxonDateTime,
  now: LuxonDateTime = nowInAppTimezone()
): Promise<LuxonDateTime | null> => {
  const employee = await findEmployeeByUser(db, user);
  if (!employee?.id) {
    return null;
  }

  const nowJs = now.toJSDate();
  const clockInJs = clockIn.toJSDate();

  // Prefer active scheduled shift (now within window)
  const [activeRaw] = await db.query(
    `SELECT * FROM ${Tables.scheduled_shifts}
     WHERE employee = $employeeId
       AND start_at <= $now
       AND end_at >= $now
     ORDER BY end_at ASC
     LIMIT 1`,
    {
      employeeId: toRecordId(employee.id),
      now: nowJs,
    }
  );
  const active = unwrapRows<ScheduledShift>(activeRaw)[0];
  if (active?.end_at) {
    return toLuxonDateTime(active.end_at);
  }

  // Else most recent shift that overlaps the open clock session and has ended (or ends soon)
  const [recentRaw] = await db.query(
    `SELECT * FROM ${Tables.scheduled_shifts}
     WHERE employee = $employeeId
       AND start_at <= $now
       AND end_at >= $clockIn
     ORDER BY end_at DESC
     LIMIT 1`,
    {
      employeeId: toRecordId(employee.id),
      now: nowJs,
      clockIn: clockInJs,
    }
  );
  const recent = unwrapRows<ScheduledShift>(recentRaw)[0];
  if (recent?.end_at) {
    return toLuxonDateTime(recent.end_at);
  }

  return null;
};

export interface AutoClockOutEvaluation {
  settings: AutoClockOutSettings;
  endAt: LuxonDateTime | null;
  secondsUntilEnd: number | null;
  shouldWarn: boolean;
  shouldClockOut: boolean;
  timeEntry?: TimeEntry;
}

export const evaluateAutoClockOut = async (
  db: DbClient,
  user: User
): Promise<AutoClockOutEvaluation> => {
  const settings = await loadAutoClockOutSettings(db);
  const empty: AutoClockOutEvaluation = {
    settings,
    endAt: null,
    secondsUntilEnd: null,
    shouldWarn: false,
    shouldClockOut: false,
  };

  if (!settings.enabled || (!settings.on_shift_end && !settings.on_defined_time)) {
    return empty;
  }

  const userId = recordIdString(user.id);
  if (!userId) {
    return empty;
  }

  const timeEntry = await findOpenTimeEntry(db, userId);
  if (!timeEntry?.clock_in) {
    return empty;
  }

  const now = nowInAppTimezone().setZone(getAppTimezone());
  const clockIn = toLuxonDateTime(timeEntry.clock_in);
  const ends: LuxonDateTime[] = [];

  if (settings.on_shift_end) {
    const scheduledEnd = await findCurrentScheduledShiftEnd(db, user, clockIn, now);
    if (scheduledEnd) {
      ends.push(scheduledEnd);
    } else {
      const templateEnd = resolveUserShiftEndAt(user.user_shift, clockIn, now);
      if (templateEnd) {
        ends.push(templateEnd);
      }
    }
  }

  if (settings.on_defined_time && settings.defined_time) {
    const definedEnd = resolveDefinedTimeEndAt(settings.defined_time, clockIn, now);
    if (definedEnd) {
      ends.push(definedEnd);
    }
  }

  if (ends.length === 0) {
    return { ...empty, timeEntry };
  }

  ends.sort((a, b) => a.toMillis() - b.toMillis());
  // Use earliest end that is at or after clock-in (ignore stale ends before clock-in)
  const applicable = ends.filter((e) => e >= clockIn.minus({ minutes: 1 }));
  const endAt = (applicable.length > 0 ? applicable : ends)[0];
  const secondsUntilEnd = Math.floor(endAt.diff(now, 'seconds').seconds);
  const shouldClockOut = secondsUntilEnd <= 0;
  const shouldWarn =
    !shouldClockOut && secondsUntilEnd > 0 && secondsUntilEnd <= WARNING_SECONDS;

  return {
    settings,
    endAt,
    secondsUntilEnd,
    shouldWarn,
    shouldClockOut,
    timeEntry,
  };
};

export const formatCountdown = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
