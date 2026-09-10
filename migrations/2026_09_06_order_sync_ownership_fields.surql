-- PosStore terminal sync: ownership + versioning fields on the SCHEMAFULL
-- `order` table. Without these definitions Surreal silently drops the values,
-- so the gateway NOT_OWNER check never fires and snapshot hydration hands every
-- order to the terminal with an empty owner.

DEFINE FIELD IF NOT EXISTS owner_terminal_id ON order TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS owner_heartbeat_at ON order TYPE option<datetime|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS server_version ON order TYPE option<int|null> DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS deleted_at ON order TYPE option<datetime|null> PERMISSIONS FULL;
