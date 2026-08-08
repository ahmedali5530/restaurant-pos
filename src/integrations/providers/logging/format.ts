import type { IntegrationEvent } from '@/integrations/core/types.ts';

export type FormattedLogEvent = {
  id: string;
  name: string;
  occurredAt: string;
  source: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
};

export const formatLogEvent = (
  event: IntegrationEvent<any>,
  includePayload: boolean
): FormattedLogEvent => {
  const body: FormattedLogEvent = {
    id: String(event.id),
    name: String(event.name),
    occurredAt: String(event.occurredAt),
    source: String(event.source ?? 'unknown'),
  };
  if (includePayload) {
    body.payload = event.payload;
  }
  if (event.metadata && Object.keys(event.metadata).length > 0) {
    body.metadata = event.metadata;
  }
  return body;
};

export const formatHttpBody = (formatted: FormattedLogEvent) => ({
  event: formatted,
  loggedAt: new Date().toISOString(),
});
