-- Purchase order approval workflow
-- Draft → Pending Approval → Approved → Fulfilled (reject returns to Draft)
-- Migrates legacy Pending rows to Approved so existing POs stay usable for purchase.

DEFINE FIELD OVERWRITE submitted_at ON inventory_purchase_order TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE submitted_by ON inventory_purchase_order TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_at ON inventory_purchase_order TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE approved_by ON inventory_purchase_order TYPE option<record<user>> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE rejected_at ON inventory_purchase_order TYPE option<datetime> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE rejected_by ON inventory_purchase_order TYPE option<record<user>> PERMISSIONS FULL;

UPDATE inventory_purchase_order SET status = 'Approved' WHERE status = 'Pending';
