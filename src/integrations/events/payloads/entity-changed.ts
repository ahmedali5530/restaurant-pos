export type EntityChangeDomain =
  | 'manage'
  | 'hr'
  | 'inventory'
  | 'accounts'
  | 'pos'
  | 'ops';

export type EntityChangeAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'deactivate'
  | 'status_change';

export type EntityChangedPayload = {
  domain: EntityChangeDomain;
  table: string;
  entityId: string;
  action: EntityChangeAction;
  before?: any | null;
  after?: any | null;
  changedBy?: string;
  source: string;
  correlationId?: string;
  label?: string;
};

const SECRET_KEY_PATTERN =
  /password|secret|token|pin|credential|api[_-]?key|private[_-]?key|encrypted/i;

/** Deep clone payload values and redact sensitive keys for logger/providers. */
export const redactEntitySnapshot = (value: unknown, depth = 0): any => {
  if (value == null || depth > 6) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactEntitySnapshot(item, depth + 1));
  }
  if (typeof value !== 'object') {
    return value;
  }
  const out: Record<string, any> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = redactEntitySnapshot(child, depth + 1);
  }
  return out;
};

export const entityChangedEventId = (
  table: string,
  entityId: string,
  action: EntityChangeAction,
  versionKey?: string
) => {
  const version = versionKey ?? String(Date.now());
  return `EntityChanged:${table}:${entityId}:${action}:${version}`;
};
