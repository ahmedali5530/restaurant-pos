import {
  AccountMapping,
  InternalAccountingConfig,
  LogicalAccountCode,
  PostingMode,
} from '@/integrations/accounting/types.ts';

const ACCOUNT_KEYS: LogicalAccountCode[] = [
  'SALES_REVENUE',
  'VAT_OUTPUT',
  'DISCOUNT',
  'TIPS',
  'CASH_MAIN',
  'CARD_RECEIVABLE',
  'OTHER_RECEIVABLE',
  'INVENTORY',
  'COGS',
  'PAYROLL_EXPENSE',
  'PAYROLL_LIABILITY',
  'ACCOUNTS_PAYABLE',
  'WASTE_EXPENSE',
  'INVENTORY_ADJUSTMENT',
];

export const REQUIRED_ACCOUNTING_ACCOUNT_CODES: LogicalAccountCode[] = [
  'SALES_REVENUE',
  'CASH_MAIN',
  'CARD_RECEIVABLE',
  'INVENTORY',
  'COGS',
  'PAYROLL_EXPENSE',
  'PAYROLL_LIABILITY',
  'ACCOUNTS_PAYABLE',
  'WASTE_EXPENSE',
  'INVENTORY_ADJUSTMENT',
];

/** @deprecated Use REQUIRED_ACCOUNTING_ACCOUNT_CODES */
export const REQUIRED_SALE_ACCOUNT_CODES = REQUIRED_ACCOUNTING_ACCOUNT_CODES;

export const parseInternalAccountingConfig = (
  raw: Record<string, unknown>
): InternalAccountingConfig => {
  const accounts: AccountMapping = {};
  for (const key of ACCOUNT_KEYS) {
    const value = raw[key] ?? raw[`account_${key}`];
    if (typeof value === 'string' && value.trim()) {
      accounts[key] = value.trim();
    }
  }

  const autoPublish = Boolean(raw.autoPublish);
  const postingModeRaw = String(raw.postingMode ?? (autoPublish ? 'auto_publish' : 'draft'));
  const postingMode: PostingMode =
    postingModeRaw === 'auto_publish' || autoPublish ? 'auto_publish' : 'draft';

  return {
    autoPublish: postingMode === 'auto_publish',
    postingMode,
    postingFrequency:
      typeof raw.postingFrequency === 'string' ? raw.postingFrequency : undefined,
    accounts,
  };
};

export const resolveLogicalAccount = (
  mapping: AccountMapping,
  code: LogicalAccountCode
): string | undefined => {
  const id = mapping[code];
  return id && id.trim() ? id.trim() : undefined;
};

export const validateAccountingAccountMapping = (
  mapping: AccountMapping
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  for (const code of REQUIRED_ACCOUNTING_ACCOUNT_CODES) {
    if (!resolveLogicalAccount(mapping, code)) {
      errors.push(`Missing GL account mapping for ${code}`);
    }
  }
  return { valid: errors.length === 0, errors };
};

/** @deprecated Use validateAccountingAccountMapping */
export const validateSaleAccountMapping = validateAccountingAccountMapping;
