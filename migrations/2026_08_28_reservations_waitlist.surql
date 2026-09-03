-- Migration: 2026_08_28_reservations_waitlist.surql
--
-- Reservation & Waitlist module — table booking + walk-in waitlist management.
--
-- Research finding: OpenTable charges $300+/mo, Toast Waitlist $50/mo,
-- Resy $249/mo. POSR offers it free — the last major competitive gap.
--
-- Tables:
--   1. reservation — table reservations (date, time, party size, customer)
--   2. waitlist_entry — walk-in waitlist (name, party size, quoted wait)
--   3. reservation_table — links reservation to floor_table (table assignment)

-- ---------------------------------------------------------------------------
-- reservation — table reservations
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS reservation TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON reservation TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer     ON reservation TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS customer_name ON reservation TYPE string;
DEFINE FIELD IF NOT EXISTS customer_phone ON reservation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS customer_email ON reservation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS party_size   ON reservation TYPE int;
DEFINE FIELD IF NOT EXISTS date         ON reservation TYPE datetime;
  -- Reservation date + time (when the party plans to arrive)
DEFINE FIELD IF NOT EXISTS end_time     ON reservation TYPE option<datetime>;
  -- Expected end time (for table turnover planning)
DEFINE FIELD IF NOT EXISTS table        ON reservation TYPE option<record<floor_table>>;
  -- Assigned table (null if not yet assigned)
DEFINE FIELD IF NOT EXISTS floor        ON reservation TYPE option<record<floor>>;
DEFINE FIELD IF NOT EXISTS status       ON reservation TYPE string DEFAULT 'pending';
  -- 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show'
DEFINE FIELD IF NOT EXISTS source       ON reservation TYPE string DEFAULT 'phone';
  -- 'phone' | 'walk_in' | 'online' | 'third_party'
DEFINE FIELD IF NOT EXISTS notes        ON reservation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS special_requests ON reservation TYPE option<string>;
  -- e.g. "birthday", "window seat", "high chair"
DEFINE FIELD IF NOT EXISTS created_at   ON reservation TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS created_by   ON reservation TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS confirmed_at  ON reservation TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS seated_at     ON reservation TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS completed_at  ON reservation TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS cancelled_at  ON reservation TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS cancelled_reason ON reservation TYPE option<string>;
DEFINE FIELD IF NOT EXISTS branch_id     ON reservation TYPE option<record<inventory_store>>;
DEFINE FIELD IF NOT EXISTS reminder_sent ON reservation TYPE bool DEFAULT false;
  -- SMS reminder sent (reuse marketing service)

DEFINE INDEX IF NOT EXISTS reservation_date ON reservation FIELDS date;
DEFINE INDEX IF NOT EXISTS reservation_status ON reservation FIELDS status;
DEFINE INDEX IF NOT EXISTS reservation_customer ON reservation FIELDS customer;
DEFINE INDEX IF NOT EXISTS reservation_phone ON reservation FIELDS customer_phone;
DEFINE INDEX IF NOT EXISTS reservation_branch ON reservation FIELDS branch_id;
DEFINE INDEX IF NOT EXISTS reservation_table ON reservation FIELDS table;

-- ---------------------------------------------------------------------------
-- waitlist_entry — walk-in waitlist
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS waitlist_entry TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON waitlist_entry TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer_name ON waitlist_entry TYPE string;
DEFINE FIELD IF NOT EXISTS customer_phone ON waitlist_entry TYPE option<string>;
DEFINE FIELD IF NOT EXISTS party_size   ON waitlist_entry TYPE int;
DEFINE FIELD IF NOT EXISTS quoted_wait_minutes ON waitlist_entry TYPE int DEFAULT 15;
  -- Estimated wait time when added to list
DEFINE FIELD IF NOT EXISTS actual_wait_minutes ON waitlist_entry TYPE option<int>;
  -- Actual wait time (for analytics)
DEFINE FIELD IF NOT EXISTS status       ON waitlist_entry TYPE string DEFAULT 'waiting';
  -- 'waiting' | 'called' | 'seated' | 'left' | 'no_show'
DEFINE FIELD IF NOT EXISTS table        ON waitlist_entry TYPE option<record<floor_table>>;
  -- Assigned table when seated
DEFINE FIELD IF NOT EXISTS floor        ON waitlist_entry TYPE option<record<floor>>;
DEFINE FIELD IF NOT EXISTS added_at     ON waitlist_entry TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS called_at    ON waitlist_entry TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS seated_at    ON waitlist_entry TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS left_at      ON waitlist_entry TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS left_reason  ON waitlist_entry TYPE option<string>;
  -- 'waited_too_long' | 'changed_mind' | 'other'
DEFINE FIELD IF NOT EXISTS notes        ON waitlist_entry TYPE option<string>;
DEFINE FIELD IF NOT EXISTS branch_id     ON waitlist_entry TYPE option<record<inventory_store>>;
DEFINE FIELD IF NOT EXISTS added_by      ON waitlist_entry TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS notification_sent ON waitlist_entry TYPE bool DEFAULT false;
  -- SMS "your table is ready" sent

DEFINE INDEX IF NOT EXISTS waitlist_status ON waitlist_entry FIELDS status;
DEFINE INDEX IF NOT EXISTS waitlist_added_at ON waitlist_entry FIELDS added_at;
DEFINE INDEX IF NOT EXISTS waitlist_branch ON waitlist_entry FIELDS branch_id;

-- ---------------------------------------------------------------------------
-- reservation_table — table assignment history (for turnover analytics)
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS reservation_table TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON reservation_table TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS reservation   ON reservation_table TYPE option<record<reservation>>;
DEFINE FIELD IF NOT EXISTS waitlist_entry ON reservation_table TYPE option<record<waitlist_entry>>;
DEFINE FIELD IF NOT EXISTS table        ON reservation_table TYPE record<floor_table>;
DEFINE FIELD IF NOT EXISTS assigned_at   ON reservation_table TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS assigned_by   ON reservation_table TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS cleared_at     ON reservation_table TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS party_size    ON reservation_table TYPE int;

DEFINE INDEX IF NOT EXISTS reservation_table_table ON reservation_table FIELDS table;
DEFINE INDEX IF NOT EXISTS reservation_table_reservation ON reservation_table FIELDS reservation;
DEFINE INDEX IF NOT EXISTS reservation_table_waitlist ON reservation_table FIELDS waitlist_entry;
