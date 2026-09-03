/**
 * AI Table Seating Optimization service — real-time table assignment.
 *
 * 24th POSR-exclusive differentiator — poor table assignment wastes 15-20%
 * of seating capacity. Toast Table Management ($50+/mo) shows table status
 * but doesn't OPTIMIZE assignments. OpenTable has basic assignment but no AI.
 * POSR recommends optimal table per incoming party based on capacity match,
 * turnover rate, reservations, floor balance.
 *
 * Distinct from:
 *   - turnover.service (analyzes table PERFORMANCE after the fact)
 *   - wait-prediction.service (predicts WAIT TIME for waitlist)
 *   - reservation.service (manages reservations, doesn't optimize seating)
 *   - no-show-prediction.service (predicts reservation attendance)
 *
 * This service OPTIMIZES real-time seating assignments — which table for THIS party?
 *
 * Algorithm:
 *   For each incoming party (from waitlist or reservation):
 *   1. capacity_match: party_size / table_capacity (1.0 = perfect)
 *   2. turnover_efficiency: prefer tables with faster turnover
 *   3. reservation_conflict: avoid tables reserved within next 90 min
 *   4. floor_balance: prefer server sections with fewer active tables
 *   5. AI: overall recommendation + reasoning
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SeatingRecommendation = 'seat_here' | 'wait_for_better' | 'split_party' | 'bar_seating';

export interface SeatingSuggestion {
  id?: string;
  party_source: string;
  party_id?: string;
  customer_name: string;
  party_size: number;
  suggested_table?: string;
  table_name: string;
  table_capacity: number;
  capacity_match_score: number;
  turnover_score: number;
  reservation_conflict_score: number;
  floor_balance_score: number;
  overall_score: number;
  ai_insight?: string;
  ai_recommendation?: SeatingRecommendation;
  action_taken: string;
  suggested_at: Date;
  branch_id?: string;
}

export interface SeatingConfig {
  aiEnabled: boolean;
  reservationWindowMin: number;
  capacityTolerance: number;
  minScore: number;
  maxSuggestions: number;
}

export const DEFAULT_SEATING_CONFIG: SeatingConfig = {
  aiEnabled: true,
  reservationWindowMin: 90,
  capacityTolerance: 0.30,
  minScore: 0.5,
  maxSuggestions: 3,
};

export const readSeatingConfig = (settings: any): SeatingConfig => ({
  aiEnabled: settings?.seating_ai_enabled ?? true,
  reservationWindowMin: safeNumber(settings?.seating_reservation_window_min, 90),
  capacityTolerance: safeNumber(settings?.seating_capacity_tolerance, 0.30),
  minScore: safeNumber(settings?.seating_min_score, 0.5),
  maxSuggestions: safeNumber(settings?.seating_max_suggestions, 3),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

interface TableData {
  id: string;
  name: string;
  capacity: number;
  floor?: string;
  isAvailable: boolean;
  avgTurnoverMin: number;  // avg time parties stay seated
  upcomingReservation?: Date;  // next reservation for this table
  activeOrderCount: number;  // current orders at this table
}

const fetchAvailableTables = async (db: any): Promise<TableData[]> => {
  try {
    // Get all tables
    const result = await db.query(
      `SELECT id, name, capacity, floor FROM floor_table
       WHERE deleted_at IS NONE AND is_block = false`
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    // Get current reservations for each table (next 90 min)
    const reservationResult = await db.query(
      `SELECT
         \`table\`.id AS table_id,
         date AS res_date,
         party_size
       FROM reservation
       WHERE status IN ['pending', 'confirmed']
         AND date > time::now()
         AND date < time::now() + 2h
       FETCH \`table\``
    );
    const reservationRows = Array.isArray(reservationResult) ? reservationResult.flat() : [];
    const tableReservations = new Map<string, Date>();
    for (const r of reservationRows) {
      const tid = r.table_id?.toString?.();
      if (tid && r.res_date) {
        const resDate = new Date(r.res_date);
        if (!tableReservations.has(tid) || resDate < tableReservations.get(tid)!) {
          tableReservations.set(tid, resDate);
        }
      }
    }

    // Get currently occupied tables (active orders not paid)
    const occupiedResult = await db.query(
      `SELECT
         \`table\`.id AS table_id,
         count() AS order_count
       FROM order
       WHERE status = 'Open'
         AND deleted_at IS NONE
         AND \`table\` IS NOT NONE
       GROUP BY \`table\``
    );
    const occupiedRows = Array.isArray(occupiedResult) ? occupiedResult.flat() : [];
    const tableOccupancy = new Map<string, number>();
    for (const o of occupiedRows) {
      tableOccupancy.set(o.table_id?.toString?.() ?? '', safeNumber(o.order_count, 0));
    }

    // Get avg turnover per table (from completed orders)
    const turnoverResult = await db.query(
      `SELECT
         \`table\`.id AS table_id,
         math::mean(time::minute(completed_at - created_at)) AS avg_min
       FROM order
       WHERE status = 'Paid'
         AND deleted_at IS NONE
         AND \`table\` IS NOT NONE
         AND completed_at > time::now() - 30d
       GROUP BY \`table\``
    );
    const turnoverRows = Array.isArray(turnoverResult) ? turnoverResult.flat() : [];
    const tableTurnover = new Map<string, number>();
    for (const t of turnoverRows) {
      tableTurnover.set(t.table_id?.toString?.() ?? '', safeNumber(t.avg_min, 60));
    }

    return rows.map((r: any) => {
      const tid = r.id?.toString?.() ?? '';
      const orderCount = tableOccupancy.get(tid) ?? 0;
      return {
        id: tid,
        name: r.name ?? 'Unknown',
        capacity: safeNumber(r.capacity, 2),
        floor: r.floor?.toString?.(),
        isAvailable: orderCount === 0,
        avgTurnoverMin: tableTurnover.get(tid) ?? 60,
        upcomingReservation: tableReservations.get(tid),
        activeOrderCount: orderCount,
      };
    });
  } catch (err) {
    console.warn('[seating] fetchAvailableTables failed', err);
    return [];
  }
};

interface PartyData {
  id: string;
  source: string;
  customerName: string;
  partySize: number;
}

const fetchIncomingParties = async (db: any): Promise<PartyData[]> => {
  const parties: PartyData[] = [];
  try {
    // Waitlist entries (status = 'waiting' or 'called')
    const waitlistResult = await db.query(
      `SELECT id, customer_name, party_size FROM waitlist_entry
       WHERE status IN ['waiting', 'called']`
    );
    const waitlistRows = Array.isArray(waitlistResult) ? waitlistResult.flat() : [];
    for (const r of waitlistRows) {
      parties.push({
        id: r.id?.toString?.() ?? '',
        source: 'waitlist',
        customerName: r.customer_name ?? 'Walk-in',
        partySize: safeNumber(r.party_size, 2),
      });
    }

    // Confirmed reservations arriving now (within 30 min of reservation time)
    const reservationResult = await db.query(
      `SELECT id, customer_name, party_size FROM reservation
       WHERE status = 'confirmed'
         AND date > time::now() - 30m
         AND date < time::now() + 30m`
    );
    const reservationRows = Array.isArray(reservationResult) ? reservationResult.flat() : [];
    for (const r of reservationRows) {
      parties.push({
        id: r.id?.toString?.() ?? '',
        source: 'reservation',
        customerName: r.customer_name ?? 'Reservation',
        partySize: safeNumber(r.party_size, 2),
      });
    }
  } catch (err) {
    console.warn('[seating] fetchIncomingParties failed', err);
  }
  return parties;
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

const scoreTable = (
  partySize: number,
  table: TableData,
  cfg: SeatingConfig
): {
  capacityMatch: number;
  turnoverScore: number;
  conflictScore: number;
  balanceScore: number;
  overall: number;
} => {
  // 1. Capacity match: party_size / capacity (1.0 = perfect, penalize over/under)
  const ratio = partySize / table.capacity;
  let capacityMatch: number;
  if (ratio > 1.0) {
    capacityMatch = 0; // party too big
  } else if (ratio >= 0.6) {
    capacityMatch = 1.0; // good fit (60-100% of capacity)
  } else if (ratio >= 1 - cfg.capacityTolerance) {
    capacityMatch = 0.7; // acceptable (within tolerance)
  } else {
    capacityMatch = 0.3; // too much wasted space
  }

  // 2. Turnover score: prefer tables that turn faster (more throughput)
  // avgTurnoverMin: 45 min = 1.0, 90 min = 0.5, 120+ min = 0.2
  const turnoverScore = Math.max(0.2, Math.min(1.0, 90 / Math.max(30, table.avgTurnoverMin)));

  // 3. Reservation conflict: penalize tables with upcoming reservation
  let conflictScore = 1.0;
  if (table.upcomingReservation) {
    const minutesUntilRes = (table.upcomingReservation.getTime() - Date.now()) / (1000 * 60);
    if (minutesUntilRes < cfg.reservationWindowMin) {
      // Conflict: table reserved soon
      conflictScore = Math.max(0, minutesUntilRes / cfg.reservationWindowMin);
    }
  }

  // 4. Floor balance: prefer sections with fewer active tables
  // (simplified: prefer tables with floor balance = use activeOrderCount as proxy)
  // Lower activeOrderCount in section = higher balance score
  // Without floor grouping, use global: 0 active = 1.0, 5+ active = 0.3
  const balanceScore = Math.max(0.3, 1 - (table.activeOrderCount * 0.15));

  // Overall: weighted
  const overall = capacityMatch * 0.35 + turnoverScore * 0.20 + conflictScore * 0.25 + balanceScore * 0.20;

  return { capacityMatch, turnoverScore, conflictScore, balanceScore, overall };
};

// ---------------------------------------------------------------------------
// AI enhancement
// ---------------------------------------------------------------------------

const enhanceWithAI = async (suggestions: SeatingSuggestion[]): Promise<void> => {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat || suggestions.length === 0) return;

  const top = suggestions.slice(0, 10);
  const prompt = `You are a restaurant host optimizing table seating.
For each party-table suggestion, provide:
  - insight: max 200 chars — why this table is optimal (or not)
  - recommendation: one of seat_here | wait_for_better | split_party | bar_seating

Recommendation guidance:
  - seat_here: overall_score >= 0.7, good capacity match → seat now
  - wait_for_better: low score but better table coming free soon → wait
  - split_party: party too large for any single table → split across 2 tables
  - bar_seating: no suitable table → offer bar seating as alternative

Suggestions (JSON):
${JSON.stringify(top.map(s => ({
  customer: s.customer_name,
  party_size: s.party_size,
  table: s.table_name,
  capacity: s.table_capacity,
  capacity_match: s.capacity_match_score,
  turnover: s.turnover_score,
  conflict: s.reservation_conflict_score,
  balance: s.floor_balance_score,
  overall: s.overall_score,
})), null, 2)}

Respond with JSON array:
[{
  "customer": "<match customer_name>",
  "insight": "<max 200 chars>",
  "recommendation": "seat_here" | "wait_for_better" | "split_party" | "bar_seating"
}]`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a seating optimization AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 1000 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      customer: string; insight?: string; recommendation?: SeatingRecommendation;
    }>;
    for (const item of parsed) {
      const sug = suggestions.find(s => s.customer_name === item.customer);
      if (sug) {
        if (item.insight) sug.ai_insight = item.insight.slice(0, 200);
        if (item.recommendation) sug.ai_recommendation = item.recommendation;
      }
    }
  } catch (err) { console.warn('[seating] AI failed', err); }
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runSeatingOptimization = async (
  db: ReturnType<typeof useDB>,
  config: SeatingConfig = DEFAULT_SEATING_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ suggestions: SeatingSuggestion[]; scanned: number }> => {
  if (onProgress) onProgress(0, 2);

  // 1. Fetch available tables + incoming parties
  const [tables, parties] = await Promise.all([
    fetchAvailableTables(db),
    fetchIncomingParties(db),
  ]);
  if (onProgress) onProgress(1, 2);

  if (parties.length === 0 || tables.length === 0) {
    if (onProgress) onProgress(2, 2);
    return { suggestions: [], scanned: parties.length };
  }

  // 2. For each party, score all available tables
  const suggestions: SeatingSuggestion[] = [];
  for (const party of parties) {
    const availableTables = tables.filter(t => t.isAvailable);
    if (availableTables.length === 0) continue;

    const scored = availableTables.map(t => {
      const scores = scoreTable(party.partySize, t, config);
      return { table: t, ...scores };
    });

    // Sort by overall score, take top N
    scored.sort((a, b) => b.overall - a.overall);
    const topTables = scored.slice(0, config.maxSuggestions);

    for (const s of topTables) {
      if (s.overall < config.minScore) continue;
      suggestions.push({
        party_source: party.source,
        party_id: party.id,
        customer_name: party.customerName,
        party_size: party.partySize,
        suggested_table: s.table.id,
        table_name: s.table.name,
        table_capacity: s.table.capacity,
        capacity_match_score: Math.round(s.capacityMatch * 100) / 100,
        turnover_score: Math.round(s.turnoverScore * 100) / 100,
        reservation_conflict_score: Math.round(s.conflictScore * 100) / 100,
        floor_balance_score: Math.round(s.balanceScore * 100) / 100,
        overall_score: Math.round(s.overall * 100) / 100,
        action_taken: 'none',
        suggested_at: new Date(),
      });
    }
  }

  // 3. AI enhancement
  if (config.aiEnabled && suggestions.length > 0) {
    await enhanceWithAI(suggestions);
  }

  // 4. Persist (refresh — delete old > 30 min)
  try {
    await db.query(`DELETE FROM seating_suggestion WHERE suggested_at < time::now() - 30m`);
  } catch { /* non-fatal */ }
  for (const sug of suggestions) {
    try {
      await db.query(`CREATE seating_suggestion CONTENT $data`, {
        data: { ...sug, suggested_at: sug.suggested_at.toISOString() },
      });
    } catch { /* non-fatal */ }
  }

  if (onProgress) onProgress(2, 2);
  return { suggestions, scanned: parties.length };
};

// ---------------------------------------------------------------------------
// Read + summary
// ---------------------------------------------------------------------------

export const getActiveSuggestions = async (db: ReturnType<typeof useDB>): Promise<SeatingSuggestion[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM seating_suggestion
       WHERE action_taken = 'none'
         AND suggested_at > time::now() - 30m
       ORDER BY overall_score DESC`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export interface SeatingSummary {
  total: number;
  seatHere: number;
  waitForBetter: number;
  splitParty: number;
  barSeating: number;
  avgScore: number;
}

export const getSeatingSummary = async (db: ReturnType<typeof useDB>): Promise<SeatingSummary> => {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(ai_recommendation = 'seat_here') AS seat_here,
         math::count(ai_recommendation = 'wait_for_better') AS wait_for_better,
         math::count(ai_recommendation = 'split_party') AS split_party,
         math::count(ai_recommendation = 'bar_seating') AS bar_seating,
         math::mean(overall_score) AS avg_score
       FROM seating_suggestion
       WHERE action_taken = 'none'
         AND suggested_at > time::now() - 30m
       GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const row = rows[0] ?? {};
    return {
      total: safeNumber(row.total, 0),
      seatHere: safeNumber(row.seat_here, 0),
      waitForBetter: safeNumber(row.wait_for_better, 0),
      splitParty: safeNumber(row.split_party, 0),
      barSeating: safeNumber(row.bar_seating, 0),
      avgScore: safeNumber(row.avg_score, 0),
    };
  } catch {
    return { total: 0, seatHere: 0, waitForBetter: 0, splitParty: 0, barSeating: 0, avgScore: 0 };
  }
};

export const updateSeatingAction = async (
  db: ReturnType<typeof useDB>, suggestionId: string, action: string
): Promise<void> => {
  await db.query(`UPDATE $id SET action_taken = $action`, { id: suggestionId, action });
};
