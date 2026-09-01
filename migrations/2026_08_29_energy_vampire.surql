-- Migration: 2026_08_29_energy_vampire.surql
--
-- AI Energy Vampire Detector — 50th POSR-exclusive differentiator.
--
-- Research finding: Restaurants waste 5-10% of electricity on "vampire" /
-- "phantom" loads — equipment drawing power when OFF or in standby
-- (DOE Energy Star, NRCan). $300-$1,200/year per location lost to:
--   - Displays on POS terminals glowing 24/7
--   - Idle kitchen equipment (microwaves, coffee warmers, ice makers)
--   - chargers left plugged in
--   - "smart" appliances that never truly sleep
--   - Old equipment with broken sleep mode
--
-- Toast, Square, Lightspeed have ZERO energy tracking. POSR's existing
-- energy-optimization.service detects equipment LEFT ON during inactive
-- hours — but does NOT detect STANDBY VAMPIRE DRAIN (devices that are
-- "off" but still drawing phantom load 24/7).
--
-- Distinct from:
--   - energy-optimization.service (AFTER_HOURS_CONSUMPTION = equipment
--     LEFT ON; EQUIPMENT_LEFT_ON = usage when no orders — neither detects
--     STANDBY phantom load when equipment is OFF)
--   - food-safety.service (HACCP temp logs — not energy)
--   - equipment-maintenance (none exists yet — but this is energy, not repair)
--
-- This service detects BASELINE LOAD when restaurant is CLOSED, identifies
-- which devices contribute to phantom drain, calculates annual waste,
-- recommends smart plugs / timers / replacement.

DEFINE TABLE IF NOT EXISTS energy_vampire_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON energy_vampire_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id        ON energy_vampire_alert TYPE string;
  -- 'standby_phantom_load' | 'always_on_candidate' | 'inefficient_aging' | 'unplug_opportunity' | 'smart_plug_roi'
DEFINE FIELD IF NOT EXISTS severity       ON energy_vampire_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS equipment_name ON energy_vampire_alert TYPE option<string>;
  -- inferred equipment name (e.g. "POS Terminal 3", "Microwave", "Coffee Warmer")
DEFINE FIELD IF NOT EXISTS location        ON energy_vampire_alert TYPE option<string>;
  -- where the equipment is located
DEFINE FIELD IF NOT EXISTS standby_watts  ON energy_vampire_alert TYPE float DEFAULT 0;
  -- watts drawn when "off"
DEFINE FIELD IF NOT EXISTS annual_kwh     ON energy_vampire_alert TYPE float DEFAULT 0;
  -- annual kWh wasted
DEFINE FIELD IF NOT EXISTS annual_cost     ON energy_vampire_alert TYPE float DEFAULT 0;
  -- $ wasted per year
DEFINE FIELD IF NOT EXISTS co2_kg_per_year ON energy_vampire_alert TYPE float DEFAULT 0;
  -- environmental impact
DEFINE FIELD IF NOT EXISTS smart_plug_cost ON energy_vampire_alert TYPE option<float>;
  -- cost to install smart plug
DEFINE FIELD IF NOT EXISTS payback_months  ON energy_vampire_alert TYPE option<float>;
  -- ROI payback period
DEFINE FIELD IF NOT EXISTS description     ON energy_vampire_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON energy_vampire_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON energy_vampire_alert TYPE option<string>;
  -- 'install_smart_plug' | 'unplug_overnight' | 'replace_equipment' | 'enable_sleep_mode' | 'monitor'
DEFINE FIELD IF NOT EXISTS status          ON energy_vampire_alert TYPE string DEFAULT 'open';
  -- 'open' | 'mitigated' | 'declined' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON energy_vampire_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON energy_vampire_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_eva_rule_id   ON energy_vampire_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_eva_severity  ON energy_vampire_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_eva_status    ON energy_vampire_alert FIELDS status;

-- Settings
DEFINE FIELD IF NOT EXISTS vampire_ai_enabled       ON settings TYPE option<bool>  DEFAULT true;
DEFINE FIELD IF NOT EXISTS vampire_electricity_rate ON settings TYPE option<float> DEFAULT 0.12;
  -- $/kWh (US avg $0.12)
DEFINE FIELD IF NOT EXISTS vampire_min_standby_watts ON settings TYPE option<float> DEFAULT 5;
  -- minimum standby draw to flag (5W threshold)
DEFINE FIELD IF NOT EXISTS vampire_closed_hours_start ON settings TYPE option<int> DEFAULT 23;
  -- restaurant closes at 23:00
