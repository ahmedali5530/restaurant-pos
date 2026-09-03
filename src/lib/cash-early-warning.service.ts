/**
 * AI Cash Flow Early Warning service — 7-day cash position projection.
 *
 * 36th POSR-exclusive differentiator — 60% of restaurant closures are due to
 * cash flow problems that could have been predicted. Toast, Square show
 * current balance but DON'T predict when cash will run out. POSR projects
 * 7-day cash position including known obligations + AI alerts before critical.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type WarningLevel = 'safe' | 'caution' | 'critical' | 'emergency';
export type CashWarningRecommendation = 'delay_payments' | 'accelerate_collections' | 'arrange_credit' | 'reduce_spending' | 'no_action';

export interface CashEarlyWarning {
  id?: string;
  current_balance: number;
  projected_date: Date;
  days_ahead: number;
  projected_inflow: number;
  projected_outflow: number;
  projected_balance: number;
  min_projected_balance: number;
  min_balance_date?: Date;
  warning_level: WarningLevel;
  est_days_until_negative: number;
  known_obligations?: Record<string, any>;
  ai_insight?: string;
  ai_recommendation?: CashWarningRecommendation;
  predicted_at: Date;
}

export interface CashWarningConfig {
  aiEnabled: boolean;
  reservePct: number;
  criticalPct: number;
}

export const DEFAULT_CASH_WARNING_CONFIG: CashWarningConfig = {
  aiEnabled: true, reservePct: 0.15, criticalPct: 0.05,
};

export const readCashWarningConfig = (settings: any): CashWarningConfig => ({
  aiEnabled: settings?.cash_warning_ai_enabled ?? true,
  reservePct: safeNumber(settings?.cash_warning_reserve_pct, 0.15),
  criticalPct: safeNumber(settings?.cash_warning_critical_pct, 0.05),
});

const formatCurrency = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface CashData {
  currentBalance: number;
  avgDailyRevenue: number;
  avgDailyExpenses: number;
  payrollDue: number;
  poPaymentsDue: number;
  rentDue: number;
  otherObligations: number;
  avgMonthlyRevenue: number;
}

const fetchCashData = async (db: any): Promise<CashData> => {
  try {
    // Current balance from latest cash closing
    const balanceResult = await db.query(
      `SELECT closing_balance FROM cash_closing ORDER BY created_at DESC LIMIT 1`
    );
    const balanceRows = Array.isArray(balanceResult) ? balanceResult.flat() : [];
    const currentBalance = safeNumber(balanceRows[0]?.closing_balance, 0);

    // Avg daily revenue (last 30 days)
    const revResult = await db.query(
      `SELECT math::sum(total) / 30 AS avg_daily FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE AND created_at > time::now() - 30d`
    );
    const revRows = Array.isArray(revResult) ? revResult.flat() : [];
    const avgDailyRevenue = safeNumber(revRows[0]?.avg_daily, 500);

    // Avg daily expenses (from expense table or inventory purchases)
    const expResult = await db.query(
      `SELECT math::sum(total_cost) / 30 AS avg_daily FROM inventory_ledger
       WHERE quantity_change < 0 AND created_at > time::now() - 30d`
    );
    const expRows = Array.isArray(expResult) ? expResult.flat() : [];
    const avgDailyExpenses = safeNumber(expRows[0]?.avg_daily, 300);

    // Payroll due in next 7 days
    const payrollResult = await db.query(
      `SELECT math::sum(total_cost) AS payroll FROM payroll_snapshot
       WHERE created_at > time::now() AND created_at < time::now() + 7d`
    );
    const payrollRows = Array.isArray(payrollResult) ? payrollResult.flat() : [];
    const payrollDue = safeNumber(payrollRows[0]?.payroll, 0);

    // PO payments due (approved POs not yet paid)
    const poResult = await db.query(
      `SELECT math::sum(total) AS po_total FROM inventory_purchase_order
       WHERE status = 'approved' AND created_at > time::now() - 30d`
    );
    const poRows = Array.isArray(poResult) ? poResult.flat() : [];
    const poPaymentsDue = safeNumber(poRows[0]?.po_total, 0);

    // Monthly revenue for threshold calculation
    const monthlyResult = await db.query(
      `SELECT math::sum(total) AS monthly FROM order
       WHERE status = 'Paid' AND deleted_at IS NONE AND created_at > time::now() - 30d`
    );
    const monthlyRows = Array.isArray(monthlyResult) ? monthlyResult.flat() : [];
    const avgMonthlyRevenue = safeNumber(monthlyRows[0]?.monthly, 15000);

    return {
      currentBalance, avgDailyRevenue, avgDailyExpenses,
      payrollDue, poPaymentsDue, rentDue: 0, otherObligations: 0,
      avgMonthlyRevenue,
    };
  } catch (err) { console.warn('[cash-warning] fetchCashData failed', err); return { currentBalance: 0, avgDailyRevenue: 500, avgDailyExpenses: 300, payrollDue: 0, poPaymentsDue: 0, rentDue: 0, otherObligations: 0, avgMonthlyRevenue: 15000 }; }
};

export const runCashWarning = async (
  db: ReturnType<typeof useDB>,
  config: CashWarningConfig = DEFAULT_CASH_WARNING_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ warning: CashEarlyWarning | null }> => {
  if (onProgress) onProgress(0, 2);

  const data = await fetchCashData(db);
  if (onProgress) onProgress(1, 2);

  const reserveThreshold = data.avgMonthlyRevenue * config.reservePct;
  const criticalThreshold = data.avgMonthlyRevenue * config.criticalPct;

  // Project 7 days
  let runningBalance = data.currentBalance;
  let minBalance = data.currentBalance;
  let minBalanceDate = new Date();
  let daysUntilNegative = 999;
  const obligations = {
    payroll: data.payrollDue,
    po_payments: data.poPaymentsDue,
    rent: data.rentDue,
    other: data.otherObligations,
  };

  for (let day = 1; day <= 7; day++) {
    const inflow = data.avgDailyRevenue;
    let outflow = data.avgDailyExpenses;
    // Add obligations on specific days (simplified: payroll on day 3, PO on day 5)
    if (day === 3) outflow += data.payrollDue;
    if (day === 5) outflow += data.poPaymentsDue;

    runningBalance += inflow - outflow;
    if (runningBalance < minBalance) {
      minBalance = runningBalance;
      minBalanceDate = new Date(Date.now() + day * 24 * 60 * 60 * 1000);
    }
    if (runningBalance < 0 && daysUntilNegative === 999) {
      daysUntilNegative = day;
    }
  }

  // Warning level
  let warningLevel: WarningLevel;
  if (minBalance < 0) warningLevel = 'emergency';
  else if (minBalance < criticalThreshold) warningLevel = 'critical';
  else if (minBalance < reserveThreshold) warningLevel = 'caution';
  else warningLevel = 'safe';

  const warning: CashEarlyWarning = {
    current_balance: Math.round(data.currentBalance * 100) / 100,
    projected_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    days_ahead: 7,
    projected_inflow: Math.round(data.avgDailyRevenue * 7 * 100) / 100,
    projected_outflow: Math.round((data.avgDailyExpenses * 7 + data.payrollDue + data.poPaymentsDue) * 100) / 100,
    projected_balance: Math.round(runningBalance * 100) / 100,
    min_projected_balance: Math.round(minBalance * 100) / 100,
    min_balance_date: minBalanceDate,
    warning_level: warningLevel,
    est_days_until_negative: daysUntilNegative,
    known_obligations: obligations,
    predicted_at: new Date(),
  };

  // AI insight
  if (config.aiEnabled && warningLevel !== 'safe') {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      try {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a restaurant cash flow warning AI. Respond with insight (max 200 chars) + recommendation.' },
          { role: 'user', content: `Cash warning: ${warningLevel}. Current ${formatCurrency(data.currentBalance)}, min projected ${formatCurrency(minBalance)} in 7d. Days until negative: ${daysUntilNegative === 999 ? 'never' : daysUntilNegative}. Obligations: payroll ${formatCurrency(data.payrollDue)}, PO ${formatCurrency(data.poPaymentsDue)}. Avg daily revenue ${formatCurrency(data.avgDailyRevenue)}, expenses ${formatCurrency(data.avgDailyExpenses)}.` },
        ], { temperature: 0.3, maxTokens: 200 });
        const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
        // Parse response for insight + recommendation
        const lines = text.split('\n').filter(l => l.trim());
        if (lines[0]) warning.ai_insight = lines[0].slice(0, 200);
        // Detect recommendation keyword
        const lowerText = text.toLowerCase();
        if (lowerText.includes('delay')) warning.ai_recommendation = 'delay_payments';
        else if (lowerText.includes('collect')) warning.ai_recommendation = 'accelerate_collections';
        else if (lowerText.includes('credit') || lowerText.includes('loan')) warning.ai_recommendation = 'arrange_credit';
        else if (lowerText.includes('reduce') || lowerText.includes('cut')) warning.ai_recommendation = 'reduce_spending';
        else warning.ai_recommendation = 'no_action';
      } catch { }
    }
  }

  // Persist
  try { await db.query(`DELETE FROM cash_early_warning WHERE predicted_at < time::now() - 1h`); } catch { }
  try { await db.query(`CREATE cash_early_warning CONTENT $data`, { data: { ...warning, projected_date: warning.projected_date.toISOString(), min_balance_date: warning.min_balance_date?.toISOString(), predicted_at: warning.predicted_at.toISOString() } }); } catch { }

  if (onProgress) onProgress(2, 2);
  return { warning };
};

export const getLatestWarning = async (db: ReturnType<typeof useDB>): Promise<CashEarlyWarning | null> => {
  try {
    const result = await db.query(`SELECT * FROM cash_early_warning ORDER BY predicted_at DESC LIMIT 1`);
    const rows = Array.isArray(result) ? result.flat() : [];
    return rows[0] ?? null;
  } catch { return null; }
};
