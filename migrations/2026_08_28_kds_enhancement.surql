-- Migration: 2026_08_28_kds_enhancement.surql
--
-- Kitchen Display System (KDS) enhancement — aging colors, bump-bar, expeditor.
--
-- Research finding: Toast KDS costs $69+/mo per station. Square KDS gated to
-- higher tier. Lightspeed KDS Pro is an add-on. POSR offers the same UX free
-- (with a cheap tablet + $15 USB keypad instead of $100+ Toast bump-bar).
--
-- Adds settings fields for KDS customization (operator-tunable):
--   - kds_fresh_minutes        — green threshold (default 5)
--   - kds_aging_minutes        — yellow threshold (default 10)
--   - kds_critical_minutes     — red threshold (default 15)
--   - kds_sound_enabled        — play sound on new order (default true)
--   - kds_bumpbar_enabled      — enable keyboard navigation (default true)
--   - kds_expeditor_mode       — combine all stations into one board
--   - kds_auto_bump            — auto-bump ticket when all items ready
--   - kds_recall_window_seconds— undo window for accidental bumps (default 30)
--   - kds_show_station_names   — display kitchen names on tickets
--   - kds_compact_mode         — smaller card layout for more tickets on screen
--
-- No new tables — KDS reads from order_item_kitchen (existing).

-- ---------------------------------------------------------------------------
-- Settings fields
-- ---------------------------------------------------------------------------
DEFINE FIELD IF NOT EXISTS kds_fresh_minutes           ON settings TYPE option<int> DEFAULT 5;
DEFINE FIELD IF NOT EXISTS kds_aging_minutes           ON settings TYPE option<int> DEFAULT 10;
DEFINE FIELD IF NOT EXISTS kds_critical_minutes        ON settings TYPE option<int> DEFAULT 15;
DEFINE FIELD IF NOT EXISTS kds_sound_enabled            ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS kds_bumpbar_enabled          ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS kds_expeditor_mode           ON settings TYPE option<bool> DEFAULT false;
DEFINE FIELD IF NOT EXISTS kds_auto_bump               ON settings TYPE option<bool> DEFAULT false;
DEFINE FIELD IF NOT EXISTS kds_recall_window_seconds    ON settings TYPE option<int> DEFAULT 30;
DEFINE FIELD IF NOT EXISTS kds_show_station_names       ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS kds_compact_mode             ON settings TYPE option<bool> DEFAULT false;

-- ---------------------------------------------------------------------------
-- KDS event log — optional audit trail for stats + bottleneck detection.
-- Lightweight: only writes on state transitions (bump/recall/expire).
-- ---------------------------------------------------------------------------
DEFINE TABLE IF NOT EXISTS kds_event TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id          ON kds_event TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS event_type  ON kds_event TYPE string;
  -- 'bumped' | 'recalled' | 'expired' | 'auto_bumped' | 'recalled_undo'
DEFINE FIELD IF NOT EXISTS order_id    ON kds_event TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS kitchen_id  ON kds_event TYPE option<record<kitchen>>;
DEFINE FIELD IF NOT EXISTS station_name ON kds_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS prep_minutes ON kds_event TYPE option<float>;
DEFINE FIELD IF NOT EXISTS user         ON kds_event TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS created_at   ON kds_event TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_kds_event_type      ON kds_event FIELDS event_type;
DEFINE INDEX IF NOT EXISTS idx_kds_event_kitchen    ON kds_event FIELDS kitchen_id;
DEFINE INDEX IF NOT EXISTS idx_kds_event_created_at ON kds_event FIELDS created_at;

-- ---------------------------------------------------------------------------
-- Helper query: per-station stats for today
-- ---------------------------------------------------------------------------
-- Usage from service:
--   SELECT
--     kitchen_id,
--     count(IF event_type = 'bumped' THEN 1 END) AS completed_today,
--     count(IF event_type = 'recalled' THEN 1 END) AS recalled_today,
--     math::mean(IF event_type = 'bumped' AND prep_minutes != NONE THEN prep_minutes END) AS avg_prep_minutes
--   FROM kds_event
--   WHERE created_at > $today_start
--   GROUP BY kitchen_id;
