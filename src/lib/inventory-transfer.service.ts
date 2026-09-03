/**
 * AI Multi-Location Inventory Transfer Optimizer — branch-to-branch transfers.
 *
 * 63rd POSR-exclusive differentiator — multi-location restaurants waste 8-12%
 * of inventory to imbalanced stock distribution (NRA). Emergency supplier
 * orders cost 15-25% more. Transferring between locations costs 60-80% less
 * than emergency procurement.
 *
 * Distinct from:
 *   - branch-comparison.service (compares PERFORMANCE — NOT inventory transfer)
 *   - procurement.service (buys from SUPPLIERS — NOT branch-to-branch transfer)
 *   - reorder.service (suggests reorder quantities — NOT transfers)
 *   - shrinkage-detection.service (detects theft/loss — NOT transfer optimization)
 *   - inventory (operational inventory management — NOT AI transfer suggestions)
 *
 * Optimizes transfers between branches:
 *   1. Surplus → Shortage matching (overstock at A, understock at B)
 *   2. Expiring relocation (move expiring stock to high-traffic location)
 *   3. Cost avoidance (transfer cheaper than emergency procurement)
 *   4. Capacity rebalance (even out stock across locations)
 *   5. Emergency fulfillment (fast transfer to prevent stockout)
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type TransferRuleId =
  | 'surplus_to_shortage'
  | 'expiring_relocation'
  | 'cost_avoidance'
  | 'capacity_rebalance'
  | 'emergency_fulfillment';

export type TransferAiRec =
  | 'transfer_now'
  | 'schedule_transfer'
  | 'verify_stock'
  | 'monitor'
  | 'decline';

export interface InventoryTransfer {
  id?: string;
  rule_id: TransferRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  item_id?: string;
  item_name?: string;
  from_branch?: string;
  to_branch?: string;
  from_branch_stock: number;
  to_branch_stock: number;
  suggested_qty: number;
  unit?: string;
  unit_cost: number;
  est_savings: number;
  transfer_cost: number;
  net_savings: number;
  days_until_expiry?: number;
  est_waste_prevented: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: TransferAiRec;
  status: 'open' | 'transferred' | 'scheduled' | 'declined' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface TransferConfig {
  aiEnabled: boolean;
  surplusThreshold: number;
  shortageThreshold: number;
  maxDistanceKm: number;
  costPerKm: number;
}

export const DEFAULT_TRANSFER_CONFIG: TransferConfig = {
  aiEnabled: true,
  surplusThreshold: 1.5,
  shortageThreshold: 0.5,
  maxDistanceKm: 50,
  costPerKm: 0.50,
};

export const readTransferConfig = (settings: any): TransferConfig => ({
  aiEnabled: settings?.transfer_ai_enabled ?? true,
  surplusThreshold: safeNumber(settings?.transfer_surplus_threshold, 1.5),
  shortageThreshold: safeNumber(settings?.transfer_shortage_threshold, 0.5),
  maxDistanceKm: safeNumber(settings?.transfer_max_distance_km, 50),
  costPerKm: safeNumber(settings?.transfer_cost_per_km, 0.50),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface BranchStockData {
  item_id: string;
  item_name: string;
  branch_id: string;
  branch_name: string;
  stock_qty: number;
  par_level: number;
  unit: string;
  unit_cost: number;
  days_until_expiry?: number;
}

/**
 * Run the inventory transfer optimizer engine.
 * Fetches stock levels across branches, identifies transfer opportunities.
 */
export const runTransferEngine = async (
  db: ReturnType<typeof useDB>,
  config: TransferConfig = DEFAULT_TRANSFER_CONFIG
): Promise<{ transfers: InventoryTransfer[]; generated: number }> => {
  const transfers: InventoryTransfer[] = [];
  const now = new Date();

  // 1. Fetch stock levels per item per branch
  let stockData: BranchStockData[] = [];
  try {
    const result = await db.query(
      `SELECT
         item.id AS item_id,
         item.name AS item_name,
         store.id AS branch_id,
         store.name AS branch_name,
         base_quantity AS stock_qty,
         par_level,
         item.unit AS unit,
         item.cost AS unit_cost,
         expiry_date
       FROM inventory_item
       WHERE deleted_at IS NONE
         AND item IS NOT NONE
         AND store IS NOT NONE
       LIMIT 200`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    stockData = rows.map((r: any) => {
      let daysUntilExpiry: number | undefined;
      if (r.expiry_date) {
        const expiry = new Date(r.expiry_date);
        daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      }
      return {
        item_id: String(r.item_id ?? ''),
        item_name: String(r.item_name ?? 'Unknown'),
        branch_id: String(r.branch_id ?? ''),
        branch_name: String(r.branch_name ?? 'Unknown Branch'),
        stock_qty: safeNumber(r.stock_qty, 0),
        par_level: safeNumber(r.par_level, 10), // default par level 10
        unit: String(r.unit ?? 'unit'),
        unit_cost: safeNumber(r.unit_cost, 0),
        days_until_expiry: daysUntilExpiry,
      };
    });
  } catch (err) {
    console.warn('[transfer] fetchStockData failed', err);
  }

  if (stockData.length === 0) return { transfers: [], generated: 0 };

  // 2. Group by item_id to compare across branches
  const itemsByBranch = new Map<string, BranchStockData[]>();
  for (const s of stockData) {
    if (!itemsByBranch.has(s.item_id)) itemsByBranch.set(s.item_id, []);
    itemsByBranch.get(s.item_id)!.push(s);
  }

  // 3. Analyze each item for transfer opportunities
  for (const [itemId, branchStocks] of itemsByBranch.entries()) {
    if (branchStocks.length < 2) continue; // need 2+ branches for transfer

    // Find surplus branches (stock > par × surplusThreshold)
    const surplusBranches = branchStocks.filter(s => s.par_level > 0 && s.stock_qty > s.par_level * config.surplusThreshold);
    // Find shortage branches (stock < par × shortageThreshold)
    const shortageBranches = branchStocks.filter(s => s.par_level > 0 && s.stock_qty < s.par_level * config.shortageThreshold);

    // --- Rule 1: SURPLUS_TO_SHORTAGE — match surplus with shortage ---
    for (const surplus of surplusBranches) {
      for (const shortage of shortageBranches) {
        if (surplus.branch_id === shortage.branch_id) continue;

        // Calculate transfer quantity
        // Transfer enough to bring shortage up to par, but don't deplete surplus below par
        const shortageDeficit = shortage.par_level - shortage.stock_qty;
        const surplusExcess = surplus.stock_qty - surplus.par_level;
        const transferQty = Math.min(shortageDeficit, surplusExcess);

        if (transferQty < 1) continue;

        // Estimate savings (vs emergency procurement at 20% premium)
        const emergencyCost = transferQty * shortage.unit_cost * 1.20;
        const transferCost = transferQty * surplus.unit_cost;
        const transportCost = config.costPerKm * 10; // assume 10km avg distance
        const estSavings = emergencyCost - transferCost;
        const netSavings = estSavings - transportCost;

        if (netSavings < 0) continue; // not worth it

        // Check for expiring stock
        const daysUntilExpiry = surplus.days_until_expiry;
        const isExpiring = daysUntilExpiry !== undefined && daysUntilExpiry <= 7;

        let ruleId: TransferRuleId;
        let severity: 'critical' | 'high' | 'medium' | 'low';
        let aiRec: TransferAiRec;
        let desc = '';

        if (isExpiring && daysUntilExpiry! <= 3) {
          // --- Rule 2: EXPIRING_RELOCATION — move expiring stock fast ---
          ruleId = 'expiring_relocation';
          severity = 'critical';
          aiRec = 'transfer_now';
          const wastePrevented = transferQty * surplus.unit_cost;
          desc = `${surplus.item_name} expiring in ${daysUntilExpiry}d at ${surplus.branch_name} — transfer ${transferQty} ${surplus.unit} to ${shortage.branch_name} (prevents ${fmt$(wastePrevented)} waste)`;
        } else if (shortage.stock_qty === 0) {
          // --- Rule 5: EMERGENCY_FULFILLMENT — stockout at destination ---
          ruleId = 'emergency_fulfillment';
          severity = 'critical';
          aiRec = 'transfer_now';
          desc = `${shortage.branch_name} is STOCKED OUT of ${surplus.item_name} — emergency transfer ${transferQty} ${surplus.unit} from ${surplus.branch_name} (saves ${fmt$(netSavings)} vs emergency procurement)`;
        } else if (netSavings > 50) {
          // --- Rule 3: COST_AVOIDANCE — significant savings ---
          ruleId = 'cost_avoidance';
          severity = 'high';
          aiRec = 'schedule_transfer';
          desc = `${surplus.item_name}: transfer ${transferQty} ${surplus.unit} from ${surplus.branch_name} to ${shortage.branch_name} — saves ${fmt$(netSavings)} vs emergency procurement`;
        } else {
          // --- Rule 4: CAPACITY_REBALANCE — even out stock ---
          ruleId = 'capacity_rebalance';
          severity = 'medium';
          aiRec = 'schedule_transfer';
          desc = `${surplus.item_name}: rebalance ${transferQty} ${surplus.unit} from ${surplus.branch_name} (surplus ${surplus.stock_qty}/${surplus.par_level}) to ${shortage.branch_name} (shortage ${shortage.stock_qty}/${shortage.par_level})`;
        }

        transfers.push({
          rule_id: ruleId,
          severity,
          item_id: itemId,
          item_name: surplus.item_name,
          from_branch: surplus.branch_name,
          to_branch: shortage.branch_name,
          from_branch_stock: surplus.stock_qty,
          to_branch_stock: shortage.stock_qty,
          suggested_qty: Math.round(transferQty * 100) / 100,
          unit: surplus.unit,
          unit_cost: Math.round(surplus.unit_cost * 100) / 100,
          est_savings: Math.round(estSavings * 100) / 100,
          transfer_cost: Math.round(transportCost * 100) / 100,
          net_savings: Math.round(netSavings * 100) / 100,
          days_until_expiry: daysUntilExpiry,
          est_waste_prevented: isExpiring ? Math.round(transferQty * surplus.unit_cost * 100) / 100 : 0,
          description: desc,
          ai_recommendation: aiRec,
          status: 'open',
          detected_at: now,
        });

        break; // one transfer per surplus branch per item
      }
    }
  }

  // 4. AI insight for top 5 high-priority transfers
  if (config.aiEnabled && transfers.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topTransfers = transfers
        .filter(t => t.severity === 'critical' || t.severity === 'high')
        .slice(0, 5);
      for (const t of topTransfers) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a multi-location restaurant inventory AI. Respond with a single transfer insight (max 200 chars).' },
            { role: 'user', content: `Transfer: ${t.item_name} ${t.suggested_qty} ${t.unit} from ${t.from_branch} to ${t.to_branch}. Savings ${fmt$(t.net_savings)}. ${t.days_until_expiry ? `Expires in ${t.days_until_expiry}d.` : ''} Rule: ${t.rule_id}.` },
          ], { temperature: 0.3, maxTokens: 120 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          t.ai_insight = text.slice(0, 200);
        } catch { /* skip AI failure */ }
      }
    }
  }

  // 5. Persist
  try {
    await db.query(`DELETE FROM inventory_transfer WHERE status = 'open' AND detected_at < time::now() - 1h`);
  } catch { /* ignore */ }
  for (const t of transfers) {
    try {
      await db.query(`CREATE inventory_transfer CONTENT $data`, {
        data: { ...t, detected_at: t.detected_at.toISOString() },
      });
    } catch { /* ignore individual insert failures */ }
  }

  return { transfers, generated: transfers.length };
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getActiveTransfers = async (db: ReturnType<typeof useDB>): Promise<InventoryTransfer[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM inventory_transfer
       WHERE status = 'open'
       ORDER BY net_savings DESC
       LIMIT 100`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  transferCount: number;
  criticalCount: number;
  totalSavings: number;
  wastePrevented: number;
}> => {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(net_savings) AS savings,
         math::sum(est_waste_prevented) AS waste
       FROM inventory_transfer
       WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      transferCount: safeNumber(r.total, 0),
      criticalCount: safeNumber(r.critical, 0),
      totalSavings: safeNumber(r.savings, 0),
      wastePrevented: safeNumber(r.waste, 0),
    };
  } catch {
    return { transferCount: 0, criticalCount: 0, totalSavings: 0, wastePrevented: 0 };
  }
};

export const updateTransferStatus = async (
  db: ReturnType<typeof useDB>,
  transferId: string,
  status: 'transferred' | 'scheduled' | 'declined' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: transferId, status });
};
