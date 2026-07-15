import { nanoid } from 'nanoid';
import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';
import { IntegrationEvent, IntegrationEventName } from '@/integrations/core/types.ts';

export const createPosEvent = <TPayload = Record<string, unknown>>(
  name: IntegrationEventName,
  payload: TPayload,
  source = 'pos-core',
  id?: string
): IntegrationEvent<TPayload> => {
  return {
    id: id ?? `integration_event:${nanoid()}`,
    name,
    source,
    payload,
    occurredAt: toJsDate(nowSurrealDateTime()).toISOString(),
  };
};
