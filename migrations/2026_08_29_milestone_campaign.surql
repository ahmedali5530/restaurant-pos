-- Migration: 2026_08_29_milestone_campaign.surql
--
-- AI Customer Milestone Campaign Generator — 55th POSR-exclusive differentiator.
--
-- Research finding: Birthday/anniversary marketing has 3-5x higher open rates
-- and 2-3x higher redemption rates than generic campaigns (Experian, DMA).
-- 60% of consumers visit a restaurant for their birthday (NRA). Yet most
-- restaurants don't systematically track or act on customer milestones.
--
-- Toast, Square, Lightspeed have NO milestone campaign automation. Toast
-- Loyalty ($185/mo) accrues points but doesn't detect birthdays. Marketing
-- platforms (Mailchimp $75/mo, Constant Contact $50/mo) send emails but
-- don't auto-detect milestones from POS data.
--
-- POSR's winback.service mentions birthday as ONE factor (+10 points) in
-- winback scoring, but does NOT generate dedicated milestone campaigns.
-- This new service:
--   1. Detects upcoming birthdays (from customer data or inferred)
--   2. Detects anniversaries (first visit date)
--   3. Detects loyalty tier milestones (approaching next tier)
--   4. Detects visit count milestones (10th, 25th, 50th, 100th visit)
--   5. Generates personalized campaign per milestone (offer + message + channel)
--
-- Distinct from:
--   - winback.service (targets churned customers — birthday is just ONE factor)
--   - marketing.service (generic email/SMS campaigns — NOT milestone-specific)
--   - loyalty-roi.service (predicts ROI of enrollment — NOT milestone campaigns)
--   - churn.service (predicts departure — NOT celebration campaigns)
--   - journey.service (tracks lifecycle stages — doesn't generate campaigns)

DEFINE TABLE IF NOT EXISTS milestone_campaign TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON milestone_campaign TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON milestone_campaign TYPE string;
  -- 'birthday' | 'anniversary' | 'tier_milestone' | 'visit_count' | 'spend_milestone'
DEFINE FIELD IF NOT EXISTS severity       ON milestone_campaign TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low' (priority for outreach)
DEFINE FIELD IF NOT EXISTS customer_id    ON milestone_campaign TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_name  ON milestone_campaign TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_email ON milestone_campaign TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_phone ON milestone_campaign TYPE option<string>;
DEFINE FIELD IF NOT EXISTS milestone_type ON milestone_campaign TYPE string;
  -- 'birthday' | 'first_visit_anniversary' | 'tier_upgrade' | 'visit_10' | 'visit_25' | 'visit_50' | 'visit_100' | 'spend_500' | 'spend_1000' | 'spend_5000'
DEFINE FIELD IF NOT EXISTS milestone_date ON milestone_campaign TYPE option<datetime>;
  -- when the milestone occurs
DEFINE FIELD IF NOT EXISTS days_until_milestone ON milestone_campaign TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS customer_ltv   ON milestone_campaign TYPE float DEFAULT 0;
  -- lifetime value for prioritization
DEFINE FIELD IF NOT EXISTS suggested_offer ON milestone_campaign TYPE option<string>;
  -- 'free_appetizer' | 'free_dessert' | 'discount_15pct' | 'discount_25pct' | 'free_drink' | 'vip_table' | 'chef_tasting'
DEFINE FIELD IF NOT EXISTS est_offer_cost ON milestone_campaign TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS est_revenue_lift ON milestone_campaign TYPE float DEFAULT 0;
  -- projected revenue from celebration visit
DEFINE FIELD IF NOT EXISTS suggested_channel ON milestone_campaign TYPE option<string>;
  -- 'email' | 'sms' | 'push' | 'call'
DEFINE FIELD IF NOT EXISTS suggested_send_date ON milestone_campaign TYPE option<datetime>;
  -- when to send the campaign (e.g. 7 days before birthday)
DEFINE FIELD IF NOT EXISTS message_template ON milestone_campaign TYPE option<string>;
  -- AI-generated message text
DEFINE FIELD IF NOT EXISTS description     ON milestone_campaign TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON milestone_campaign TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON milestone_campaign TYPE option<string>;
  -- 'send_now' | 'schedule_7d_before' | 'schedule_14d_before' | 'personal_call' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON milestone_campaign TYPE string DEFAULT 'open';
  -- 'open' | 'sent' | 'responded' | 'visited' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON milestone_campaign TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON milestone_campaign TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_mc_rule_id   ON milestone_campaign FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_mc_severity  ON milestone_campaign FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_mc_status    ON milestone_campaign FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_mc_customer  ON milestone_campaign FIELDS customer_id;
DEFINE INDEX IF NOT EXISTS idx_mc_milestone_date ON milestone_campaign FIELDS milestone_date;

-- Settings
DEFINE FIELD IF NOT EXISTS milestone_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS milestone_lookahead_days   ON settings TYPE option<int>   DEFAULT 30;
  -- look ahead 30 days for upcoming milestones
DEFINE FIELD IF NOT EXISTS milestone_send_offset_days ON settings TYPE option<int>   DEFAULT 7;
  -- send campaign 7 days before milestone
DEFINE FIELD IF NOT EXISTS milestone_min_ltv_for_vip  ON settings TYPE option<float> DEFAULT 500;
  -- customers with LTV > $500 get VIP treatment
