export type TransportProtocol = 'http' | 'websocket' | 'localService' | 'bluetooth' | 'usb' | 'serial';

export interface TransportRequest {
  protocol: TransportProtocol;
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
}

export interface TransportResponse<TBody = unknown> {
  ok: boolean;
  status: number;
  body?: TBody;
  error?: string;
}

export interface TransportAdapter {
  send<TBody = unknown>(request: TransportRequest): Promise<TransportResponse<TBody>>;
}
