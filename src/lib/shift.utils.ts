import { Shift } from "@/api/model/shift.ts";

const toMinutes = (time: string): number => {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

export const isOvernightShift = (start_time?: string, end_time?: string): boolean => {
  if (!start_time || !end_time) return false;
  return toMinutes(end_time) <= toMinutes(start_time);
};

export const shiftDisplayTime = (shift?: Partial<Shift>): string => {
  if (!shift?.start_time || !shift?.end_time) return "-";
  const overnight = shift.ends_next_day ?? isOvernightShift(shift.start_time, shift.end_time);
  return `${shift.start_time} - ${shift.end_time}${overnight ? " (next day)" : ""}`;
};
