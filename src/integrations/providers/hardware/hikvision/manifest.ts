import {
  ProviderConfigurationSchema,
  ProviderManifest,
} from '@/integrations/core/types.ts';
import { HIKVISION_PROVIDER_ID } from '@/integrations/providers/hardware/hikvision/isapi-types.ts';
import { hikvisionConfigDefaults } from '@/integrations/providers/hardware/hikvision/config.ts';

export const hikvisionConfigurationSchema: ProviderConfigurationSchema = {
  sections: [
    {
      id: 'devices',
      title: 'Devices',
      description:
        'Hikvision terminals reachable from the API server (LAN IP or public IP with port forwarding).',
      fields: [
        {
          key: 'devices',
          label: 'Devices',
          type: 'list',
          required: true,
          itemLabel: 'Device',
          helpText:
            'Add each attendance terminal. Host can be a LAN IP or a port-forwarded public IP/domain that the API server can reach.',
          defaultValue: [
            {
              id: 'device-1',
              name: 'Main entrance',
              host: '',
              port: 80,
              useHttps: false,
              username: 'admin',
              password: '',
              enabled: true,
            },
          ],
          itemFields: [
            {
              key: 'name',
              label: 'Display name',
              type: 'text',
              required: true,
              placeholder: 'Main entrance',
              defaultValue: '',
            },
            {
              key: 'host',
              label: 'Host / IP',
              type: 'text',
              required: true,
              placeholder: '192.168.1.50 or attendance.example.com',
              defaultValue: '',
              helpText: 'LAN address, or public hostname/IP when using port forwarding.',
            },
            {
              key: 'port',
              label: 'Port',
              type: 'number',
              required: true,
              defaultValue: 80,
              validation: { min: 1, max: 65535 },
            },
            {
              key: 'useHttps',
              label: 'Use HTTPS',
              type: 'switch',
              defaultValue: false,
            },
            {
              key: 'username',
              label: 'Username',
              type: 'text',
              required: true,
              defaultValue: 'admin',
              placeholder: 'admin',
            },
            {
              key: 'password',
              label: 'Password',
              type: 'password',
              required: true,
              encrypted: true,
              defaultValue: '',
            },
            {
              key: 'enabled',
              label: 'Enabled',
              type: 'switch',
              defaultValue: true,
            },
          ],
        },
      ],
    },
    {
      id: 'sync',
      title: 'Sync behavior',
      fields: [
        {
          key: 'pollIntervalSeconds',
          label: 'Poll interval (seconds)',
          type: 'number',
          defaultValue: hikvisionConfigDefaults.pollIntervalSeconds,
          helpText: 'Minimum 30 seconds. Polls AcsEvent while this provider is enabled.',
        },
        {
          key: 'eventLookbackMinutes',
          label: 'Event lookback (minutes)',
          type: 'number',
          defaultValue: hikvisionConfigDefaults.eventLookbackMinutes,
          helpText: 'Overlap window when fetching events to avoid gaps.',
        },
        {
          key: 'timezone',
          label: 'Timezone',
          type: 'text',
          defaultValue: hikvisionConfigDefaults.timezone,
          helpText: 'Used for odd/even punch pairing by calendar day.',
        },
        {
          key: 'autoImportPunches',
          label: 'Auto-import punches',
          type: 'switch',
          defaultValue: true,
          helpText: 'Create or close time entries from device access events.',
        },
        {
          key: 'autoSyncEmployees',
          label: 'Auto-sync employees',
          type: 'switch',
          defaultValue: true,
          helpText: 'Push create/update/delete of HR employees to the device person list.',
        },
        {
          key: 'defaultApprovalStatus',
          label: 'Default approval status',
          type: 'dropdown',
          defaultValue: 'pending',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Approved', value: 'approved' },
          ],
        },
        {
          key: 'pairFallbackMode',
          label: 'Fallback pairing',
          type: 'dropdown',
          defaultValue: 'odd_even',
          options: [{ label: 'Odd = in / Even = out', value: 'odd_even' }],
          helpText: 'Used when the device does not send attendanceStatus.',
        },
      ],
    },
  ],
};

export const hikvisionManifest: ProviderManifest = {
  id: HIKVISION_PROVIDER_ID,
  name: 'hikvision-attendance',
  displayName: 'Hikvision Attendance',
  category: 'hardware',
  version: '1.0.0',
  providerVersion: '1.0.0',
  minimumFrameworkVersion: '1.0.0',
  supportedFeatures: [
    'attendanceImport',
    'employeePush',
    'employeeDelete',
    'devicePolling',
  ],
  supportedEvents: ['EntityChanged'],
  offlineSupport: false,
  requiresInternet: false,
  requiresAuthentication: true,
  authenticationType: 'apiKey',
  supportsQueue: true,
  supportsRetry: true,
  supportsWebhooks: false,
  supportsCertificates: false,
  supportsBackgroundJobs: true,
  configurationSchema: hikvisionConfigurationSchema,
  documentation:
    'Fetches attendance from Hikvision access terminals via ISAPI (Digest) through the API proxy. Maps employee_number to device employeeNo. Supports LAN and port-forwarded public hosts.',
};
