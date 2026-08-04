import { IntegrationEvent } from '@/integrations/core/types.ts';
import { AccountingRemoteAdapter, ExternalAccountingConfig } from '@/integrations/accounting/external/types.ts';
import { EntityMappingRepository } from '@/integrations/accounting/external/entity-mapping-repository.ts';
import { categorizeExternalError, formatSyncFailure, isRetriableExternalError } from '@/integrations/accounting/external/errors.ts';
import { parseExternalAccountingConfig } from '@/integrations/accounting/external/config.ts';
import { AccountingPostingEngine } from '@/integrations/accounting/posting-engine.ts';
import { InternalAccountingConfig } from '@/integrations/accounting/types.ts';

export type ExternalEventRoutingResult = {
  handled: boolean;
  action?: string;
  skippedReason?: string;
  error?: string;
  retriable?: boolean;
};

/**
 * Routes a POS business event to the correct outbound path:
 *   sale/refund/customer → entity sync (via adapter)
 *   inventory/payroll/waste/purchase/production → posting engine → postExternalJournal
 */
export const routeExternalAccountingEvent = async (
  event: IntegrationEvent<any>,
  providerId: string,
  adapter: AccountingRemoteAdapter,
  config: ExternalAccountingConfig,
  mappingRepo: EntityMappingRepository,
  postingEngine: AccountingPostingEngine,
  enqueueJob: (action: string, payload: Record<string, unknown>, idempotencyKey?: string) => Promise<void>
): Promise<ExternalEventRoutingResult> => {
  try {
    // Sales and payments → native entity sync
    if (event.name === 'SaleCompleted') {
      const orderId = String(event.payload?.orderId ?? event.payload?.id ?? '');
      if (!orderId) return { handled: false, error: 'SaleCompleted missing order id' };
      await enqueueJob('syncSale', { eventPayload: event.payload }, `syncSale:${orderId}`);
      return { handled: true, action: 'syncSale' };
    }

    if (event.name === 'PaymentCompleted') {
      const paymentId = String(event.payload?.paymentId ?? event.payload?.id ?? '');
      if (!paymentId) return { handled: false, error: 'PaymentCompleted missing payment id' };
      await enqueueJob('syncPayment', { eventPayload: event.payload }, `syncPayment:${paymentId}`);
      return { handled: true, action: 'syncPayment' };
    }

    if (event.name === 'SaleRefunded') {
      const refundId = String(event.payload?.refundId ?? event.payload?.id ?? '');
      if (!refundId) return { handled: false, error: 'SaleRefunded missing refund id' };
      await enqueueJob('syncRefund', { eventPayload: event.payload }, `syncRefund:${refundId}`);
      return { handled: true, action: 'syncRefund' };
    }

    if (event.name === 'CustomerCreated') {
      const customerId = String(event.payload?.customerId ?? event.payload?.id ?? '');
      if (!customerId) return { handled: false, error: 'CustomerCreated missing customer id' };
      await enqueueJob('syncCustomer', { eventPayload: event.payload }, `syncCustomer:${customerId}`);
      return { handled: true, action: 'syncCustomer' };
    }

    // Inventory, payroll, waste, purchase, and production events → posting engine → journal
    const journalEvents = [
      'PurchaseReceived', 'PurchaseReturned', 'PayrollPosted',
      'WasteRecorded', 'InventoryAdjusted', 'InventoryIssued',
      'IssueReturned', 'InventoryTransferred', 'ProductionCompleted',
    ];

    if (journalEvents.includes(event.name)) {
      // Convert external config to internal for the posting engine
      const internalConfig: InternalAccountingConfig = {
        autoPublish: false, // External providers always post via adapter
        postingMode: 'draft',
        accounts: config.accounts,
      };

      const result = await postingEngine.process(event, internalConfig, providerId, async (request) => {
        if (request.action === 'postJournal' && request.payload) {
          await enqueueJob('postExternalJournal', request.payload as Record<string, unknown>, request.idempotencyKey);
        }
      });

      if (result.draft) {
        return { handled: true, action: 'postExternalJournal' };
      }
      return { handled: false, skippedReason: result.skippedReason ?? result.error };
    }

    return { handled: false, skippedReason: `No handler for event ${event.name}` };
  } catch (err: any) {
    const category = categorizeExternalError(err);
    return {
      handled: false,
      error: err?.message ?? 'Event routing failed',
      retriable: isRetriableExternalError(category),
    };
  }
};
