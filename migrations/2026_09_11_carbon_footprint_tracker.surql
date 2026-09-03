-- Migration: 2026_09_11_carbon_footprint_tracker.surql
--
-- AI Restaurant Carbon Footprint Tracker — 90th POSR-exclusive differentiator.
--
-- Research finding: Restaurants emit 3-5 tons CO2/month per location (EPA,
-- NRA Sustainability Report):
--   - Energy (electricity + gas): 40-50% of total emissions (1.5-2.5 tons)
--   - Food supply chain (beef, dairy, imported): 30-40% (1-2 tons)
--   - Delivery vehicles: 10-15% (0.3-0.75 tons)
--   - Waste (food waste + packaging): 5-10% (0.15-0.5 tons)
--   - Water heating + processing: 5% (0.15-0.25 tons)
--
-- EU CSRD (Corporate Sustainability Reporting Directive, 2024) requires
-- carbon reporting for 50,000+ companies. California SB-253 (2026) requires
-- emissions reporting for companies $1B+ revenue. Customers increasingly
-- prefer sustainable restaurants (35% willing to pay 10% more for green,
-- Nielsen Global Sustainability Survey).
--
-- Classic POS systems (Toast, Square, Lightspeed) have ZERO carbon tracking.
-- Third-party carbon calculators (Watershed, Persefoni, Sweep) cost
-- $500-2,000/mo for enterprise — out of reach for independent restaurants.
-- No restaurant-specific carbon tracker exists at any price.
--
-- POSR's existing services cover DIFFERENT sustainability aspects:
--   - energy-optimization.service = ENERGY waste detection (after-hours,
--     peak rate, HVAC drift) — NOT carbon emissions calculation
--   - energy-vampire.service = PHANTOM load detection — NOT carbon tracking
--   - waste-tracking.service = FOOD waste logging — NOT carbon emissions
--   - packaging-optimizer.service = PACKAGING cost optimization — NOT carbon
--   - delivery-route.service = ROUTE optimization — NOT carbon emissions
--
-- This new service TRACKS CARBON FOOTPRINT:
--   - Calculates CO2 emissions from 5 sources (energy, food, delivery,
--     waste, water)
--   - Tracks monthly + annual carbon footprint
--   - Compares to industry benchmarks + net-zero goals
--   - Identifies high-emission areas for reduction
--   - Calculates offset cost ($15-30/ton CO2)
--   - Generates ESG/CSRD compliance reports
--   - Suggests reduction actions with ROI

DEFINE TABLE IF NOT EXISTS carbon_footprint_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON carbon_footprint_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON carbon_footprint_alert TYPE string;
  -- 'high_energy_emissions' | 'high_food_emissions' | 'delivery_carbon_spike' |
  -- 'waste_emissions_high' | 'water_usage_alert' | 'supplier_carbon_heavy' |
  -- 'peak_shift_opportunity' | 'net_zero_gap'
DEFINE FIELD IF NOT EXISTS severity        ON carbon_footprint_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS emission_source ON carbon_footprint_alert TYPE string;
  -- 'energy' | 'food' | 'delivery' | 'waste' | 'water'
DEFINE FIELD IF NOT EXISTS current_co2_kg  ON carbon_footprint_alert TYPE float DEFAULT 0;
  -- current monthly CO2 emissions in kg for this source
DEFINE FIELD IF NOT EXISTS benchmark_co2_kg ON carbon_footprint_alert TYPE option<float>;
  -- industry benchmark for this source
DEFINE FIELD IF NOT EXISTS reduction_potential_kg ON carbon_footprint_alert TYPE option<float>;
  -- kg CO2 that could be reduced
DEFINE FIELD IF NOT EXISTS offset_cost     ON carbon_footprint_alert TYPE option<float>;
  -- $ to offset this emission (at $20/ton)
DEFINE FIELD IF NOT EXISTS est_savings_monthly ON carbon_footprint_alert TYPE float DEFAULT 0;
  -- $ saved by reducing emissions (energy cost + waste cost)
DEFINE FIELD IF NOT EXISTS description     ON carbon_footprint_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON carbon_footprint_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON carbon_footprint_alert TYPE option<string>;
  -- 'reduce_now' | 'offset' | 'switch_supplier' | 'shift_peak' | 'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON carbon_footprint_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON carbon_footprint_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON carbon_footprint_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_carbon_rule      ON carbon_footprint_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_carbon_status    ON carbon_footprint_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_carbon_severity  ON carbon_footprint_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_carbon_source    ON carbon_footprint_alert FIELDS emission_source;

-- Settings (configurable thresholds)
DEFINE FIELD IF NOT EXISTS carbon_ai_enabled       ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS carbon_offset_rate      ON settings TYPE option<float> DEFAULT 20.0;
  -- $ per ton CO2 for offset (default $20/ton)
DEFINE FIELD IF NOT EXISTS carbon_net_zero_year    ON settings TYPE option<int> DEFAULT 2030;
  -- target year for net-zero emissions
DEFINE FIELD IF NOT EXISTS carbon_monthly_goal_kg  ON settings TYPE option<int> DEFAULT 2500;
  -- monthly CO2 goal in kg (default 2,500 kg = 2.5 tons)
DEFINE FIELD IF NOT EXISTS carbon_energy_kwh_rate  ON settings TYPE option<float> DEFAULT 0.4;
  -- kg CO2 per kWh (grid average, varies by region)
