/**
 * AI Inventory Expiry Tracker — proactive expiry management + commercial actions.
 *
 * 67th POSR-exclusive differentiator — restaurants waste 4-10% of food
 * inventory to expiry (NRRA). 40% of food waste happens because items expire
 * before use (ReFED). Existing systems find items ALREADY expired (food-safety)
 * or PREDICT spoilage (spoilage-prediction). Neither recommends COMMERCIAL
 * ACTIONS to use expiring items before they're wasted.
 *
 * Distinct from:
 *   - spoilage-prediction.service (PREDICTS spoilage from consumption rate —
 *     NOT commercial actions to use expiring items)
 *   - food-safety.service (finds ALREADY expired items — reactive)
 *   - waste-tracking.service (analyzes waste AFTER it happens)
 *   - inventory-transfer.service (transfers between branches — not expiry action)
 *   - reorder.service (suggests reorder timing — not expiry management)
 *
 * Tracks items approaching expiry, recommends commercial actions (markdown,
 * daily special, prep priority, transfer, donate, discard), calculates
 * financial impact, tracks batch/lot for recalls.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ExpiryRuleId =
  | 'critical_3d'
  | 'urgent_7d'
  | 'warning_14d'
  | 'expired'
  | 'batch_recall';

export type ExpiryAiRec =
  | 'act_now'
  | 'schedule_markdown'
  | 'monitor'
  | 'recall_check'
  | 'discard';

export type SuggestedAction =
  | 'markdown_30pct'
  | 'daily_special'
  | 'prep_priority'
  | 'transfer_busy'
  | 'donate'
  | 'discard';

export interface ExpiryTracker {
  id?: string;
  rule_id: ExpiryRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  item_id?: string;
  item_name?: string;
  batch_number?: string;
  quantity: number;
  unit?: string;
  unit_cost: number;
  expiry_date?: Date;
  days_until_expiry: number;
  cost_at_risk: number;
  suggested_action?: SuggestedAction;
  est_savings: number;
  consumption_rate: number;
  will_expire_before_used?: boolean;
  description: string;
  ai_insight?: string;
  ai_recommendation?: ExpiryAiRec;
  status: 'open' | 'actioned' | 'used' | 'expired' | 'recalled';
  detected_at: Date;
  expires_at?: Date;
}

export interface ExpiryConfig {
  aiEnabled: boolean;
  criticalDays: number;
  urgentDays: number;
  warningDays: number;
  markdownPct: number;
}

export const DEFAULT_EXPIRY_CONFIG: ExpiryConfig = {
  aiEnabled: true,
  criticalDays: 3,
  urgentDays: 7,
  warningDays: 14,
  markdownPct: 0.30,
};

export const readExpiryConfig = (settings: any): ExpiryConfig => ({
  aiEnabled: settings?.expiry_ai_enabled ?? true,
  criticalDays: safeNumber(settings?.expiry_critical_days, 3),
  urgentDays: safeNumber(settings?.expiry_urgent_days, 7),
  warningDays: safeNumber(settings?.expiry_warning_days, 14),
  markdownPct: safeNumber(settings?.expiry_markdown_pct, 0.30),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface InventoryItemData {
  id: string;
  name: string;
  base_quantity: number;
  unit: string;
  cost: number;
  expiry_date?: string;
  batch_number?: string;
}

/**
 * Run the expiry tracker engine.
 * Fetches inventory items with expiry dates, categorizes by urgency,
 * recommends commercial actions.
 */
export const runExpiryEngine = async (
  db: ReturnType<typeof useDB>,
  config: ExpiryConfig = DEFAULT_EXPIRY_CONFIG
): Promise<{ alerts: ExpiryTracker[]; generated: number }> => {
  const alerts: ExpiryTracker[] = [];
  const now = new Date();

  // 1. Fetch inventory items with expiry dates
  let items: InventoryItemData[] = [];
  try {
    const result = await db.query(
      `SELECT
         id,
         name,
         base_quantity,
         item.unit AS unit,
         item.cost AS cost,
         expiry_date,
         batch_number
       FROM inventory_purchase_item
       WHERE expiry_date IS NOT NONE
         AND base_quantity > 0
       LIMIT 200`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    items = rows.map((r: any) => ({
      id: String(r.id ?? ''),
      name: String(r.name ?? 'Unknown Item'),
      base_quantity: safeNumber(r.base_quantity, 0),
      unit: String(r.unit ?? 'unit'),
      cost: safeNumber(r.cost, 0),
      expiry_date: r.expiry_date ? String(r.expiry_date) : undefined,
      batch_number: r.batch_number ? String(r.batch_number) : undefined,
    }));
  } catch (err) {
    console.warn('[expiry] fetchItems failed', err);
  }

  // Fallback: try inventory_item table if purchase_item doesn't have expiry
  if (items.length === 0) {
    try {
      const result = await db.query(
        `SELECT
           id,
           name,
           base_quantity,
           unit,
           cost,
           expiry_date,
           batch_number
         FROM inventory_item
         WHERE expiry_date IS NOT NONE
           AND deleted_at IS NONE
           AND base_quantity > 0
         LIMIT 200`
      );
      const rows = Array.isArray(result) ? result.flat() : [];
      items = rows.map((r: any) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? 'Unknown Item'),
        base_quantity: safeNumber(r.base_quantity, 0),
        unit: String(r.unit ?? 'unit'),
        cost: safeNumber(r.cost, 0),
        expiry_date: r.expiry_date ? String(r.expiry_date) : undefined,
        batch_number: r.batch_number ? String(r.batch_number) : undefined,
      }));
    } catch (err) {
      console.warn('[expiry] fetchItemsFallback failed', err);
    }
  }

  if (items.length === 0) return { alerts: [], generated: 0 };

  // 2. Fetch consumption rate per item (from order_item history)
  let consumptionRates: Map<string, number> = new Map();
  try {
    const rateResult = await db.query(
      `SELECT
         item.id AS item_id,
         math::sum(quantity) / 14 AS daily_rate
       FROM order_item
       WHERE order.status = 'Paid'
         AND order.deleted_at IS NONE
         AND deleted_at IS NONE
         AND item IS NOT NONE
         AND created_at > time::now() - 14d
       GROUP BY item.id`
    );
    const rateRows = Array.isArray(rateResult) ? rateResult.flat() : [];
    for (const r of rateRows) {
      consumptionRates.set(String(r.item_id), safeNumber(r.daily_rate, 0));
    }
  } catch (err) {
    console.warn('[expiry] fetchConsumptionRates failed', err);
  }

  // 3. Analyze each item
  for (const item of items) {
    if (!item.expiry_date) continue;

    const expiry = new Date(item.expiry_date);
    const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    // Skip items beyond warning window (more than 14 days)
    if (daysUntilExpiry > config.warningDays + 7) continue;

    const costAtRisk = item.base_quantity * item.cost;
    const consumptionRate = consumptionRates.get(item.id) ?? 0;
    const willExpireBeforeUsed = consumptionRate > 0
      ? (consumptionRate * daysUntilExpiry) < item.base_quantity
      : true; // no consumption data = assume won't be used

    // Determine rule + severity + action
    let ruleId: ExpiryRuleId;
    let severity: 'critical' | 'high' | 'medium' | 'low';
    let suggestedAction: SuggestedAction;
    let aiRec: ExpiryAiRec;
    let estSavings = 0;
    let desc = '';

    if (daysUntilExpiry < 0) {
      // Already expired
      ruleId = 'expired';
      severity = 'critical';
      suggestedAction = 'discard';
      aiRec = 'discard';
      desc = `${item.name} EXPIRED ${Math.abs(daysUntilExpiry)}d ago — ${item.base_quantity} ${item.unit} at ${fmt$(costAtRisk)} cost. Discard immediately (food safety risk).`;
    } else if (daysUntilExpiry <= config.criticalDays) {
      // Critical: 0-3 days
      ruleId = 'critical_3d';
      severity = 'critical';
      // If high-value, do daily special; if low-value, markdown
      suggestedAction = costAtRisk > 50 ? 'daily_special' : 'markdown_30pct';
      aiRec = 'act_now';
      estSavings = costAtRisk * 0.60; // recover 60% via markdown/special
      desc = `${item.name} expires in ${daysUntilExpiry}d — ${item.base_quantity} ${item.unit} (${fmt$(costAtRisk)} at risk). ${willExpireBeforeUsed ? 'Will NOT be consumed at current rate. ' : ''}Action: ${suggestedAction.replace(/_/g, ' ')}.`;
    } else if (daysUntilExpiry <= config.urgentDays) {
      // Urgent: 4-7 days
      ruleId = 'urgent_7d';
      severity = 'high';
      suggestedAction = willExpireBeforeUsed ? 'prep_priority' : 'monitor';
      aiRec = willExpireBeforeUsed ? 'schedule_markdown' : 'monitor';
      estSavings = willExpireBeforeUsed ? costAtRisk * 0.80 : 0;
      desc = `${item.name} expires in ${daysUntilExpiry}d — ${item.base_quantity} ${item.unit} (${fmt$(costAtRisk)} at risk). ${willExpireBeforeUsed ? 'Prioritize in prep or markdown. ' : 'Should be consumed in time.'}`;
    } else if (daysUntilExpiry <= config.warningDays) {
      // Warning: 8-14 days
      ruleId = 'warning_14d';
      severity = 'medium';
      suggestedAction = willExpireBeforeUsed ? 'transfer_busy' : 'monitor';
      aiRec = 'monitor';
      estSavings = willExpireBeforeUsed ? costAtRisk * 0.90 : 0;
      desc = `${item.name} expires in ${daysUntilExpiry}d — ${item.base_quantity} ${item.unit} (${fmt$(costAtRisk)} at risk). ${willExpireBeforeUsed ? 'Consider transferring to busier location. ' : 'On track for consumption.'}`;
    } else {
      // 15-21 days: low priority
      ruleId = 'warning_14d';
      severity = 'low';
      suggestedAction = 'monitor';
      aiRec = 'monitor';
      desc = `${item.name} expires in ${daysUntilExpiry}d — ${item.base_quantity} ${item.unit} (${fmt$(costAtRisk)} at risk). Monitor.`;
    }

    // Check for batch recall (if multiple items same batch expiring)
    if (item.batch_number && daysUntilExpiry < 0) {
      ruleId = 'batch_recall';
      severity = 'critical';
      suggestedAction = 'discard';
      aiRec = 'recall_check';
      desc = `BATCH RECALL: ${item.name} (batch ${item.batch_number}) EXPIRED — check all items from this batch. ${item.base_quantity} ${item.unit} at ${fmt$(costAtRisk)} cost.`;
    }

    alerts.push({
      rule_id: ruleId,
      severity,
      item_id: item.id,
      item_name: item.name,
      batch_number: item.batch_number,
      quantity: Math.round(item.base_quantity * 100) / 100,
      unit: item.unit,
      unit_cost: Math.round(item.cost * 100) / 100,
      expiry_date: expiry,
      days_until_expiry: daysUntilExpiry,
      cost_at_risk: Math.round(costAtRisk * 100) / 100,
      suggested_action: suggestedAction,
      est_savings: Math.round(estSavings * 100) / 100,
      consumption_rate: Math.round(consumptionRate * 100) / 100,
      will_expire_before_used: willExpireBeforeUsed || undefined,
      description: desc,
      ai_recommendation: aiRec,
      status: 'open',
      detected_at: now,
    });
  }

  // 4. AI insight for top 5 critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts
        .filter(a => a.severity === 'critical' || a.severity === 'high')
        .slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant inventory waste prevention AI. Respond with a single actionable insight (max 200 chars).' },
            { role: 'user', content: `Item "${a.item_name}": ${a.quantity} ${a.unit}, expires in ${a.days_until_expiry}d, cost at risk ${fmt$(a.cost_at_risk)}. Consumption rate: ${a.consumption_rate}/day. Will expire before used: ${a.will_expire_before_used}. Suggested action: ${a.suggested_action}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM expiry_tracker WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE expiry_tracker CONTENT $data`, {
        data: {
          ...a,
          expiry_date: a.expiry_date?.toISOString(),
          detected_at: a.detected_at.toISOString(),
        },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { alerts, generated: alerts.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<ExpiryTracker[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM expiry_tracker
       WHERE status = 'open'
       ORDER BY days_until_expiry ASC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  criticalCount: number;
  totalAlerts: number;
  totalCostAtRisk: number;
  totalSavings: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(cost_at_risk) AS risk,
         math::sum(est_savings) AS savings
       FROM expiry_tracker
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      criticalCount: safeNumber(r.critical, 0),
      totalAlerts: safeNumber(r.total, 0),
      totalCostAtRisk: safeNumber(r.risk, 0),
      totalSavings: safeNumber(r.savings, 0),
    };
  } catch {
    return { criticalCount: 0, totalAlerts: 0, totalCostAtRisk: 0, totalSavings: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'actioned' | 'used' | 'expired' | 'recalled'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
