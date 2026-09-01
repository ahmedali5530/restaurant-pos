-- Migration: 2026_08_28_seating_optimization.surql
--
-- AI Table Seating Optimization — 24th POSR-exclusive differentiator.
--
-- Research finding: Poor table assignment wastes 15-20% of seating capacity
-- (wasted seats, turnover delays, server imbalance). Toast Table Management
-- ($50+/mo) shows table status but doesn't OPTIMIZE assignments. OpenTable
-- has basic assignment but no AI. POSR recommends optimal table per incoming
-- party based on capacity match, turnover rate, reservations, floor balance.
--
-- Distinct from:
--   - turnover.service (analyzes table PERFORMANCE after the fact)
--   - wait-prediction.service (predicts WAIT TIME for waitlist)
--   - reservation.service (manages reservations, doesn't optimize seating)
--   - no-show-prediction.service (predicts reservation attendance)
--
-- This service OPTIMIZES real-time seating assignments — which table for THIS party?
--
-- Algorithm:
--   For each incoming party (from waitlist or reservation):
--   1. capacity_match: party_size / table_capacity (1.0 = perfect, 0.5 = half empty)
--   2. turnover_efficiency: prefer tables with faster turnover (more parties/day)
--   3. reservation_conflict: avoid tables reserved within next 90 min
--   4. floor_balance: prefer server sections with fewer active tables
--   5. proximity: for multi-table parties, prefer adjacent tables
--   6. AI: overall recommendation + reasoning

DEFINE TABLE IF NOT EXISTS seating_suggestion TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON seating_suggestion TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS party_source     ON seating_suggestion TYPE string;
  -- 'waitlist' | 'reservation' | 'walk_in'
DEFINE FIELD IF NOT EXISTS party_id         ON seating_suggestion TYPE option<string>;
  -- waitlist_entry id or reservation id
DEFINE FIELD IF NOT EXISTS customer_name   ON seating_suggestion TYPE string;
DEFINE FIELD IF NOT EXISTS party_size      ON seating_suggestion TYPE int;
DEFINE FIELD IF NOT EXISTS suggested_table ON seating_suggestion TYPE option<record<floor_table>>;
DEFINE FIELD IF NOT EXISTS table_name      ON seating_suggestion TYPE string;
DEFINE FIELD IF NOT EXISTS table_capacity   ON seating_suggestion TYPE int;
DEFINE FIELD IF NOT EXISTS capacity_match_score ON seating_suggestion TYPE float;
  -- 0-1 (1 = perfect size match)
DEFINE FIELD IF NOT EXISTS turnover_score   ON seating_suggestion TYPE float;
  -- 0-1 (1 = fast-turning table)
DEFINE FIELD IF NOT EXISTS reservation_conflict_score ON seating_suggestion TYPE float;
  -- 0-1 (1 = no upcoming reservation conflict)
DEFINE FIELD IF NOT EXISTS floor_balance_score ON seating_suggestion TYPE float;
  -- 0-1 (1 = server section has capacity)
DEFINE FIELD IF NOT EXISTS overall_score    ON seating_suggestion TYPE float;
  -- weighted: capacity 35% + turnover 20% + conflict 25% + balance 20%
DEFINE FIELD IF NOT EXISTS ai_insight      ON seating_suggestion TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON seating_suggestion TYPE option<string>;
  -- 'seat_here' | 'wait_for_better' | 'split_party' | 'bar_seating'
DEFINE FIELD IF NOT EXISTS action_taken    ON seating_suggestion TYPE string DEFAULT 'none';
  -- 'none' | 'seated' | 'waited' | 'split' | 'bar' | 'dismissed'
DEFINE FIELD IF NOT EXISTS suggested_at     ON seating_suggestion TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id       ON seating_suggestion TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_ss_party     ON seating_suggestion FIELDS party_id;
DEFINE INDEX IF NOT EXISTS idx_ss_table     ON seating_suggestion FIELDS suggested_table;
DEFINE INDEX IF NOT EXISTS idx_ss_action    ON seating_suggestion FIELDS action_taken;
DEFINE INDEX IF NOT EXISTS idx_ss_suggested  ON seating_suggestion FIELDS suggested_at;

-- Settings
DEFINE FIELD IF NOT EXISTS seating_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS seating_reservation_window_min ON settings TYPE option<int>   DEFAULT 90;
  -- avoid tables reserved within next 90 min
DEFINE FIELD IF NOT EXISTS seating_capacity_tolerance ON settings TYPE option<float> DEFAULT 0.30;
  -- table capacity within 30% of party size = good match
DEFINE FIELD IF NOT EXISTS seating_min_score        ON settings TYPE option<float> DEFAULT 0.5;
  -- minimum overall_score to suggest a table
DEFINE FIELD IF NOT EXISTS seating_max_suggestions  ON settings TYPE option<int>   DEFAULT 3;
  -- top 3 table suggestions per party
