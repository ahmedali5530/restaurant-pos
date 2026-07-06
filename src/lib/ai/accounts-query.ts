import {resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter} from "@/api/reports/shared/types.ts";

export const isTrialBalancePrompt = (prompt: string): boolean =>
  /\btrial\s+balance\b/i.test(prompt);

export const isBalanceSheetPrompt = (prompt: string): boolean =>
  /\bbalance\s+sheet\b/i.test(prompt);

export const isProfitLossPrompt = (prompt: string): boolean =>
  /\b(profit(?:\s*(?:&|and)\s*loss)?|p\s*&\s*l|net\s+profit)\b/i.test(prompt)
  && !/\b(product|menu|dish)\b/i.test(prompt);

export const isCashFlowPrompt = (prompt: string): boolean =>
  /\bcash\s+flow\b/i.test(prompt);

export const isGeneralLedgerPrompt = (prompt: string): boolean =>
  /\b(general\s+ledger|gl\b)\b/i.test(prompt)
  || (/\bledger\b/i.test(prompt) && /\baccount\b/i.test(prompt));

export const isJournalEntriesPrompt = (prompt: string): boolean =>
  /\bjournal\s+entr/i.test(prompt);

export const isAccountStatementPrompt = (prompt: string): boolean =>
  /\b(customer|supplier)\s+statement\b/i.test(prompt)
  || (/\bstatement\b/i.test(prompt) && /\baccount\b/i.test(prompt));

export const isListAccountsPrompt = (prompt: string): boolean =>
  /\bchart\s+of\s+accounts\b/i.test(prompt)
  || (/\blist\b/i.test(prompt) && /\baccounts?\b/i.test(prompt) && !/\bstatement\b/i.test(prompt));

export const extractAccountCodeFromPrompt = (prompt: string): string | undefined => {
  const codeMatch = prompt.match(/\baccount\s+(\d{3,})\b/i)
    || prompt.match(/\bfor\s+(\d{3,})\b/i);
  return codeMatch?.[1];
};

export const extractSourceModuleFromPrompt = (prompt: string): string | undefined => {
  const match = prompt.match(/\bsource\s+module\s+(\w+)\b/i)
    || prompt.match(/\bfrom\s+module\s+(\w+)\b/i);
  return match?.[1];
};

export const resolveAccountsStatementType = (prompt: string): "customer" | "supplier" =>
  /\bsupplier\b/i.test(prompt) ? "supplier" : "customer";

export const resolveAccountsToolName = (prompt: string): string | null => {
  if (isTrialBalancePrompt(prompt)) return "get_trial_balance";
  if (isBalanceSheetPrompt(prompt)) return "get_balance_sheet";
  if (isAccountStatementPrompt(prompt)) return "get_account_statement";
  if (isJournalEntriesPrompt(prompt)) return "get_journal_entries";
  if (isGeneralLedgerPrompt(prompt)) return "get_general_ledger";
  if (isCashFlowPrompt(prompt)) return "get_cash_flow";
  if (isProfitLossPrompt(prompt)) return "get_profit_loss";
  if (isListAccountsPrompt(prompt)) return "list_accounts";
  return null;
};

export const resolveAccountsPromptDateRange = (prompt: string): DateRangeFilter => {
  if (/\blast\s+month\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "last month"});
  }
  if (/\bthis\s+month\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "this month"});
  }
  if (/\btoday\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "today"});
  }
  if (/\bthis\s+week\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "this week"});
  }
  if (/\blast\s+week\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "last week"});
  }
  if (/\bmonth[\s-]?end\b/i.test(prompt)) {
    return resolveNaturalDateRange({phrase: "this month"});
  }
  return {};
};
