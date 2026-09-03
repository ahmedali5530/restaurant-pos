export const AUTO_CHECK_CLOSE_KEY = 'auto_check_close';

export interface AutoCheckCloseSettings {
  enabled: boolean;
  payment_type_id: unknown;
  print_on_close: boolean;
  last_closed_cycle?: string;
}

export const DEFAULT_AUTO_CHECK_CLOSE: AutoCheckCloseSettings = {
  enabled: false,
  payment_type_id: null,
  print_on_close: false,
};
