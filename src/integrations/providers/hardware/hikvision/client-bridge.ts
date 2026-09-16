/**
 * Bridge between HikvisionProvider (browser) and the API Digest proxy (server).
 */

import { getSessionToken } from '@/lib/session.ts';
import {
  HikvisionAcsEvent,
  HikvisionDeviceConfig,
  HikvisionProxyDevice,
  ISAPI,
} from '@/integrations/providers/hardware/hikvision/isapi-types.ts';

const API_BASE = import.meta.env.VITE_API_SERVER_URL + '/integrations/hikvision';

async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const err: any = new Error(`API returned non-JSON response (${res.status}). Is the API server running?`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json().catch(() => ({}));
  if (!json.success && json.error) {
    const err: any = new Error(json.error);
    err.status = res.status;
    err.details = json.details;
    throw err;
  }
  return (json.data ?? json) as T;
}

export function toProxyDevice(device: HikvisionDeviceConfig): HikvisionProxyDevice {
  return {
    id: device.id,
    name: device.name,
    host: device.host,
    port: device.port,
    useHttps: device.useHttps,
    username: device.username,
    password: device.password,
  };
}

export async function testConnection(device: HikvisionDeviceConfig) {
  return apiFetch<{
    deviceId?: string;
    connected: boolean;
    deviceInfo?: any;
    capabilities?: any;
  }>('/test-connection', {
    method: 'POST',
    body: JSON.stringify({ device: toProxyDevice(device) }),
  });
}

export async function syncEvents(params: {
  device: HikvisionDeviceConfig;
  startTime: string;
  endTime: string;
  maxResults?: number;
  major?: number;
}) {
  return apiFetch<{ deviceId?: string; count: number; events: HikvisionAcsEvent[] }>('/sync-events', {
    method: 'POST',
    body: JSON.stringify({
      device: toProxyDevice(params.device),
      startTime: params.startTime,
      endTime: params.endTime,
      maxResults: params.maxResults,
      major: params.major,
    }),
  });
}

export async function proxyIsapi<T = any>(params: {
  device: HikvisionDeviceConfig;
  method: string;
  path: string;
  body?: any;
  query?: Record<string, string | number | boolean>;
}) {
  return apiFetch<{ deviceId?: string; status: number; data: T }>('/proxy', {
    method: 'POST',
    body: JSON.stringify({
      device: toProxyDevice(params.device),
      method: params.method,
      path: params.path,
      body: params.body,
      query: params.query,
    }),
  });
}

export async function createUserInfo(device: HikvisionDeviceConfig, userInfo: Record<string, unknown>) {
  return proxyIsapi({
    device,
    method: 'POST',
    path: ISAPI.USER_INFO_RECORD,
    body: { UserInfo: userInfo },
  });
}

export async function modifyUserInfo(device: HikvisionDeviceConfig, userInfo: Record<string, unknown>) {
  return proxyIsapi({
    device,
    method: 'PUT',
    path: ISAPI.USER_INFO_MODIFY,
    body: { UserInfo: userInfo },
  });
}

export async function deleteUserInfo(device: HikvisionDeviceConfig, employeeNo: string) {
  return proxyIsapi({
    device,
    method: 'PUT',
    path: ISAPI.USER_INFO_DELETE,
    body: {
      UserInfoDelCond: {
        EmployeeNoList: [{ employeeNo }],
      },
    },
  });
}

export async function searchUserInfo(device: HikvisionDeviceConfig, searchResultPosition = 0, maxResults = 30) {
  return proxyIsapi({
    device,
    method: 'POST',
    path: ISAPI.USER_INFO_SEARCH,
    body: {
      UserInfoSearchCond: {
        searchID: `posr-users-${Date.now()}`,
        searchResultPosition,
        maxResults,
      },
    },
  });
}
