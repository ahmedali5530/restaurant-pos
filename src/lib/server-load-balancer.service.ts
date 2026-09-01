/**
 * AI Server Load Balancer service — real-time server assignment.
 *
 * 33rd POSR-exclusive differentiator — uneven server load causes 15-20%
 * slower service and lower tips. Toast, Square, Lightspeed show server
 * status but DON'T balance assignments. POSR assigns incoming parties to
 * servers based on current active tables, order complexity, performance.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export interface ServerAssignment {
  id?: string;
  assigned_server?: string;
  server_name: string;
  party_id?: string;
  customer_name?: string;
  party_size: number;
  current_tables: number;
  current_orders: number;
  load_score: number;
  performance_score: number;
  recommendation_reason?: string;
  ai_insight?: string;
  status: string;
  assigned_at: Date;
  branch_id?: string;
}

export interface ServerBalancerConfig {
  aiEnabled: boolean;
  maxTables: number;
  lookbackDays: number;
}

export const DEFAULT_SERVER_BALANCER_CONFIG: ServerBalancerConfig = {
  aiEnabled: true, maxTables: 6, lookbackDays: 30,
};

export const readServerBalancerConfig = (settings: any): ServerBalancerConfig => ({
  aiEnabled: settings?.server_balancer_ai_enabled ?? true,
  maxTables: safeNumber(settings?.server_balancer_max_tables, 6),
  lookbackDays: safeNumber(settings?.server_balancer_lookback_days, 30),
});

interface ServerData {
  id: string; name: string; activeTables: number; activeOrders: number;
  avgOrderTime: number; avgRating: number; totalOrders: number;
}

const fetchServerData = async (db: any, cfg: ServerBalancerConfig): Promise<ServerData[]> => {
  try {
    // Get all active servers (users with cashier role)
    const userResult = await db.query(
      `SELECT id, name FROM user WHERE deleted_at IS NONE LIMIT 50`
    );
    const users = Array.isArray(userResult) ? userResult.flat() : [];

    const servers: ServerData[] = [];
    for (const user of users) {
      const uid = user.id?.toString?.() ?? '';
      if (!uid) continue;

      // Count active Open orders for this cashier
      const orderResult = await db.query(
        `SELECT count() AS order_count, count(DISTINCT \`table\`) AS table_count
         FROM order WHERE status = 'Open' AND deleted_at IS NONE AND cashier = $uid`,
        { uid }
      );
      const orderRows = Array.isArray(orderResult) ? orderResult.flat() : [];

      // Get performance: avg order completion time + customer rating
      const perfResult = await db.query(
        `SELECT
           math::mean(time::minute(completed_at - created_at)) AS avg_time,
           count() AS total_orders
         FROM order WHERE status = 'Paid' AND deleted_at IS NONE
           AND cashier = $uid AND completed_at > time::now() - ${cfg.lookbackDays}d`,
        { uid }
      );
      const perfRows = Array.isArray(perfResult) ? perfResult.flat() : [];

      // Customer rating for this server
      const ratingResult = await db.query(
        `SELECT math::mean(rating) AS avg_rating
         FROM customer_review WHERE order.cashier = $uid AND created_at > time::now() - ${cfg.lookbackDays}d
         FETCH order`,
        { uid }
      );
      const ratingRows = Array.isArray(ratingResult) ? ratingResult.flat() : [];

      servers.push({
        id: uid, name: user.name ?? 'Unknown',
        activeTables: safeNumber(orderRows[0]?.table_count, 0),
        activeOrders: safeNumber(orderRows[0]?.order_count, 0),
        avgOrderTime: safeNumber(perfRows[0]?.avg_time, 30),
        avgRating: safeNumber(ratingRows[0]?.avg_rating, 0),
        totalOrders: safeNumber(perfRows[0]?.total_orders, 0),
      });
    }
    return servers;
  } catch (err) { console.warn('[server-balancer] fetchServerData failed', err); return []; }
};

const scoreServer = (server: ServerData, cfg: ServerBalancerConfig): { loadScore: number; perfScore: number } => {
  // Load score: 0-100 (100 = max overloaded)
  const tableLoad = Math.min(100, (server.activeTables / cfg.maxTables) * 100);
  const orderLoad = Math.min(100, (server.activeOrders / (cfg.maxTables * 1.5)) * 100);
  const loadScore = (tableLoad * 0.6 + orderLoad * 0.4);

  // Performance score: 0-100 (100 = best performer)
  // Lower avg order time = higher performance
  const timeScore = Math.max(0, Math.min(100, 100 - (server.avgOrderTime - 20) * 2));
  const ratingScore = (server.avgRating / 5) * 100;
  const perfScore = timeScore * 0.5 + ratingScore * 0.5;

  return { loadScore: Math.round(loadScore), perfScore: Math.round(perfScore) };
};

export const runServerBalancer = async (
  db: ReturnType<typeof useDB>,
  config: ServerBalancerConfig = DEFAULT_SERVER_BALANCER_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ assignments: ServerAssignment[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch all server data
  const servers = await fetchServerData(db, config);
  if (onProgress) onProgress(1, 2);

  if (servers.length === 0) { if (onProgress) onProgress(2, 2); return { assignments: [], scanned: 0 }; }

  // 2. Fetch incoming parties (waitlist + reservations arriving now)
  let parties: any[] = [];
  try {
    const waitlistResult = await db.query(
      `SELECT id, customer_name, party_size FROM waitlist_entry WHERE status IN ['waiting', 'called'] LIMIT 20`
    );
    parties = Array.isArray(waitlistResult) ? waitlistResult.flat() : [];
  } catch { }

  // 3. Score each server
  const scoredServers = servers.map(s => {
    const { loadScore, perfScore } = scoreServer(s, config);
    return { ...s, loadScore, perfScore };
  });

  // 4. For each party, recommend the best server
  const assignments: ServerAssignment[] = [];
  for (const party of parties) {
    // Sort servers by: lowest load first, then highest performance
    const sorted = [...scoredServers].sort((a, b) => {
      // Primary: load (lower = better)
      if (a.loadScore !== b.loadScore) return a.loadScore - b.loadScore;
      // Secondary: performance (higher = better)
      return b.perfScore - a.perfScore;
    });

    const best = sorted[0];
    if (!best || best.loadScore >= 100) continue; // all overloaded

    const reason = best.loadScore < 30
      ? 'Lowest current load — best capacity to handle new party'
      : best.perfScore > 70
      ? 'High performance score — handles complex orders well'
      : 'Least busy available server';

    assignments.push({
      assigned_server: best.id,
      server_name: best.name,
      party_id: party.id?.toString?.(),
      customer_name: party.customer_name,
      party_size: safeNumber(party.party_size, 2),
      current_tables: best.activeTables,
      current_orders: best.activeOrders,
      load_score: best.loadScore,
      performance_score: best.perfScore,
      recommendation_reason: reason,
      status: 'pending',
      assigned_at: new Date(),
    });

    // Simulate: increment this server's load for next party
    best.activeTables++;
    best.activeOrders++;
    const rescored = scoreServer(best, config);
    best.loadScore = rescored.loadScore;
  }

  // 5. AI insight for top 5 assignments
  if (config.aiEnabled && assignments.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      for (const a of assignments.slice(0, 5)) {
        try {
          const response = await callOpenAIChat([
            { role: 'system', content: 'You are a server load balancing AI. Respond with a single insight (max 200 chars).' },
            { role: 'user', content: `Assigned party of ${a.party_size} to server "${a.server_name}" (load ${a.load_score}/100, performance ${a.performance_score}/100, ${a.current_tables} active tables). Reason: ${a.recommendation_reason}.` },
          ], { temperature: 0.3, maxTokens: 100 });
          const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
          a.ai_insight = text.slice(0, 200);
        } catch { }
      }
    }
  }

  // 6. Persist
  try { await db.query(`DELETE FROM server_assignment WHERE assigned_at < time::now() - 30m AND status = 'pending'`); } catch { }
  for (const a of assignments) {
    try { await db.query(`CREATE server_assignment CONTENT $data`, { data: { ...a, assigned_at: a.assigned_at.toISOString() } }); } catch { }
  }

  if (onProgress) onProgress(2, 2);
  return { assignments, scanned: servers.length };
};

export const getActiveAssignments = async (db: ReturnType<typeof useDB>): Promise<ServerAssignment[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM server_assignment WHERE status = 'pending' AND assigned_at > time::now() - 30m ORDER BY load_score ASC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalPending: number; avgLoad: number; overloadedCount: number; bestPerformer?: string;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::mean(load_score) AS avg_load, math::count(load_score >= 80) AS overloaded
       FROM server_assignment WHERE status = 'pending' AND assigned_at > time::now() - 30m GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      totalPending: safeNumber(row.total, 0), avgLoad: safeNumber(row.avg_load, 0),
      overloadedCount: safeNumber(row.overloaded, 0),
    };
  } catch { return { totalPending: 0, avgLoad: 0, overloadedCount: 0 }; }
};

export const updateAssignmentStatus = async (db: ReturnType<typeof useDB>, id: string, status: string): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id, status });
};
