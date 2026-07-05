export const CALCULATION_VERSION = '1.0.0'

export const CURRENCY_DECIMALS = 2

/** Default daily hours before overtime applies */
export const DEFAULT_DAILY_OT_THRESHOLD_HOURS = 8

/** Default weekly hours before overtime applies */
export const DEFAULT_WEEKLY_OT_THRESHOLD_HOURS = 40

/** Default daily hours before double-time applies */
export const DEFAULT_DOUBLE_TIME_THRESHOLD_HOURS = 12

/** Default night premium window (24h clock) */
export const DEFAULT_NIGHT_START_TIME = '22:00'
export const DEFAULT_NIGHT_END_TIME = '06:00'

/** Weekend days: 0 = Sunday, 6 = Saturday */
export const DEFAULT_WEEKEND_DAYS = [0, 6] as const

/** Break defaults */
export const DEFAULT_BREAK_MINUTES = 30
export const DEFAULT_MIN_SHIFT_HOURS_FOR_BREAK = 6

/** Standard multipliers when policy config is absent */
export const DEFAULT_OT_MULTIPLIER = 1.5
export const DEFAULT_DOUBLE_TIME_MULTIPLIER = 2
export const DEFAULT_NIGHT_MULTIPLIER = 1.25
export const DEFAULT_WEEKEND_MULTIPLIER = 1.5
export const DEFAULT_HOLIDAY_MULTIPLIER = 2

/** Performance guardrails */
export const PERFORMANCE_BENCHMARK_MS = 200
export const PERFORMANCE_BENCHMARK_ENTRIES = 500

/** Labor audit DB writes — disabled until audit log UI/reporting is ready */
export const LABOR_AUDIT_ENABLED = false
