import {
  HikvisionDeviceConfig,
  HikvisionProviderConfig,
} from '@/integrations/providers/hardware/hikvision/isapi-types.ts';

export type HikvisionConfigLoader = () => Promise<Record<string, unknown>>;

const DEFAULTS: HikvisionProviderConfig = {
  devices: [],
  pollIntervalSeconds: 60,
  eventLookbackMinutes: 120,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  autoImportPunches: true,
  autoSyncEmployees: true,
  employeeIdField: 'employee_number',
  defaultApprovalStatus: 'pending',
  pairFallbackMode: 'odd_even',
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1 || value === '1') return true;
  if (value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function parseDevices(raw: unknown): HikvisionDeviceConfig[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }

  return list
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const useHttps = asBoolean(item.useHttps, false);
      return {
        id: asString(item.id, `device-${index + 1}`),
        name: asString(item.name, `Device ${index + 1}`),
        host: asString(item.host).trim(),
        port: asNumber(item.port, useHttps ? 443 : 80),
        useHttps,
        username: asString(item.username).trim(),
        password: asString(item.password),
        enabled: asBoolean(item.enabled, true),
      };
    });
}

export function parseHikvisionConfig(raw: Record<string, unknown> | null | undefined): HikvisionProviderConfig {
  const source = raw ?? {};
  return {
    devices: parseDevices(source.devices),
    pollIntervalSeconds: Math.max(30, asNumber(source.pollIntervalSeconds, DEFAULTS.pollIntervalSeconds)),
    eventLookbackMinutes: Math.max(5, asNumber(source.eventLookbackMinutes, DEFAULTS.eventLookbackMinutes)),
    timezone: asString(source.timezone, DEFAULTS.timezone) || DEFAULTS.timezone,
    autoImportPunches: asBoolean(source.autoImportPunches, DEFAULTS.autoImportPunches),
    autoSyncEmployees: asBoolean(source.autoSyncEmployees, DEFAULTS.autoSyncEmployees),
    employeeIdField: 'employee_number',
    defaultApprovalStatus:
      source.defaultApprovalStatus === 'approved' ? 'approved' : 'pending',
    pairFallbackMode: 'odd_even',
  };
}

export function validateHikvisionConfig(config: HikvisionProviderConfig): {
  valid: boolean;
  errors?: string[];
} {
  const errors: string[] = [];
  const enabled = config.devices.filter((d) => d.enabled);

  if (enabled.length === 0) {
    errors.push('At least one enabled Hikvision device is required');
  }

  for (const device of enabled) {
    if (!device.host) errors.push(`Device "${device.name}" is missing host`);
    if (!device.username) errors.push(`Device "${device.name}" is missing username`);
    if (!device.password) errors.push(`Device "${device.name}" is missing password`);
    if (!device.port || device.port < 1 || device.port > 65535) {
      errors.push(`Device "${device.name}" has an invalid port`);
    }
  }

  if (config.pollIntervalSeconds < 30) {
    errors.push('Poll interval must be at least 30 seconds');
  }

  return errors.length ? { valid: false, errors } : { valid: true };
}

export function enabledDevices(config: HikvisionProviderConfig): HikvisionDeviceConfig[] {
  return config.devices.filter((d) => d.enabled && d.host && d.username && d.password);
}

export { DEFAULTS as hikvisionConfigDefaults };
