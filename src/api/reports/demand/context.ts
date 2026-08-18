import {DateTime} from "luxon";
import {Tables} from "@/api/db/tables.ts";
import type {
  DemandContextResult,
  DemandDayContext,
  DemandDriver,
  DemandWeatherDay,
  LocalEventInput,
} from "@/api/reports/demand/types.ts";
import {toIsoDate, weekdayName} from "@/api/reports/demand/horizon.ts";
import {fetchPublicHolidays} from "@/api/reports/labor/fetch.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {getAppTimezone} from "@/lib/datetime.ts";
import {safeNumber} from "@/lib/utils.ts";

export const HOLIDAY_LIFT_PCT = 20;
export const DEFAULT_EVENT_LIFT_PCT = 20;
export const RAIN_LIFT_PCT = 10;
export const EXTREME_TEMP_LIFT_PCT = 10;
export const MAX_DEMAND_MULTIPLIER = 1.5;
const RAIN_MM_THRESHOLD = 5;
const TEMP_MAX_C = 32;
const TEMP_MIN_C = 15;

const WMO_SUMMARY: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent rain showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const eventCoversDate = (event: LocalEventInput, isoDate: string, horizonDates: string[]): boolean => {
  const start = toIsoDate(event.startDate);
  const end = toIsoDate(event.endDate) || start;
  if (!start && !end) {
    return horizonDates.includes(isoDate);
  }
  if (start && end) {
    return isoDate >= start && isoDate <= end;
  }
  return isoDate === start;
};

export const combineLiftPcts = (lifts: number[]): number => {
  const total = lifts.reduce((sum, lift) => sum + Math.max(0, lift), 0);
  return Math.min(MAX_DEMAND_MULTIPLIER, round2(1 + total / 100));
};

export const weatherLifts = (day: DemandWeatherDay): DemandDriver[] => {
  const drivers: DemandDriver[] = [];
  const rain = safeNumber(day.precipitationMm);
  if (rain >= RAIN_MM_THRESHOLD) {
    drivers.push({
      type: "weather",
      name: day.summary || "Rain",
      liftPct: RAIN_LIFT_PCT,
      detail: `${rain} mm precipitation`,
    });
  }
  const max = day.tempMax;
  const min = day.tempMin;
  if ((max != null && max > TEMP_MAX_C) || (min != null && min < TEMP_MIN_C)) {
    drivers.push({
      type: "weather",
      name: max != null && max > TEMP_MAX_C ? "Extreme heat" : "Extreme cold",
      liftPct: EXTREME_TEMP_LIFT_PCT,
      detail: `High ${max ?? "n/a"}°C / low ${min ?? "n/a"}°C`,
    });
  }
  return drivers;
};

const parseMapCenter = (raw: unknown): {lat: number; lng: number} | undefined => {
  let value = raw as any;
  if (value && typeof value === "object" && value.value != null) {
    value = value.value;
  }
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  const lat = safeNumber(value?.lat ?? value?.latitude);
  const lng = safeNumber(value?.lng ?? value?.longitude);
  if (!lat && !lng) {
    return undefined;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return undefined;
  }
  return {lat, lng};
};

const fetchMapCenter = async (db: DbClient): Promise<{lat: number; lng: number} | undefined> => {
  try {
    const rows = unwrapQueryResult<{key?: string; value?: unknown}>(
      await db.query(
        `SELECT * FROM ${Tables.settings} WHERE key = $key LIMIT 1`,
        {key: "map_center"},
      ),
    );
    return parseMapCenter(rows[0]);
  } catch {
    return undefined;
  }
};

const fetchWeather = async (
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
): Promise<DemandWeatherDay[]> => {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code",
    timezone: getAppTimezone() || "auto",
    start_date: startDate,
    end_date: endDate,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP ${response.status}`);
    }
    const json = await response.json() as {
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
        weather_code?: number[];
      };
    };
    const times = json.daily?.time ?? [];
    return times.map((date, index) => {
      const code = json.daily?.weather_code?.[index];
      return {
        date,
        tempMax: json.daily?.temperature_2m_max?.[index],
        tempMin: json.daily?.temperature_2m_min?.[index],
        precipitationMm: json.daily?.precipitation_sum?.[index],
        weatherCode: code,
        summary: code != null ? (WMO_SUMMARY[code] || `Weather code ${code}`) : undefined,
      };
    });
  } finally {
    clearTimeout(timer);
  }
};

const holidayMatchesDate = (holidayDateIso: string | undefined, isRecurring: boolean | undefined, isoDate: string): boolean => {
  if (!holidayDateIso) {
    return false;
  }
  if (holidayDateIso === isoDate) {
    return true;
  }
  if (!isRecurring) {
    return false;
  }
  const zone = getAppTimezone();
  const holiday = DateTime.fromISO(holidayDateIso, {zone});
  const day = DateTime.fromISO(isoDate, {zone});
  return holiday.isValid && day.isValid && holiday.month === day.month && holiday.day === day.day;
};

export const getDemandContext = async (
  db: DbClient,
  options: {
    dates: string[];
    localEvents?: LocalEventInput[];
  },
): Promise<DemandContextResult> => {
  const dates = options.dates.filter(Boolean);
  const warnings: string[] = [];
  const localEvents = (options.localEvents ?? []).filter(event => event?.name?.trim());
  const eventsWithoutDates = localEvents.filter(event => !toIsoDate(event.startDate) && !toIsoDate(event.endDate));
  if (eventsWithoutDates.length) {
    warnings.push(
      `Local event(s) ${eventsWithoutDates.map(e => e.name).join(", ")} had no dates — applied across the full forecast horizon.`,
    );
  }

  const holidaysRaw = await fetchPublicHolidays(db, {});
  const holidays = holidaysRaw
    .filter(row => row.is_active !== false)
    .map(row => ({
      name: row.name || "Holiday",
      date: toIsoDate(row.date) || "",
      isRecurring: Boolean(row.is_recurring),
      liftPct: HOLIDAY_LIFT_PCT,
    }))
    .filter(row => row.date);

  let weather: DemandWeatherDay[] = [];
  const center = dates.length ? await fetchMapCenter(db) : undefined;
  if (!center) {
    warnings.push("Weather omitted: delivery map center (lat/lng) is not configured.");
  } else if (dates.length) {
    try {
      weather = await fetchWeather(center.lat, center.lng, dates[0], dates[dates.length - 1]);
    } catch {
      warnings.push("Weather omitted: Open-Meteo forecast request failed.");
    }
  }

  const weatherByDate = new Map(weather.map(day => [day.date, day]));
  const days: DemandDayContext[] = dates.map(date => {
    const drivers: DemandDriver[] = [];
    for (const holiday of holidays) {
      if (holidayMatchesDate(holiday.date, holiday.isRecurring, date)) {
        drivers.push({
          type: "holiday",
          name: holiday.name,
          liftPct: HOLIDAY_LIFT_PCT,
          detail: holiday.isRecurring ? "Recurring public holiday" : "Public holiday",
        });
      }
    }
    for (const event of localEvents) {
      if (eventCoversDate(event, date, dates)) {
        const liftPct = event.liftPct != null && Number.isFinite(Number(event.liftPct))
          ? Math.max(0, Number(event.liftPct))
          : DEFAULT_EVENT_LIFT_PCT;
        drivers.push({
          type: "event",
          name: event.name.trim(),
          liftPct,
          detail: "From prompt",
        });
      }
    }
    const weatherDay = weatherByDate.get(date);
    if (weatherDay) {
      drivers.push(...weatherLifts(weatherDay));
    }
    const multiplier = combineLiftPcts(drivers.map(driver => driver.liftPct));
    return {
      date,
      weekday: weekdayName(date),
      multiplier,
      drivers,
    };
  });

  const matchedHolidays = days.flatMap(day =>
    day.drivers
      .filter(driver => driver.type === "holiday")
      .map(driver => ({name: driver.name, date: day.date, liftPct: driver.liftPct})),
  );

  const stockImpacts = days
    .filter(day => day.drivers.length > 0)
    .map(day => {
      const bits = day.drivers.map(driver => `${driver.name} +${driver.liftPct}%`);
      return `${day.weekday} ${day.date}: ${bits.join(", ")} (×${day.multiplier})`;
    });

  return {
    days,
    holidays: matchedHolidays,
    events: localEvents.map(event => ({
      name: event.name.trim(),
      startDate: toIsoDate(event.startDate),
      endDate: toIsoDate(event.endDate),
      liftPct: event.liftPct != null ? Number(event.liftPct) : DEFAULT_EVENT_LIFT_PCT,
    })),
    weather,
    warnings,
    stockImpacts,
  };
};
