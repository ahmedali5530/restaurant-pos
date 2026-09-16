import {
  HikvisionAcsEvent,
} from '@/integrations/providers/hardware/hikvision/isapi-types.ts';

export type PunchDirection = 'in' | 'out' | 'unknown';

const CHECK_IN = new Set([
  'checkin',
  'check_in',
  'check-in',
  'in',
  'clockin',
  'clock_in',
  'arrive',
  'entry',
]);

const CHECK_OUT = new Set([
  'checkout',
  'check_out',
  'check-out',
  'out',
  'clockout',
  'clock_out',
  'leave',
  'exit',
]);

export function normalizeAttendanceStatus(value: unknown): PunchDirection {
  if (value == null) return 'unknown';
  const key = String(value).trim().toLowerCase().replace(/\s+/g, '');
  if (CHECK_IN.has(key)) return 'in';
  if (CHECK_OUT.has(key)) return 'out';
  return 'unknown';
}

export function eventDedupeKey(deviceId: string, event: HikvisionAcsEvent): string {
  const serial = event.serialNo != null ? String(event.serialNo) : '';
  const time = event.time ? String(event.time) : '';
  const employee = event.employeeNoString ? String(event.employeeNoString) : '';
  if (serial) {
    return `${deviceId}:${serial}:${time}:${employee}`;
  }
  return `${deviceId}:${time}:${employee}:${event.major ?? ''}:${event.minor ?? ''}`;
}

export function isDuplicateWithinWindow(
  previousMs: number | null | undefined,
  currentMs: number,
  windowSeconds = 60
): boolean {
  if (previousMs == null || !Number.isFinite(previousMs)) return false;
  return Math.abs(currentMs - previousMs) <= windowSeconds * 1000;
}

/**
 * When attendanceStatus is missing, assign direction by odd/even order within a day.
 * Index 0 = in, 1 = out, 2 = in, ...
 */
export function assignOddEvenDirections<T extends { timeMs: number }>(
  punches: T[]
): Array<T & { direction: PunchDirection }> {
  const sorted = [...punches].sort((a, b) => a.timeMs - b.timeMs);
  return sorted.map((punch, index) => ({
    ...punch,
    direction: (index % 2 === 0 ? 'in' : 'out') as PunchDirection,
  }));
}

export function resolvePunchDirection(
  event: HikvisionAcsEvent,
  fallback?: PunchDirection
): PunchDirection {
  const fromStatus = normalizeAttendanceStatus(event.attendanceStatus);
  if (fromStatus !== 'unknown') return fromStatus;
  return fallback ?? 'unknown';
}

export function calendarDayKey(date: Date, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
