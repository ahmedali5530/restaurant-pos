-- Per-dish: prompt for quantity after scan/tap on Menu and Quick Order.
-- Null/false = add qty 1 immediately (default). True = show qty dialog first.
DEFINE FIELD IF NOT EXISTS ask_quantity ON menu_item TYPE option<bool|null> PERMISSIONS FULL;
