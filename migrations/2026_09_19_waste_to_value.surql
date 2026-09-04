-- Migration: 2026_09_19_waste_to_value.surql
--
-- AI Restaurant Waste-to-Value Converter — 98th POSR-exclusive differentiator.
--
-- Research finding: Restaurants generate 25-50% food waste (NRA, ReFED).
-- 95% goes to landfill — only 5% is repurposed. But 60-70% of "waste" can
-- be converted to value:
--   - Vegetable scraps → stock/soup bases ($200-500/mo saved on stock)
--   - Meat trimmings → pâté, terrines, pet food ($100-300/mo)
--   - Day-old bread → croutons, bread pudding, breadcrumbs ($50-150/mo)
--   - Coffee grounds → compost/garden fertilizer (eco value + marketing)
--   - Used cooking oil → biodiesel conversion ($50-200/mo revenue)
--   - Fruit peels → infused waters, vinegars, garnishes ($30-100/mo)
--   - Excess prep food → staff meals (already done but not tracked)
--   - Packaging waste → recycling programs ($20-50/mo rebates)
-- Total potential: $500-2,000/mo per location from waste conversion.
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO waste-to-value.
-- waste-tracking.service logs what's thrown away — doesn't suggest reuse.
-- Third-party waste management (Leanpath, Winnow) cost $300-500/mo and only
-- track waste, don't suggest conversion. No restaurant-specific waste-to-value
-- converter exists at any price.
--
-- POSR's existing services:
--   - waste-tracking.service = LOGS waste (item, time, reason, quantity) — NOT
--     conversion/reuse suggestions
--   - spoilage-prediction.service = PREDICTS shelf-life — NOT repurposing
--   - carbon-footprint-tracker.service = TRACKS CO2 — NOT waste value recovery
--   - recipe-substitution.service = SUGGESTS ingredient swaps — NOT waste reuse
--   - recipe-scaling.service = BATCH scaling — NOT waste conversion
--
-- This new service CONVERTS WASTE TO VALUE:
--   - Identifies reusable food scraps (stock bases, repurposing)
--   - Flags compost-eligible waste (eco value + marketing)
--   - Identifies donation-eligible excess food (tax deductions)
--   - Suggests animal feed partnerships (local farms)
--   - Tracks biogas/biodiesel opportunities (cooking oil)
--   - Recommends leftover repurposing recipes
--   - Identifies packaging recycling programs
--   - Calculates total value recovery potential

DEFINE TABLE IF NOT EXISTS waste_value_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON waste_value_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON waste_value_alert TYPE string;
  -- 'food_scrap_reuse' | 'compost_opportunity' | 'donation_eligible' |
--   'animal_feed_partner' | 'biogas_biodiesel' | 'stock_base_creation' |
--   'leftover_repurposing' | 'packaging_recycle'
DEFINE FIELD IF NOT EXISTS severity        ON waste_value_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS waste_item      ON waste_value_alert TYPE string;
  -- name of waste item
DEFINE FIELD IF NOT EXISTS waste_quantity_kg ON waste_value_alert TYPE option<float>;
  -- kg per month of this waste item
DEFINE FIELD IF NOT EXISTS current_disposal ON waste_value_alert TYPE option<string>;
  -- 'landfill' | 'compost' | 'donation' | 'recycle' | 'repurpose'
DEFINE FIELD IF NOT EXISTS suggested_use   ON waste_value_alert TYPE option<string>;
  -- specific reuse suggestion
DEFINE FIELD IF NOT EXISTS est_value_recovery ON waste_value_alert TYPE float DEFAULT 0;
  -- $ monthly value recovered by conversion
DEFINE FIELD IF NOT EXISTS eco_impact_kg_co2 ON waste_value_alert TYPE option<float>;
  -- kg CO2 saved by not landfilling
DEFINE FIELD IF NOT EXISTS tax_deduction_value ON waste_value_alert TYPE option<float>;
  -- $ tax deduction if donated
DEFINE FIELD IF NOT EXISTS description     ON waste_value_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON waste_value_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON waste_value_alert TYPE option<string>;
  -- 'repurpose_now' | 'setup_compost' | 'contact_charity' | 'partner_farm' |
--   'schedule_biodiesel' | 'create_recipe' | 'enroll_recycling' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON waste_value_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON waste_value_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON waste_value_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_waste_value_rule      ON waste_value_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_waste_value_status    ON waste_value_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_waste_value_severity  ON waste_value_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_waste_value_item      ON waste_value_alert FIELDS waste_item;

-- Settings
DEFINE FIELD IF NOT EXISTS waste_value_ai_enabled    ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS waste_value_landfill_rate ON settings TYPE option<float> DEFAULT 0.12;
  -- $ per kg landfill disposal cost (default $0.12/kg)
DEFINE FIELD IF NOT EXISTS waste_value_compost_rate  ON settings TYPE option<float> DEFAULT 0.05;
  -- $ per kg compost value (default $0.05/kg)
DEFINE FIELD IF NOT EXISTS waste_value_tax_deduction_pct ON settings TYPE option<float> DEFAULT 21.0;
  -- corporate tax rate for donation deduction calculation
