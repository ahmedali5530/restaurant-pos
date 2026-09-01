-- Migration: 2026_08_28_menu_pairing.surql
--
-- AI Menu Pairing Engine — 16th POSR-exclusive differentiator.
--
-- Research finding: Restaurants miss 40% of upsell opportunities because
-- staff don't know what to suggest. Toast and Square have STATIC "add-on"
-- config (manual lists). POSR generates DYNAMIC pairing suggestions from
-- actual co-purchase patterns + AI reasoning — "customers who ordered X
-- also ordered Y" with confidence scores.
--
-- Distinct from upsell-analytics.service (which MEASURES effectiveness of
-- existing upsells). This service GENERATES new pairing recommendations
-- that didn't exist before.
--
-- Algorithm:
--   1. Market basket analysis: find item pairs that co-occur in same order
--      more often than random chance (lift > 1)
--   2. Confidence: P(Y | X) = count(X,Y) / count(X)
--   3. Lift: confidence / P(Y) — how much more likely Y is given X
--   4. Filter: min support (co-occurrence count), min confidence, lift > 1
--   5. AI enhancement: per-pair reasoning ("why these go together") +
--      suggested pitch script for staff
--   6. Tier: 'classic' (top 10% confidence) | 'strong' (lift > 2) |
--      'opportunity' (untapped — high lift, low adoption)

DEFINE TABLE IF NOT EXISTS menu_pairing TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON menu_pairing TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS primary_item    ON menu_pairing TYPE option<record<menu_item>>;
DEFINE FIELD IF NOT EXISTS primary_item_name ON menu_pairing TYPE string;
DEFINE FIELD IF NOT EXISTS primary_category ON menu_pairing TYPE option<string>;
DEFINE FIELD IF NOT EXISTS paired_item     ON menu_pairing TYPE option<record<menu_item>>;
DEFINE FIELD IF NOT EXISTS paired_item_name ON menu_pairing TYPE string;
DEFINE FIELD IF NOT EXISTS paired_category ON menu_pairing TYPE option<string>;
DEFINE FIELD IF NOT EXISTS co_occurrence_count ON menu_pairing TYPE int;
  -- number of orders containing both items
DEFINE FIELD IF NOT EXISTS primary_count    ON menu_pairing TYPE int;
  -- number of orders containing primary_item
DEFINE FIELD IF NOT EXISTS paired_count     ON menu_pairing TYPE int;
  -- number of orders containing paired_item
DEFINE FIELD IF NOT EXISTS confidence      ON menu_pairing TYPE float;
  -- P(paired | primary) = co_occurrence / primary_count (0-1)
DEFINE FIELD IF NOT EXISTS lift             ON menu_pairing TYPE float;
  -- confidence / P(paired) — >1 means positive correlation
DEFINE FIELD IF NOT EXISTS support         ON menu_pairing TYPE float;
  -- co_occurrence / total_orders (frequency of pair)
DEFINE FIELD IF NOT EXISTS tier             ON menu_pairing TYPE string;
  -- 'classic' | 'strong' | 'opportunity'
DEFINE FIELD IF NOT EXISTS est_revenue_lift ON menu_pairing TYPE float DEFAULT 0;
  -- estimated $/month if pairing actively promoted (based on confidence × primary sales × paired price)
DEFINE FIELD IF NOT EXISTS ai_reasoning     ON menu_pairing TYPE option<string>;
  -- max 200 chars — why these go together
DEFINE FIELD IF NOT EXISTS ai_pitch_script  ON menu_pairing TYPE option<string>;
  -- max 150 chars — ready-to-say script for staff
DEFINE FIELD IF NOT EXISTS analyzed_at      ON menu_pairing TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id        ON menu_pairing TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS idx_mp_primary   ON menu_pairing FIELDS primary_item;
DEFINE INDEX IF NOT EXISTS idx_mp_paired   ON menu_pairing FIELDS paired_item;
DEFINE INDEX IF NOT EXISTS idx_mp_tier      ON menu_pairing FIELDS tier;
DEFINE INDEX IF NOT EXISTS idx_mp_lift      ON menu_pairing FIELDS lift;
DEFINE INDEX IF NOT EXISTS idx_mp_confidence ON menu_pairing FIELDS confidence;

-- Settings
DEFINE FIELD IF NOT EXISTS pairing_ai_enabled        ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS pairing_lookback_days      ON settings TYPE option<int>   DEFAULT 90;
  -- 3 months of order history
DEFINE FIELD IF NOT EXISTS pairing_min_support        ON settings TYPE option<int>   DEFAULT 5;
  -- need 5+ co-occurrences to consider a pair
DEFINE FIELD IF NOT EXISTS pairing_min_confidence     ON settings TYPE option<float> DEFAULT 0.05;
  -- 5% confidence threshold (paired in 5%+ of primary orders)
DEFINE FIELD IF NOT EXISTS pairing_min_lift            ON settings TYPE option<float> DEFAULT 1.2;
  -- lift > 1.2 means meaningful correlation (20% above random)
DEFINE FIELD IF NOT EXISTS pairing_max_results        ON settings TYPE option<int>   DEFAULT 50;
  -- cap at 50 pairings per analysis
