import { postTracking } from '@/lib/tracking.service.ts';

export interface IntegrationAuditEvent {
  action:
    | 'ProviderInstalled'
    | 'ProviderRemoved'
    | 'ProviderUpdated'
    | 'ConfigurationChanged'
    | 'Request'
    | 'Response'
    | 'Retry'
    | 'Failure'
    | 'Authentication'
    | 'HealthChanged';
  providerId: string;
  payload?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'error';
}

export class IntegrationAuditLogger {
  async log(event: IntegrationAuditEvent) {
    await postTracking({
      module: 'Integrations',
      page: event.providerId,
      payload: {
        action: event.action,
        severity: event.severity ?? 'info',
        ...event.payload,
      },
    });
  }
}
