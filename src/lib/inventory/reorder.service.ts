/**
 * Inventory AI Reorder service — predictive purchase suggestions.
 *
 * Research finding: Lightspeed Pro charges $50+/mo for "Smart Reordering".
 * Toast Inventory Pro has demand-based reorder suggestions. POSR offers it
 * free — combines demand forecast (already implemented) + consumption rate
 * + lead time + par-level to generate purchase suggestions.
 *
 * Algorithm:
 *   1. For each inventory item, compute:
 *      - current_stock (sum of on-hand across locations)
 *      - avg_daily_usage (consumption rate over last N days, default 30)
 *      - forecasted_usage_7d (from demand-forecast.service.ts if available)
 *      - days_until_out (current_stock / max(avg_daily_usage, 0.1))
 *      - par_level (from inventory_item.reorder_levels, fallback: 7-day need + safety stock)
 *   2. Trigger conditions (any one):
 *      - current_stock < par_level
 *      - days_until_out < (lead_time + safety_stock_days)
 *      - forecasted_usage_7d > current_stock (spike detected)
 *   3. Suggested quantity:
 *      - target = (lead_time + safety_stock_days + 14) * avg_daily_usage
 *      - suggested_qty = max(0, target - current_stock)
 *      - Round up to typical supplier pack size if known
 *   4. AI enhancement (optional):
 *      - OpenAI analyzes suggestions + generates insights + adjusts quantities
 *      - Falls back to pure statistical when AI is disabled or unavailable
 *   5. Urgency:
 *      - critical: days_until_out < 2
 *      - high:     days_until_out < 5
 *      - medium:   days_until_out < 10
 *      - low:      below par but > 10 days of stock
 *
 * Output: array of ReorderSuggestion, persisted to reorder_suggestion table
 * (cached for 24h — refreshable on demand).
 *
 * Conversion: suggestions can be accepted/rejected individually or in bulk,
 * and converted to draft purchase orders (via existing PO service).
 */

import { useDB } from '@/api/db/db.ts';
import { toRecordId, safeNumber } from '@/lib/utils.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReorderUrgency = 'critical' | 'high' | 'medium' | 'low';
export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'converted_to_po' | 'expired';

export interface ReorderSuggestion {
  id?: string;
  inventory_item?: string;
  item_id: string;
  item_name: string;
  item_code?: string;
  uom?: string;
  current_stock: number;
  par_level: number;
  suggested_qty: number;
  avg_daily_usage: number;
  forecasted_usage_7d: number;
  days_until_out: number;
  urgency: ReorderUrgency;
  supplier?: string;
  supplier_name?: string;
  unit_cost?: number;
  total_cost?: number;
  reason_codes: string[];
  ai_confidence: number;
  status: SuggestionStatus;
  generated_at: Date;
  expires_at?: Date;
  accepted_at?: Date;
  accepted_by?: string;
  converted_po?: string;
  location?: string;
}

export interface ReorderConfig {
  safetyStockDays: number;
  minOrderValue: number;
  maxSuggestionAgeHours: number;
  autoApproveBelow: number;
  consumeLookbackDays: number;
  aiEnabled: boolean;
}

export const DEFAULT_REORDER_CONFIG: ReorderConfig = {
  safetyStockDays: 3,
  minOrderValue: 50,
  maxSuggestionAgeHours: 24,
  autoApproveBelow: 0,
  consumeLookbackDays: 30,
  aiEnabled: true,
};

// ---------------------------------------------------------------------------
// Config reader
// ---------------------------------------------------------------------------

export const readReorderConfig = (settings: any): ReorderConfig => ({
  safetyStockDays: settings?.reorder_safety_stock_days ?? DEFAULT_REORDER_CONFIG.safetyStockDays,
  minOrderValue: settings?.reorder_min_order_value ?? DEFAULT_REORDER_CONFIG.minOrderValue,
  maxSuggestionAgeHours: settings?.reorder_max_suggestion_age_hours ?? DEFAULT_REORDER_CONFIG.maxSuggestionAgeHours,
  autoApproveBelow: settings?.reorder_auto_approve_below ?? DEFAULT_REORDER_CONFIG.autoApproveBelow,
  consumeLookbackDays: settings?.reorder_consume_lookback_days ?? DEFAULT_REORDER_CONFIG.consumeLookbackDays,
  aiEnabled: settings?.reorder_ai_enabled ?? DEFAULT_REORDER_CONFIG.aiEnabled,
});

// ---------------------------------------------------------------------------
// Lead time — auto-learned from purchase order history
// ---------------------------------------------------------------------------

interface LeadTimeStats {
  avgLeadDays: number;
  minLeadDays: number;
  maxLeadDays: number;
  sampleCount: number;
}

const DEFAULT_LEAD_TIME: LeadTimeStats = {
  avgLeadDays: 7,
  minLeadDays: 3,
  maxLeadDays: 14,
  sampleCount: 0,
};

export const getLeadTimeForItem = async (
  db: ReturnType<typeof useDB>,
  itemId: string
): Promise<LeadTimeStats> => {
  try {
    const result = await db.query<any[]>(
      `SELECT * FROM inventory_lead_time WHERE item.id = $itemId LIMIT 1`,
      { itemId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const lt = rows[0];
    if (!lt) return DEFAULT_LEAD_TIME;
    return {
      avgLeadDays: safeNumber(lt.avg_lead_days, 7),
      minLeadDays: safeNumber(lt.min_lead_days, 3),
      maxLeadDays: safeNumber(lt.max_lead_days, 14),
      sampleCount: safeNumber(lt.sample_count, 0),
    };
  } catch {
    return DEFAULT_LEAD_TIME;
  }
};

/**
 * Recompute lead times from purchase order history.
 * Called periodically (e.g. nightly) or on-demand.
 */
export const recomputeLeadTimes = async (
  db: ReturnType<typeof useDB>
): Promise<{ updated: number }> => {
  try {
    // Find all fulfilled POs with submitted_at + fulfilled timestamps
    const result = await db.query<any[]>(
      `SELECT
         supplier.id AS supplier_id,
         items.item.id AS item_id,
         submitted_at,
         updated_at
       FROM inventory_purchase_order
       WHERE status = 'Fulfilled'
         AND submitted_at != NONE
       FETCH items`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    // Aggregate per (supplier, item)
    const byPair = new Map<string, { leadDays: number[]; supplierId?: string; itemId?: string }>();
    for (const po of rows) {
      const submitted = po.submitted_at ? new Date(po.submitted_at as any) : null;
      const fulfilled = po.updated_at ? new Date(po.updated_at as any) : null;
      if (!submitted || !fulfilled) continue;
      const leadDays = (fulfilled.getTime() - submitted.getTime()) / (24 * 60 * 60 * 1000);
      const supplierId = po.supplier_id?.toString?.() ?? 'unknown';
      for (const item of (po.items ?? [])) {
        const itemId = item?.item?.id?.toString?.() ?? item?.item_id?.toString?.() ?? 'unknown';
        if (itemId === 'unknown') continue;
        const key = `${supplierId}:${itemId}`;
        if (!byPair.has(key)) byPair.set(key, { leadDays: [], supplierId, itemId });
        byPair.get(key)!.leadDays.push(leadDays);
      }
    }

    let updated = 0;
    for (const [key, data] of byPair) {
      if (data.leadDays.length === 0) continue;
      const avg = data.leadDays.reduce((s, d) => s + d, 0) / data.leadDays.length;
      const min = Math.min(...data.leadDays);
      const max = Math.max(...data.leadDays);
      try {
        await db.query(
          `UPSERT inventory_lead_time CONTENT $data`,
          {
            data: {
              id: key.replace(/[^a-zA-Z0-9]/g, '_'),
              supplier: data.supplierId && data.supplierId !== 'unknown' ? toRecordId(data.supplierId) : undefined,
              item: data.itemId && data.itemId !== 'unknown' ? toRecordId(data.itemId) : undefined,
              avg_lead_days: Math.round(avg * 10) / 10,
              min_lead_days: Math.round(min * 10) / 10,
              max_lead_days: Math.round(max * 10) / 10,
              sample_count: data.leadDays.length,
              last_updated: nowSurrealDateTime(),
            },
          }
        );
        updated++;
      } catch (err) {
        console.warn('[reorder] upsert lead time failed for', key, err);
      }
    }
    return { updated };
  } catch (err) {
    console.error('[reorder] recomputeLeadTimes failed', err);
    return { updated: 0 };
  }
};

// ---------------------------------------------------------------------------
// Consumption rate — units consumed per day (last N days)
// ---------------------------------------------------------------------------

interface ConsumptionStats {
  avgDailyUsage: number;
  totalConsumed: number;
  daysCovered: number;
}

export const getConsumptionRate = async (
  db: ReturnType<typeof useDB>,
  itemId: string,
  lookbackDays: number = 30
): Promise<ConsumptionStats> => {
  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const result = await db.query<any[]>(
      `SELECT quantity_change, reference_type, created_at
       FROM inventory_ledger
       WHERE inventory_item.id = $itemId
         AND created_at > $cutoff
       ORDER BY created_at DESC`,
      { itemId, cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    // Consumption = sum of negative quantity_changes (issues, waste, transfers out)
    let totalConsumed = 0;
    const consumeTypes = ['issue', 'waste', 'transfer_out', 'production_input', 'buffet_consumption'];
    for (const r of rows) {
      const qty = safeNumber(r.quantity_change, 0);
      const refType = r.reference_type;
      if (consumeTypes.includes(refType) && qty < 0) {
        totalConsumed += Math.abs(qty);
      }
    }
    const daysCovered = Math.min(lookbackDays, rows.length > 0 ? 1 : 0); // at least 1 day if any data
    const avgDailyUsage = daysCovered > 0 ? totalConsumed / daysCovered : 0;
    return { avgDailyUsage, totalConsumed, daysCovered };
  } catch (err) {
    console.warn('[reorder] getConsumptionRate failed for', itemId, err);
    return { avgDailyUsage: 0, totalConsumed: 0, daysCovered: 0 };
  }
};

// ---------------------------------------------------------------------------
// Current stock — sum of on-hand across locations
// ---------------------------------------------------------------------------

export const getCurrentStock = async (
  db: ReturnType<typeof useDB>,
  itemId: string
): Promise<number> => {
  try {
    const result = await db.query<any[]>(
      `SELECT
         math::sum(quantity_change) AS on_hand
       FROM inventory_ledger
       WHERE inventory_item.id = $itemId
       GROUP BY inventory_item`,
      { itemId }
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    return safeNumber(rows[0]?.on_hand, 0);
  } catch {
    return 0;
  }
};

// ---------------------------------------------------------------------------
// Demand forecast integration — get forecasted 7-day usage for an item
// ---------------------------------------------------------------------------

/**
 * Get forecasted usage for an inventory item over the next 7 days.
 * Tries to use the demand-forecast cache if available; falls back to
 * avg_daily_usage * 7 if no forecast exists.
 */
export const getForecastedUsage7d = async (
  db: ReturnType<typeof useDB>,
  itemId: string,
  fallbackDailyUsage: number
): Promise<number> => {
  try {
    // Check if there's a recent demand forecast (within 24h)
    const result = await db.query<any[]>(
      `SELECT predicted_items FROM demand_forecast
       WHERE generated_at > time::now() - 24h
       ORDER BY generated_at DESC
       LIMIT 1`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    if (rows.length === 0) {
      return fallbackDailyUsage * 7;
    }
    // demand_forecast stores predicted_items as a flat array across all hours/days
    // Sum quantities for our item across the forecast horizon
    const allItems = rows[0].predicted_items ?? [];
    let total = 0;
    for (const pi of allItems) {
      if (pi?.dishId === itemId || pi?.itemId === itemId) {
        total += safeNumber(pi.quantity, 0);
      }
    }
    return total > 0 ? total : fallbackDailyUsage * 7;
  } catch {
    return fallbackDailyUsage * 7;
  }
};

// ---------------------------------------------------------------------------
// Urgency computation
// ---------------------------------------------------------------------------

export const computeUrgency = (
  daysUntilOut: number,
  belowPar: boolean
): ReorderUrgency => {
  if (daysUntilOut < 2) return 'critical';
  if (daysUntilOut < 5) return 'high';
  if (daysUntilOut < 10) return 'medium';
  if (belowPar) return 'low';
  return 'low';
};

// ---------------------------------------------------------------------------
// Suggestion generation — main entry point
// ---------------------------------------------------------------------------

export interface GenerateSuggestionsResult {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  generatedAt: Date;
  totalValue: number;
}

export const generateReorderSuggestions = async (
  db: ReturnType<typeof useDB>,
  config: ReorderConfig = DEFAULT_REORDER_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<GenerateSuggestionsResult> => {
  // 1. Fetch all active inventory items
  const itemsResult = await db.query<any[]>(
    `SELECT id, name, code, uom, price, average_price, reorder_levels, suppliers
     FROM inventory_item
     WHERE deleted_at IS NONE
     LIMIT 500`
  );
  const items = Array.isArray(itemsResult) ? itemsResult.flat() : [];
  const total = items.length;

  // 2. Mark existing pending suggestions as expired
  try {
    await db.query(
      `UPDATE reorder_suggestion SET status = 'expired'
       WHERE status = 'pending' AND generated_at < time::now() - ${config.maxSuggestionAgeHours}h`
    );
  } catch (err) {
    console.warn('[reorder] expire old suggestions failed', err);
  }

  // 3. Per-item analysis
  const suggestions: ReorderSuggestion[] = [];
  let processed = 0;

  for (const item of items) {
    if (onProgress) onProgress(++processed, total);
    const itemId = item.id?.toString?.() ?? '';
    if (!itemId) continue;

    const currentStock = await getCurrentStock(db, itemId);
    const consumption = await getConsumptionRate(db, itemId, config.consumeLookbackDays);
    const leadTime = await getLeadTimeForItem(db, itemId);
    const forecasted7d = await getForecastedUsage7d(db, itemId, consumption.avgDailyUsage);

    // Par level: from item.reorder_levels (per-location map) — use max as fallback
    const reorderLevels = item.reorder_levels ?? {};
    const parLevelValues = Object.values(reorderLevels).map(v => safeNumber(v, 0));
    const parLevel = parLevelValues.length > 0
      ? Math.max(...parLevelValues)
      : (consumption.avgDailyUsage * (leadTime.avgLeadDays + config.safetyStockDays));

    // Days until out (use max of avg + forecast to be conservative)
    const effectiveDailyUsage = Math.max(consumption.avgDailyUsage, forecasted7d / 7);
    const daysUntilOut = effectiveDailyUsage > 0
      ? currentStock / effectiveDailyUsage
      : 999; // No usage — never runs out

    // Trigger conditions
    const belowPar = currentStock < parLevel;
    const daysUntilOutTrigger = daysUntilOut < (leadTime.avgLeadDays + config.safetyStockDays);
    const spikeTrigger = forecasted7d > currentStock && forecasted7d > 0;
    const shouldSuggest = belowPar || daysUntilOutTrigger || spikeTrigger;

    if (!shouldSuggest) continue;

    // Suggested quantity: target = (lead_time + safety_stock + 14 days) * daily usage
    const targetStock = effectiveDailyUsage * (leadTime.avgLeadDays + config.safetyStockDays + 14);
    const suggestedQty = Math.max(0, Math.ceil(targetStock - currentStock));

    if (suggestedQty <= 0) continue;

    // Supplier + cost
    const supplier = item.suppliers?.[0];
    const supplierId = supplier?.id?.toString?.();
    const supplierName = supplier?.name;
    const unitCost = safeNumber(item.average_price ?? item.price, 0);
    const totalCost = suggestedQty * unitCost;

    // Skip if below minimum order value
    if (totalCost < config.minOrderValue) continue;

    // Reason codes
    const reasonCodes: string[] = [];
    if (belowPar) reasonCodes.push('below_par');
    if (daysUntilOutTrigger) reasonCodes.push(`days_until_out_${Math.round(daysUntilOut)}`);
    if (spikeTrigger) reasonCodes.push('forecast_spike');
    reasonCodes.push(`lead_time_${leadTime.avgLeadDays}d`);

    const urgency = computeUrgency(daysUntilOut, belowPar);

    suggestions.push({
      inventory_item: itemId,
      item_id: itemId,
      item_name: item.name ?? item.code ?? 'Unknown',
      item_code: item.code,
      uom: item.uom,
      current_stock: currentStock,
      par_level: parLevel,
      suggested_qty: suggestedQty,
      avg_daily_usage: consumption.avgDailyUsage,
      forecasted_usage_7d: forecasted7d,
      days_until_out: Math.round(daysUntilOutSafe(daysUntilOut)),
      urgency,
      supplier: supplierId,
      supplier_name: supplierName,
      unit_cost: unitCost,
      total_cost: totalCost,
      reason_codes: reasonCodes,
      ai_confidence: 0.7,
      status: 'pending',
      generated_at: new Date(),
      expires_at: new Date(Date.now() + config.maxSuggestionAgeHours * 60 * 60 * 1000),
    });
  }

  // 4. Persist suggestions
  for (const s of suggestions) {
    try {
      await db.query(
        `CREATE reorder_suggestion CONTENT $data`,
        {
          data: {
            ...s,
            inventory_item: s.inventory_item ? toRecordId(s.inventory_item) : undefined,
            supplier: s.supplier ? toRecordId(s.supplier) : undefined,
            generated_at: s.generated_at.toISOString(),
            expires_at: s.expires_at?.toISOString(),
          },
        }
      );
    } catch (err) {
      console.warn('[reorder] persist suggestion failed for', s.item_name, err);
    }
  }

  // 5. AI enhancement (optional)
  if (config.aiEnabled && suggestions.length > 0) {
    try {
      await enhanceSuggestionsWithAI(db, suggestions);
    } catch (err) {
      console.warn('[reorder] AI enhancement failed — keeping statistical suggestions', err);
    }
  }

  // 6. Auto-approve below threshold
  if (config.autoApproveBelow > 0) {
    for (const s of suggestions) {
      if ((s.total_cost ?? 0) < config.autoApproveBelow) {
        s.status = 'accepted';
        s.accepted_at = new Date();
      }
    }
  }

  // Summary
  const summary: GenerateSuggestionsResult = {
    total: suggestions.length,
    critical: suggestions.filter(s => s.urgency === 'critical').length,
    high: suggestions.filter(s => s.urgency === 'high').length,
    medium: suggestions.filter(s => s.urgency === 'medium').length,
    low: suggestions.filter(s => s.urgency === 'low').length,
    generatedAt: new Date(),
    totalValue: suggestions.reduce((sum, s) => sum + (s.total_cost ?? 0), 0),
  };

  return summary;
};

// Safe days-until-out: avoid returning Infinity for items with no usage
const daysUntilOutSafe = (days: number): number => {
  if (!Number.isFinite(days) || days > 999) return 999;
  return days;
};

// ---------------------------------------------------------------------------
// AI enhancement — uses OpenAI to refine suggestions + generate insights
// ---------------------------------------------------------------------------

const enhanceSuggestionsWithAI = async (
  db: ReturnType<typeof useDB>,
  suggestions: ReorderSuggestion[]
): Promise<void> => {
  // Lazy import to avoid circular dep + only load when needed
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[reorder] OpenAI service not available — skipping AI enhancement');
    return;
  }

  // Build a compact summary for the AI
  const topSuggestions = suggestions
    .sort((a, b) => a.days_until_out - b.days_until_out)
    .slice(0, 30); // Top 30 most urgent

  const prompt = `You are an inventory optimization expert for a restaurant POS system.
Analyze these reorder suggestions and provide:
1. Adjusted quantities (if a suggestion seems too high/low)
2. Insights (trends, anomalies, supplier recommendations)
3. Confidence scores (0-1) based on data quality

Suggestions (JSON):
${JSON.stringify(topSuggestions.map(s => ({
  item: s.item_name,
  current_stock: s.current_stock,
  par_level: s.par_level,
  suggested_qty: s.suggested_qty,
  avg_daily_usage: s.avg_daily_usage,
  days_until_out: s.days_until_out,
  urgency: s.urgency,
  reason_codes: s.reason_codes,
})), null, 2)}

Respond with a JSON array of adjustments:
[{"item_name": "...", "adjusted_qty": N, "confidence": 0.8, "insight": "..."}]

Only include items where you recommend a change. Keep insights under 100 chars.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant inventory optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1500 });

    // Parse + apply adjustments
    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const adjustments = JSON.parse(jsonMatch[0]) as Array<{
      item_name: string;
      adjusted_qty?: number;
      confidence?: number;
      insight?: string;
    }>;

    for (const adj of adjustments) {
      const suggestion = suggestions.find(s => s.item_name === adj.item_name);
      if (!suggestion) continue;
      if (typeof adj.adjusted_qty === 'number' && adj.adjusted_qty > 0) {
        suggestion.suggested_qty = adj.adjusted_qty;
        suggestion.total_cost = adj.adjusted_qty * (suggestion.unit_cost ?? 0);
      }
      if (typeof adj.confidence === 'number') {
        suggestion.ai_confidence = Math.max(0, Math.min(1, adj.confidence));
      }
      if (adj.insight) {
        suggestion.reason_codes.push(`ai: ${adj.insight.slice(0, 80)}`);
      }
    }

    // Update persisted suggestions
    for (const s of suggestions) {
      try {
        await db.query(
          `UPDATE reorder_suggestion SET
             suggested_qty = $qty,
             total_cost = $cost,
             ai_confidence = $conf,
             reason_codes = $reasons
           WHERE item_id = $itemId AND status = 'pending'`,
          {
            itemId: s.item_id,
            qty: s.suggested_qty,
            cost: s.total_cost,
            conf: s.ai_confidence,
            reasons: s.reason_codes,
          }
        );
      } catch (err) {
        console.warn('[reorder] AI update persist failed for', s.item_name, err);
      }
    }
  } catch (err) {
    console.warn('[reorder] AI call failed', err);
  }
};

// ---------------------------------------------------------------------------
// Suggestion retrieval + lifecycle
// ---------------------------------------------------------------------------

export const getPendingSuggestions = async (
  db: ReturnType<typeof useDB>
): Promise<ReorderSuggestion[]> => {
  try {
    const result = await db.query<ReorderSuggestion[]>(
      `SELECT * FROM reorder_suggestion WHERE status = 'pending' ORDER BY urgency ASC, days_until_out ASC`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    return list;
  } catch (err) {
    console.error('[reorder] getPendingSuggestions failed', err);
    return [];
  }
};

export const acceptSuggestion = async (
  db: ReturnType<typeof useDB>,
  suggestionId: string,
  userId: string
): Promise<void> => {
  await db.query(
    `UPDATE $id SET status = 'accepted', accepted_at = $now, accepted_by = $user`,
    {
      id: toRecordId(suggestionId),
      now: nowSurrealDateTime(),
      user: toRecordId(userId),
    }
  );
};

export const rejectSuggestion = async (
  db: ReturnType<typeof useDB>,
  suggestionId: string
): Promise<void> => {
  await db.query(
    `UPDATE $id SET status = 'rejected'`,
    { id: toRecordId(suggestionId) }
  );
};

/**
 * Convert accepted suggestions into a draft purchase order.
 * Groups items by supplier (one PO per supplier).
 */
export const convertSuggestionsToPO = async (
  db: ReturnType<typeof useDB>,
  suggestionIds: string[],
  userId: string
): Promise<{ createdPOs: string[]; totalValue: number }> => {
  // Fetch the suggestions
  const result = await db.query<ReorderSuggestion[]>(
    `SELECT * FROM reorder_suggestion WHERE id IN $ids`,
    { ids: suggestionIds.map(id => toRecordId(id)) }
  );
  const suggestions = Array.isArray(result) ? result.flat() : [];

  // Group by supplier
  const bySupplier = new Map<string, ReorderSuggestion[]>();
  for (const s of suggestions) {
    const supplierKey = s.supplier ?? 'unknown';
    if (!bySupplier.has(supplierKey)) bySupplier.set(supplierKey, []);
    bySupplier.get(supplierKey)!.push(s);
  }

  const createdPOs: string[] = [];
  let totalValue = 0;

  for (const [supplierId, items] of bySupplier) {
    const poItems = items.map((s, idx) => ({
      item: s.inventory_item ? toRecordId(s.inventory_item) : toRecordId(s.item_id),
      quantity: s.suggested_qty,
      price: s.unit_cost ?? 0,
      supplier: s.supplier ? toRecordId(s.supplier) : undefined,
      position: idx + 1,
    }));

    try {
      const poResult = await db.query<any>(
        `CREATE inventory_purchase_order SET
           status = 'Draft',
           supplier = $supplier,
           items = $items,
           created_at = $now,
           submitted_by = $user`,
        {
          supplier: supplierId !== 'unknown' ? toRecordId(supplierId) : undefined,
          items: poItems,
          now: nowSurrealDateTime(),
          user: toRecordId(userId),
        }
      );
      const poId = (poResult as any)?.id?.toString?.() ?? (Array.isArray(poResult) ? poResult[0]?.id?.toString() : '');
      if (poId) {
        createdPOs.push(poId);
        totalValue += items.reduce((sum, s) => sum + (s.total_cost ?? 0), 0);
        // Mark suggestions as converted
        for (const s of items) {
          if (s.id) {
            await db.query(
              `UPDATE $id SET status = 'converted_to_po', converted_po = $poId`,
              { id: toRecordId(s.id), poId: toRecordId(poId) }
            );
          }
        }
      }
    } catch (err) {
      console.error('[reorder] create PO failed for supplier', supplierId, err);
    }
  }

  return { createdPOs, totalValue };
};
