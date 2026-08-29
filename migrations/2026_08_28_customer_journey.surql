-- Migration: 2026_08_28_customer_journey.surql
--
-- AI Customer Journey Analytics — end-to-end customer lifecycle tracking.
--
-- Research finding: Toast Customer Journey $35+/mo (higher tier), Square
-- doesn't have an equivalent. POSR offers it free — combines data from
-- reservations + orders + loyalty + sentiment + reviews to map each
-- customer's journey from first visit to loyalty/advocacy/churn.
--
-- Journey stages:
--   1. AWARENESS    — first reservation or walk-in (never ordered before)
--   2. FIRST_PURCHASE — first Paid order
--   3. REPEAT       — 2-5 orders within 90 days
--   4. LOYAL       — 6+ orders OR loyalty member with active points
--   5. ADVOCATE     — left positive review (4-5 stars) + 10+ orders
--   6. AT_RISK      — was loyal but declining frequency
--   7. CHURNED      — no orders in 90+ days
--
-- Funnel metrics:
--   - Awareness → First Purchase conversion rate
--   - First → Repeat conversion rate
--   - Repeat → Loyal conversion rate
--   - Loyal → Advocate conversion rate
--   - Overall journey completion rate

DEFINE TABLE IF NOT EXISTS customer_journey TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON customer_journey TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer_id     ON customer_journey TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON customer_journey TYPE string;
DEFINE FIELD IF NOT EXISTS email           ON customer_journey TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_stage    ON customer_journey TYPE string;
  -- 'awareness' | 'first_purchase' | 'repeat' | 'loyal' | 'advocate' | 'at_risk' | 'churned'
DEFINE FIELD IF NOT EXISTS stage_entered_at ON customer_journey TYPE datetime;
DEFINE FIELD IF NOT EXISTS first_visit_date ON customer_journey TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS first_order_date ON customer_journey TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS total_orders    ON customer_journey TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_revenue    ON customer_journey TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_days_between_visits ON customer_journey TYPE option<float>;
DEFINE FIELD IF NOT EXISTS is_loyalty_member ON customer_journey TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS loyalty_tier    ON customer_journey TYPE option<string>;
DEFINE FIELD IF NOT EXISTS has_reviewed    ON customer_journey TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS avg_rating      ON customer_journey TYPE option<float>;
DEFINE FIELD IF NOT EXISTS days_since_last_order ON customer_journey TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS journey_duration_days ON customer_journey TYPE int DEFAULT 0;
  -- Days from first visit to current stage
DEFINE FIELD IF NOT EXISTS touchpoints     ON customer_journey TYPE option<array<object>>;
  -- [{type, date, description}] — key events in their journey
DEFINE FIELD IF NOT EXISTS ai_insight      ON customer_journey TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_next_best_action ON customer_journey TYPE option<string>;
  -- 'welcome_offer' | 'loyalty_invite' | 'review_request' | 'winback' | 'vip_treatment' | 'monitor'
DEFINE FIELD IF NOT EXISTS generated_at    ON customer_journey TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON customer_journey TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_cj_customer_id ON customer_journey FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_cj_stage      ON customer_journey FIELDS current_stage;
DEFINE FIELD IF NOT EXISTS expires_at ON customer_journey TYPE option<datetime>;

DEFINE FIELD IF NOT EXISTS journey_ai_enabled ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS journey_loyal_threshold ON settings TYPE option<int> DEFAULT 6;
DEFINE FIELD IF NOT EXISTS journey_advocate_order_threshold ON settings TYPE option<int> DEFAULT 10;
DEFINE FIELD IF NOT EXISTS journey_churn_days ON settings TYPE option<int> DEFAULT 90;
DEFINE FIELD IF NOT EXISTS journey_at_risk_decline_pct ON settings TYPE option<float> DEFAULT 30;
