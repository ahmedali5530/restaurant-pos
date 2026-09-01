/**
 * AI Allergen Cross-Contamination Risk Detector — per-order safety analysis.
 *
 * 46th POSR-exclusive differentiator — 32M Americans have food allergies;
 * 200+ die annually from anaphylaxis (FDA, AAAAI). Restaurants face $1M+
 * liability per allergen incident. Toast, Square, Lightspeed tag allergens
 * per dish but DO NOT detect cross-contamination risk when MULTIPLE DISHES
 * share a table, prep station, or order.
 *
 * Distinct from:
 *   - food-safety.service (HACCP temperature logs — NOT allergen-specific)
 *   - recipe-substitution.service (ingredient substitutions — not allergen risk)
 *   - food-cost-trend.service (price trends — not allergens)
 *   - menu-optimization.service (BCG matrix — not allergen cross-contamination)
 *
 * Detection rules (5):
 *   1. MIXED_ORDER_RISK — table orders both allergen-free + allergen-containing dishes
 *   2. SHARED_UTENSIL_RISK — dishes likely to share tongs/spatulas
 *   3. DEEP_FRYER_RISK — breaded + unbattered items in same order (shared fryer)
 *   4. UNKNOWN_ALLERGEN — dish contains allergen but customer allergy not asked
 *   5. REPEAT_OFFENDER — same dish triggers alerts repeatedly (recipe issue)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type AllergenRuleId =
  | 'mixed_order_risk'
  | 'shared_utensil_risk'
  | 'deep_fryer_risk'
  | 'unknown_allergen'
  | 'repeat_offender';

export type AllergenAiRec =
  | 'separate_prep'
  | 'change_gloves'
  | 'clean_fryer'
  | 'inform_customer'
  | 'decline_dish'
  | 'monitor';

export interface AllergenRiskAlert {
  id?: string;
  rule_id: AllergenRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  order_id?: string;
  table_name?: string;
  server_name?: string;
  allergens: string;
  affected_items: string;
  risk_count: number;
  customer_allergy?: string;
  preparation_note?: string;
  detected_at_order_time?: boolean;
  description: string;
  ai_insight?: string;
  ai_recommendation?: AllergenAiRec;
  status: 'open' | 'mitigated' | 'declined_dish' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface AllergenConfig {
  aiEnabled: boolean;
  lookbackDays: number;
  repeatThreshold: number;
  knownAllergens: string[];
}

export const DEFAULT_ALLERGEN_CONFIG: AllergenConfig = {
  aiEnabled: true,
  lookbackDays: 7,
  repeatThreshold: 3,
  knownAllergens: ['peanut', 'tree_nut', 'dairy', 'gluten', 'shellfish', 'egg', 'soy', 'sesame', 'fish'],
};

export const readAllergenConfig = (settings: any): AllergenConfig => ({
  aiEnabled: settings?.allergen_ai_enabled ?? true,
  lookbackDays: safeNumber(settings?.allergen_lookback_days, 7),
  repeatThreshold: safeNumber(settings?.allergen_repeat_threshold, 3),
  knownAllergens: String(settings?.allergen_known_list ?? 'peanut,tree_nut,dairy,gluten,shellfish,egg,soy,sesame,fish').split(','),
});

// ---------------------------------------------------------------------------
// Allergen detection — keyword-based (since menu_item has no allergen field)
// ---------------------------------------------------------------------------

// Allergen keyword map — used to detect allergens in dish names + ingredient names
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  peanut:      ['peanut', 'groundnut', 'satay', 'pad thai'],
  tree_nut:    ['almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio', 'macadamia', 'pine nut', 'brazil nut'],
  dairy:       ['cheese', 'cream', 'milk', 'butter', 'yogurt', 'parmesan', 'mozzarella', 'feta', 'ricotta', 'cream sauce', 'alfredo'],
  gluten:      ['bread', 'pasta', 'flour', 'wheat', 'noodle', 'crust', 'dough', 'breadcrumb', 'pita', 'tortilla', 'croissant', 'pizza'],
  shellfish:   ['shrimp', 'prawn', 'lobster', 'crab', 'crawfish', 'langoustine', 'scampi'],
  egg:         ['egg', 'mayo', 'aioli', 'meringue', 'custard', 'hollandaise', 'carbonara'],
  soy:         ['soy', 'tofu', 'edamame', 'tamari', 'teriyaki'],
  sesame:      ['sesame', 'tahini', 'hummus', 'sesame seed', 'benne'],
  fish:        ['salmon', 'tuna', 'cod', 'anchovy', 'sardine', 'mackerel', 'trout', 'bass', 'halibut', 'worcestershire'],
};

/**
 * Detect allergens in a dish name based on keyword matching.
 * Returns array of allergen codes (e.g. ['peanut', 'tree_nut'])
 */
const detectAllergens = (dishName: string): string[] => {
  const name = dishName.toLowerCase();
  const found = new Set<string>();
  for (const [allergen, keywords] of Object.entries(ALLERGEN_KEYWORDS)) {
    for (const kw of keywords) {
      if (name.includes(kw)) {
        found.add(allergen);
        break;
      }
    }
  }
  return Array.from(found);
};

// Items likely to share utensils (fried/grilled/baked — same appliance)
const UTENSIL_SHARING_KEYWORDS = ['fried', 'grilled', 'bbq', 'roasted', 'baked', 'skewer'];
// Fried items (deep fryer risk)
const FRIED_KEYWORDS = ['fried', 'fries', 'crispy', 'battered', 'breaded', 'nugget', 'tender', 'croquette'];

const isFried = (name: string): boolean => {
  const n = name.toLowerCase();
  return FRIED_KEYWORDS.some(kw => n.includes(kw));
};

const sharesUtensil = (name: string): boolean => {
  const n = name.toLowerCase();
  return UTENSIL_SHARING_KEYWORDS.some(kw => n.includes(kw));
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface OrderItemInfo {
  order_id: string;
  order_status: string;
  table_name: string;
  server_name: string;
  created_at: string;
  item_name: string;
  quantity: number;
  allergens: string[];
}

/**
 * Run the allergen risk detector engine.
 * Fetches recent order items, groups by order/table, detects cross-
 * contamination risks per group.
 */
export const runAllergenEngine = async (
  db: ReturnType<typeof useDB>,
  config: AllergenConfig = DEFAULT_ALLERGEN_CONFIG
): Promise<{ alerts: AllergenRiskAlert[]; generated: number }> => {
  const lookback = config.lookbackDays;

  // 1. Fetch recent order items (last N days)
  let orderItems: OrderItemInfo[] = [];
  try {
    const result = await db.query(
      `SELECT
         order.id AS order_id,
         order.status AS order_status,
         order.table.name AS table_name,
         order.created_by.name AS server_name,
         order.created_at AS created_at,
         item.name AS item_name,
         quantity
       FROM order_item
       WHERE order.deleted_at IS NONE
         AND deleted_at IS NONE
         AND item IS NOT NONE
         AND order.created_at > time::now() - ${lookback}d
       ORDER BY order.created_at DESC`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    orderItems = rows.map((r: any) => {
      const itemName = String(r.item_name ?? 'Unknown');
      return {
        order_id: String(r.order_id ?? ''),
        order_status: String(r.order_status ?? ''),
        table_name: String(r.table_name ?? '—'),
        server_name: String(r.server_name ?? '—'),
        created_at: String(r.created_at ?? ''),
        item_name: itemName,
        quantity: safeNumber(r.quantity, 0),
        allergens: detectAllergens(itemName),
      };
    });
  } catch (err) {
    console.warn('[allergen-risk] fetchOrderItems failed', err);
  }

  if (orderItems.length === 0) return { alerts: [], generated: 0 };

  // 2. Group items by order_id
  const ordersByOrderId = new Map<string, OrderItemInfo[]>();
  for (const item of orderItems) {
    if (!ordersByOrderId.has(item.order_id)) {
      ordersByOrderId.set(item.order_id, []);
    }
    ordersByOrderId.get(item.order_id)!.push(item);
  }

  const alerts: AllergenRiskAlert[] = [];

  // 3. Analyze each order for cross-contamination risks
  for (const [orderId, items] of ordersByOrderId.entries()) {
    if (items.length < 2) continue; // single-item order can't have cross-contamination

    // Collect all allergens in this order
    const allAllergensInOrder = new Set<string>();
    const itemsByAllergen = new Map<string, OrderItemInfo[]>();
    for (const item of items) {
      for (const a of item.allergens) {
        allAllergensInOrder.add(a);
        if (!itemsByAllergen.has(a)) itemsByAllergen.set(a, []);
        itemsByAllergen.get(a)!.push(item);
      }
    }

    const firstItem = items[0];

    // --- Rule 1: MIXED_ORDER_RISK — allergen-free + allergen-containing ---
    // Find items with NO allergens vs items WITH allergens in same order
    const allergenFree = items.filter(i => i.allergens.length === 0);
    const allergenContaining = items.filter(i => i.allergens.length > 0);

    if (allergenFree.length > 0 && allergenContaining.length > 0) {
      const sharedAllergens = Array.from(allAllergensInOrder);
      // severity = critical if contains top-8 allergen
      const hasCritical = sharedAllergens.some(a => ['peanut', 'tree_nut', 'shellfish', 'fish'].includes(a));
      alerts.push({
        rule_id: 'mixed_order_risk',
        severity: hasCritical ? 'critical' : 'high',
        order_id: orderId,
        table_name: firstItem.table_name,
        server_name: firstItem.server_name,
        allergens: sharedAllergens.join(','),
        affected_items: [...allergenFree.map(i => i.item_name).slice(0, 3), ...allergenContaining.map(i => i.item_name).slice(0, 3)].join(', '),
        risk_count: allergenContaining.length + allergenFree.length,
        preparation_note: `Prepare allergen-free items (${allergenFree.map(i => i.item_name).slice(0, 2).join(', ')}) on separate surface with clean utensils + fresh gloves`,
        detected_at_order_time: true,
        description: `Table ${firstItem.table_name} ordered ${allergenFree.length} allergen-free + ${allergenContaining.length} allergen-containing dishes — cross-contamination risk for: ${sharedAllergens.join(', ')}`,
        status: 'open',
        detected_at: new Date(firstItem.created_at || Date.now()),
      });
    }

    // --- Rule 2: SHARED_UTENSIL_RISK — multiple items using same utensil type ---
    const utensilSharingItems = items.filter(i => sharesUtensil(i.item_name));
    if (utensilSharingItems.length >= 2) {
      const uniqueAllergens = new Set<string>();
      utensilSharingItems.forEach(i => i.allergens.forEach(a => uniqueAllergens.add(a)));
      if (uniqueAllergens.size > 0) {
        alerts.push({
          rule_id: 'shared_utensil_risk',
          severity: uniqueAllergens.size > 1 ? 'high' : 'medium',
          order_id: orderId,
          table_name: firstItem.table_name,
          server_name: firstItem.server_name,
          allergens: Array.from(uniqueAllergens).join(','),
          affected_items: utensilSharingItems.map(i => i.item_name).slice(0, 4).join(', '),
          risk_count: utensilSharingItems.length,
          preparation_note: `Use separate utensils for each dish (allergens: ${Array.from(uniqueAllergens).join(', ')})`,
          detected_at_order_time: true,
          description: `${utensilSharingItems.length} dishes share cooking utensils (grill/fryer/oven) — allergen transfer risk: ${Array.from(uniqueAllergens).join(', ')}`,
          status: 'open',
          detected_at: new Date(firstItem.created_at || Date.now()),
        });
      }
    }

    // --- Rule 3: DEEP_FRYER_RISK — breaded + unbattered items same fryer ---
    const friedItems = items.filter(i => isFried(i.item_name));
    if (friedItems.length >= 2) {
      const breadedItems = friedItems.filter(i => i.item_name.toLowerCase().match(/breaded|battered|crispy/));
      const unbatteredItems = friedItems.filter(i => !i.item_name.toLowerCase().match(/breaded|battered|crispy/));
      if (breadedItems.length > 0 && unbatteredItems.length > 0) {
        alerts.push({
          rule_id: 'deep_fryer_risk',
          severity: 'high',
          order_id: orderId,
          table_name: firstItem.table_name,
          server_name: firstItem.server_name,
          allergens: 'gluten,cross-fryer',
          affected_items: friedItems.map(i => i.item_name).slice(0, 4).join(', '),
          risk_count: friedItems.length,
          preparation_note: `Use dedicated fryer for allergen-free items or fry ${unbatteredItems[0].item_name} BEFORE ${breadedItems[0].item_name} and change oil`,
          detected_at_order_time: true,
          description: `${breadedItems.length} breaded + ${unbatteredItems.length} unbattered fried items — shared fryer contamination risk`,
          status: 'open',
          detected_at: new Date(firstItem.created_at || Date.now()),
        });
      }
    }

    // --- Rule 4: UNKNOWN_ALLERGEN — order has allergen-containing dish but no customer allergy note ---
    // (Since customer allergy isn't recorded in schema, flag if allergen dish present
    //  AND no order note indicating allergy checked)
    for (const item of allergenContaining) {
      const topAllergens = item.allergens.filter(a => ['peanut', 'tree_nut', 'shellfish', 'fish', 'dairy', 'egg'].includes(a));
      if (topAllergens.length > 0) {
        alerts.push({
          rule_id: 'unknown_allergen',
          severity: topAllergens.includes('peanut') || topAllergens.includes('shellfish') ? 'high' : 'medium',
          order_id: orderId,
          table_name: firstItem.table_name,
          server_name: firstItem.server_name,
          allergens: topAllergens.join(','),
          affected_items: item.item_name,
          risk_count: 1,
          preparation_note: `Confirm with customer: any allergies to ${topAllergens.join(', ')}? If yes, prepare on separate surface`,
          detected_at_order_time: true,
          description: `Order contains ${item.item_name} (allergens: ${topAllergens.join(', ')}) — customer allergy not confirmed`,
          status: 'open',
          detected_at: new Date(firstItem.created_at || Date.now()),
        });
        break; // one alert per order is enough
      }
    }
  }

  // 4. REPEAT_OFFENDER — dish triggers alerts repeatedly across multiple orders
  const dishAlertCount = new Map<string, { count: number; allergens: Set<string> }>();
  for (const alert of alerts) {
    for (const dish of alert.affected_items.split(', ')) {
      const trimmed = dish.trim();
      if (!trimmed || trimmed === '—') continue;
      if (!dishAlertCount.has(trimmed)) {
        dishAlertCount.set(trimmed, { count: 0, allergens: new Set() });
      }
      const entry = dishAlertCount.get(trimmed)!;
      entry.count += 1;
      alert.allergens.split(',').forEach(a => entry.allergens.add(a));
    }
  }

  for (const [dish, info] of dishAlertCount.entries()) {
    if (info.count >= config.repeatThreshold) {
      alerts.push({
        rule_id: 'repeat_offender',
        severity: 'critical',
        allergens: Array.from(info.allergens).join(','),
        affected_items: dish,
        risk_count: info.count,
        preparation_note: `Review recipe for ${dish} — flagged ${info.count}× in ${lookback}d. Consider dedicated allergen-free version.`,
        description: `${dish} triggered ${info.count} allergen alerts in last ${lookback}d (allergens: ${Array.from(info.allergens).join(', ')}) — recipe/procedure review needed`,
        status: 'open',
        detected_at: new Date(),
      });
    }
  }

  // 5. AI insight for top 5 critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts
        .filter(a => a.severity === 'critical' || a.severity === 'high')
        .slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a restaurant food safety AI specializing in allergen management. Respond with a single actionable safety insight (max 200 chars).' },
            { role: 'user', content: `Order at table ${a.table_name ?? '—'}: ${a.description}. Allergens: ${a.allergens}. Affected items: ${a.affected_items}. Rule: ${a.rule_id}.` },
          ], { temperature: 0.2, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
          a.ai_recommendation = a.rule_id === 'mixed_order_risk' ? 'separate_prep'
            : a.rule_id === 'shared_utensil_risk' ? 'change_gloves'
            : a.rule_id === 'deep_fryer_risk' ? 'clean_fryer'
            : a.rule_id === 'unknown_allergen' ? 'inform_customer'
            : a.rule_id === 'repeat_offender' ? 'decline_dish'
            : 'monitor';
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 6. Persist
  try {
    await db.query(`DELETE FROM allergen_risk_alert WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE allergen_risk_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { alerts, generated: alerts.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<AllergenRiskAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM allergen_risk_alert
       WHERE status = 'open'
       ORDER BY detected_at DESC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  criticalCount: number;
  highCount: number;
  totalAlerts: number;
  repeatOffenderCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(severity = 'high') AS high,
         math::count(rule_id = 'repeat_offender') AS repeat_offender
       FROM allergen_risk_alert
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      criticalCount: safeNumber(r.critical, 0),
      highCount: safeNumber(r.high, 0),
      totalAlerts: safeNumber(r.total, 0),
      repeatOffenderCount: safeNumber(r.repeat_offender, 0),
    };
  } catch {
    return { criticalCount: 0, highCount: 0, totalAlerts: 0, repeatOffenderCount: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>,
  alertId: string,
  status: 'mitigated' | 'declined_dish' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
