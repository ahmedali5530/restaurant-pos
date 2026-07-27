import { Order } from '@/api/model/order.ts';
import {
  IntegrationExecutionRequest,
  IntegrationExecutionResponse,
} from '@/integrations/core/types.ts';
import { TransportRouter } from '@/integrations/transport/router.ts';
import { FiscalConfigLoader, FiscalExecutionData } from '@/integrations/providers/fiscal/shared/runtime-config.ts';
import { parsePkFiscalProviderConfig } from '@/integrations/providers/fiscal/pk-fbr-pra/config.ts';
import {
  PkFiscalAuthority,
  PkFiscalInvoicePayload,
  serializePkFiscalInvoice,
} from '@/integrations/providers/fiscal/pk-fbr-pra/serialize-invoice.ts';
import { apiUrl } from '@/lib/api.service.ts';
import { authHeaders } from '@/lib/session.ts';

const FISCAL_INVOICE_PATH = '/fiscal/invoice';

type AuthorityResponse = {
  Code?: number | string;
  InvoiceNumber?: string;
  Response?: string;
  message?: string;
  error?: string;
};

const sessionAuthHeaderRecord = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  authHeaders().forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
};

export const submitPkFiscalInvoiceRequest = async (
  providerId: string,
  authority: PkFiscalAuthority,
  request: IntegrationExecutionRequest,
  getConfig: FiscalConfigLoader,
  transport: TransportRouter = new TransportRouter()
): Promise<IntegrationExecutionResponse<FiscalExecutionData & { request: PkFiscalInvoicePayload }>> => {
  if (request.action !== 'invoiceSubmission') {
    return {
      success: false,
      status: 'failed',
      providerId,
      error: `Unsupported action: ${request.action}`,
      retriable: false,
    };
  }

  const rawConfig = await getConfig();
  const parsed = parsePkFiscalProviderConfig(rawConfig, {
    requireSellerNtn: authority === 'fbr',
  });
  if ('error' in parsed) {
    return {
      success: false,
      status: 'failed',
      providerId,
      error: parsed.error,
      retriable: false,
    };
  }

  const order = request.payload?.order as Order | undefined;
  if (!order) {
    return {
      success: false,
      status: 'failed',
      providerId,
      error: 'Order payload is required for invoiceSubmission',
      retriable: false,
    };
  }

  const payload = serializePkFiscalInvoice(order, authority, parsed);
  // Proxy through the API server so the browser never calls FBR/PRA directly (CORS).
  // Send both `url` and `apiBaseUrl` so older/newer proxy validators accept the body.
  const transportResponse = await transport.send<AuthorityResponse>({
    protocol: 'http',
    endpoint: apiUrl(FISCAL_INVOICE_PATH),
    method: 'POST',
    headers: sessionAuthHeaderRecord(),
    body: {
      url: parsed.apiBaseUrl,
      apiBaseUrl: parsed.apiBaseUrl,
      bearerToken: parsed.bearerToken,
      payload,
    },
  });

  if (!transportResponse.ok || transportResponse.error) {
    const proxyError =
      transportResponse.body?.error ||
      transportResponse.body?.message ||
      transportResponse.body?.Response;
    return {
      success: false,
      status: 'failed',
      providerId,
      error: transportResponse.error ?? proxyError ?? `HTTP ${transportResponse.status}`,
      retriable: true,
      data: {
        request: payload,
        response: transportResponse.body,
        code: transportResponse.status,
      },
    };
  }

  const body = transportResponse.body ?? {};
  const code = body.Code;
  const codeNumber = typeof code === 'string' ? Number(code) : code;
  const invoiceNumber = body.InvoiceNumber ? String(body.InvoiceNumber) : undefined;
  const success = codeNumber === 100;

  if (!success) {
    return {
      success: false,
      status: 'failed',
      providerId,
      error: body.Response ?? body.message ?? `Fiscal authority rejected invoice (Code ${String(code)})`,
      retriable: true,
      data: {
        invoiceNumber,
        qrcode: invoiceNumber,
        code,
        response: body,
        request: payload,
      },
    };
  }

  return {
    success: true,
    status: 'completed',
    providerId,
    requestId: invoiceNumber,
    data: {
      invoiceNumber,
      qrcode: invoiceNumber,
      code,
      response: body,
      request: payload,
    },
  };
};
