import { IntegrationEventName } from '@/integrations/core/types.ts';

/** Logical GL roles — never store real account IDs in templates. */
export type LogicalAccountCode =
  | 'SALES_REVENUE'
  | 'VAT_OUTPUT'
  | 'DISCOUNT'
  | 'TIPS'
  | 'CASH_MAIN'
  | 'CARD_RECEIVABLE'
  | 'OTHER_RECEIVABLE'
  | 'INVENTORY'
  | 'COGS'
  | 'PAYROLL_EXPENSE'
  | 'PAYROLL_LIABILITY'
  | 'ACCOUNTS_PAYABLE'
  | 'WASTE_EXPENSE'
  | 'INVENTORY_ADJUSTMENT';

export type JournalLineSide = 'debit' | 'credit';

export interface PostingRuleCondition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  value: unknown;
}

export interface PostingRule {
  id: string;
  eventName: IntegrationEventName;
  templateId: string;
  enabled: boolean;
  /** When true, overrides provider autoPublish for this rule. */
  autoPublish?: boolean;
  branchIds?: string[];
  currencies?: string[];
  effectiveFrom?: string;
  effectiveTo?: string;
  conditions?: PostingRuleCondition[];
}

export interface JournalTemplateLineDef {
  logicalAccount: LogicalAccountCode;
  side: JournalLineSide;
  /** Key into template amount context (e.g. cashAmount, taxAmount). */
  amountKey: string;
  description?: string;
  /** Skip the line when amount is 0 / missing. Default true. */
  omitWhenZero?: boolean;
}

export interface JournalTemplate {
  id: string;
  name: string;
  memo?: string;
  lines: JournalTemplateLineDef[];
}

export interface ResolvedJournalLine {
  accountId: string;
  logicalAccount: LogicalAccountCode;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalDraftRequest {
  date: string;
  memo?: string;
  lines: ResolvedJournalLine[];
  status: 'draft' | 'posted';
  originEvent: string;
  originModule: string;
  originRecordId: string;
  integrationProviderId: string;
  postingRuleId: string;
  journalTemplateId: string;
  idempotencyKey: string;
  generatedAt: string;
  generatedBy?: string;
  sourceModule?: string;
  sourceId?: string;
}

export type AccountMapping = Partial<Record<LogicalAccountCode, string>>;

export type PostingMode = 'draft' | 'auto_publish';

export interface InternalAccountingConfig {
  autoPublish: boolean;
  postingMode: PostingMode;
  postingFrequency?: string;
  accounts: AccountMapping;
}
