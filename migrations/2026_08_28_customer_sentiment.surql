-- Migration: 2026_08_28_customer_sentiment.surql
--
-- AI Customer Sentiment Analysis — review collection + AI-powered insights.
--
-- Research finding: Square Customer Insights + Lightspeed Customer Engagement
-- bundle sentiment analysis in higher tiers (~$50/mo). POSR offers it free —
-- collects customer reviews (post-order) + AI analyzes for sentiment, themes,
-- and actionable insights.
--
-- Tables:
--   1. customer_review — post-order reviews (rating + comment + tags)
--   2. sentiment_analysis — cached AI analysis per review (24h TTL)
--   3. sentiment_summary — aggregated daily/weekly sentiment rollups
--
-- Sources of reviews:
--   - Digital receipt follow-up (SMS/email link → /review/:orderId)
--   - Kiosk post-payment prompt (1-5 stars + optional comment)
--   - Manual entry (waiter asks customer, enters in admin)
--   - Integration with delivery platforms (DoorDash/UberEats ratings via webhook)
--
-- AI analysis:
--   - Per-review: sentiment (positive/neutral/negative) + emotion (joy/anger/
--     disappointment/satisfaction) + themes (food/service/price/ambiance/
--     cleanliness/wait_time) + actionability (low/medium/high) + suggested
--     response (for negative reviews)
--   - Aggregated: weekly trend (NPS-style), top positive/negative themes,
--     dishes mentioned most/least, server performance correlation

-- ---------------------------------------------------------------------------
-- customer_review — post-order customer reviews
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS customer_review TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON customer_review TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS order_id         ON customer_review TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS customer         ON customer_review TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name   ON customer_review TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_email  ON customer_review TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_phone  ON customer_review TYPE option<string>;
DEFINE FIELD IF NOT EXISTS rating           ON customer_review TYPE int;
  -- 1-5 stars (5 = excellent, 1 = terrible)
DEFINE FIELD IF NOT EXISTS comment          ON customer_review TYPE option<string>;
  -- Free-text feedback (max 1000 chars)
DEFINE FIELD IF NOT EXISTS tags             ON customer_review TYPE array<string> DEFAULT [];
  -- Waiter-assigned tags: 'birthday', 'anniversary', 'business', 'family'
DEFINE FIELD IF NOT EXISTS source           ON customer_review TYPE string DEFAULT 'manual';
  -- 'manual' | 'sms_receipt' | 'email_receipt' | 'kiosk' | 'doordash' | 'ubereats' | 'grubhub'
DEFINE FIELD IF NOT EXISTS visit_date       ON customer_review TYPE datetime;
  -- When the customer visited (may differ from review submission time)
DEFINE FIELD IF NOT EXISTS submitted_at      ON customer_review TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id         ON customer_review TYPE option<record<branch>>;
DEFINE FIELD IF NOT EXISTS is_responded      ON customer_review TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS response_text     ON customer_review TYPE option<string>;
DEFINE FIELD IF NOT EXISTS responded_at      ON customer_review TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS responded_by      ON customer_review TYPE option<record<user>>;

DEFINE INDEX IF NOT EXISTS idx_cr_order_id    ON customer_review FIELDS order_id;
DEFINE INDEX IF NOT EXISTS idx_cr_customer    ON customer_review FIELDS customer;
DEFINE INDEX IF NOT EXISTS idx_cr_rating       ON customer_review FIELDS rating;
DEFINE INDEX IF NOT EXISTS idx_cr_submitted_at ON customer_review FIELDS submitted_at;
DEFINE INDEX IF NOT EXISTS idx_cr_source      ON customer_review FIELDS source;

-- ---------------------------------------------------------------------------
-- sentiment_analysis — cached AI analysis per review (24h TTL)
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS sentiment_analysis TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON sentiment_analysis TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS review          ON sentiment_analysis TYPE option<record<customer_review>>;
DEFINE FIELD IF NOT EXISTS review_id        ON sentiment_analysis TYPE string;
DEFINE FIELD IF NOT EXISTS sentiment         ON sentiment_analysis TYPE string;
  -- 'positive' | 'neutral' | 'negative' | 'mixed'
DEFINE FIELD IF NOT EXISTS sentiment_score   ON sentiment_analysis TYPE float;
  -- -1.0 (very negative) to +1.0 (very positive); 0 = neutral
DEFINE FIELD IF NOT EXISTS emotion         ON sentiment_analysis TYPE option<string>;
  -- 'joy' | 'satisfaction' | 'disappointment' | 'anger' | 'frustration' | 'excitement' | 'neutral'
DEFINE FIELD IF NOT EXISTS themes          ON sentiment_analysis TYPE array<string> DEFAULT [];
  -- Extracted themes: 'food_quality', 'service', 'price', 'ambiance', 'cleanliness',
  -- 'wait_time', 'portion_size', 'temperature', 'presentation', 'staff_friendliness'
DEFINE FIELD IF NOT EXISTS mentioned_dishes ON sentiment_analysis TYPE array<string> DEFAULT [];
  -- Dish names mentioned in the comment
DEFINE FIELD IF NOT EXISTS actionability    ON sentiment_analysis TYPE string DEFAULT 'low';
  -- 'low' | 'medium' | 'high' — how actionable the feedback is
DEFINE FIELD IF NOT EXISTS suggested_response ON sentiment_analysis TYPE option<string>;
  -- AI-generated response for negative reviews (max 300 chars)
DEFINE FIELD IF NOT EXISTS key_phrases      ON sentiment_analysis TYPE array<string> DEFAULT [];
  -- Notable phrases extracted (max 5)
DEFINE FIELD IF NOT EXISTS analyzed_at      ON sentiment_analysis TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON sentiment_analysis TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS model_used      ON sentiment_analysis TYPE option<string>;
  -- Which AI model was used (e.g. 'gpt-4o-mini')

DEFINE INDEX IF NOT EXISTS idx_sa_review_id  ON sentiment_analysis FIELDS review_id;
DEFINE INDEX IF NOT EXISTS idx_sa_sentiment  ON sentiment_analysis FIELDS sentiment;
DEFINE INDEX IF NOT EXISTS idx_sa_analyzed_at ON sentiment_analysis FIELDS analyzed_at;

-- ---------------------------------------------------------------------------
-- sentiment_summary — daily/weekly aggregated rollups (auto-generated)
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS sentiment_summary TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON sentiment_summary TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS period_type      ON sentiment_summary TYPE string;
  -- 'daily' | 'weekly' | 'monthly'
DEFINE FIELD IF NOT EXISTS period_start     ON sentiment_summary TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end       ON sentiment_summary TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_reviews    ON sentiment_summary TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_rating       ON sentiment_summary TYPE float DEFAULT 0;
  -- 1-5 scale
DEFINE FIELD IF NOT EXISTS avg_sentiment_score ON sentiment_summary TYPE float DEFAULT 0;
  -- -1.0 to +1.0
DEFINE FIELD IF NOT EXISTS nps_score       ON sentiment_summary TYPE float DEFAULT 0;
  -- Net Promoter Score: %promoters (4-5) - %detractors (1-2), range -100 to +100
DEFINE FIELD IF NOT EXISTS positive_count  ON sentiment_summary TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS neutral_count   ON sentiment_summary TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS negative_count   ON sentiment_summary TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS top_positive_themes ON sentiment_summary TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS top_negative_themes ON sentiment_summary TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS top_mentioned_dishes ON sentiment_summary TYPE array<string> DEFAULT [];
DEFINE FIELD IF NOT EXISTS generated_at     ON sentiment_summary TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_ss_period ON sentiment_summary FIELDS period_type, period_start;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS sentiment_collection_enabled ON settings TYPE option<bool> DEFAULT true;
  -- Master switch — when false, no review prompts are shown
DEFINE FIELD IF NOT EXISTS sentiment_ai_enabled ON settings TYPE option<bool> DEFAULT true;
  -- Use AI for analysis; when false, uses keyword-based sentiment
DEFINE FIELD IF NOT EXISTS sentiment_auto_respond_threshold ON settings TYPE option<int> DEFAULT 2;
  -- Auto-respond to reviews rated <= this (default: only 1-2 star reviews get suggested responses)
DEFINE FIELD IF NOT EXISTS sentiment_reminder_delay_hours ON settings TYPE option<int> DEFAULT 2;
  -- Hours after order completion before sending review prompt (default: 2h)
