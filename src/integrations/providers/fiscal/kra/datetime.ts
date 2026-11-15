import { DateTime } from 'luxon';
import { nowSurrealDateTime, toLuxonDateTime } from '@/lib/datetime.ts';

/** KRA date: yyyyMMdd */
export const kraDate = (value?: unknown): string => {
  const dt =
    value != null
      ? toLuxonDateTime(value as any)
      : toLuxonDateTime(nowSurrealDateTime());
  return (dt.isValid ? dt : DateTime.now()).toFormat('yyyyMMdd');
};

/** KRA datetime: yyyyMMddHHmmss */
export const kraDateTime = (value?: unknown): string => {
  const dt =
    value != null
      ? toLuxonDateTime(value as any)
      : toLuxonDateTime(nowSurrealDateTime());
  return (dt.isValid ? dt : DateTime.now()).toFormat('yyyyMMddHHmmss');
};

export const roundKraAmount = (value: number): number =>
  Math.round((Number(value) || 0) * 100) / 100;
