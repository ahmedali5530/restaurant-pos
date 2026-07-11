import { Order } from '@/api/model/order.ts';
import { IntegrationExecutionResponse, ProviderManifest } from '@/integrations/core/types.ts';
import { IntegrationManager } from '@/integrations/core/integration-manager.ts';
import { getIntegrationProviderConfig } from '@/integrations/configuration/configuration-store.ts';
import {
  pickPreferredFiscalQr,
  parseFiscalRuntimeConfig,
} from '@/integrations/providers/fiscal/shared/runtime-config.ts';
import { nowSurrealDateTime, toJsDate } from '@/lib/datetime.ts';

export { pickPreferredFiscalQr } from '@/integrations/providers/fiscal/shared/runtime-config.ts';

export interface FiscalSubmissionRecord {
  invoiceNumber?: string;
  code?: number | string;
  status: 'completed' | 'failed' | 'skipped';
  error?: string;
  submittedAt: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  qrPriority?: number;
}

export interface FiscalSettlementResult {
  qrcode?: string;
  fiscalInvoiceNumber?: string;
  fiscalProviderId?: string;
  resultsByProvider: Record<string, FiscalSubmissionRecord>;
  blocked: boolean;
  blockedError?: string;
}

type ConfigDb = Parameters<typeof getIntegrationProviderConfig>[0];

const schemaFieldDefaults = (manifest: ProviderManifest): Record<string, unknown> => {
  const fields = [
    ...(manifest.configurationSchema.fields ?? []),
    ...(manifest.configurationSchema.sections ?? []).flatMap((section) => section.fields),
  ];
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      defaults[field.key] = field.defaultValue;
    }
  }
  return defaults;
};

export const shouldBlockSettlementForFiscal = async (
  manager: IntegrationManager,
  getConfig: (providerId: string) => Promise<Record<string, unknown>>
): Promise<boolean> => {
  const fiscalProviders = manager.getEnabledProvidersByCategory('fiscal');
  for (const manifest of fiscalProviders) {
    const config = {
      ...schemaFieldDefaults(manifest),
      ...(await getConfig(manifest.id)),
    };
    if (parseFiscalRuntimeConfig(config).blockSettlementOnFailure) {
      return true;
    }
  }
  return false;
};

export const submitFiscalInvoices = async (
  manager: IntegrationManager,
  order: Order,
  options?: {
    getConfig?: (providerId: string) => Promise<Record<string, unknown>>;
    db?: ConfigDb;
  }
): Promise<FiscalSettlementResult> => {
  const fiscalProviders = manager.getEnabledProvidersByCategory('fiscal');
  if (fiscalProviders.length === 0) {
    return {
      resultsByProvider: {},
      blocked: false,
    };
  }

  const getConfig =
    options?.getConfig ??
    (options?.db
      ? (providerId: string) => getIntegrationProviderConfig(options.db!, providerId)
      : async () => ({}));

  const resultsByProvider: Record<string, FiscalSubmissionRecord> = {};
  const successMap: Record<
    string,
    { invoiceNumber?: string; qrcode?: string; success: boolean; qrPriority: number }
  > = {};
  let blocked = false;
  let blockedError: string | undefined;
  const submittedAt = toJsDate(nowSurrealDateTime()).toISOString();

  for (const manifest of fiscalProviders) {
    const providerId = manifest.id;
    const config = {
      ...schemaFieldDefaults(manifest),
      ...(await getConfig(providerId)),
    };
    const runtime = parseFiscalRuntimeConfig(config);
    const blockOnFailure = runtime.blockSettlementOnFailure;

    try {
      const response: IntegrationExecutionResponse<{
        invoiceNumber?: string;
        qrcode?: string;
        code?: number | string;
        request?: unknown;
        response?: unknown;
      }> = await manager.executeImmediate(providerId, {
        action: 'invoiceSubmission',
        payload: { order },
        idempotencyKey: `fiscal:${String(order.id)}:${providerId}`,
      });

      const invoiceNumber = response.data?.invoiceNumber ?? response.data?.qrcode;
      const qrcode = response.data?.qrcode ?? response.data?.invoiceNumber;
      resultsByProvider[providerId] = {
        invoiceNumber,
        code: response.data?.code,
        status: response.success ? 'completed' : 'failed',
        error: response.error,
        submittedAt,
        requestPayload: response.data?.request,
        responsePayload: response.data?.response,
        qrPriority: runtime.qrPriority,
      };
      successMap[providerId] = {
        invoiceNumber,
        qrcode,
        success: Boolean(response.success && (qrcode || invoiceNumber)),
        qrPriority: runtime.qrPriority,
      };

      if (!response.success && blockOnFailure) {
        blocked = true;
        blockedError = response.error ?? `Fiscal submission failed for ${providerId}`;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resultsByProvider[providerId] = {
        status: 'failed',
        error: message,
        submittedAt,
        qrPriority: runtime.qrPriority,
      };
      successMap[providerId] = { success: false, qrPriority: runtime.qrPriority };
      if (blockOnFailure) {
        blocked = true;
        blockedError = message;
      }
    }
  }

  const preferred = pickPreferredFiscalQr(successMap);

  return {
    qrcode: preferred.qrcode,
    fiscalInvoiceNumber: preferred.qrcode,
    fiscalProviderId: preferred.providerId,
    resultsByProvider,
    blocked,
    blockedError,
  };
};
