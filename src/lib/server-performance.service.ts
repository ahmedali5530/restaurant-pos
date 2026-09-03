/**
 * AI Server Performance Analytics service — per-server metrics + ranking.
 *
 * Research finding: Toast Server Performance reports in higher tiers (~$35/mo),
 * Square Team Performance in Plus. POSR offers it free — tracks each server's
 * order count, revenue, avg ticket, accuracy, customer satisfaction + AI coaching.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type ServerGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type ServerCoaching = 'recognize' | 'mentor' | 'coach_accuracy' | 'coach_upsell' | 'coach_speed' | 'monitor';
export type TrendDirection = 'improving' | 'declining' | 'stable' | 'new';

export interface ServerPerformance {
  id?: string;
  server_id: string;
  server_name: string;
  period_start: Date;
  period_end: Date;
  total_orders: number;
  total_revenue: number;
  avg_ticket_size: number;
  avg_items_per_order: number;
  void_count: number;
  refund_count: number;
  accuracy_rate: number;
  tables_served: number;
  avg_table_turnover: number;
  peak_hour?: number;
  peak_hour_orders: number;
  customer_rating?: number;
  cash_payments: number;
  card_payments: number;
  total_tips: number;
  avg_tip_pct: number;
  overall_score: number;
  grade: ServerGrade;
  rank?: number;
  trend_direction: TrendDirection;
  ai_insight?: string;
  ai_coaching?: ServerCoaching;
  ai_action?: string;
  generated_at: Date;
  expires_at?: Date;
}

export interface ServerConfig {
  lookbackDays: number;
  aiEnabled: boolean;
  minOrders: number;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  lookbackDays: 30,
  aiEnabled: true,
  minOrders: 5,
};

export const readServerConfig = (settings: any): ServerConfig => ({
  lookbackDays: safeNumber(settings?.server_perf_lookback_days, 30),
  aiEnabled: settings?.server_perf_ai_enabled ?? true,
  minOrders: safeNumber(settings?.server_perf_min_orders, 5),
});

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

interface ServerData {
  server_id: string;
  server_name: string;
  orders: any[];
  total_revenue: number;
  total_items: number;
  voids: number;
  refunds: number;
  tables: Set<string>;
  tips: number;
  cash_payments: number;
  card_payments: number;
  byHour: Map<number, number>;
}

const collectServerData = async (
  db: ReturnType<typeof useDB>,
  lookbackDays: number
): Promise<Map<string, ServerData>> => {
  const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const byServer = new Map<string, ServerData>();

  try {
    const result = await db.query(
      `SELECT
         id,
         total,
         status,
         user.id AS server_id,
         user.first_name AS first_name,
         user.last_name AS last_name,
         table.id AS table_id,
         created_at,
         items,
         tip,
         payments,
         completed_at
       FROM order
       WHERE created_at > $cutoff
         AND status IN ['Paid', 'Cancelled', 'Refunded']
         AND deleted_at IS NONE
         AND user != NONE
       FETCH user, table, items, payments`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const order of rows) {
      const serverId = order.server_id?.toString?.() ?? '';
      if (!serverId) continue;
      if (!byServer.has(serverId)) {
        byServer.set(serverId, {
          server_id: serverId,
          server_name: `${order.first_name ?? ''} ${order.last_name ?? ''}`.trim() || 'Unknown',
          orders: [],
          total_revenue: 0,
          total_items: 0,
          voids: 0,
          refunds: 0,
          tables: new Set(),
          tips: 0,
          cash_payments: 0,
          card_payments: 0,
          byHour: new Map(),
        });
      }
      const data = byServer.get(serverId)!;
      data.orders.push(order);

      const status = order.status;
      const total = safeNumber(order.total, 0);
      const tip = safeNumber(order.tip, 0);

      if (status === 'Paid') {
        data.total_revenue += total;
        data.tips += tip;
        // Count items
        if (Array.isArray(order.items)) {
          data.total_items += order.items.length;
        }
        // Count tables
        const tableId = order.table_id?.toString?.();
        if (tableId) data.tables.add(tableId);
        // Payment methods
        if (Array.isArray(order.payments)) {
          for (const p of order.payments) {
            const ptype = p?.payment_type?.name ?? p?.method ?? '';
            if (ptype.toLowerCase().includes('cash')) data.cash_payments++;
            else if (ptype.toLowerCase().includes('card') || ptype.toLowerCase().includes('credit')) data.card_payments++;
          }
        }
        // Peak hour
        const hour = new Date(order.created_at).getHours();
        data.byHour.set(hour, (data.byHour.get(hour) ?? 0) + 1);
      } else if (status === 'Cancelled') {
        data.voids++;
      } else if (status === 'Refunded') {
        data.refunds++;
      }
    }
  } catch (err) {
    console.error('[server-perf] collectServerData failed', err);
  }

  return byServer;
};

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

const computeGrade = (score: number): ServerGrade => {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
};

const computeTrend = async (
  db: ReturnType<typeof useDB>,
  serverId: string
): Promise<TrendDirection> => {
  try {
    const prevResult = await db.query(
      `SELECT overall_score FROM server_performance
       WHERE server_id = $sid AND generated_at < time::now() - 7d
       ORDER BY generated_at DESC LIMIT 1`,
      { sid: serverId }
    );
    const rows = Array.isArray(prevResult) ? prevResult.flat() : [];
    if (rows.length === 0) return 'new';
    const prevScore = safeNumber(rows[0]?.overall_score, 0);
    // We don't have current yet — return 'stable' as placeholder
    // (will be updated after current score is computed)
    return prevScore > 0 ? 'stable' : 'new';
  } catch {
    return 'stable';
  }
};

const determineCoaching = (
  grade: ServerGrade,
  accuracyRate: number,
  avgItemsPerOrder: number,
  avgTicketSize: number,
  avgTicketAcrossServers: number
): ServerCoaching => {
  if (grade === 'A') return 'recognize';
  if (grade === 'B') return 'mentor';
  if (accuracyRate < 0.9) return 'coach_accuracy';
  if (avgItemsPerOrder < 2) return 'coach_upsell';
  if (avgTicketSize < avgTicketAcrossServers * 0.8) return 'coach_speed';
  return 'monitor';
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (
  servers: ServerPerformance[],
  avgTicketAcross: number
): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    console.warn('[server-perf] OpenAI not available — using rule-based');
    return;
  }

  const prompt = `You are a restaurant server performance coach.
Analyze these server metrics and provide coaching insights.

Avg ticket across all servers: $${avgTicketAcross.toFixed(2)}

Servers (JSON):
${JSON.stringify(servers.map(s => ({
  name: s.server_name,
  orders: s.total_orders,
  revenue: s.total_revenue,
  avg_ticket: s.avg_ticket_size,
  items_per_order: s.avg_items_per_order,
  accuracy: (s.accuracy_rate * 100).toFixed(0) + '%',
  voids: s.void_count,
  refunds: s.refund_count,
  tables: s.tables_served,
  tips: s.total_tips,
  tip_pct: s.avg_tip_pct + '%',
  rating: s.customer_rating ?? 'n/a',
  grade: s.grade,
  rank: s.rank,
  coaching: s.ai_coaching,
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match server name>",
  "insight": "<max 200 chars — what's notable about their performance>",
  "action": "<max 200 chars — specific coaching step>"
}]

Focus on: recognition for top performers, specific improvement areas for underperformers.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant server coaching AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1500 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      name: string;
      insight?: string;
      action?: string;
    }>;

    for (const item of parsed) {
      const server = servers.find(s => s.server_name === item.name);
      if (!server) continue;
      if (item.insight) server.ai_insight = item.insight.slice(0, 200);
      if (item.action) server.ai_action = item.action.slice(0, 200);
    }
  } catch (err) {
    console.warn('[server-perf] AI enhancement failed', err);
  }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const computeServerPerformance = async (
  db: ReturnType<typeof useDB>,
  config: ServerConfig = DEFAULT_SERVER_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ servers: ServerPerformance[] }> => {
  if (onProgress) onProgress(0, 3);

  const byServer = await collectServerData(db, config.lookbackDays);
  if (onProgress) onProgress(1, 3);

  // Filter by min orders
  const filtered = Array.from(byServer.values()).filter(s => s.orders.length >= config.minOrders);
  if (filtered.length === 0) {
    return { servers: [] };
  }

  // Compute avg ticket across all servers (for benchmarking)
  const allTickets: number[] = [];
  for (const data of filtered) {
    const paidOrders = data.orders.filter(o => o.status === 'Paid');
    if (paidOrders.length > 0) {
      allTickets.push(data.total_revenue / paidOrders.length);
    }
  }
  const avgTicketAcross = allTickets.length > 0
    ? allTickets.reduce((s, t) => s + t, 0) / allTickets.length
    : 0;

  // Compute per-server
  const periodStart = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);
  const periodEnd = new Date();

  const servers: ServerPerformance[] = filtered.map(data => {
    const paidOrders = data.orders.filter(o => o.status === 'Paid');
    const totalOrders = data.orders.length;
    const totalRevenue = data.total_revenue;
    const avgTicket = paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0;
    const avgItems = paidOrders.length > 0 ? data.total_items / paidOrders.length : 0;
    const accuracyRate = totalOrders > 0 ? 1 - ((data.voids + data.refunds) / totalOrders) : 0;
    const tablesServed = data.tables.size;
    const avgTableTurnover = tablesServed > 0 ? paidOrders.length / tablesServed : 0;

    // Peak hour
    let peakHour: number | undefined;
    let peakHourOrders = 0;
    for (const [hour, count] of data.byHour) {
      if (count > peakHourOrders) {
        peakHour = hour;
        peakHourOrders = count;
      }
    }

    // Tip percentage
    const avgTipPct = totalRevenue > 0 ? (data.tips / totalRevenue) * 100 : 0;

    // Overall score (0-100, weighted):
    // revenue contribution (30%) + avg_ticket vs benchmark (20%) + accuracy (25%) + items_per_order (25%)
    const ticketScore = avgTicketAcross > 0 ? Math.min(1, avgTicket / avgTicketAcross) * 20 : 10;
    const itemsScore = Math.min(1, avgItems / 5) * 25; // 5+ items = max
    const accuracyScore = accuracyRate * 25;
    const revenueScore = Math.min(1, totalOrders / 100) * 30; // 100+ orders = max
    const overallScore = Math.round(revenueScore + ticketScore + accuracyScore + itemsScore);

    const grade = computeGrade(overallScore);
    const coaching = determineCoaching(grade, accuracyRate, avgItems, avgTicket, avgTicketAcross);

    return {
      server_id: data.server_id,
      server_name: data.server_name,
      period_start: periodStart,
      period_end: periodEnd,
      total_orders: totalOrders,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      avg_ticket_size: Math.round(avgTicket * 100) / 100,
      avg_items_per_order: Math.round(avgItems * 10) / 10,
      void_count: data.voids,
      refund_count: data.refunds,
      accuracy_rate: Math.round(accuracyRate * 100) / 100,
      tables_served: tablesServed,
      avg_table_turnover: Math.round(avgTableTurnover * 10) / 10,
      peak_hour: peakHour,
      peak_hour_orders: peakHourOrders,
      cash_payments: data.cash_payments,
      card_payments: data.card_payments,
      total_tips: Math.round(data.tips * 100) / 100,
      avg_tip_pct: Math.round(avgTipPct * 10) / 10,
      overall_score: overallScore,
      grade,
      trend_direction: 'stable' as TrendDirection,
      ai_coaching: coaching,
      generated_at: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  });

  // Sort by overall score descending + assign ranks
  servers.sort((a, b) => b.overall_score - a.overall_score);
  servers.forEach((s, idx) => { s.rank = idx + 1; });
  if (onProgress) onProgress(2, 3);

  // AI enhancement
  if (config.aiEnabled && servers.length > 0) {
    await enhanceWithAI(servers, avgTicketAcross);
  }
  if (onProgress) onProgress(3, 3);

  // Persist
  try {
    await db.query(`UPDATE server_performance SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const server of servers) {
      try {
        const result = await db.query(
          `CREATE server_performance CONTENT $data`,
          {
            data: {
              ...server,
              user_id: server.server_id,
              period_start: server.period_start.toISOString(),
              period_end: server.period_end.toISOString(),
              generated_at: server.generated_at.toISOString(),
              expires_at: server.expires_at?.toISOString(),
            },
          }
        );
        server.id = (result as any)?.id?.toString?.() ?? '';
      } catch (err) {
        console.warn('[server-perf] persist failed', err);
      }
    }
  } catch (err) {
    console.warn('[server-perf] persist batch failed', err);
  }

  return { servers };
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export const getServerPerformance = async (
  db: ReturnType<typeof useDB>
): Promise<ServerPerformance[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM server_performance
       WHERE expires_at > time::now()
       ORDER BY overall_score DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[server-perf] getServerPerformance failed', err);
    return [];
  }
};
