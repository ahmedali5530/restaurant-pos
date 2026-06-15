-- Per-user KDS completion for multi-stage kitchen workflow.
-- `completed_by` tracks which users have cleared a kitchen row from their own
-- screen, so one user completing a dish does not remove it from another user's
-- KDS. The global `status`/`completed_at`/`user` fields still drive workflow
-- advancement (the first completer advances the dish to the next station).

DEFINE FIELD OVERWRITE completed_by ON TABLE order_item_kitchen TYPE option<array<record<user>>> DEFAULT [] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- Backfill: ensure the array exists, and seed it with the original completer so
-- already-completed rows stay in that user's completed list.
UPDATE order_item_kitchen SET completed_by = [] WHERE completed_by = NONE;
UPDATE order_item_kitchen SET completed_by = [user] WHERE status = 'completed' AND user != NONE AND completed_by = [];

-- The KDS now requires activated_at to display a row. Backfill it for any
-- already-active rows (waiting rows are intentionally excluded).
UPDATE order_item_kitchen SET activated_at = created_at WHERE activated_at = NONE AND status IN ['pending', 'in_progress', 'completed'];
