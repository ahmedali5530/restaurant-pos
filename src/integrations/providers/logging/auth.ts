import type { EventLoggerConfig, LogAuthType } from '@/integrations/providers/logging/config.ts';

/**
 * Build HTTP headers for the configured auth mode.
 * Secrets stay in config; this only formats transport headers.
 */
export const buildAuthHeaders = (config: EventLoggerConfig): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (config.customHeaders) {
    Object.assign(headers, config.customHeaders);
  }

  switch (config.authType as LogAuthType) {
    case 'bearer':
      if (config.bearerToken) {
        headers.Authorization = `Bearer ${config.bearerToken}`;
      }
      break;
    case 'jwt':
      if (config.jwtToken) {
        headers.Authorization = `Bearer ${config.jwtToken}`;
      }
      break;
    case 'apiKey':
      if (config.apiKey) {
        headers[config.apiKeyHeader || 'X-API-Key'] = config.apiKey;
      }
      break;
    case 'basic': {
      const user = config.basicUsername ?? '';
      const pass = config.basicPassword ?? '';
      if (user || pass) {
        // btoa is available in the browser/runtime this app targets.
        const token =
          typeof btoa === 'function'
            ? btoa(`${user}:${pass}`)
            : Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
        headers.Authorization = `Basic ${token}`;
      }
      break;
    }
    case 'none':
    default:
      break;
  }

  return headers;
};
