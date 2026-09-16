export const HIKVISION_PROVIDER_ID = 'provider:hikvision-attendance';

export const ISAPI = {
  DEVICE_INFO: '/ISAPI/System/deviceInfo',
  ACS_EVENT: '/ISAPI/AccessControl/AcsEvent',
  ACS_EVENT_CAPABILITIES: '/ISAPI/AccessControl/AcsEvent/capabilities',
  USER_INFO_COUNT: '/ISAPI/AccessControl/UserInfo/Count',
  USER_INFO_SEARCH: '/ISAPI/AccessControl/UserInfo/Search',
  USER_INFO_RECORD: '/ISAPI/AccessControl/UserInfo/Record',
  USER_INFO_MODIFY: '/ISAPI/AccessControl/UserInfo/Modify',
  USER_INFO_DELETE: '/ISAPI/AccessControl/UserInfo/Delete',
} as const;

export type HikvisionDeviceConfig = {
  id: string;
  name: string;
  host: string;
  port: number;
  useHttps: boolean;
  username: string;
  password: string;
  enabled: boolean;
};

export type HikvisionProviderConfig = {
  devices: HikvisionDeviceConfig[];
  pollIntervalSeconds: number;
  eventLookbackMinutes: number;
  timezone: string;
  autoImportPunches: boolean;
  autoSyncEmployees: boolean;
  employeeIdField: 'employee_number';
  defaultApprovalStatus: 'pending' | 'approved';
  pairFallbackMode: 'odd_even';
};

export type HikvisionAcsEvent = {
  time?: string;
  employeeNoString?: string;
  name?: string;
  serialNo?: number;
  attendanceStatus?: string;
  currentVerifyMode?: string;
  major?: number;
  minor?: number;
  cardNo?: string;
  doorNo?: number;
  [key: string]: unknown;
};

export type HikvisionProxyDevice = {
  id?: string;
  name?: string;
  host: string;
  port: number;
  useHttps: boolean;
  username: string;
  password: string;
};
