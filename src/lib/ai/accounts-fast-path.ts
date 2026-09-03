import type {DbClient} from "@/api/reports/shared/types.ts";
import {
  getAccountStatement,
  getBalanceSheet,
  getCashFlow,
  getGeneralLedger,
  getJournalEntries,
  getProfitLoss,
  getTrialBalance,
  listAccounts,
} from "@/api/reports/accounts/index.ts";
import {
  extractAccountCodeFromPrompt,
  extractSourceModuleFromPrompt,
  isJournalEntriesPrompt,
  isListAccountsPrompt,
  isTrialBalancePrompt,
  resolveAccountsPromptDateRange,
  resolveAccountsStatementType,
  resolveAccountsToolName,
} from "@/lib/ai/accounts-query.ts";

export interface AccountsFastPathResult {
  toolName: string;
  args: Record<string, unknown>;
  data: unknown;
  hint: string;
}

export const tryAccountsFastPath = async (
  db: DbClient,
  prompt: string,
): Promise<AccountsFastPathResult | null> => {
  const toolName = resolveAccountsToolName(prompt);
  if (!toolName) {
    return null;
  }

  const dateRange = resolveAccountsPromptDateRange(prompt);
  const accountCode = extractAccountCodeFromPrompt(prompt);
  const sourceModule = extractSourceModuleFromPrompt(prompt);

  switch (toolName) {
    case "get_trial_balance": {
      const data = await getTrialBalance(db, dateRange);
      return {
        toolName,
        args: {...dateRange} as Record<string, unknown>,
        data,
        hint: "Report totals.isBalanced and highlight any debit/credit imbalance.",
      };
    }
    case "get_balance_sheet": {
      const data = await getBalanceSheet(db, dateRange);
      return {
        toolName,
        args: {...dateRange} as Record<string, unknown>,
        data,
        hint: "Summarize assets, liabilities, equity, and totals.isBalanced.",
      };
    }
    case "get_profit_loss": {
      const data = await getProfitLoss(db, dateRange);
      return {
        toolName,
        args: {...dateRange} as Record<string, unknown>,
        data,
        hint: "Report totalIncome, totalExpense, and netProfit.",
      };
    }
    case "get_cash_flow": {
      const data = await getCashFlow(db, dateRange);
      return {
        toolName,
        args: {...dateRange} as Record<string, unknown>,
        data,
        hint: "Break down buckets Operating, Investing, Financing and netCashMovement.",
      };
    }
    case "get_general_ledger": {
      const data = await getGeneralLedger(db, {...dateRange, accountCode});
      return {
        toolName,
        args: {...dateRange, accountCode},
        data,
        hint: "Show openingBalance, period movement, and closingBalance per account.",
      };
    }
    case "get_journal_entries": {
      const status = /\bposted\b/i.test(prompt) ? "posted" as const : undefined;
      const data = await getJournalEntries(db, {
        ...dateRange,
        status,
        sourceModule,
        limit: 50,
      });
      return {
        toolName,
        args: {...dateRange, status, sourceModule, limit: 50},
        data,
        hint: "List entries with entryNumber, date, memo, status, and totals.",
      };
    }
    case "get_account_statement": {
      if (!accountCode) {
        return null;
      }
      const statementType = resolveAccountsStatementType(prompt);
      const data = await getAccountStatement(db, {
        ...dateRange,
        accountCode,
        statementType,
      });
      return {
        toolName,
        args: {...dateRange, accountCode, statementType},
        data,
        hint: "Report openingBalance, key lines, and closingBalance.",
      };
    }
    case "list_accounts": {
      const data = await listAccounts(db, {
        customerOnly: /\bcustomer\b/i.test(prompt),
        supplierOnly: /\bsupplier\b/i.test(prompt),
        search: accountCode,
      });
      return {
        toolName,
        args: {customerOnly: /\bcustomer\b/i.test(prompt)},
        data,
        hint: "List matching accounts with code, name, and headType.",
      };
    }
    default:
      return null;
  }
};

// Re-export detectors used in tests
export {
  isTrialBalancePrompt,
  isJournalEntriesPrompt,
  isListAccountsPrompt,
  resolveAccountsToolName,
};
