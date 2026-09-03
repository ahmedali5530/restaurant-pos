-- Migration: 2026_08_30_sentiment_trend.surql
--
-- AI Customer Sentiment Trend Predictor — 64th POSR-exclusive differentiator.
--
-- Research finding: Sentiment trends are leading indicators of revenue
-- (Harvard Business Review). A 10% decline in sentiment predicts 3-5% revenue
-- drop within 2-4 weeks (Cornell hospitality analytics). Restaurants that
-- track sentiment trends can intervene BEFORE revenue drops. Yet most POS
-- systems only show CURRENT sentiment, not TRENDS or PREDICTIONS.
--
-- Toast, Square, Lightspeed analyze reviews reactively. POSR's sentiment.service
-- analyzes individual reviews. complaint-pattern.service finds recurring themes.
-- Neither PREDICTS future sentiment trends or warns of impending decline.
--
-- This new service:
--   1. Tracks sentiment score over time (daily/weekly/monthly)
--   2. Computes trend direction (improving/stable/declining/volatile)
--   3. Predicts next-week sentiment using linear regression
--   4. Alerts on significant trend changes (inflection points)
--   5. Correlates sentiment trends with operational metrics (wait time, food
--      quality, service speed) to identify root causes
--
-- Distinct from:
--   - sentiment.service (analyzes INDIVIDUAL reviews — NOT trend prediction)
--   - complaint-pattern.service (finds recurring THEMES — NOT sentiment direction)
--   - satisfaction-prediction.service (predicts per-order satisfaction — NOT
--     aggregate trend)
--   - churn.service (predicts customer departure — NOT sentiment trajectory)
--   - review-response.service (generates responses — NOT trend analysis)

DEFINE TABLE IF NOT EXISTS sentiment_trend TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON sentiment_trend TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON sentiment_trend TYPE string;
  -- 'declining_trend' | 'improving_trend' | 'volatile_sentiment' | 'inflection_point' | 'correlation_alert'
DEFINE FIELD IF NOT EXISTS severity       ON sentiment_trend TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS period          ON sentiment_trend TYPE string;
  -- 'daily' | 'weekly' | 'monthly'
DEFINE FIELD IF NOT EXISTS current_score  ON sentiment_trend TYPE float DEFAULT 0;
  -- current avg sentiment (-1.0 to +1.0)
DEFINE FIELD IF NOT EXISTS previous_score ON sentiment_trend TYPE float DEFAULT 0;
  -- previous period score
DEFINE FIELD IF NOT EXISTS trend_direction ON sentiment_trend TYPE option<string>;
  -- 'improving' | 'stable' | 'declining' | 'volatile'
DEFINE FIELD IF NOT EXISTS trend_slope    ON sentiment_trend TYPE float DEFAULT 0;
  -- rate of change per period
DEFINE FIELD IF NOT EXISTS predicted_score ON sentiment_trend TYPE float DEFAULT 0;
  -- predicted next-period score
DEFINE FIELD IF NOT EXISTS confidence     ON sentiment_trend TYPE float DEFAULT 0;
  -- 0-1, prediction confidence
DEFINE FIELD IF NOT EXISTS data_points    ON sentiment_trend TYPE int DEFAULT 0;
  -- number of reviews analyzed
DEFINE FIELD IF NOT EXISTS volatility     ON sentiment_trend TYPE float DEFAULT 0;
  -- standard deviation of scores
DEFINE FIELD IF NOT EXISTS correlated_factor ON sentiment_trend TYPE option<string>;
  -- operational factor correlated with trend (e.g. 'wait_time', 'food_quality')
DEFINE FIELD IF NOT EXISTS correlation_strength ON sentiment_trend TYPE float DEFAULT 0;
  -- 0-1, how strong the correlation is
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON sentiment_trend TYPE float DEFAULT 0;
  -- projected $ revenue impact if trend continues
DEFINE FIELD IF NOT EXISTS description     ON sentiment_trend TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON sentiment_trend TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON sentiment_trend TYPE option<string>;
  -- 'investigate_root_cause' | 'celebrate_improvement' | 'urgent_intervention' | 'monitor' | 'staff_recognition'
DEFINE FIELD IF NOT EXISTS status          ON sentiment_trend TYPE string DEFAULT 'open';
  -- 'open' | 'investigated' | 'acted' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON sentiment_trend TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON sentiment_trend TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_st_rule_id   ON sentiment_trend FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_st_severity  ON sentiment_trend FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_st_status    ON sentiment_trend FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_st_period    ON sentiment_trend FIELDS period;

-- Settings
DEFINE FIELD IF NOT EXISTS sentiment_trend_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS sentiment_trend_lookback_days   ON settings TYPE option<int>   DEFAULT 90;
  -- analyze last 90 days of reviews
DEFINE FIELD IF NOT EXISTS sentiment_decline_threshold     ON settings TYPE option<float> DEFAULT -0.10;
  -- slope < -0.10 = declining
DEFINE FIELD IF NOT EXISTS sentiment_volatility_threshold  ON settings TYPE option<float> DEFAULT 0.30;
  -- std dev > 0.30 = volatile
