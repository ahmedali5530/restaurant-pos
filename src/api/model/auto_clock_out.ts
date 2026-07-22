export const AUTO_CLOCK_OUT_KEY = 'auto_clock_out';

export interface AutoClockOutSettings {
  enabled: boolean;
  on_shift_end: boolean;
  on_defined_time: boolean;
  defined_time: string;
}

export const DEFAULT_AUTO_CLOCK_OUT: AutoClockOutSettings = {
  enabled: false,
  on_shift_end: false,
  on_defined_time: false,
  defined_time: '23:00',
};
