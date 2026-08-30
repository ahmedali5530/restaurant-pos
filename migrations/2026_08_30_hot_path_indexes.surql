-- Hot-path indexes for list screens, reports, POS lookups, and parent-record queries.
-- Uses CONCURRENTLY on large tables so index builds do not block writes.

-- ---------------------------------------------------------------------------
-- Orders (order_status, order_created_at, order_floor, order_user already exist)
-- ---------------------------------------------------------------------------

DEFINE INDEX IF NOT EXISTS order_status_created_at ON order FIELDS status, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS order_type ON order FIELDS order_type CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS order_table ON order FIELDS `table` CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS order_customer ON order FIELDS customer CONCURRENTLY;

-- Order children (queried by parent order id)
DEFINE INDEX IF NOT EXISTS oi_order ON order_item FIELDS order CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ov_order ON order_void FIELDS order CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ov_created_at ON order_void FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS or_order ON order_refund FIELDS order CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS os_old_order ON order_split FIELDS old_order CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS om_new_order ON order_merge FIELDS new_order CONCURRENTLY;

-- ---------------------------------------------------------------------------
-- Settings (key lookup on every screen)
-- ---------------------------------------------------------------------------

DEFINE INDEX IF NOT EXISTS setting_key_global ON setting FIELDS key, is_global;

-- ---------------------------------------------------------------------------
-- Labor / clock
-- ---------------------------------------------------------------------------

DEFINE INDEX IF NOT EXISTS te_clock_in ON time_entry FIELDS clock_in CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS te_employee_clock_in ON time_entry FIELDS employee, clock_in CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS te_user_clock_out ON time_entry FIELDS user, clock_out CONCURRENTLY;

-- ---------------------------------------------------------------------------
-- Inventory document headers
-- ---------------------------------------------------------------------------

DEFINE INDEX IF NOT EXISTS ip_created_at ON inventory_purchase FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ip_status_created_at ON inventory_purchase FIELDS status, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ip_location_created_at ON inventory_purchase FIELDS location, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ip_supplier ON inventory_purchase FIELDS supplier CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ip_invoice_number ON inventory_purchase FIELDS invoice_number UNIQUE;

DEFINE INDEX IF NOT EXISTS ipr_created_at ON inventory_purchase_return FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ipr_status_created_at ON inventory_purchase_return FIELDS status, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ipr_location_created_at ON inventory_purchase_return FIELDS location, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ipr_invoice_number ON inventory_purchase_return FIELDS invoice_number UNIQUE;

DEFINE INDEX IF NOT EXISTS ii_created_at ON inventory_issue FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ii_status_created_at ON inventory_issue FIELDS status, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ii_location_created_at ON inventory_issue FIELDS location, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ii_invoice_number ON inventory_issue FIELDS invoice_number UNIQUE;

DEFINE INDEX IF NOT EXISTS iir_created_at ON inventory_issue_return FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iir_status_created_at ON inventory_issue_return FIELDS status, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iir_location_created_at ON inventory_issue_return FIELDS location, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iir_invoice_number ON inventory_issue_return FIELDS invoice_number UNIQUE;

DEFINE INDEX IF NOT EXISTS iiw_created_at ON inventory_item_waste FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iiw_status_created_at ON inventory_item_waste FIELDS status, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iiw_invoice_number ON inventory_item_waste FIELDS invoice_number UNIQUE;

DEFINE INDEX IF NOT EXISTS ia_created_at ON inventory_adjustment FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ia_status_created_at ON inventory_adjustment FIELDS status, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ia_location_created_at ON inventory_adjustment FIELDS location, created_at CONCURRENTLY;

DEFINE INDEX IF NOT EXISTS ipo_created_at ON inventory_purchase_order FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ipo_status_created_at ON inventory_purchase_order FIELDS status, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ipo_location_created_at ON inventory_purchase_order FIELDS location, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ipo_supplier ON inventory_purchase_order FIELDS supplier CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ipo_po_number ON inventory_purchase_order FIELDS po_number UNIQUE;

DEFINE INDEX IF NOT EXISTS st_created_at ON stock_transfer FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS st_status_created_at ON stock_transfer FIELDS status, created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS st_from_location ON stock_transfer FIELDS from_location CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS st_to_location ON stock_transfer FIELDS to_location CONCURRENTLY;

-- ---------------------------------------------------------------------------
-- Inventory line items (item + location aggregations, parent lookups)
-- ---------------------------------------------------------------------------

DEFINE INDEX IF NOT EXISTS ipi_item_location ON inventory_purchase_item FIELDS item, location CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ipi_purchase ON inventory_purchase_item FIELDS purchase CONCURRENTLY;

DEFINE INDEX IF NOT EXISTS ipri_item ON inventory_purchase_return_item FIELDS item CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ipri_purchase_return ON inventory_purchase_return_item FIELDS purchase_return CONCURRENTLY;

DEFINE INDEX IF NOT EXISTS iii_item_location ON inventory_issue_item FIELDS item, location CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iii_issue ON inventory_issue_item FIELDS issue CONCURRENTLY;

DEFINE INDEX IF NOT EXISTS iiri_item ON inventory_issue_return_item FIELDS item CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iiri_issue_return ON inventory_issue_return_item FIELDS issue_return CONCURRENTLY;

DEFINE INDEX IF NOT EXISTS iiwi_item ON inventory_item_waste_item FIELDS item CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iiwi_waste ON inventory_item_waste_item FIELDS waste CONCURRENTLY;

DEFINE INDEX IF NOT EXISTS iai_item ON inventory_adjustment_item FIELDS item CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iai_adjustment ON inventory_adjustment_item FIELDS adjustment CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS iai_item_location ON inventory_adjustment_item FIELDS item, location CONCURRENTLY;

DEFINE INDEX IF NOT EXISTS sti_item ON stock_transfer_item FIELDS item CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS sti_transfer ON stock_transfer_item FIELDS transfer CONCURRENTLY;

-- ---------------------------------------------------------------------------
-- Accounting (native datetime filters — indexes apply directly)
-- ---------------------------------------------------------------------------

DEFINE INDEX IF NOT EXISTS aje_date ON account_journal_entry FIELDS date CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS aje_status_date ON account_journal_entry FIELDS status, date CONCURRENTLY;

DEFINE INDEX IF NOT EXISTS ajl_account ON account_journal_line FIELDS account CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS ajl_entry ON account_journal_line FIELDS entry CONCURRENTLY;

-- ---------------------------------------------------------------------------
-- Ops / audit
-- ---------------------------------------------------------------------------

DEFINE INDEX IF NOT EXISTS tracking_created_at ON tracking FIELDS created_at CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS tracking_module_created_at ON tracking FIELDS module, created_at CONCURRENTLY;

DEFINE INDEX IF NOT EXISTS dc_date_from ON day_closing FIELDS date_from CONCURRENTLY;
DEFINE INDEX IF NOT EXISTS dc_created_at ON day_closing FIELDS created_at CONCURRENTLY;

-- ---------------------------------------------------------------------------
-- POS dish lookup
-- ---------------------------------------------------------------------------

DEFINE INDEX IF NOT EXISTS mi_number ON menu_item FIELDS number;
