-- Migration: 2026_08_29_review_response.surql
--
-- AI Online Review Response Generator — 51st POSR-exclusive differentiator.
--
-- Research finding: 89% of consumers read business responses to reviews
-- (BrightLocal 2024), but restaurants respond to only 44% of reviews
-- (ReviewTrackers). Manual responses take 3-5 min each — a busy restaurant
-- with 50 reviews/month spends 4+ hours/month just responding.
--
-- Existing tools:
--   - Google Business Profile: free but manual response only
--   - Yelp: requires manual response
--   - Reputation.com / Podium: $300+/mo, auto-generate responses
--   - Toast/Square/Lightspeed: NO review response feature at all
--
-- POSR's sentiment.service generates ONE suggested_response per negative
-- review (300 chars). This new service goes far beyond:
--   1. Generates responses for ALL reviews (positive, neutral, mixed, negative)
--   2. Platform-specific tone (Google formal, Yelp conversational, TripAdvisor traveler-friendly)
--   3. Brand voice matching (formal / casual / playful)
--   4. Multi-language support
--   5. Response template library (reuses best-performing responses)
--   6. Response effectiveness tracking (did customer update review after response?)
--   7. Sentiment-specific strategies (thank / address / resolve / invite back)
--
-- Distinct from:
--   - sentiment.service (analyzes reviews + 1 suggested_response for negatives
--     only — NOT multi-platform, brand-aware, multi-language, or effectiveness-tracked)
--   - complaint-pattern.service (detects recurring themes — doesn't generate responses)
--   - marketing.service (campaigns — not review responses)
--   - churn.service (predicts departure — not review responses)

DEFINE TABLE IF NOT EXISTS review_response TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON review_response TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON review_response TYPE string;
  -- 'positive_thank' | 'neutral_address' | 'negative_resolve' | 'mixed_acknowledge' | 'critical_escalate'
DEFINE FIELD IF NOT EXISTS severity       ON review_response TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS review_id       ON review_response TYPE option<string>;
  -- link to source review
DEFINE FIELD IF NOT EXISTS customer_name   ON review_response TYPE option<string>;
DEFINE FIELD IF NOT EXISTS platform        ON review_response TYPE string;
  -- 'google' | 'yelp' | 'tripadvisor' | 'internal' | 'doordash' | 'ubereats' | 'grubhub'
DEFINE FIELD IF NOT EXISTS rating          ON review_response TYPE int;
  -- 1-5 stars
DEFINE FIELD IF NOT EXISTS review_text     ON review_response TYPE option<string>;
  -- the customer's review content
DEFINE FIELD IF NOT EXISTS sentiment       ON review_response TYPE string;
  -- 'positive' | 'neutral' | 'negative' | 'mixed'
DEFINE FIELD IF NOT EXISTS themes          ON review_response TYPE option<string>;
  -- comma-separated themes extracted from review
DEFINE FIELD IF NOT EXISTS generated_response ON review_response TYPE option<string>;
  -- AI-generated response text
DEFINE FIELD IF NOT EXISTS brand_voice     ON review_response TYPE option<string>;
  -- 'formal' | 'casual' | 'playful'
DEFINE FIELD IF NOT EXISTS language        ON review_response TYPE option<string>;
  -- 'en' | 'es' | 'fr' | 'de' | etc.
DEFINE FIELD IF NOT EXISTS response_strategy ON review_response TYPE option<string>;
  -- 'thank' | 'address' | 'resolve' | 'invite_back' | 'escalate'
DEFINE FIELD IF NOT EXISTS est_impact_score ON review_response TYPE float DEFAULT 0;
  -- 0-100 predicted impact on customer retention
DEFINE FIELD IF NOT EXISTS description     ON review_response TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON review_response TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON review_response TYPE option<string>;
  -- 'send_now' | 'edit_then_send' | 'escalate_manager' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON review_response TYPE string DEFAULT 'open';
  -- 'open' | 'sent' | 'edited' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS sent_at         ON review_response TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS customer_updated_review ON review_response TYPE option<bool>;
  -- did customer update their review after response?
DEFINE FIELD IF NOT EXISTS detected_at     ON review_response TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON review_response TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_rr_rule_id   ON review_response FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_rr_severity  ON review_response FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_rr_status    ON review_response FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_rr_platform  ON review_response FIELDS platform;

-- Settings
DEFINE FIELD IF NOT EXISTS review_resp_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS review_resp_brand_voice      ON settings TYPE option<string> DEFAULT 'casual';
  -- 'formal' | 'casual' | 'playful'
DEFINE FIELD IF NOT EXISTS review_resp_language          ON settings TYPE option<string> DEFAULT 'en';
DEFINE FIELD IF NOT EXISTS review_resp_max_response_chars ON settings TYPE option<int>   DEFAULT 500;
DEFINE FIELD IF NOT EXISTS review_resp_auto_send_positive ON settings TYPE option<bool>  DEFAULT false;
  -- auto-send responses to 5-star reviews (no edit needed)
