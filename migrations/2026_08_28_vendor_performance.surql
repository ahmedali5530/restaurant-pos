-- Migration: 2026_08_28_vendor_performance.surql
--
-- AI Vendor Performance Analysis — supplier scoring + recommendations.
--
-- Research finding: Square Vendor Management $40/mo, Toast Supplier
-- Management add-on. POSR offers it free — analyzes supplier performance
-- (on-time delivery, quality, price competitiveness) + AI generates
-- recommendations (renegotiate, diversify, consolidate, drop).
--
-- Tables:
--   1. vendor_performance — cached per-supplier scorecard (24h TTL)
--   2. vendor_insight — AI-generated insights + recommendations
--
-- Metrics per supplier:
--   - On-time delivery rate: % POs fulfilled before due_date
--   - Quality score: 1 - (returns / total_orders), 0-1
--   - Price competitiveness: avg unit cost vs market median (computed)
--   - Order accuracy: 1 - (amendments / total_orders), 0-1
--   - Total spend (last N days)
--   - Total orders count
--   - Avg lead time (days from submitted_at to fulfilled)
--   - Return rate (% orders with returns)
--   - Waste attribution ($ waste from items supplied by this vendor)
--
-- Overall score (0-100, weighted):
--   on-time (30%) + quality (25%) + price (20%) + accuracy (15%) + volume (10%)
--
-- Grade: A (>= 85), B (70-84), C (55-69), D (40-54), F (< 40)
--
-- Recommendations (AI):
--   - 'renegotiate' — high volume + high price → ask for discount
--   - 'diversify'   — single-source risk (no backup supplier for critical items)
--   - 'consolidate' — many small orders → consolidate to fewer, larger POs
--   - 'drop'        — poor performance + low volume → find alternative
--   - 'keep'        — good performance, maintain relationship
--   - 'monitor'    — borderline performance, watch closely

-- ---------------------------------------------------------------------------
-- vendor_performance — cached per-supplier scorecard
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS vendor_performance TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON vendor_performance TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS supplier       ON vendor_performance TYPE option<record<inventory_supplier>>;
DEFINE FIELD IF NOT EXISTS supplier_id     ON vendor_performance TYPE string;
DEFINE FIELD IF NOT EXISTS supplier_name   ON vendor_performance TYPE string;
DEFINE FIELD IF NOT EXISTS period_start    ON vendor_performance TYPE datetime;
DEFINE FIELD IF NOT EXISTS period_end       ON vendor_performance TYPE datetime;
DEFINE FIELD IF NOT EXISTS total_orders    ON vendor_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS fulfilled_orders ON vendor_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS on_time_orders  ON vendor_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS on_time_rate    ON vendor_performance TYPE float DEFAULT 0;
  -- 0-1 (% POs fulfilled before due_date)
DEFINE FIELD IF NOT EXISTS returned_orders ON vendor_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS return_rate     ON vendor_performance TYPE float DEFAULT 0;
  -- 0-1 (% orders with returns)
DEFINE FIELD IF NOT EXISTS quality_score   ON vendor_performance TYPE float DEFAULT 0;
  -- 1 - return_rate, 0-1
DEFINE FIELD IF NOT EXISTS amendments_count ON vendor_performance TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS accuracy_score   ON vendor_performance TYPE float DEFAULT 0;
  -- 1 - (amendments / total_orders), 0-1
DEFINE FIELD IF NOT EXISTS avg_lead_days   ON vendor_performance TYPE float DEFAULT 0;
  -- Avg days from submitted_at to fulfilled_at
DEFINE FIELD IF NOT EXISTS total_spend     ON vendor_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS avg_order_value  ON vendor_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS unique_items     ON vendor_performance TYPE int DEFAULT 0;
  -- How many distinct items this supplier provides
DEFINE FIELD IF NOT EXISTS avg_unit_cost    ON vendor_performance TYPE float DEFAULT 0;
DEFINE FIELD IF NOT EXISTS price_competitiveness ON vendor_performance TYPE float DEFAULT 0;
  -- 0-1 (1 = cheapest among suppliers for same items)
DEFINE FIELD IF NOT EXISTS waste_attributed ON vendor_performance TYPE float DEFAULT 0;
  -- $ waste from items supplied by this vendor
DEFINE FIELD IF NOT EXISTS overall_score    ON vendor_performance TYPE float DEFAULT 0;
  -- 0-100 weighted
DEFINE FIELD IF NOT EXISTS grade           ON vendor_performance TYPE string DEFAULT 'C';
  -- A/B/C/D/F
DEFINE FIELD IF NOT EXISTS trend_direction ON vendor_performance TYPE string DEFAULT 'stable';
  -- 'improving' | 'declining' | 'stable'
DEFINE FIELD IF NOT EXISTS generated_at     ON vendor_performance TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at       ON vendor_performance TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_vp_supplier_id ON vendor_performance FIELDS supplier_id;
DEFINE INDEX IF NOT EXISTS idx_vp_grade       ON vendor_performance FIELDS grade;
DEFINE INDEX IF NOT EXISTS idx_vp_overall     ON vendor_performance FIELDS overall_score;

-- ---------------------------------------------------------------------------
-- vendor_insight — AI-generated insights + recommendations
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS vendor_insight TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON vendor_insight TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS supplier       ON vendor_insight TYPE option<record<inventory_supplier>>;
DEFINE FIELD IF NOT EXISTS supplier_id     ON vendor_insight TYPE string;
DEFINE FIELD IF NOT EXISTS supplier_name   ON vendor_insight TYPE string;
DEFINE FIELD IF NOT EXISTS recommendation  ON vendor_insight TYPE string;
  -- 'renegotiate' | 'diversify' | 'consolidate' | 'drop' | 'keep' | 'monitor'
DEFINE FIELD IF NOT EXISTS insight_text    ON vendor_insight TYPE string;
  -- Human-readable insight (max 300 chars)
DEFINE FIELD IF NOT EXISTS action          ON vendor_insight TYPE option<string>;
  -- Concrete next step (max 200 chars)
DEFINE FIELD IF NOT EXISTS projected_savings ON vendor_insight TYPE option<float>;
  -- Estimated annual savings if action taken
DEFINE FIELD IF NOT EXISTS confidence      ON vendor_insight TYPE float DEFAULT 0.7;
  -- 0-1
DEFINE FIELD IF NOT EXISTS priority        ON vendor_insight TYPE string DEFAULT 'medium';
  -- 'low' | 'medium' | 'high'
DEFINE FIELD IF NOT EXISTS status          ON vendor_insight TYPE string DEFAULT 'open';
  -- 'open' | 'acknowledged' | 'acted_on' | 'dismissed'
DEFINE FIELD IF NOT EXISTS generated_at    ON vendor_insight TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON vendor_insight TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_vi_supplier_id  ON vendor_insight FIELDS supplier_id;
DEFINE INDEX IF NOT EXISTS idx_vi_recommendation ON vendor_insight FIELDS recommendation;
DEFINE INDEX IF NOT EXISTS idx_vi_priority      ON vendor_insight FIELDS priority;
DEFINE INDEX IF NOT EXISTS idx_vi_status        ON vendor_insight FIELDS status;

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS vendor_perf_lookback_days   ON settings TYPE option<int> DEFAULT 90;
DEFINE FIELD IF NOT EXISTS vendor_perf_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS vendor_perf_min_orders      ON settings TYPE option<int> DEFAULT 3;
  -- Min orders in period to evaluate a supplier (default: 3+)
DEFINE FIELD IF NOT EXISTS vendor_perf_critical_items_only ON settings TYPE option<bool> DEFAULT false;
  -- When true, only analyze suppliers providing critical items (high-volume or high-cost)
