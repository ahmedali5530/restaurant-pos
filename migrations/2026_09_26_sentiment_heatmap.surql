-- Migration: 2026_09_26_sentiment_heatmap.surql
--
-- AI Customer Feedback Sentiment Heatmap — 105th POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-1,500/mo from not visualizing
-- feedback sentiment across operational dimensions (NRA, BrightLocal):
--   - 70% of feedback mentions specific dimensions (food/service/price/ambience)
--     but managers only look at overall star rating
--   - Food declining: customers mention "bland" "overcooked" repeatedly but
--     overall rating stays 4.2 → trend hidden in averages
--   - Service complaints: "rude server" mentions spike on weekends but
--     manager doesn't see the pattern
--   - Price complaints: "expensive" mentions increase after menu price change
--     → silent churn
--   - Wait time: "long wait" mentions cluster at specific hours → staffing gap
--   - Staff mentions: specific servers named negatively → training needed
--   - Positive spikes: a dish gets viral praise → amplify opportunity missed
--   - Negative clusters: multiple negative mentions in short window → crisis
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO sentiment heatmap.
-- sentiment.service analyzes overall sentiment. sentiment-trend tracks TRENDS
-- over time. complaint-pattern finds RECURRING themes. None provide real-time
-- multi-dimensional HEATMAP visualization.
--
-- This new service provides SENTIMENT HEATMAP:
--   - Tracks sentiment across 6 dimensions: food, service, price, ambience,
--     wait_time, value
--   - Real-time sentiment scoring per dimension (-1.0 to +1.0)
--   - Heatmap visualization (green/amber/red per dimension × time)
--   - Detects declining dimensions before overall rating drops
--   - Identifies staff-specific sentiment mentions
--   - Spots positive spikes for amplification
--   - Alerts on negative mention clusters

DEFINE TABLE IF NOT EXISTS sentiment_heatmap_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON sentiment_heatmap_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON sentiment_heatmap_alert TYPE string;
  -- 'food_decline' | 'service_decline' | 'price_complaint_spike' |
--   'wait_time_spike' | 'ambience_decline' | 'staff_negative_mention' |
--   'positive_amplification' | 'negative_cluster'
DEFINE FIELD IF NOT EXISTS severity        ON sentiment_heatmap_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS dimension       ON sentiment_heatmap_alert TYPE string;
  -- 'food' | 'service' | 'price' | 'ambience' | 'wait_time' | 'value'
DEFINE FIELD IF NOT EXISTS current_sentiment ON sentiment_heatmap_alert TYPE float DEFAULT 0;
  -- -1.0 to +1.0
DEFINE FIELD IF NOT EXISTS previous_sentiment ON sentiment_heatmap_alert TYPE option<float>;
  -- previous period sentiment for comparison
DEFINE FIELD IF NOT EXISTS mention_count   ON sentiment_heatmap_alert TYPE option<int>;
DEFINE FIELD IF NOT EXISTS staff_mentioned ON sentiment_heatmap_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS time_window     ON sentiment_heatmap_alert TYPE option<string>;
  -- 'morning' | 'afternoon' | 'evening' | 'all_day'
DEFINE FIELD IF NOT EXISTS est_revenue_impact ON sentiment_heatmap_alert TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS description     ON sentiment_heatmap_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON sentiment_heatmap_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON sentiment_heatmap_alert TYPE option<string>;
  -- 'investigate_now' | 'train_staff' | 'adjust_pricing' | 'amplify_positive' |
--   'add_staffing' | 'quality_review' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON sentiment_heatmap_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON sentiment_heatmap_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON sentiment_heatmap_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_heatmap_rule      ON sentiment_heatmap_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_heatmap_status    ON sentiment_heatmap_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_heatmap_severity  ON sentiment_heatmap_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_heatmap_dimension ON sentiment_heatmap_alert FIELDS dimension;

DEFINE FIELD IF NOT EXISTS heatmap_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS heatmap_decline_threshold ON settings TYPE option<float> DEFAULT -0.2;
  -- sentiment change threshold for decline alert (default -0.2)
DEFINE FIELD IF NOT EXISTS heatmap_mention_min   ON settings TYPE option<int> DEFAULT 5;
  -- minimum mentions before alert (default 5)
DEFINE FIELD IF NOT EXISTS heatmap_cluster_window_h ON settings TYPE option<int> DEFAULT 6;
  -- hours for negative cluster detection (default 6h)
