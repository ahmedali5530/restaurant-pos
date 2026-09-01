-- Migration: 2026_08_28_table_turnover.surql
--
-- AI Table Turnover Optimization — occupancy + revenue per table analysis.
--
-- Research finding: Toast Table Management $50+/mo (higher tier), Lightspeed
-- equivalent in Pro. POSR offers it free — analyzes table occupancy patterns,
-- turnover rates, revenue per table-hour + AI generates recommendations
-- (reseat faster, combine tables, adjust capacity, remove underperformers).
--
-- Tables:
--   1. table_turnover_analysis — cached per-table metrics (24h TTL)
--   2. turnover_insight — AI-generated insights + recommendations
--
-- Metrics per table:
--   - avg_occupancy_minutes: avg time from first order to payment
--   - median_occupancy_minutes: robust central tendency (outlier-resistant)
--   - turnover_rate: parties served per day (avg)
--   - revenue_per_hour: revenue / open-hours (measure of table productivity)
--   - avg_party_size: avg covers per party
--   - capacity_utilization: avg_party_size / table_capacity (0-1+)
--   - avg_idle_minutes: avg gap between parties (table empty but service open)
--   - total_parties: count of parties in period
--   - total_revenue: revenue in period
--   - peak_hour: hour with most parties
--   - slowest_hour: hour with lowest revenue
--   - mismatch_score: how often party_size < capacity × 0.5 (wasted seats)
--
-- Overall table score (0-100, weighted):
--   revenue_per_hour (40%) + turnover_rate (25%) + capacity_utilization (20%)
--   + idle_efficiency (15% — lower idle = higher score)
--
-- Grade: A (>=85) top performer, B (70-84), C (55-69), D (40-54), F (<40)
--
-- AI recommendations:
--   - 'combine' — low party size + low utilization → combine small tables
--   - 'reseat_faster' — high idle time → optimize cleaning + seating flow
--   - 'adjust_capacity' — frequent mismatch → change table capacity/size
--   - 'remove' — consistently low revenue per hour → remove or repurpose table
--   - 'promote_location' — high performer → replicate (add similar table nearby)
--   - 'monitor' — borderline, watch closely

-- ---------------------------------------------------------------------------
-- table_turnover_analysis — cached per-table metrics
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS table_turnover_analysis TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON table_turnover_analysis TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS table          ON table_turnover_analysis TYPE option<record<floor_table>>;
DEFINE FIELD IF NOT EXISTS table_id       ON table_turnover_analysis TYPE string;
DEFINE FIELD IF NOT EXISTS table_name     ON table_turnover_analysis TYPE string;
DEFINE FIELD IF NOT EXISTS table_number   ON table_turnover_analysis TYPE option<string>;
DEFINE FIELD IF NOT EXISTS capacity        ON table_turnover_analysis TYPE option<int>;
DEFINE FIELD IF NOT EXISTS floor_name     ON table_turnover_analysis TYPE option<string>;
DEFINE FIELD IF NOT EXISTS period_start    ON table_turnover_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end      ON table_turnover_analysis TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_parties  ON table_turnover_analysis TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_revenue   ON table_turnover_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_occupancy_minutes ON table_turnover_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS median_occupancy_minutes ON table_turnover_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS turnover_rate   ON table_turnover_analysis TYPE float DEFAULT 0;
  -- Parties per open-day
DEFINE FIELD IF NOT EXISTS revenue_per_hour ON table_turnover_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_party_size  ON table_turnover_analysis TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS capacity_utilization ON table_turnover_analysis TYPE float DEFAULT 0;
  -- avg_party_size / capacity (0-1+)
DEFINE FIELD IF NOT EXISTS avg_idle_minutes ON table_turnover_analysis TYPE float DEFAULT 0;
  -- Gap between parties
DEFINE FIELD IF NOT EXISTS peak_hour       ON table_turnover_analysis TYPE option<int>;
DEFINE FIELD IF NOT EXISTS peak_hour_parties ON table_turnover_analysis TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS mismatch_count  ON table_turnover_analysis TYPE int DEFAULT 0;
  -- Parties where size < capacity × 0.5
DEFINE FIELD IF NOT EXISTS mismatch_score  ON table_turnover_analysis TYPE float DEFAULT 0;
  -- mismatch_count / total_parties (0-1)
DEFINE FIELD IF NOT EXISTS overall_score    ON table_turnover_analysis TYPE float DEFAULT 0;
  -- 0-100 weighted
DEFINE FIELD IF NOT EXISTS grade           ON table_turnover_analysis TYPE string DEFAULT 'C';
  -- A/B/C/D/F
DEFINE FIELD IF NOT EXISTS generated_at    ON table_turnover_analysis TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON table_turnover_analysis TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_tta_table_id ON table_turnover_analysis FIELDS table_id;
DEFINE INDEX IF NOT EXISTS idx_tta_grade    ON table_turnover_analysis FIELDS grade;
DEFINE INDEX IF NOT EXISTS idx_tta_score    ON table_turnover_analysis FIELDS overall_score;

-- ---------------------------------------------------------------------------
-- turnover_insight — AI-generated insights + recommendations
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS turnover_insight TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON turnover_insight TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS table_id        ON turnover_insight TYPE string;
DEFINE FIELD IF NOT EXISTS table_name      ON turnover_insight TYPE string;
DEFINE FIELD IF NOT EXISTS recommendation  ON turnover_insight TYPE string;
  -- 'combine' | 'reseat_faster' | 'adjust_capacity' | 'remove' | 'promote_location' | 'monitor'
DEFINE FIELD IF NOT EXISTS insight_text    ON turnover_insight TYPE string;
  -- Max 300 chars
DEFINE FIELD IF NOT EXISTS action          ON turnover_insight TYPE option<string>;
  -- Concrete next step, max 200 chars
DEFINE FIELD IF NOT EXISTS projected_revenue_impact ON turnover_insight TYPE option<float>;
  -- Estimated monthly revenue increase if action taken
DEFINE FIELD IF NOT EXISTS confidence      ON turnover_insight TYPE float DEFAULT 0.7;
  -- 0-1
DEFINE FIELD IF NOT EXISTS priority        ON turnover_insight TYPE string DEFAULT 'medium';
  -- 'low' | 'medium' | 'high'
DEFINE FIELD IF NOT EXISTS status          ON turnover_insight TYPE string DEFAULT 'open';
  -- 'open' | 'acknowledged' | 'acted_on' | 'dismissed'
DEFINE FIELD IF NOT EXISTS generated_at    ON turnover_insight TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON turnover_insight TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ti_table_id      ON turnover_insight FIELDS table_id;
DEFINE INDEX IF NOT EXISTS idx_ti_recommendation ON turnover_insight FIELDS recommendation;
DEFINE INDEX IF NOT EXISTS idx_ti_status        ON turnover_insight FIELDS status;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS turnover_lookback_days  ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS turnover_ai_enabled     ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS turnover_open_hours     ON settings TYPE option<int> DEFAULT 15;
  -- Hours per day the venue is open (default: 15h = 8AM-11PM)
DEFINE FIELD IF NOT EXISTS turnover_min_parties   ON settings TYPE option<int> DEFAULT 5;
  -- Min parties in period to evaluate a table (default: 5+)
