import { nanoid } from 'nanoid';
import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';
import { IntegrationEvent } from '@/integrations/core/types.ts';

export const createPosEvent = <TPayload = Record<string, unknown>>(
  name: string,
  payload: TPayload,
  source = 'pos-core'
): IntegrationEvent<TPayload> => {
  return {
    id: `integration_event:${nanoid()}`,
    name,
    source,
    payload,
    occurredAt: toJsDate(nowSurrealDateTime()).toISOString(),
  };
};
