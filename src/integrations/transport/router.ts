import {
  TransportAdapter,
  TransportProtocol,
  TransportRequest,
  TransportResponse,
} from '@/integrations/transport/types.ts';

class HttpTransportAdapter implements TransportAdapter {
  async send<TBody = unknown>(request: TransportRequest): Promise<TransportResponse<TBody>> {
    try {
      // Content-Type must win over auth/header bags so express.json can parse the body.
      // (A missing/empty Content-Type leaves req.body empty → "url ... missing".)
      const headers: Record<string, string> = {
        ...(request.headers ?? {}),
        'Content-Type': 'application/json',
      };
      const response = await fetch(request.endpoint, {
        method: request.method ?? 'POST',
        headers,
        body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      });
      const body = (await response.json().catch(() => undefined)) as TBody | undefined;
      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export class TransportRouter {
  private readonly adapters = new Map<TransportProtocol, TransportAdapter>();

  constructor() {
    this.adapters.set('http', new HttpTransportAdapter());
  }

  register(protocol: TransportProtocol, adapter: TransportAdapter) {
    this.adapters.set(protocol, adapter);
  }

  async send<TBody = unknown>(request: TransportRequest) {
    const adapter = this.adapters.get(request.protocol);
    if (!adapter) {
      return {
        ok: false,
        status: 0,
        error: `No transport adapter for protocol: ${request.protocol}`,
      };
    }
    return adapter.send<TBody>(request);
  }
}
