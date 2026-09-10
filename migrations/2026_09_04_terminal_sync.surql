-- Initial PosStore sync table stubs. A follow-up migration resets any leftover
-- SCHEMAFULL definitions from earlier sync experiments.

DEFINE TABLE IF NOT EXISTS sync_terminal SCHEMALESS;
DEFINE TABLE IF NOT EXISTS sync_event SCHEMALESS;
DEFINE TABLE IF NOT EXISTS sync_event_seq SCHEMALESS;
DEFINE TABLE IF NOT EXISTS sync_accepted_operation SCHEMALESS;
DEFINE TABLE IF NOT EXISTS sync_conflict SCHEMALESS;
DEFINE TABLE IF NOT EXISTS sync_number_reservation SCHEMALESS;
DEFINE TABLE IF NOT EXISTS sync_number_counter SCHEMALESS;
