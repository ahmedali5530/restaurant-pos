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

type AuthorityResponse = {
  Code?: number | string;
  InvoiceNumber?: string;
  Response?: string;
  message?: string;
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
  const transportResponse = await transport.send<AuthorityResponse>({
    protocol: 'http',
    endpoint: parsed.apiBaseUrl,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${parsed.bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: payload,
  });

  if (!transportResponse.ok || transportResponse.error) {
    return {
      success: false,
      status: 'failed',
      providerId,
      error: transportResponse.error ?? `HTTP ${transportResponse.status}`,
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
