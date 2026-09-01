-- Migration: 2026_08_28_marketing_automation.surql
--
-- Marketing automation infrastructure — email/SMS campaigns + segment builder.
--
-- Research finding: Toast charges $185/mo for the loyalty + marketing bundle.
-- POSR offers it free. This enables restaurants to:
--   - Build customer segments (by tier, visit frequency, spend amount)
--   - Create email/SMS campaigns with promotional offers
--   - Track open rates, click rates, redemption rates
--   - AI-assisted campaign content generation
--
-- Tables:
--   1. marketing_segment — saved customer segments (filter criteria)
--   2. marketing_campaign — campaign config (template, segment, schedule)
--   3. marketing_campaign_recipient — per-recipient tracking (sent/opened/clicked)
--   4. marketing_template — reusable message templates

-- ---------------------------------------------------------------------------
-- marketing_segment — saved customer segments
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS marketing_segment TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON marketing_segment TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS name          ON marketing_segment TYPE string;
DEFINE FIELD IF NOT EXISTS description   ON marketing_segment TYPE option<string>;
DEFINE FIELD IF NOT EXISTS criteria     ON marketing_segment TYPE any;
  -- JSON object with filter criteria:
  -- { loyalty_tier: ['gold', 'platinum'], min_visits: 5, min_spend: 100,
  --   last_visit_days: 30, tags: ['vip'], branch_id: '...' }
DEFINE FIELD IF NOT EXISTS recipient_count ON marketing_segment TYPE option<int>;
  -- Cached count of matching customers (updated on save + periodically)
DEFINE FIELD IF NOT EXISTS created_at   ON marketing_segment TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at   ON marketing_segment TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS created_by   ON marketing_segment TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS is_active    ON marketing_segment TYPE bool DEFAULT true;

DEFINE INDEX IF NOT EXISTS marketing_segment_active ON marketing_segment FIELDS is_active;

-- ---------------------------------------------------------------------------
-- marketing_campaign — campaign configuration
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS marketing_campaign TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON marketing_campaign TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS name          ON marketing_campaign TYPE string;
DEFINE FIELD IF NOT EXISTS segment       ON marketing_campaign TYPE option<record<marketing_segment>>;
DEFINE FIELD IF NOT EXISTS channel       ON marketing_campaign TYPE string;
  -- 'email' | 'sms' | 'both'
DEFINE FIELD IF NOT EXISTS subject       ON marketing_campaign TYPE option<string>;
  -- Email subject line
DEFINE FIELD IF NOT EXISTS body_text     ON marketing_campaign TYPE string;
  -- Plain text body (for SMS or email fallback)
DEFINE FIELD IF NOT EXISTS body_html     ON marketing_campaign TYPE option<string>;
  -- HTML body (for email)
DEFINE FIELD IF NOT EXISTS offer_type    ON marketing_campaign TYPE option<string>;
  -- 'discount_percent' | 'discount_fixed' | 'free_item' | 'points_bonus' | 'none'
DEFINE FIELD IF NOT EXISTS offer_value   ON marketing_campaign TYPE option<float>;
  -- E.g. 10 for 10% off, 5 for $5 off, 100 for 100 bonus points
DEFINE FIELD IF NOT EXISTS offer_code    ON marketing_campaign TYPE option<string>;
  -- Promo code customers use to redeem the offer
DEFINE FIELD IF NOT EXISTS offer_expires_at ON marketing_campaign TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS status        ON marketing_campaign TYPE string DEFAULT 'draft';
  -- 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled'
DEFINE FIELD IF NOT EXISTS scheduled_at  ON marketing_campaign TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS sent_at       ON marketing_campaign TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS created_at   ON marketing_campaign TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS created_by   ON marketing_campaign TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS branch_id     ON marketing_campaign TYPE option<record<inventory_store>>;
DEFINE FIELD IF NOT EXISTS ai_generated  ON marketing_campaign TYPE bool DEFAULT false;
  -- True if content was AI-assisted
DEFINE FIELD IF NOT EXISTS stats         ON marketing_campaign TYPE any DEFAULT {};
  -- { sent: 0, opened: 0, clicked: 0, redeemed: 0, bounced: 0 }

DEFINE INDEX IF NOT EXISTS marketing_campaign_status ON marketing_campaign FIELDS status;
DEFINE INDEX IF NOT EXISTS marketing_campaign_scheduled ON marketing_campaign FIELDS scheduled_at;

-- ---------------------------------------------------------------------------
-- marketing_campaign_recipient — per-recipient tracking
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS marketing_campaign_recipient TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON marketing_campaign_recipient TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS campaign      ON marketing_campaign_recipient TYPE record<marketing_campaign>;
DEFINE FIELD IF NOT EXISTS customer      ON marketing_campaign_recipient TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS email         ON marketing_campaign_recipient TYPE option<string>;
DEFINE FIELD IF NOT EXISTS phone         ON marketing_campaign_recipient TYPE option<string>;
DEFINE FIELD IF NOT EXISTS status        ON marketing_campaign_recipient TYPE string DEFAULT 'pending';
  -- 'pending' | 'sent' | 'opened' | 'clicked' | 'bounced' | 'failed'
DEFINE FIELD IF NOT EXISTS sent_at       ON marketing_campaign_recipient TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS opened_at     ON marketing_campaign_recipient TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS clicked_at    ON marketing_campaign_recipient TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS redeemed      ON marketing_campaign_recipient TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS redeemed_at   ON marketing_campaign_recipient TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS error         ON marketing_campaign_recipient TYPE option<string>;

DEFINE INDEX IF NOT EXISTS mcr_campaign ON marketing_campaign_recipient FIELDS campaign;
DEFINE INDEX IF NOT EXISTS mcr_customer ON marketing_campaign_recipient FIELDS customer;
DEFINE INDEX IF NOT EXISTS mcr_status ON marketing_campaign_recipient FIELDS status;

-- ---------------------------------------------------------------------------
-- marketing_template — reusable message templates
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS marketing_template TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON marketing_template TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS name         ON marketing_template TYPE string;
DEFINE FIELD IF NOT EXISTS channel      ON marketing_template TYPE string;
  -- 'email' | 'sms'
DEFINE FIELD IF NOT EXISTS subject      ON marketing_template TYPE option<string>;
DEFINE FIELD IF NOT EXISTS body_text    ON marketing_template TYPE string;
DEFINE FIELD IF NOT EXISTS body_html    ON marketing_template TYPE option<string>;
DEFINE FIELD IF NOT EXISTS variables    ON marketing_template TYPE array<string> DEFAULT [];
  -- List of template variables: {{first_name}}, {{offer_code}}, {{expiry_date}}, etc.
DEFINE FIELD IF NOT EXISTS created_at   ON marketing_template TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS is_active    ON marketing_template TYPE bool DEFAULT true;

DEFINE INDEX IF NOT EXISTS marketing_template_active ON marketing_template FIELDS is_active;
