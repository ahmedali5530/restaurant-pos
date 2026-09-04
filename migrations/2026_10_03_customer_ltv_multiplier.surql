-- Migration: 2026_10_03_customer_ltv_multiplier.surql
--
-- AI Customer LTV Multiplier Predictor — 112th POSR-exclusive differentiator.
--
-- Research finding: Restaurants leave $500-2,000/mo per location on the table
-- by treating all customers equally instead of identifying "multiplier
-- candidates" — customers whose value could 2-5x with targeted investment
-- (Bain Loyalty Math, Harvard CLV Multiplier Study):
--   - 20% of customers drive 80% of profit (Pareto) but receive same treatment
--   - "Multiplier candidates" = low-current-LTV customers with high-potential
--     signals (growing income, family formation, referral behavior)
--   - A $200 LTV customer could become $1,000 LTV with $50 retention investment
--   - No POS identifies latent high-value potential (only tracks realized value)
--   - Upsell/retention budget wasted on customers who won't multiply
--   - Referral multipliers: customers who bring 3+ new customers worth 3x LTV
--   - Category expansion: single-category buyers who could become multi-category
--   - Frequency multipliers: monthly buyers who could become weekly
--   - VIP identification too late (after they've already peaked)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO LTV multiplier
-- prediction. clv.service computes current CLV snapshot. clv-trajectory.service
-- tracks historical DIRECTION of CLV change. churn-prediction predicts who will
-- LEAVE. winback targets those who LEFT. None identify which current customers
-- have latent MULTIPLIER POTENTIAL — i.e., could 2-5x their value with targeted
-- investment.
--
-- This new service PREDICTS CUSTOMER LTV MULTIPLIER POTENTIAL:
--   - Identifies "multiplier candidates" (current LTV × predicted multiplier)
--   - Detects referral multipliers (customers who bring new customers)
--   - Flags category expansion opportunities (single → multi-category)
--   - Detects frequency multipliers (monthly → weekly potential)
--   - Identifies VIP-in-training (high-potential, not yet high-value)
--   - Calculates optimal retention investment per customer
--   - Flags false multipliers (one-time spikes mistaken for potential)
--   - Tracks multiplier realization (did prediction come true?)

DEFINE TABLE IF NOT EXISTS customer_ltv_multiplier_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON customer_ltv_multiplier_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON customer_ltv_multiplier_alert TYPE string;
  -- 'multiplier_candidate' | 'referral_multiplier' | 'category_expansion' |
--   'frequency_multiplier' | 'vip_in_training' | 'optimal_investment' |
--   'false_multiplier' | 'multiplier_realized'
DEFINE FIELD IF NOT EXISTS severity        ON customer_ltv_multiplier_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS customer_id     ON customer_ltv_multiplier_alert TYPE string;
DEFINE FIELD IF NOT EXISTS customer_name   ON customer_ltv_multiplier_alert TYPE string;
DEFINE FIELD IF NOT EXISTS current_ltv     ON customer_ltv_multiplier_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS predicted_ltv   ON customer_ltv_multiplier_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS multiplier      ON customer_ltv_multiplier_alert TYPE option<float>;
  -- predicted_ltv / current_ltv (e.g. 3.5x)
DEFINE FIELD IF NOT EXISTS multiplier_type ON customer_ltv_multiplier_alert TYPE option<string>;
  -- 'referral' | 'category_expansion' | 'frequency' | 'vip_escalation'
DEFINE FIELD IF NOT EXISTS retention_investment ON customer_ltv_multiplier_alert TYPE option<float>;
  -- recommended $ investment to realize multiplier
DEFINE FIELD IF NOT EXISTS expected_return ON customer_ltv_multiplier_alert TYPE option<float>;
  -- predicted return on retention investment
DEFINE FIELD IF NOT EXISTS roi_multiple     ON customer_ltv_multiplier_alert TYPE option<float>;
  -- expected_return / retention_investment
DEFINE FIELD IF NOT EXISTS signals         ON customer_ltv_multiplier_alert TYPE option<string>;
  -- comma-separated signals (e.g. 'growing_frequency,referral_history,high_spend')
DEFINE FIELD IF NOT EXISTS months_to_realize ON customer_ltv_multiplier_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON customer_ltv_multiplier_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON customer_ltv_multiplier_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON customer_ltv_multiplier_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON customer_ltv_multiplier_alert TYPE option<string>;
  -- 'invest_now' | 'upsell_premium' | 'referral_program' | 'category_cross_sell' |
--   'frequency_incentive' | 'vip_treatment' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON customer_ltv_multiplier_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON customer_ltv_multiplier_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON customer_ltv_multiplier_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ltvmult_rule      ON customer_ltv_multiplier_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_ltvmult_status    ON customer_ltv_multiplier_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_ltvmult_severity  ON customer_ltv_multiplier_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_ltvmult_customer  ON customer_ltv_multiplier_alert FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_ltvmult_type      ON customer_ltv_multiplier_alert FIELDS multiplier_type;

DEFINE FIELD IF NOT EXISTS ltvmult_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS ltvmult_min_multiplier ON settings TYPE option<float> DEFAULT 2.0;
  -- minimum predicted multiplier to flag as candidate (default 2x)
DEFINE FIELD IF NOT EXISTS ltvmult_min_roi       ON settings TYPE option<float> DEFAULT 3.0;
  -- minimum ROI multiple to recommend investment (default 3x)
DEFINE FIELD IF NOT EXISTS ltvmult_max_investment ON settings TYPE option<float> DEFAULT 100.0;
  -- max recommended retention investment per customer (default $100)
DEFINE FIELD IF NOT EXISTS ltvmult_realization_window ON settings TYPE option<int> DEFAULT 6;
  -- months to realize multiplier (default 6 months)
