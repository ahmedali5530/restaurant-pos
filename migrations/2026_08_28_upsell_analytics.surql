-- Migration: 2026_08_28_upsell_analytics.surql
--
-- AI Upsell Effectiveness Analytics — measure upsell conversion + impact.
--
-- Research finding: Square Upsell Analytics + Toast Upsell Insights bundle
-- upsell performance measurement in higher tiers (~$35/mo). POSR offers it
-- free — persists upsell events (shown/accepted/declined) then computes
-- conversion rate + revenue lift + per-item effectiveness + AI insights.
--
-- Why it matters:
--   - Without measurement, upsell is a guess — operators don't know which
--     suggestions actually convert
--   - Identifies top-performing upsell items (focus on what works)
--   - Shows underperformers (remove or rework)
--   - Quantifies revenue lift (justifies the upsell feature)
--   - A/B testing foundation (compare suggestion strategies)
--
-- Tables:
--   1. upsell_event — individual upsell interactions (shown/accepted/declined)
--   2. upsell_effectiveness — aggregated per-item + overall metrics (24h TTL)
--
-- Metrics:
--   - Conversion rate: accepted / shown × 100 (per item + overall)
--   - Revenue lift: total upsell revenue added (sum of accepted item prices)
--   - Avg ticket lift: avg revenue added per order with upsell
--   - Attachment rate: % orders with at least one accepted upsell
--   - Top items: highest conversion + highest revenue contribution
--   - Underperformers: low conversion (< 10%) with high show count
--
-- AI insights:
--   - Which items to feature more (high converters)
--   - Which to remove/rework (low converters)
--   - Optimal placement (after-dish vs at-checkout)
--   - Time-of-day patterns (when upsell works best)

-- ---------------------------------------------------------------------------
-- upsell_event — individual upsell interactions
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS upsell_event TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON upsell_event TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS order_id         ON upsell_event TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS trigger_item    ON upsell_event TYPE option<record<dish>>;
  -- The dish that triggered the upsell prompt
DEFINE FIELD IF NOT EXISTS trigger_item_id ON upsell_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS trigger_item_name ON upsell_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS suggested_item  ON upsell_event TYPE option<record<dish>>;
  -- The upsell item suggested
DEFINE FIELD IF NOT EXISTS suggested_item_id ON upsell_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS suggested_item_name ON upsell_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS suggested_price  ON upsell_event TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS outcome          ON upsell_event TYPE string;
  -- 'shown' | 'accepted' | 'declined' | 'timeout'
DEFINE FIELD IF NOT EXISTS placement        ON upsell_event TYPE string DEFAULT 'after_dish';
  -- 'after_dish' | 'at_checkout' | 'kiosk'
DEFINE FIELD IF NOT EXISTS hour_of_day      ON upsell_event TYPE option<int>;
DEFINE FIELD IF NOT EXISTS day_of_week     ON upsell_event TYPE option<int>;
DEFINE FIELD IF NOT EXISTS user_id          ON upsell_event TYPE option<record<user>>;
  -- Server who triggered (for correlation with performance)
DEFINE FIELD IF NOT EXISTS terminal_id     ON upsell_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS response_time_ms ON upsell_event TYPE option<int>;
  -- How long before user responded (for UX optimization)
DEFINE FIELD IF NOT EXISTS created_at       ON upsell_event TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_ue_order_id      ON upsell_event FIELDS order_id;
DEFINE INDEX IF NOT EXISTS idx_ue_suggested_item ON upsell_event FIELDS suggested_item_id;
DEFINE INDEX IF NOT EXISTS idx_ue_trigger_item  ON upsell_event FIELDS trigger_item_id;
DEFINE INDEX IF NOT EXISTS idx_ue_outcome      ON upsell_event FIELDS outcome;
DEFINE INDEX IF NOT EXISTS idx_ue_created_at   ON upsell_event FIELDS created_at;
DEFINE INDEX IF NOT EXISTS idx_ue_placement    ON upsell_event FIELDS placement;

-- ---------------------------------------------------------------------------
-- upsell_effectiveness — aggregated per-item + overall metrics (24h TTL)
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS upsell_effectiveness TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON upsell_effectiveness TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS item_id         ON upsell_effectiveness TYPE option<string>;
  -- null = overall aggregate
DEFINE FIELD IF NOT EXISTS item_name      ON upsell_effectiveness TYPE option<string>;
DEFINE FIELD IF NOT EXISTS period_start   ON upsell_effectiveness TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end     ON upsell_effectiveness TYPE datetime;
DEFINE FIELD IF NOT EXISTS times_shown    ON upsell_effectiveness TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS times_accepted  ON upsell_effectiveness TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS times_declined ON upsell_effectiveness TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS times_timeout  ON upsell_effectiveness TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS conversion_rate ON upsell_effectiveness TYPE float DEFAULT 0;
  -- accepted / shown × 100
DEFINE FIELD IF NOT EXISTS revenue_lift   ON upsell_effectiveness TYPE float DEFAULT 0;
  -- Sum of accepted item prices
DEFINE FIELD IF NOT EXISTS avg_response_ms ON upsell_effectiveness TYPE float DEFAULT 0;
  -- Avg time to respond (for UX insights)
DEFINE FIELD IF NOT EXISTS grade           ON upsell_effectiveness TYPE string DEFAULT 'C';
  -- A (>=30% conv) / B (20-29%) / C (10-19%) / D (5-9%) / F (<5%)
DEFINE FIELD IF NOT EXISTS ai_insight      ON upsell_effectiveness TYPE option<string>;
  -- AI-generated recommendation per item
DEFINE FIELD IF NOT EXISTS ai_action      ON upsell_effectiveness TYPE option<string>;
  -- 'feature_more' | 'keep' | 'rework' | 'remove'
DEFINE FIELD IF NOT EXISTS is_overall     ON upsell_effectiveness TYPE bool DEFAULT false;
  -- True for the aggregate row (all items combined)
DEFINE FIELD IF NOT EXISTS generated_at    ON upsell_effectiveness TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON upsell_effectiveness TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ueff_item_id  ON upsell_effectiveness FIELDS item_id;
DEFINE INDEX IF NOT EXISTS idx_ueff_is_overall ON upsell_effectiveness FIELDS is_overall;
DEFINE INDEX IF NOT EXISTS idx_ueff_grade    ON upsell_effectiveness FIELDS grade;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS upsell_analytics_enabled ON settings TYPE option<bool> DEFAULT true;
  -- Master switch — when false, no events are recorded (privacy/perf)
DEFINE FIELD IF NOT EXISTS upsell_lookback_days  ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS upsell_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS upsell_min_shows_for_eval ON settings TYPE option<int> DEFAULT 10;
  -- Min times shown to evaluate an item (default: 10+ shows for statistical significance)
