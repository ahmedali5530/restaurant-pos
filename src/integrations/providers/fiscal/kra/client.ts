import { TransportRouter } from '@/integrations/transport/router.ts';
import { apiUrl } from '@/lib/api.service.ts';
import { authHeaders } from '@/lib/session.ts';
import { KraProviderConfig } from '@/integrations/providers/fiscal/kra/config.ts';
import {
  getKraPath,
  joinKraUrl,
  KraApiAction,
} from '@/integrations/providers/fiscal/kra/paths.ts';

const FISCAL_INVOICE_PATH = '/fiscal/invoice';

export type KraApiResponse = {
  resultCd?: string;
  resultMsg?: string;
  resultDt?: string;
  data?: any;
  message?: string;
  error?: string;
};

export const isKraSuccess = (body: KraApiResponse | null | undefined): boolean =>
  String(body?.resultCd ?? '') === '000';

const sessionAuthHeaderRecord = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  authHeaders().forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
};

export const kraAuthHeaders = (
  config: Pick<KraProviderConfig, 'tin' | 'bhfId' | 'cmcKey'>
): Record<string, string> => {
  const headers: Record<string, string> = {
    tin: config.tin,
    bhfId: config.bhfId,
  };
  if (config.cmcKey) headers.cmcKey = config.cmcKey;
  return headers;
};

export const callKraApi = async <T extends KraApiResponse = KraApiResponse>(
  config: KraProviderConfig,
  action: KraApiAction,
  payload: Record<string, unknown>,
  transport: TransportRouter = new TransportRouter()
): Promise<{
  ok: boolean;
  status: number;
  body: T;
  url: string;
  error?: string;
}> => {
  const path = getKraPath(config.mode, action);
  const url = joinKraUrl(config.apiBaseUrl, path);
  const kraHeaders = kraAuthHeaders(config);

  const transportResponse = await transport.send<T>({
    protocol: 'http',
    endpoint: apiUrl(FISCAL_INVOICE_PATH),
    method: 'POST',
    headers: sessionAuthHeaderRecord(),
    body: {
      url,
      apiBaseUrl: url,
      headers: kraHeaders,
      payload,
    },
  });

  const body = (transportResponse.body ?? {}) as T;
  if (!transportResponse.ok || transportResponse.error) {
    return {
      ok: false,
      status: transportResponse.status,
      body,
      url,
      error:
        transportResponse.error ||
        body.error ||
        body.message ||
        body.resultMsg ||
        `HTTP ${transportResponse.status}`,
    };
  }

  return {
    ok: true,
    status: transportResponse.status,
    body,
    url,
  };
};
