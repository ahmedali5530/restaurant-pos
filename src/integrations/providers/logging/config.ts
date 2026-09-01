export type LogDestination = 'console' | 'http';
export type LogAuthType = 'none' | 'bearer' | 'apiKey' | 'basic' | 'jwt';
export type LogEventFilter = 'all' | 'entityOnly' | 'businessOnly';
export type LogHttpMethod = 'POST' | 'PUT';

export type EventLoggerConfig = {
  destination: LogDestination;
  includePayload: boolean;
  eventFilter: LogEventFilter;
  endpoint?: string;
  httpMethod: LogHttpMethod;
  requestTimeoutSeconds: number;
  customHeaders?: Record<string, string>;
  authType: LogAuthType;
  bearerToken?: string;
  apiKeyHeader: string;
  apiKey?: string;
  basicUsername?: string;
  basicPassword?: string;
  jwtToken?: string;
};

export type EventLoggerConfigLoader = () => Promise<Record<string, unknown>>;

const asString = (value: unknown): string => String(value ?? '').trim();

const parseCustomHeaders = (raw: unknown): Record<string, string> | undefined => {
  if (raw == null || raw === '') return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (k) out[k] = String(v ?? '');
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parseCustomHeaders(parsed);
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const parseEventLoggerConfig = (
  values: Record<string, unknown>
): EventLoggerConfig => {
  const destinationRaw = asString(values.destination).toLowerCase();
  const destination: LogDestination =
    destinationRaw === 'http' ? 'http' : 'console';

  const filterRaw = asString(values.eventFilter);
  const eventFilter: LogEventFilter =
    filterRaw === 'entityOnly' || filterRaw === 'businessOnly' ? filterRaw : 'all';

  const authRaw = asString(values.authType).toLowerCase();
  let authType: LogAuthType = 'none';
  if (authRaw === 'bearer') authType = 'bearer';
  else if (authRaw === 'apikey' || authRaw === 'api_key') authType = 'apiKey';
  else if (authRaw === 'basic') authType = 'basic';
  else if (authRaw === 'jwt') authType = 'jwt';

  const methodRaw = asString(values.httpMethod).toUpperCase();
  const httpMethod: LogHttpMethod = methodRaw === 'PUT' ? 'PUT' : 'POST';

  const timeout = Number(values.requestTimeoutSeconds);
  const requestTimeoutSeconds =
    Number.isFinite(timeout) && timeout > 0 ? Math.min(timeout, 120) : 15;

  return {
    destination,
    includePayload: values.includePayload !== false && values.includePayload !== 'false',
    eventFilter,
    endpoint: asString(values.endpoint) || undefined,
    httpMethod,
    requestTimeoutSeconds,
    customHeaders: parseCustomHeaders(values.customHeaders),
    authType,
    bearerToken: asString(values.bearerToken) || undefined,
    apiKeyHeader: asString(values.apiKeyHeader) || 'X-API-Key',
    apiKey: asString(values.apiKey) || undefined,
    basicUsername: asString(values.basicUsername) || undefined,
    basicPassword: asString(values.basicPassword) || undefined,
    jwtToken: asString(values.jwtToken) || undefined,
  };
};

export const validateEventLoggerConfig = (
  config: EventLoggerConfig
): { valid: boolean; errors?: string[] } => {
  if (config.destination === 'console') {
    return { valid: true };
  }

  const errors: string[] = [];
  if (!config.endpoint) {
    errors.push('endpoint is required when destination is http');
  } else if (!/^https?:\/\//i.test(config.endpoint)) {
    errors.push('endpoint must be an http(s) URL');
  }

  switch (config.authType) {
    case 'bearer':
      if (!config.bearerToken) errors.push('bearerToken is required for bearer auth');
      break;
    case 'apiKey':
      if (!config.apiKey) errors.push('apiKey is required for apiKey auth');
      break;
    case 'basic':
      if (!config.basicUsername) errors.push('basicUsername is required for basic auth');
      if (!config.basicPassword) errors.push('basicPassword is required for basic auth');
      break;
    case 'jwt':
      if (!config.jwtToken) errors.push('jwtToken is required for jwt auth');
      break;
    default:
      break;
  }

  return errors.length ? { valid: false, errors } : { valid: true };
};

export const shouldHandleEvent = (
  eventName: string,
  filter: LogEventFilter
): boolean => {
  if (filter === 'all') return true;
  if (filter === 'entityOnly') return eventName === 'EntityChanged';
  return eventName !== 'EntityChanged';
};
