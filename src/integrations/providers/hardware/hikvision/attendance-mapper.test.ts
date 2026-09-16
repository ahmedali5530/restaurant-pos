import { describe, expect, it } from 'vitest';
import {
  assignOddEvenDirections,
  eventDedupeKey,
  isDuplicateWithinWindow,
  normalizeAttendanceStatus,
  resolvePunchDirection,
} from '@/integrations/providers/hardware/hikvision/attendance-mapper.ts';
import {
  parseHikvisionConfig,
  validateHikvisionConfig,
} from '@/integrations/providers/hardware/hikvision/config.ts';

describe('hikvision attendance-mapper', () => {
  it('normalizes attendanceStatus checkIn/checkOut', () => {
    expect(normalizeAttendanceStatus('checkIn')).toBe('in');
    expect(normalizeAttendanceStatus('checkOut')).toBe('out');
    expect(normalizeAttendanceStatus('CHECK_IN')).toBe('in');
    expect(normalizeAttendanceStatus('unknown')).toBe('unknown');
  });

  it('prefers attendanceStatus over fallback', () => {
    expect(resolvePunchDirection({ attendanceStatus: 'checkOut' }, 'in')).toBe('out');
    expect(resolvePunchDirection({}, 'in')).toBe('in');
  });

  it('assigns odd/even directions', () => {
    const assigned = assignOddEvenDirections([
      { timeMs: 200, id: 'b' },
      { timeMs: 100, id: 'a' },
      { timeMs: 300, id: 'c' },
    ]);
    expect(assigned.map((p) => [p.id, p.direction])).toEqual([
      ['a', 'in'],
      ['b', 'out'],
      ['c', 'in'],
    ]);
  });

  it('builds stable dedupe keys and window check', () => {
    const key = eventDedupeKey('d1', {
      serialNo: 10,
      time: '2026-09-14T08:00:00Z',
      employeeNoString: '1001',
    });
    expect(key).toContain('d1:10:');
    expect(isDuplicateWithinWindow(1_000, 1_500, 1)).toBe(true);
    expect(isDuplicateWithinWindow(1_000, 5_000, 1)).toBe(false);
  });
});

describe('hikvision config', () => {
  it('requires an enabled device with credentials', () => {
    const empty = parseHikvisionConfig({});
    expect(validateHikvisionConfig(empty).valid).toBe(false);

    const ok = parseHikvisionConfig({
      devices: [
        {
          id: 'd1',
          name: 'Gate',
          host: '192.168.1.50',
          port: 80,
          useHttps: false,
          username: 'admin',
          password: 'secret',
          enabled: true,
        },
      ],
      pollIntervalSeconds: 60,
    });
    expect(validateHikvisionConfig(ok).valid).toBe(true);
    expect(ok.pollIntervalSeconds).toBe(60);
  });

  it('enforces minimum poll interval of 30s', () => {
    const config = parseHikvisionConfig({ pollIntervalSeconds: 5 });
    expect(config.pollIntervalSeconds).toBe(30);
  });
});
