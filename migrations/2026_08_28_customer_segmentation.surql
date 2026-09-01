-- Migration: 2026_08_28_customer_segmentation.surql
--
-- AI Customer Segmentation for Targeted Marketing — per-segment strategies.
--
-- Research finding: Toast Customer Segmentation $40+/mo (higher tier), Square
-- Customer Segments in Plus. POSR offers it free — aggregates CLV data into
-- segment-level insights + AI generates per-segment marketing strategies
-- (which campaign, which offer, which channel for each segment).

DEFINE TABLE IF NOT EXISTS segment_strategy TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON segment_strategy TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS segment        ON segment_strategy TYPE string;
  -- 'champion' | 'loyal' | 'potential' | 'new' | 'at_risk' | 'cant_lose' | 'hibernating'
DEFINE FIELD IF NOT EXISTS customer_count  ON segment_strategy TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS total_clv       ON segment_strategy TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_clv         ON segment_strategy TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_churn_risk   ON segment_strategy TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS revenue_share_pct ON segment_strategy TYPE float DEFAULT 0;
  -- % of total CLV this segment represents
DEFINE FIELD IF NOT EXISTS loyalty_member_pct ON segment_strategy TYPE float DEFAULT 0;
  -- % of segment that are loyalty members
DEFINE FIELD IF NOT EXISTS recommended_channel ON segment_strategy TYPE option<string>;
  -- 'email' | 'sms' | 'push' | 'social' | 'in_person' | 'none'
DEFINE FIELD IF NOT EXISTS recommended_offer ON segment_strategy TYPE option<string>;
  -- 'vip_perk' | 'discount' | 'free_item' | 'early_access' | 'winback' | 'welcome' | 'none'
DEFINE FIELD IF NOT EXISTS recommended_frequency ON segment_strategy TYPE option<string>;
  -- 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'never'
DEFINE FIELD IF NOT EXISTS ai_strategy    ON segment_strategy TYPE option<string>;
  -- Full AI-generated strategy (max 500 chars)
DEFINE FIELD IF NOT EXISTS ai_campaign_idea ON segment_strategy TYPE option<string>;
  -- Specific campaign idea (max 200 chars)
DEFINE FIELD IF NOT EXISTS projected_revenue_impact ON segment_strategy TYPE option<float>;
DEFINE FIELD IF NOT EXISTS generated_at    ON segment_strategy TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON segment_strategy TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_ss_segment ON segment_strategy FIELDS segment;

DEFINE FIELD IF NOT EXISTS segmentation_ai_enabled ON settings TYPE option<bool> DEFAULT true;
