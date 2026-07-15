import { SaleCompletedPayload } from '@/integrations/accounting/events/payloads.ts';
import { resolveLogicalAccount } from '@/integrations/accounting/mapping/account-mapping.ts';
import {
  AccountMapping,
  JournalDraftRequest,
  JournalTemplate,
  PostingRule,
  ResolvedJournalLine,
} from '@/integrations/accounting/types.ts';
import { IntegrationEvent } from '@/integrations/core/types.ts';
import { buildAccountingIdempotencyKey } from '@/integrations/accounting/idempotency.ts';

export type TemplateAmountContext = Record<string, number>;

export const buildSaleCompletedAmountContext = (
  payload: SaleCompletedPayload
): TemplateAmountContext => {
  const salesRevenue = Number(
    (payload.subtotal + payload.discountAmount).toFixed(2)
  );
  return {
    cashAmount: payload.tenders.cashAmount,
    cardAmount: payload.tenders.cardAmount,
    otherAmount: payload.tenders.otherAmount,
    taxAmount: payload.taxAmount,
    discountAmount: payload.discountAmount,
    tipAmount: payload.tipAmount,
    salesRevenue,
    totalCollected: payload.totalCollected,
  };
};

export const buildJournalLinesFromTemplate = (
  template: JournalTemplate,
  amounts: TemplateAmountContext,
  mapping: AccountMapping
): { lines: ResolvedJournalLine[]; errors: string[] } => {
  const lines: ResolvedJournalLine[] = [];
  const errors: string[] = [];

  for (const def of template.lines) {
    const amount = Number(amounts[def.amountKey] ?? 0);
    const omitWhenZero = def.omitWhenZero !== false;
    if (omitWhenZero && (!Number.isFinite(amount) || amount === 0)) {
      continue;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push(`Invalid amount for ${def.logicalAccount} (${def.amountKey})`);
      continue;
    }

    const accountId = resolveLogicalAccount(mapping, def.logicalAccount);
    if (!accountId) {
      // OTHER_RECEIVABLE can fall back to CARD_RECEIVABLE then CASH_MAIN
      if (def.logicalAccount === 'OTHER_RECEIVABLE') {
        const fallback =
          resolveLogicalAccount(mapping, 'CARD_RECEIVABLE') ||
          resolveLogicalAccount(mapping, 'CASH_MAIN');
        if (fallback) {
          lines.push({
            accountId: fallback,
            logicalAccount: def.logicalAccount,
            debit: def.side === 'debit' ? amount : 0,
            credit: def.side === 'credit' ? amount : 0,
            description: def.description,
          });
          continue;
        }
      }
      errors.push(`No GL mapping for logical account ${def.logicalAccount}`);
      continue;
    }

    lines.push({
      accountId,
      logicalAccount: def.logicalAccount,
      debit: def.side === 'debit' ? amount : 0,
      credit: def.side === 'credit' ? amount : 0,
      description: def.description,
    });
  }

  return { lines, errors };
};

export const assertBalancedLines = (lines: ResolvedJournalLine[]): string | undefined => {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (Number(debit.toFixed(2)) !== Number(credit.toFixed(2))) {
    return `Journal unbalanced: debit ${debit.toFixed(2)} != credit ${credit.toFixed(2)}`;
  }
  if (lines.length < 2) {
    return 'Journal requires at least two lines';
  }
  return undefined;
};

export const buildJournalDraftFromEvent = (params: {
  event: IntegrationEvent<any>;
  rule: PostingRule;
  template: JournalTemplate;
  mapping: AccountMapping;
  providerId: string;
  autoPublish: boolean;
  amounts: TemplateAmountContext;
  originRecordId: string;
  generatedBy?: string;
}): { draft?: JournalDraftRequest; error?: string } => {
  const { lines, errors } = buildJournalLinesFromTemplate(
    params.template,
    params.amounts,
    params.mapping
  );
  if (errors.length) {
    return { error: errors.join('; ') };
  }
  const balanceError = assertBalancedLines(lines);
  if (balanceError) {
    return { error: balanceError };
  }

  const ruleAutoPublish = params.rule.autoPublish === true;
  const status =
    params.autoPublish || ruleAutoPublish ? 'posted' : 'draft';

  const draft: JournalDraftRequest = {
    date: params.event.occurredAt,
    memo: `${params.template.memo ?? params.template.name} (${params.event.name})`,
    lines,
    status,
    originEvent: String(params.event.name),
    originModule: params.event.source,
    originRecordId: params.originRecordId,
    integrationProviderId: params.providerId,
    postingRuleId: params.rule.id,
    journalTemplateId: params.template.id,
    idempotencyKey: buildAccountingIdempotencyKey(params.event.id),
    generatedAt: new Date().toISOString(),
    generatedBy: params.generatedBy,
    sourceModule: params.event.source,
    sourceId: params.originRecordId,
  };

  return { draft };
};
