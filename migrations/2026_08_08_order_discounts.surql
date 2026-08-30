-- Denormalize order_discount record IDs on order so FETCH order_discounts works
-- (mirrors order_taxes on order for multi-tax display).

DEFINE FIELD IF NOT EXISTS order_discounts ON order TYPE option<array<record<order_discount>>|null>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- Backfill from existing junction rows (active lines only).
UPDATE order SET order_discounts = (
  SELECT VALUE id FROM order_discount
  WHERE order = $parent.id
    AND (removed_at = NONE OR removed_at = null)
);
