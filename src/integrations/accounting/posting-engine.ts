import { IntegrationEvent, IntegrationExecutionRequest } from '@/integrations/core/types.ts';
import { findMatchingPostingRule } from '@/integrations/accounting/rules/default-rules.ts';
import { getJournalTemplate } from '@/integrations/accounting/templates/registry.ts';
import { buildJournalDraftFromEvent } from '@/integrations/accounting/templates/builder.ts';
import {
  InternalAccountingConfig,
  JournalDraftRequest,
  PostingRule,
} from '@/integrations/accounting/types.ts';
import { EVENT_POSTING_HANDLERS } from '@/integrations/accounting/handlers.ts';

export type AccountingExecuteSink = (
  request: IntegrationExecutionRequest
) => Promise<unknown>;

export interface PostingEngineResult {
  handled: boolean;
  skippedReason?: string;
  draft?: JournalDraftRequest;
  error?: string;
}

/**
 * Accounting posting engine — independent of any IntegrationProvider.
 * Resolves rules/templates/mappings via event handlers, then hands a journal
 * draft to the sink (provider execute / queue enqueue for action postJournal).
 */
export class AccountingPostingEngine {
  constructor(private readonly rules?: PostingRule[]) {}

  async process(
    event: IntegrationEvent<any>,
    config: InternalAccountingConfig,
    providerId: string,
    sink: AccountingExecuteSink
  ): Promise<PostingEngineResult> {
    const rule = findMatchingPostingRule(event, this.rules);
    if (!rule) {
      return { handled: false, skippedReason: 'No matching posting rule' };
    }

    const template = getJournalTemplate(rule.templateId);
    if (!template) {
      return {
        handled: false,
        error: `Journal template "${rule.templateId}" not found`,
      };
    }

    const handler = EVENT_POSTING_HANDLERS[event.name];
    if (!handler) {
      return {
        handled: false,
        skippedReason: `Event "${event.name}" has no posting handler`,
      };
    }

    const originRecordId = handler.originRecordId(event.payload);
    if (!originRecordId) {
      return {
        handled: false,
        error: `${event.name} payload missing origin record id`,
      };
    }

    const amounts = handler.buildAmounts(event.payload);
    const built = buildJournalDraftFromEvent({
      event,
      rule,
      template,
      mapping: config.accounts,
      providerId,
      autoPublish: config.autoPublish,
      amounts,
      originRecordId,
    });

    if (built.error || !built.draft) {
      return { handled: false, error: built.error ?? 'Failed to build journal draft' };
    }

    await sink({
      action: 'postJournal',
      payload: built.draft as unknown as Record<string, unknown>,
      idempotencyKey: built.draft.idempotencyKey,
    });

    return { handled: true, draft: built.draft };
  }
}

export const accountingPostingEngine = new AccountingPostingEngine();
