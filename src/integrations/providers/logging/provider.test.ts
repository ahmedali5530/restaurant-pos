import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  parseEventLoggerConfig,
  shouldHandleEvent,
  validateEventLoggerConfig,
} from '@/integrations/providers/logging/config.ts';
import { buildAuthHeaders } from '@/integrations/providers/logging/auth.ts';
import { EventLoggerProvider } from '@/integrations/providers/logging/provider.ts';
import { TransportRouter } from '@/integrations/transport/router.ts';
import type { TransportAdapter, TransportRequest } from '@/integrations/transport/types.ts';

describe('EventLogger config', () => {
  it('defaults to console + all events', () => {
    const config = parseEventLoggerConfig({});
    expect(config.destination).toBe('console');
    expect(config.eventFilter).toBe('all');
    expect(config.includePayload).toBe(true);
    expect(config.authType).toBe('none');
  });

  it('validates http destination', () => {
    const invalid = validateEventLoggerConfig(
      parseEventLoggerConfig({ destination: 'http', authType: 'bearer' })
    );
    expect(invalid.valid).toBe(false);
    expect(invalid.errors?.some((e) => e.includes('endpoint'))).toBe(true);

    const valid = validateEventLoggerConfig(
      parseEventLoggerConfig({
        destination: 'http',
        endpoint: 'https://logs.example.com/events',
        authType: 'bearer',
        bearerToken: 'secret',
      })
    );
    expect(valid.valid).toBe(true);
  });

  it('filters events', () => {
    expect(shouldHandleEvent('EntityChanged', 'all')).toBe(true);
    expect(shouldHandleEvent('EntityChanged', 'entityOnly')).toBe(true);
    expect(shouldHandleEvent('SaleCompleted', 'entityOnly')).toBe(false);
    expect(shouldHandleEvent('EntityChanged', 'businessOnly')).toBe(false);
    expect(shouldHandleEvent('SaleCompleted', 'businessOnly')).toBe(true);
  });
});

describe('EventLogger auth headers', () => {
  it('builds bearer Authorization', () => {
    const headers = buildAuthHeaders(
      parseEventLoggerConfig({
        destination: 'http',
        endpoint: 'https://x.test',
        authType: 'bearer',
        bearerToken: 'tok',
      })
    );
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('builds api key header', () => {
    const headers = buildAuthHeaders(
      parseEventLoggerConfig({
        destination: 'http',
        endpoint: 'https://x.test',
        authType: 'apiKey',
        apiKeyHeader: 'X-Custom-Key',
        apiKey: 'k1',
      })
    );
    expect(headers['X-Custom-Key']).toBe('k1');
  });

  it('builds basic Authorization', () => {
    const headers = buildAuthHeaders(
      parseEventLoggerConfig({
        destination: 'http',
        endpoint: 'https://x.test',
        authType: 'basic',
        basicUsername: 'u',
        basicPassword: 'p',
      })
    );
    expect(headers.Authorization).toMatch(/^Basic /);
    const encoded = headers.Authorization.replace('Basic ', '');
    expect(atob(encoded)).toBe('u:p');
  });

  it('builds jwt as Bearer', () => {
    const headers = buildAuthHeaders(
      parseEventLoggerConfig({
        destination: 'http',
        endpoint: 'https://x.test',
        authType: 'jwt',
        jwtToken: 'jwt.token',
      })
    );
    expect(headers.Authorization).toBe('Bearer jwt.token');
  });
});

describe('EventLoggerProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs to console by default', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const provider = new EventLoggerProvider();
    provider.setConfigLoader(async () => ({}));

    await provider.handleEvent({
      id: 'e1',
      name: 'SaleCompleted',
      occurredAt: '2026-01-01T00:00:00.000Z',
      source: 'test',
      payload: { orderId: 'order:1' },
    });

    expect(log).toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toBe('[EventLogger]');
    expect(log.mock.calls[0][1]).toBe('SaleCompleted');
  });

  it('skips events outside filter', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const provider = new EventLoggerProvider();
    provider.setConfigLoader(async () => ({ eventFilter: 'entityOnly' }));

    await provider.handleEvent({
      id: 'e1',
      name: 'SaleCompleted',
      occurredAt: '2026-01-01T00:00:00.000Z',
      source: 'test',
      payload: {},
    });

    expect(log).not.toHaveBeenCalled();
  });

  it('posts to HTTP with auth headers', async () => {
    const sent: TransportRequest[] = [];
    const adapter: TransportAdapter = {
      async send(request) {
        sent.push(request);
        return { ok: true, status: 200, body: { ok: true } };
      },
    };
    const router = new TransportRouter();
    router.register('http', adapter);

    const provider = new EventLoggerProvider();
    provider.setTransport(router);
    provider.setConfigLoader(async () => ({
      destination: 'http',
      endpoint: 'https://logs.example.com/v1',
      authType: 'bearer',
      bearerToken: 'secret-token',
    }));

    await provider.handleEvent({
      id: 'e2',
      name: 'EntityChanged',
      occurredAt: '2026-01-01T00:00:00.000Z',
      source: 'settings-form',
      payload: { table: 'menu_item', action: 'update' },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe('https://logs.example.com/v1');
    expect(sent[0].method).toBe('POST');
    expect(sent[0].headers?.Authorization).toBe('Bearer secret-token');
    expect((sent[0].body as any)?.event?.name).toBe('EntityChanged');

    const health = await provider.healthCheck();
    expect(health.status).toBe('connected');
  });

  it('degrades health after HTTP failure without throwing', async () => {
    const adapter: TransportAdapter = {
      async send() {
        return { ok: false, status: 500, error: 'server error' };
      },
    };
    const router = new TransportRouter();
    router.register('http', adapter);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const provider = new EventLoggerProvider();
    provider.setTransport(router);
    provider.setConfigLoader(async () => ({
      destination: 'http',
      endpoint: 'https://logs.example.com/v1',
      authType: 'none',
    }));

    await expect(
      provider.handleEvent({
        id: 'e3',
        name: 'OrderCreated',
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: 'pos-core',
        payload: {},
      })
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalled();
    const health = await provider.healthCheck();
    expect(health.status).toBe('degraded');
  });
});
