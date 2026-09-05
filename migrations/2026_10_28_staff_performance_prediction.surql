-- Migration: 2026_10_28_staff_performance_prediction.surql
--
-- AI Staff Performance Prediction Engine — 137th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $500-2,000/mo per location from staff
-- performance decline going undetected until customer satisfaction drops
-- (NRA Workforce, Cornell Staff Management):
--   - 40% of staff show performance decline 2-4 weeks before it's noticed
--   - Leading indicators: energy drops, error rate creep, slower service,
--     reduced upselling, fewer smile/positive interactions
--   - No POS predicts future performance from leading indicators
--   - Managers react AFTER complaints, not before decline
--   - Burnout build-up is gradual — detectable via trend analysis
--   - Disengagement shows as reduced initiative (fewer upsell attempts)
--   - Skill stagnation shows as no improvement despite training
--   - Schedule overload shows as declining performance in later shifts
--   - Each week of undetected decline = ~$200 in lost satisfaction + errors
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO performance
-- prediction. server-performance tracks CURRENT metrics. staff-energy-monitor
-- tracks shift-level energy. server-coach coaches skills. training-need
-- predicts training. staff-turnover tracks churn. None PREDICT future
-- performance decline from leading indicator trends.
--
-- This new service PREDICTS STAFF PERFORMANCE DECLINE:
--   - Tracks leading indicators (energy trend, error trend, speed trend, upsell trend)
--   - Predicts performance trajectory (improving, stable, declining, critical)
--   - Identifies burnout risk (declining across all indicators)
--   - Detects disengagement (reduced initiative + slower + fewer smiles)
--   - Flags skill stagnation (no improvement despite training + time)
--   - Correlates schedule overload with performance decline
--   - Recommends proactive interventions before customer impact
--   - Tracks intervention effectiveness (did performance recover?)

DEFINE TABLE IF NOT EXISTS staff_performance_prediction_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON staff_performance_prediction_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON staff_performance_prediction_alert TYPE string;
  -- 'performance_decline_predicted' | 'burnout_risk' | 'disengagement_detected' |
--   'skill_stagnation' | 'schedule_overload_correlation' | 'performance_recovery_confirmed' |
--   'improving_performer' | 'critical_decline_imminent'
DEFINE FIELD IF NOT EXISTS severity        ON staff_performance_prediction_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS staff_id        ON staff_performance_prediction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS staff_name      ON staff_performance_prediction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS role            ON staff_performance_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS current_performance_score ON staff_performance_prediction_alert TYPE option<float>;
  -- 0-100 composite
DEFINE FIELD IF NOT EXISTS previous_performance_score ON staff_performance_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS predicted_score_next_month ON staff_performance_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS performance_trend ON staff_performance_prediction_alert TYPE option<string>;
  -- 'improving' | 'stable' | 'declining' | 'critical'
DEFINE FIELD IF NOT EXISTS decline_rate    ON staff_performance_prediction_alert TYPE option<float>;
  -- points per month
DEFINE FIELD IF NOT EXISTS weeks_until_critical ON staff_performance_prediction_alert TYPE option<int>;
  -- predicted weeks until score <40
DEFINE FIELD IF NOT EXISTS leading_indicators ON staff_performance_prediction_alert TYPE option<string>;
  -- comma-separated: 'energy_decline,error_increase,speed_slowdown,upsell_drop'
DEFINE FIELD IF NOT EXISTS energy_trend    ON staff_performance_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS error_trend     ON staff_performance_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS speed_trend     ON staff_performance_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS upsell_trend    ON staff_performance_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS shifts_last_14d ON staff_performance_prediction_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS avg_shifts_per_week ON staff_performance_prediction_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS recommended_intervention ON staff_performance_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS est_monthly_opportunity ON staff_performance_prediction_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON staff_performance_prediction_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON staff_performance_prediction_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON staff_performance_prediction_alert TYPE option<string>;
  -- 'proactive_coaching' | 'schedule_break' | 'reduce_shifts' | 'new_challenge' |
--   'recognize_progress' | 'investigate' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON staff_performance_prediction_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON staff_performance_prediction_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON staff_performance_prediction_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_staffperfpred_rule      ON staff_performance_prediction_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_staffperfpred_status    ON staff_performance_prediction_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_staffperfpred_severity  ON staff_performance_prediction_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_staffperfpred_staff     ON staff_performance_prediction_alert FIELDS staff_id;

DEFINE FIELD IF NOT EXISTS staffperfpred_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS staffperfpred_decline_threshold ON settings TYPE option<float> DEFAULT 5.0;
  -- points/month decline to flag (default 5)
DEFINE FIELD IF NOT EXISTS staffperfpred_critical_score ON settings TYPE option<float> DEFAULT 40.0;
  -- score below which is critical (default 40)
DEFINE FIELD IF NOT EXISTS staffperfpred_overload_shifts ON settings TYPE option<float> DEFAULT 6.0;
  -- avg shifts/week to flag overload (default 6)
