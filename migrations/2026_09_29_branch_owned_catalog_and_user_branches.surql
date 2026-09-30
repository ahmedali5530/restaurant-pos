-- Phase 6/7: document branch scoping on cloud catalog + multi-branch users.
-- sync-service also DEFINE FIELD IF NOT EXISTS at runtime on master.

DEFINE FIELD IF NOT EXISTS branch_id ON menu_item TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON category TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON menu TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON tax TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON payment_type TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON order_type TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON extra TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON coupon TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON modifier_group TYPE option<string|null> PERMISSIONS FULL;
DEFINE FIELD IF NOT EXISTS branch_id ON discount TYPE option<string|null> PERMISSIONS FULL;

-- Empty / NONE = shared (all branches). Non-empty = only those SYNC_CLIENT_IDs.
DEFINE FIELD IF NOT EXISTS branch_ids ON user TYPE option<array<string>|null> PERMISSIONS FULL;
