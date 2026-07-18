-- Inventory document lifecycle (Phase 1)
-- Existing rows default to 'posted' so historical documents keep affecting stock.
-- Compatible with SurrealDB 3.x. Apply with the server CLI (not host surreal 2.x):
--   docker exec -i posr-react-surrealdb-1 /surreal sql \
--     --endpoint http://127.0.0.1:8000 --username root --password root \
--     --namespace posr --database posr < migrations/2026_07_17_inventory_lifecycle.surql

-- inventory_purchase
DEFINE FIELD OVERWRITE status ON inventory_purchase TYPE string DEFAULT 'posted' PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_at ON inventory_purchase TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_by ON inventory_purchase TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_at ON inventory_purchase TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_by ON inventory_purchase TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_at ON inventory_purchase TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_by ON inventory_purchase TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_at ON inventory_purchase TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_by ON inventory_purchase TYPE option<record<user>> PERMISSIONS FULL;

-- inventory_purchase_return
DEFINE FIELD OVERWRITE status ON inventory_purchase_return TYPE string DEFAULT 'posted' PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_at ON inventory_purchase_return TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_by ON inventory_purchase_return TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_at ON inventory_purchase_return TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_by ON inventory_purchase_return TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_at ON inventory_purchase_return TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_by ON inventory_purchase_return TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_at ON inventory_purchase_return TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_by ON inventory_purchase_return TYPE option<record<user>> PERMISSIONS FULL;

-- inventory_issue
DEFINE FIELD OVERWRITE status ON inventory_issue TYPE string DEFAULT 'posted' PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_at ON inventory_issue TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_by ON inventory_issue TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_at ON inventory_issue TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_by ON inventory_issue TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_at ON inventory_issue TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_by ON inventory_issue TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_at ON inventory_issue TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_by ON inventory_issue TYPE option<record<user>> PERMISSIONS FULL;

-- inventory_issue_return
DEFINE FIELD OVERWRITE status ON inventory_issue_return TYPE string DEFAULT 'posted' PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_at ON inventory_issue_return TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_by ON inventory_issue_return TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_at ON inventory_issue_return TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_by ON inventory_issue_return TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_at ON inventory_issue_return TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_by ON inventory_issue_return TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_at ON inventory_issue_return TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_by ON inventory_issue_return TYPE option<record<user>> PERMISSIONS FULL;

-- inventory_item_waste
DEFINE FIELD OVERWRITE status ON inventory_item_waste TYPE string DEFAULT 'posted' PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_at ON inventory_item_waste TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_by ON inventory_item_waste TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_at ON inventory_item_waste TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_by ON inventory_item_waste TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_at ON inventory_item_waste TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_by ON inventory_item_waste TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_at ON inventory_item_waste TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_by ON inventory_item_waste TYPE option<record<user>> PERMISSIONS FULL;

-- stock_transfer
DEFINE FIELD OVERWRITE status ON stock_transfer TYPE string DEFAULT 'posted' PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_at ON stock_transfer TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_by ON stock_transfer TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_at ON stock_transfer TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posted_by ON stock_transfer TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_at ON stock_transfer TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE voided_by ON stock_transfer TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_at ON stock_transfer TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE cancelled_by ON stock_transfer TYPE option<record<user>> PERMISSIONS FULL;

-- Backfill existing rows that may have null/empty status (SurrealQL uses NONE, not NULL)
UPDATE inventory_purchase SET status = 'posted' WHERE status = NONE OR status = '';
UPDATE inventory_purchase_return SET status = 'posted' WHERE status = NONE OR status = '';
UPDATE inventory_issue SET status = 'posted' WHERE status = NONE OR status = '';
UPDATE inventory_issue_return SET status = 'posted' WHERE status = NONE OR status = '';
UPDATE inventory_item_waste SET status = 'posted' WHERE status = NONE OR status = '';
UPDATE stock_transfer SET status = 'posted' WHERE status = NONE OR status = '';
