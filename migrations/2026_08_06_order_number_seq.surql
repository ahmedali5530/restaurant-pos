-- Atomic counters for POS invoice_number (per business day) and global auto_id.
-- Prevents concurrent order creates (double-click / multi-tab) from sharing numbers.

DEFINE TABLE IF NOT EXISTS order_number_seq TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS value ON order_number_seq TYPE int DEFAULT 0 PERMISSIONS FULL;

-- Seed auto_id counter to current max so next allocate is max+1.
LET $max_auto = (
  SELECT math::max(auto_id) AS max_value FROM order GROUP ALL
)[0].max_value OR 0;

UPSERT order_number_seq:auto_id SET value = math::floor($max_auto OR 0);
