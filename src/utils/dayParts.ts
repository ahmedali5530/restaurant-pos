export type DayPartLabel = 'Breakfast' | 'Lunch' | 'Dinner' | 'Late night';

export const DAY_PARTS = [
  {label: 'Breakfast' as const, startHour: 5, endHour: 11},
  {label: 'Lunch' as const, startHour: 11, endHour: 16},
  {label: 'Dinner' as const, startHour: 16, endHour: 22},
  // Wraps midnight: 22:00 -> 05:00
  {label: 'Late night' as const, startHour: 22, endHour: 5},
] as const satisfies ReadonlyArray<{
  label: DayPartLabel;
  startHour: number;
  endHour: number;
}>;

export const DAY_PART_LABELS: DayPartLabel[] = DAY_PARTS.map(part => part.label);

const formatHour = (hour: number): string => `${hour.toString().padStart(2, '0')}:00`;

export const getDayPartTimeRangeLabel = (label: DayPartLabel): string => {
  const part = DAY_PARTS.find(item => item.label === label);
  if (!part) return '';

  return `${formatHour(part.startHour)}-${formatHour(part.endHour)}`;
};

export const getDayPartLabel = (date: Date): DayPartLabel => {
  const hour = date.getHours();

  for (const part of DAY_PARTS) {
    const {startHour, endHour, label} = part;
    const wrapsMidnight = startHour > endHour;

    const matches = !wrapsMidnight
      ? hour >= startHour && hour < endHour
      : hour >= startHour || hour < endHour;

    if (matches) return label;
  }

  // Should never happen, but keeps the function total.
  return DAY_PARTS[0].label;
};

