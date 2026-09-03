export type DemandDriverType = "holiday" | "event" | "weather";

export interface LocalEventInput {
  name: string;
  startDate?: string;
  endDate?: string;
  liftPct?: number;
}

export interface DemandDriver {
  type: DemandDriverType;
  name: string;
  liftPct: number;
  detail?: string;
}

export interface DemandDayContext {
  date: string;
  weekday: string;
  multiplier: number;
  drivers: DemandDriver[];
}

export interface DemandWeatherDay {
  date: string;
  tempMax?: number;
  tempMin?: number;
  precipitationMm?: number;
  weatherCode?: number;
  summary?: string;
}

export interface DemandContextResult {
  days: DemandDayContext[];
  holidays: Array<{name: string; date: string; liftPct: number}>;
  events: Array<{name: string; startDate?: string; endDate?: string; liftPct: number}>;
  weather: DemandWeatherDay[];
  warnings: string[];
  stockImpacts: string[];
}

export interface DemandHorizon {
  mode: "day" | "horizon";
  dates: string[];
  targetDate?: string;
  horizonDays: number;
  warnings: string[];
}
