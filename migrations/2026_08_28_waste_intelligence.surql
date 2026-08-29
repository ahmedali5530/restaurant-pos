-- Migration: 2026_08_28_waste_intelligence.surql
--
-- AI Waste Tracking Intelligence — pattern detection + actionable insights.
--
-- Research finding: Toast Waste Management is $40+/mo, Lightspeed Waste
-- Tracking is an add-on. POSR offers it free — analyzes waste patterns
-- (by item, time-of-day, day-of-week, staff) + AI generates recommendations
-- for reducing waste (reduce order qty, retrain staff, adjust prep, etc.).
--
-- Tables:
--   1. waste_pattern — detected recurring waste patterns (auto-generated)
--   2. waste_insight — AI-generated insights + recommendations (cached 24h)
--   3. waste_reason_code — structured reason taxonomy (seeded)
--
-- Reason taxonomy (industry standard from NRA — National Restaurant Assoc):
--   spoilage      — expired/spoiled before use
--   over_prep     — prepared too much, not used in time
--   burn          — cooking error (overcooked, burnt)
--   customer_return — returned by customer (quality complaint)
--   expired       — past expiration date in storage
--   damage        — physical damage (dropped, broken packaging)
--   theft         — suspected theft/loss
--   training      — staff training waste (new employees)
--   portion_error — incorrect portion size served
--   trim_waste    — excessive trim during prep
--   other         — uncategorized
--
-- Waste as % of revenue benchmark (industry):
--   Healthy:     < 2%
--   Acceptable:  2-4%
--   Concerning:  4-6%
--   Critical:    > 6% (action needed)

-- ---------------------------------------------------------------------------
-- waste_pattern — detected recurring waste patterns
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS waste_pattern TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON waste_pattern TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS pattern_type   ON waste_pattern TYPE string;
  -- 'item_recurring' | 'time_of_day' | 'day_of_week' | 'staff_correlation' | 'reason_cluster'
DEFINE FIELD IF NOT EXISTS item_id         ON waste_pattern TYPE option<record<inventory_item>>;
DEFINE FIELD IF NOT EXISTS item_name      ON waste_pattern TYPE option<string>;
DEFINE FIELD IF NOT EXISTS reason_code    ON waste_pattern TYPE option<string>;
  -- Links to waste_reason_code
DEFINE FIELD IF NOT EXISTS day_of_week    ON waste_pattern TYPE option<int>;
  -- 0=Sunday ... 6=Saturday
DEFINE FIELD IF NOT EXISTS hour_of_day    ON waste_pattern TYPE option<int>;
  -- 0-23
DEFINE FIELD IF NOT EXISTS user_id         ON waste_pattern TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS user_name      ON waste_pattern TYPE option<string>;
DEFINE FIELD IF NOT EXISTS occurrence_count ON waste_pattern TYPE int DEFAULT 1;
DEFINE FIELD IF NOT EXISTS total_quantity  ON waste_pattern TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_cost      ON waste_pattern TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_cost_per_event ON waste_pattern TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS first_seen      ON waste_pattern TYPE datetime;
DEFINE FIELD IF NOT EXISTS last_seen       ON waste_pattern TYPE datetime;
DEFINE FIELD IF NOT EXISTS trend_direction ON waste_pattern TYPE string DEFAULT 'stable';
  -- 'increasing' | 'decreasing' | 'stable'
DEFINE FIELD IF NOT EXISTS severity        ON waste_pattern TYPE string DEFAULT 'low';
  -- 'low' | 'medium' | 'high' | 'critical'
DEFINE FIELD IF NOT EXISTS detected_at     ON waste_pattern TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_wp_pattern_type ON waste_pattern FIELDS pattern_type;
DEFINE INDEX IF NOT EXISTS idx_wp_item_id      ON waste_pattern FIELDS item_id;
DEFINE INDEX IF NOT EXISTS idx_wp_reason_code  ON waste_pattern FIELDS reason_code;
DEFINE INDEX IF NOT EXISTS idx_wp_severity     ON waste_pattern FIELDS severity;

-- ---------------------------------------------------------------------------
-- waste_insight — AI-generated insights + recommendations (cached 24h)
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS waste_insight TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON waste_insight TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS pattern         ON waste_insight TYPE option<record<waste_pattern>>;
DEFINE FIELD IF NOT EXISTS pattern_id      ON waste_insight TYPE string;
DEFINE FIELD IF NOT EXISTS insight_type    ON waste_insight TYPE string;
  -- 'reduce_order' | 'retrain_staff' | 'adjust_prep' | 'check_storage' | 'menu_change' | 'supplier_issue' | 'monitor'
DEFINE FIELD IF NOT EXISTS insight_text    ON waste_insight TYPE string;
  -- Human-readable insight (max 300 chars)
DEFINE FIELD IF NOT EXISTS recommended_action ON waste_insight TYPE string;
  -- Concrete action (max 200 chars)
DEFINE FIELD IF NOT EXISTS projected_savings ON waste_insight TYPE option<float>;
  -- Estimated monthly savings if action taken (in base currency)
DEFINE FIELD IF NOT EXISTS confidence      ON waste_insight TYPE float DEFAULT 0.7;
  -- 0-1
DEFINE FIELD IF NOT EXISTS priority        ON waste_insight TYPE string DEFAULT 'medium';
  -- 'low' | 'medium' | 'high'
DEFINE FIELD IF NOT EXISTS status          ON waste_insight TYPE string DEFAULT 'open';
  -- 'open' | 'acknowledged' | 'acted_on' | 'dismissed'
DEFINE FIELD IF NOT EXISTS generated_at    ON waste_insight TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON waste_insight TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_wi_pattern_id ON waste_insight FIELDS pattern_id;
DEFINE INDEX IF NOT EXISTS idx_wi_priority    ON waste_insight FIELDS priority;
DEFINE INDEX IF NOT EXISTS idx_wi_status     ON waste_insight FIELDS status;

-- ---------------------------------------------------------------------------
-- waste_reason_code — structured reason taxonomy (seeded)
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS waste_reason_code TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON waste_reason_code TYPE string;
DEFINE FIELD IF NOT EXISTS code            ON waste_reason_code TYPE string;
DEFINE FIELD IF NOT EXISTS label           ON waste_reason_code TYPE string;
DEFINE FIELD IF NOT EXISTS description     ON waste_reason_code TYPE option<string>;
DEFINE FIELD IF NOT EXISTS is_preventable  ON waste_reason_code TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS category        ON waste_reason_code TYPE string;
  -- 'storage' | 'preparation' | 'service' | 'inventory' | 'training' | 'other'
DEFINE FIELD IF NOT EXISTS sort_order      ON waste_reason_code TYPE int DEFAULT 100;
DEFINE FIELD IF NOT EXISTS is_active       ON waste_reason_code TYPE bool DEFAULT true;

DEFINE INDEX IF NOT EXISTS idx_wrc_code     ON waste_reason_code FIELDS code UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_wrc_category ON waste_reason_code FIELDS category;

-- Seed reason codes
INSERT INTO waste_reason_code (id, code, label, description, is_preventable, category, sort_order) VALUES
  ('spoilage',        'spoilage',        'Spoilage',        'Expired/spoiled before use', true,  'storage', 10),
  ('over_prep',       'over_prep',       'Over-preparation','Prepared too much, not used in time', true, 'preparation', 20),
  ('burn',            'burn',            'Burn',            'Cooking error — overcooked or burnt', true, 'preparation', 30),
  ('customer_return', 'customer_return', 'Customer return', 'Returned by customer due to quality complaint', true, 'service', 40),
  ('expired',         'expired',         'Expired',         'Past expiration date in storage', true, 'storage', 50),
  ('damage',          'damage',          'Damage',          'Physical damage — dropped, broken packaging', true, 'inventory', 60),
  ('theft',           'theft',           'Theft',           'Suspected theft or unexplained loss', false, 'other', 70),
  ('training',        'training',        'Training waste',  'Waste from new staff training', true, 'training', 80),
  ('portion_error',   'portion_error',   'Portion error',   'Incorrect portion size served', true, 'service', 90),
  ('trim_waste',      'trim_waste',      'Trim waste',      'Excessive trim during prep', true, 'preparation', 100),
  ('temp_abuse',      'temp_abuse',      'Temperature abuse','Stored at wrong temperature', true, 'storage', 110),
  ('other',           'other',           'Other',           'Uncategorized waste', false, 'other', 999)
ON DUPLICATE KEY UPDATE label = label;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS waste_critical_pct        ON settings TYPE option<float> DEFAULT 6;
  -- Waste % of revenue above which is 'critical' (industry benchmark: > 6%)
DEFINE FIELD IF NOT EXISTS waste_concerning_pct      ON settings TYPE option<float> DEFAULT 4;
  -- Above which is 'concerning' (industry: 4-6%)
DEFINE FIELD IF NOT EXISTS waste_acceptable_pct      ON settings TYPE option<float> DEFAULT 2;
  -- Above which is 'acceptable' (industry: 2-4%); below is 'healthy'
DEFINE FIELD IF NOT EXISTS waste_lookback_days       ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS waste_ai_enabled          ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS waste_pattern_min_occurrences ON settings TYPE option<int> DEFAULT 3;
  -- Min occurrences to flag as a pattern (default: 3+ times in lookback window)
