import { IntegrationProvider, ProviderExecutionContext } from '@/integrations/core/provider.ts';
import {
  IntegrationEvent,
  IntegrationExecutionRequest,
  IntegrationExecutionResponse,
  IntegrationHealthSnapshot,
  ProviderCapability,
  ProviderConfigurationSchema,
  ProviderManifest,
} from '@/integrations/core/types.ts';
import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';
import { TransportRouter } from '@/integrations/transport/router.ts';
import {
  EventLoggerConfigLoader,
  parseEventLoggerConfig,
  shouldHandleEvent,
  validateEventLoggerConfig,
} from '@/integrations/providers/logging/config.ts';
import { buildAuthHeaders } from '@/integrations/providers/logging/auth.ts';
import { formatHttpBody, formatLogEvent } from '@/integrations/providers/logging/format.ts';

const schema: ProviderConfigurationSchema = {
  sections: [
    {
      id: 'destination',
      title: 'Destination',
      description: 'Where integration events are sent. Default is the browser console.',
      fields: [
        {
          key: 'destination',
          label: 'Destination',
          type: 'dropdown',
          defaultValue: 'console',
          options: [
            { label: 'Console', value: 'console' },
            { label: 'HTTP API', value: 'http' },
          ],
          helpText: 'Console uses console.log. HTTP posts each event to your logging endpoint.',
        },
        {
          key: 'includePayload',
          label: 'Include event payload',
          type: 'switch',
          defaultValue: true,
          helpText: 'When off, only event metadata (name, id, source, time) is logged.',
        },
        {
          key: 'eventFilter',
          label: 'Event filter',
          type: 'dropdown',
          defaultValue: 'all',
          options: [
            { label: 'All events', value: 'all' },
            { label: 'EntityChanged only', value: 'entityOnly' },
            { label: 'Business events only (exclude EntityChanged)', value: 'businessOnly' },
          ],
        },
      ],
    },
    {
      id: 'http',
      title: 'HTTP',
      description: 'Required when destination is HTTP API.',
      fields: [
        {
          key: 'endpoint',
          label: 'Endpoint URL',
          type: 'text',
          placeholder: 'https://logs.example.com/v1/events',
          dependsOn: { field: 'destination', equals: 'http' },
        },
        {
          key: 'httpMethod',
          label: 'HTTP method',
          type: 'dropdown',
          defaultValue: 'POST',
          options: [
            { label: 'POST', value: 'POST' },
            { label: 'PUT', value: 'PUT' },
          ],
          dependsOn: { field: 'destination', equals: 'http' },
        },
        {
          key: 'requestTimeoutSeconds',
          label: 'Timeout (seconds)',
          type: 'number',
          defaultValue: 15,
          dependsOn: { field: 'destination', equals: 'http' },
        },
        {
          key: 'customHeaders',
          label: 'Custom headers (JSON)',
          type: 'json',
          helpText: 'Optional extra non-secret headers as a JSON object.',
          dependsOn: { field: 'destination', equals: 'http' },
        },
      ],
    },
    {
      id: 'authentication',
      title: 'Authentication',
      description: 'How the remote logging API authenticates this POS. Used when destination is HTTP.',
      fields: [
        {
          key: 'authType',
          label: 'Auth type',
          type: 'dropdown',
          defaultValue: 'none',
          options: [
            { label: 'None', value: 'none' },
            { label: 'Bearer token', value: 'bearer' },
            { label: 'API key', value: 'apiKey' },
            { label: 'Basic', value: 'basic' },
            { label: 'JWT (Bearer)', value: 'jwt' },
          ],
          dependsOn: { field: 'destination', equals: 'http' },
        },
        {
          key: 'bearerToken',
          label: 'Bearer token',
          type: 'password',
          encrypted: true,
          dependsOn: { field: 'authType', equals: 'bearer' },
        },
        {
          key: 'apiKeyHeader',
          label: 'API key header name',
          type: 'text',
          defaultValue: 'X-API-Key',
          dependsOn: { field: 'authType', equals: 'apiKey' },
        },
        {
          key: 'apiKey',
          label: 'API key',
          type: 'password',
          encrypted: true,
          dependsOn: { field: 'authType', equals: 'apiKey' },
        },
        {
          key: 'basicUsername',
          label: 'Basic username',
          type: 'text',
          dependsOn: { field: 'authType', equals: 'basic' },
        },
        {
          key: 'basicPassword',
          label: 'Basic password',
          type: 'password',
          encrypted: true,
          dependsOn: { field: 'authType', equals: 'basic' },
        },
        {
          key: 'jwtToken',
          label: 'JWT token',
          type: 'password',
          encrypted: true,
          helpText: 'Sent as Authorization: Bearer <token>.',
          dependsOn: { field: 'authType', equals: 'jwt' },
        },
      ],
    },
  ],
};

const manifest: ProviderManifest = {
  id: 'provider:event-logger',
  name: 'event-logger',
  displayName: 'Event Logger',
  category: 'custom',
  version: '1.0.0',
  providerVersion: '1.0.0',
  minimumFrameworkVersion: '1.0.0',
  supportedFeatures: ['eventLogging'],
  supportedEvents: ['*'],
  offlineSupport: true,
  requiresInternet: false,
  requiresAuthentication: false,
  authenticationType: 'none',
  supportsQueue: false,
  supportsRetry: false,
  supportsWebhooks: false,
  supportsCertificates: false,
  supportsBackgroundJobs: false,
  configurationSchema: schema,
  documentation:
    'Logs integration framework events to the console or an HTTP API. Enable and configure destination under Integrations.',
};

export class EventLoggerProvider implements IntegrationProvider {
  private getConfig: EventLoggerConfigLoader = async () => ({});
  private transport = new TransportRouter();
  private lastError: string | undefined;
  private lastSuccessAt: string | undefined;
  private failedJobs = 0;

  setConfigLoader(loader: EventLoggerConfigLoader) {
    this.getConfig = loader;
  }

  setTransport(router: TransportRouter) {
    this.transport = router;
  }

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}

  getManifest(): ProviderManifest {
    return manifest;
  }

  getConfigurationSchema(): ProviderConfigurationSchema {
    return schema;
  }

  getCapabilities(): ProviderCapability[] {
    return ['events', 'configuration', 'health', 'execute'];
  }

  supports(capability: ProviderCapability): boolean {
    return this.getCapabilities().includes(capability);
  }

  async validate(): Promise<{ valid: boolean; errors?: string[] }> {
    const raw = await this.getConfig();
    const config = parseEventLoggerConfig(raw);
    return validateEventLoggerConfig(config);
  }

  async healthCheck(): Promise<IntegrationHealthSnapshot> {
    const validation = await this.validate();
    const raw = await this.getConfig();
    const config = parseEventLoggerConfig(raw);

    let status: IntegrationHealthSnapshot['status'] = 'connected';
    if (!validation.valid) {
      status = 'disconnected';
    } else if (config.destination === 'http' && this.lastError) {
      status = 'degraded';
    }

    return {
      providerId: manifest.id,
      status,
      authenticationStatus: validation.valid ? 'valid' : 'invalid',
      averageResponseTimeMs: config.destination === 'console' ? 1 : 50,
      pendingJobs: 0,
      failedJobs: this.failedJobs,
      lastSynchronization: this.lastSuccessAt,
      version: manifest.providerVersion,
      updatedAt: toJsDate(nowSurrealDateTime()).toISOString(),
      errors: validation.errors ?? (this.lastError ? [this.lastError] : undefined),
    };
  }

  async subscribeEvents(): Promise<string[]> {
    return manifest.supportedEvents;
  }

  async handleEvent(event: IntegrationEvent<any>): Promise<void> {
    const raw = await this.getConfig();
    const config = parseEventLoggerConfig(raw);

    if (!shouldHandleEvent(String(event.name), config.eventFilter)) {
      return;
    }

    const formatted = formatLogEvent(event, config.includePayload);

    if (config.destination === 'console') {
      console.log('[EventLogger]', formatted.name, formatted);
      this.lastSuccessAt = new Date().toISOString();
      this.lastError = undefined;
      return;
    }

    await this.sendHttp(formatted, config);
  }

  async execute(
    request: IntegrationExecutionRequest,
    _context: ProviderExecutionContext
  ): Promise<IntegrationExecutionResponse> {
    if (request.action !== 'sendLog') {
      return {
        success: false,
        status: 'failed',
        providerId: manifest.id,
        error: `Unknown action: ${request.action}`,
      };
    }

    const raw = await this.getConfig();
    const config = parseEventLoggerConfig(raw);
    if (config.destination !== 'http') {
      console.log('[EventLogger]', request.payload);
      return {
        success: true,
        status: 'completed',
        providerId: manifest.id,
      };
    }

    const eventPayload = (request.payload?.event ?? request.payload) as IntegrationEvent<any> | FormattedLike;
    const formatted =
      eventPayload && typeof eventPayload === 'object' && 'name' in eventPayload
        ? formatFromPartial(eventPayload as IntegrationEvent<any>, config.includePayload)
        : { id: 'manual', name: 'sendLog', occurredAt: new Date().toISOString(), source: 'execute' };

    try {
      await this.sendHttp(formatted, config);
      return {
        success: !this.lastError,
        status: this.lastError ? 'failed' : 'completed',
        providerId: manifest.id,
        error: this.lastError,
        retriable: Boolean(this.lastError),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        status: 'failed',
        providerId: manifest.id,
        error: message,
        retriable: true,
      };
    }
  }

  private async sendHttp(
    formatted: ReturnType<typeof formatLogEvent>,
    config: ReturnType<typeof parseEventLoggerConfig>
  ): Promise<void> {
    const validation = validateEventLoggerConfig(config);
    if (!validation.valid || !config.endpoint) {
      this.lastError = validation.errors?.join('; ') ?? 'Invalid HTTP logger config';
      this.failedJobs += 1;
      console.warn('[EventLogger] skipped HTTP send', this.lastError);
      return;
    }

    try {
      const response = await this.transport.send({
        protocol: 'http',
        endpoint: config.endpoint,
        method: config.httpMethod,
        headers: buildAuthHeaders(config),
        body: formatHttpBody(formatted),
      });

      if (!response.ok) {
        this.lastError = response.error ?? `HTTP ${response.status}`;
        this.failedJobs += 1;
        console.warn('[EventLogger] HTTP send failed', this.lastError);
        return;
      }

      this.lastError = undefined;
      this.lastSuccessAt = new Date().toISOString();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.failedJobs += 1;
      console.warn('[EventLogger] HTTP send error', this.lastError);
    }
  }
}

type FormattedLike = {
  id?: string;
  name?: string;
  occurredAt?: string;
  source?: string;
  payload?: unknown;
};

const formatFromPartial = (
  event: IntegrationEvent<any> | FormattedLike,
  includePayload: boolean
) => {
  if ('occurredAt' in event && event.occurredAt && 'name' in event) {
    return formatLogEvent(event as IntegrationEvent<any>, includePayload);
  }
  return {
    id: String((event as FormattedLike).id ?? 'unknown'),
    name: String((event as FormattedLike).name ?? 'unknown'),
    occurredAt: String((event as FormattedLike).occurredAt ?? new Date().toISOString()),
    source: String((event as FormattedLike).source ?? 'unknown'),
    ...(includePayload && (event as FormattedLike).payload !== undefined
      ? { payload: (event as FormattedLike).payload }
      : {}),
  };
};
