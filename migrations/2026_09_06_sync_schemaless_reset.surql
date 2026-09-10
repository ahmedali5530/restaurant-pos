-- Wipe leftover SCHEMAFULL sync protocol definitions from the WASM-era
-- experiment and recreate SCHEMALESS tables for the PosStore gateway protocol.
-- sync_* rows are protocol bookkeeping only; terminals re-handshake + snapshot.

REMOVE TABLE IF EXISTS sync_terminal;
REMOVE TABLE IF EXISTS sync_event;
REMOVE TABLE IF EXISTS sync_event_seq;
REMOVE TABLE IF EXISTS sync_accepted_operation;
REMOVE TABLE IF EXISTS sync_conflict;
REMOVE TABLE IF EXISTS sync_number_reservation;
REMOVE TABLE IF EXISTS sync_number_counter;
REMOVE TABLE IF EXISTS sync_operation;
REMOVE TABLE IF EXISTS sync_financial_event;
REMOVE TABLE IF EXISTS sync_aggregate_version;
REMOVE TABLE IF EXISTS sync_cursor;
REMOVE TABLE IF EXISTS sync_array_test;

DEFINE TABLE sync_terminal SCHEMALESS;
DEFINE TABLE sync_event SCHEMALESS;
DEFINE TABLE sync_event_seq SCHEMALESS;
DEFINE TABLE sync_accepted_operation SCHEMALESS;
DEFINE TABLE sync_conflict SCHEMALESS;
DEFINE TABLE sync_number_reservation SCHEMALESS;
DEFINE TABLE sync_number_counter SCHEMALESS;

DEFINE INDEX IF NOT EXISTS sync_terminal_terminal_id ON sync_terminal FIELDS terminal_id UNIQUE;
DEFINE INDEX IF NOT EXISTS sync_event_event_id ON sync_event FIELDS event_id UNIQUE;
DEFINE INDEX IF NOT EXISTS sync_accepted_operation_id ON sync_accepted_operation FIELDS operation_id UNIQUE;
DEFINE INDEX IF NOT EXISTS sync_number_reservation_id ON sync_number_reservation FIELDS reservation_id UNIQUE;
