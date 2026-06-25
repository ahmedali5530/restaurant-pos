-- ------------------------------
-- OPTION
-- ------------------------------

OPTION IMPORT;

-- ------------------------------
-- TABLE: auth_permission
-- ------------------------------

DEFINE TABLE auth_permission TYPE ANY SCHEMALESS PERMISSIONS NONE;




-- ------------------------------
-- TABLE: buffet_consumption_log
-- ------------------------------

DEFINE TABLE buffet_consumption_log TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD guest_consumption ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD item ON buffet_consumption_log TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD leftover_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD posted_to_ledger ON buffet_consumption_log TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD produced_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD session ON buffet_consumption_log TYPE record<buffet_session> PERMISSIONS FULL;
DEFINE FIELD staff_meal_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD theoretical_guest_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD total_consumed ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD total_food_cost ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD unit_food_cost ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD variance_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD waste_qty ON buffet_consumption_log TYPE float DEFAULT 0 PERMISSIONS FULL;

DEFINE INDEX bcl_session_item ON buffet_consumption_log FIELDS session, item UNIQUE;


-- ------------------------------
-- TABLE: buffet_guest_count
-- ------------------------------

DEFINE TABLE buffet_guest_count TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD count_type ON buffet_guest_count TYPE string ASSERT $value INSIDE ['expected', 'actual', 'checkpoint'] PERMISSIONS FULL;
DEFINE FIELD guest_count ON buffet_guest_count TYPE int PERMISSIONS FULL;
DEFINE FIELD recorded_at ON buffet_guest_count TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD recorded_by ON buffet_guest_count TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD session ON buffet_guest_count TYPE record<buffet_session> PERMISSIONS FULL;

DEFINE INDEX bgc_session ON buffet_guest_count FIELDS session;


-- ------------------------------
-- TABLE: buffet_menu
-- ------------------------------

DEFINE TABLE buffet_menu TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD code ON buffet_menu TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD created_at ON buffet_menu TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON buffet_menu TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD is_active ON buffet_menu TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD name ON buffet_menu TYPE string PERMISSIONS FULL;
DEFINE FIELD notes ON buffet_menu TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD session_type ON buffet_menu TYPE string DEFAULT 'lunch' ASSERT $value INSIDE ['breakfast', 'lunch', 'dinner'] PERMISSIONS FULL;

DEFINE INDEX bm_active ON buffet_menu FIELDS is_active;


-- ------------------------------
-- TABLE: buffet_menu_item
-- ------------------------------

DEFINE TABLE buffet_menu_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD menu ON buffet_menu_item TYPE record<buffet_menu> PERMISSIONS FULL;
DEFINE FIELD per_guest_qty ON buffet_menu_item TYPE float DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD recipe ON buffet_menu_item TYPE record<recipe> PERMISSIONS FULL;
DEFINE FIELD sort_order ON buffet_menu_item TYPE int DEFAULT 0 PERMISSIONS FULL;

DEFINE INDEX bmi_menu ON buffet_menu_item FIELDS menu;


-- ------------------------------
-- TABLE: buffet_production_batch
-- ------------------------------

DEFINE TABLE buffet_production_batch TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD menu_item ON buffet_production_batch TYPE record<buffet_menu_item> PERMISSIONS FULL;
DEFINE FIELD planned_qty ON buffet_production_batch TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD production_batch ON buffet_production_batch TYPE none | record<production_batch> | null PERMISSIONS FULL;
DEFINE FIELD session ON buffet_production_batch TYPE record<buffet_session> PERMISSIONS FULL;
DEFINE FIELD status ON buffet_production_batch TYPE string DEFAULT 'planned' ASSERT $value INSIDE ['planned', 'completed', 'skipped'] PERMISSIONS FULL;

DEFINE INDEX bpb_session ON buffet_production_batch FIELDS session;


-- ------------------------------
-- TABLE: buffet_session
-- ------------------------------

DEFINE TABLE buffet_session TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD actual_guests ON buffet_session TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD buffet_price ON buffet_session TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD business_date ON buffet_session TYPE string PERMISSIONS FULL;
DEFINE FIELD closed_at ON buffet_session TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD closed_by ON buffet_session TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD created_at ON buffet_session TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON buffet_session TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD expected_guests ON buffet_session TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD menu ON buffet_session TYPE record<buffet_menu> PERMISSIONS FULL;
DEFINE FIELD notes ON buffet_session TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD posted_to_ledger ON buffet_session TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD scheduled_end ON buffet_session TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD scheduled_start ON buffet_session TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD session_number ON buffet_session TYPE string PERMISSIONS FULL;
DEFINE FIELD session_type ON buffet_session TYPE string DEFAULT 'lunch' ASSERT $value INSIDE ['breakfast', 'lunch', 'dinner'] PERMISSIONS FULL;
DEFINE FIELD started_at ON buffet_session TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD status ON buffet_session TYPE string DEFAULT 'draft' ASSERT $value INSIDE ['draft', 'planned', 'in_progress', 'closing', 'closed', 'voided'] PERMISSIONS FULL;
DEFINE FIELD store ON buffet_session TYPE record<inventory_store> PERMISSIONS FULL;

DEFINE INDEX bs_store_date_type ON buffet_session FIELDS store, business_date, session_type;


-- ------------------------------
-- TABLE: buffet_stock_snapshot
-- ------------------------------

DEFINE TABLE buffet_stock_snapshot TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD captured_at ON buffet_stock_snapshot TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD captured_by ON buffet_stock_snapshot TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD item ON buffet_stock_snapshot TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD notes ON buffet_stock_snapshot TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD production_batch ON buffet_stock_snapshot TYPE none | record<production_batch> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON buffet_stock_snapshot TYPE float PERMISSIONS FULL;
DEFINE FIELD session ON buffet_stock_snapshot TYPE record<buffet_session> PERMISSIONS FULL;
DEFINE FIELD snapshot_type ON buffet_stock_snapshot TYPE string ASSERT $value INSIDE ['start', 'end', 'refill'] PERMISSIONS FULL;

DEFINE INDEX bss_session_item_type ON buffet_stock_snapshot FIELDS session, item, snapshot_type UNIQUE;


-- ------------------------------
-- TABLE: buffet_waste_log
-- ------------------------------

DEFINE TABLE buffet_waste_log TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON buffet_waste_log TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON buffet_waste_log TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD item ON buffet_waste_log TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD ledger_waste_item ON buffet_waste_log TYPE none | record<inventory_item_waste_item> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON buffet_waste_log TYPE float PERMISSIONS FULL;
DEFINE FIELD reason ON buffet_waste_log TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD session ON buffet_waste_log TYPE record<buffet_session> PERMISSIONS FULL;

DEFINE INDEX bwl_session_item ON buffet_waste_log FIELDS session, item;


-- ------------------------------
-- TABLE: category
-- ------------------------------

DEFINE TABLE category TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD background ON category TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD color ON category TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD deleted_at ON category TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD name ON category TYPE string PERMISSIONS FULL;
DEFINE FIELD parent ON category TYPE none | record<category> | null PERMISSIONS FULL;
DEFINE FIELD priority ON category TYPE int PERMISSIONS FULL;
DEFINE FIELD show_in_menu ON category TYPE none | bool | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: coupon
-- ------------------------------

DEFINE TABLE coupon TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD code ON coupon TYPE string ASSERT $value != NONE PERMISSIONS FULL;
DEFINE FIELD coupon_type ON coupon TYPE string DEFAULT order ASSERT $value INSIDE ['order', 'product', 'shipping'] PERMISSIONS FULL;
DEFINE FIELD created_at ON coupon TYPE datetime VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD deleted_at ON coupon TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD description ON coupon TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD discount_type ON coupon TYPE string ASSERT $value INSIDE ['percent', 'fixed'] PERMISSIONS FULL;
DEFINE FIELD discount_value ON coupon TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD end_date ON coupon TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD end_time ON coupon TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD first_order_only ON coupon TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD is_active ON coupon TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD max_discount_amount ON coupon TYPE none | float | null DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD min_order_amount ON coupon TYPE none | float | null DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD priority ON coupon TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD stackable ON coupon TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD start_date ON coupon TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD start_time ON coupon TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD updated_at ON coupon TYPE datetime VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD usage_limit ON coupon TYPE int PERMISSIONS FULL;
DEFINE FIELD usage_limit_per_user ON coupon TYPE int PERMISSIONS FULL;
DEFINE FIELD used_count ON coupon TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD valid_days ON coupon TYPE none | array<string> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: coupon_redemption
-- ------------------------------

DEFINE TABLE coupon_redemption TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD coupon ON coupon_redemption TYPE record<coupon> PERMISSIONS FULL;
DEFINE FIELD customer ON coupon_redemption TYPE none | record<customer> | null PERMISSIONS FULL;
DEFINE FIELD discount_amount ON coupon_redemption TYPE float PERMISSIONS FULL;
DEFINE FIELD order ON coupon_redemption TYPE record<order> PERMISSIONS FULL;
DEFINE FIELD redeemed_at ON coupon_redemption TYPE datetime VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD user ON coupon_redemption TYPE none | record<user> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: customer
-- ------------------------------

DEFINE TABLE customer TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD address ON customer TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD addresses ON customer TYPE none | array<record<customer_address>> | null PERMISSIONS FULL;
DEFINE FIELD email ON customer TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD lat ON customer TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD lng ON customer TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD name ON customer TYPE string PERMISSIONS FULL;
DEFINE FIELD number ON customer TYPE none | int PERMISSIONS FULL;
DEFINE FIELD phone ON customer TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD points ON customer TYPE none | float PERMISSIONS FULL;
DEFINE FIELD postal_code ON customer TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD secondary_address ON customer TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD tags ON customer TYPE array<string> DEFAULT [] PERMISSIONS FULL;



-- ------------------------------
-- TABLE: customer_address
-- ------------------------------

DEFINE TABLE customer_address TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD country ON customer_address TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD is_primary ON customer_address TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD lat ON customer_address TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD lng ON customer_address TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD postal_code ON customer_address TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD primary_address ON customer_address TYPE string PERMISSIONS FULL;
DEFINE FIELD region ON customer_address TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD secondary_address ON customer_address TYPE none | string | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: day_closing
-- ------------------------------

DEFINE TABLE day_closing TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD cash_added ON day_closing TYPE float PERMISSIONS FULL;
DEFINE FIELD cash_withdrawn ON day_closing TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD closed_at ON day_closing TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD closed_by ON day_closing TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD closing_balance ON day_closing TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD created_at ON day_closing TYPE datetime PERMISSIONS FULL;
DEFINE FIELD date_from ON day_closing TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD date_to ON day_closing TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD denominations ON day_closing TYPE any PERMISSIONS FULL;
DEFINE FIELD expenses ON day_closing TYPE float PERMISSIONS FULL;
DEFINE FIELD expenses_data ON day_closing TYPE any PERMISSIONS FULL;
DEFINE FIELD net_amount ON day_closing TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD notes ON day_closing TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD opened_by ON day_closing TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD opening_balance ON day_closing TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD payments_data ON day_closing TYPE any PERMISSIONS FULL;
DEFINE FIELD previous_day_balance ON day_closing TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD status ON day_closing TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD terminal_cash ON day_closing TYPE any PERMISSIONS FULL;
DEFINE FIELD total_cash ON day_closing TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD total_other_payments ON day_closing TYPE none | float | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: discount
-- ------------------------------

DEFINE TABLE discount TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD applicable_floors ON discount TYPE none | array<record<floor>> | null DEFAULT [] PERMISSIONS FULL;
DEFINE FIELD application_mode ON discount TYPE string DEFAULT 'manual' PERMISSIONS FULL;
DEFINE FIELD branch_id ON discount TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD category ON discount TYPE none | string | null DEFAULT 'manual' PERMISSIONS FULL;
DEFINE FIELD code ON discount TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD conditions ON discount TYPE any PERMISSIONS FULL;
DEFINE FIELD deleted_at ON discount TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD exclusive ON discount TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD is_active ON discount TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD max_cap ON discount TYPE none | float PERMISSIONS FULL;
DEFINE FIELD max_rate ON discount TYPE none | float PERMISSIONS FULL;
DEFINE FIELD max_value ON discount TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD min_order_amount ON discount TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD min_rate ON discount TYPE none | float PERMISSIONS FULL;
DEFINE FIELD min_value ON discount TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD name ON discount TYPE string PERMISSIONS FULL;
DEFINE FIELD priority ON discount TYPE int PERMISSIONS FULL;
DEFINE FIELD requires_approval ON discount TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD requires_reason ON discount TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD schedules ON discount TYPE any DEFAULT [] PERMISSIONS FULL;
DEFINE FIELD scope ON discount TYPE string DEFAULT 'cart' PERMISSIONS FULL;
DEFINE FIELD stack_group ON discount TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD stackable ON discount TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD stackable_with_coupon ON discount TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD stacking_mode ON discount TYPE string DEFAULT 'allow' PERMISSIONS FULL;
DEFINE FIELD targets ON discount TYPE any DEFAULT {  } PERMISSIONS FULL;
DEFINE FIELD tax_treatment ON discount TYPE string DEFAULT 'tax_before_discount' PERMISSIONS FULL;
DEFINE FIELD type ON discount TYPE string PERMISSIONS FULL;
DEFINE FIELD `value` ON discount TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD value_type ON discount TYPE none | string | null PERMISSIONS FULL;

DEFINE INDEX d_active_priority ON discount FIELDS is_active, priority;


-- ------------------------------
-- TABLE: discount_reason
-- ------------------------------

DEFINE TABLE discount_reason TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD code ON discount_reason TYPE string PERMISSIONS FULL;
DEFINE FIELD deleted_at ON discount_reason TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD is_active ON discount_reason TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD name ON discount_reason TYPE string PERMISSIONS FULL;
DEFINE FIELD requires_approval ON discount_reason TYPE bool DEFAULT false PERMISSIONS FULL;

DEFINE INDEX dr_code ON discount_reason FIELDS code UNIQUE;


-- ------------------------------
-- TABLE: document
-- ------------------------------

DEFINE TABLE document TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD content ON document TYPE none | bytes | null PERMISSIONS FULL;
DEFINE FIELD name ON document TYPE string PERMISSIONS FULL;
DEFINE FIELD path ON document TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD size ON document TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD type ON document TYPE none | string | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: extra
-- ------------------------------

DEFINE TABLE extra TYPE ANY SCHEMALESS PERMISSIONS NONE;




-- ------------------------------
-- TABLE: extras
-- ------------------------------

DEFINE TABLE extras TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD apply_to_all ON extras TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD name ON extras TYPE string PERMISSIONS FULL;
DEFINE FIELD order_types ON extras TYPE none | array<record<order_type>> | null PERMISSIONS FULL;
DEFINE FIELD payment_types ON extras TYPE none | array<record<payment_type>> | null PERMISSIONS FULL;
DEFINE FIELD tables ON extras TYPE none | array<record<floor_table>> | null PERMISSIONS FULL;
DEFINE FIELD `value` ON extras TYPE any PERMISSIONS FULL;



-- ------------------------------
-- TABLE: floor
-- ------------------------------

DEFINE TABLE floor TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD background ON floor TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD color ON floor TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD deleted_at ON floor TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD name ON floor TYPE string PERMISSIONS FULL;
DEFINE FIELD priority ON floor TYPE int PERMISSIONS FULL;



-- ------------------------------
-- TABLE: floor_table
-- ------------------------------

DEFINE TABLE floor_table TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD allow_multiple_orders ON floor_table TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD ask_for_covers ON floor_table TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD background ON floor_table TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD block_source ON floor_table TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD capacity ON floor_table TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD categories ON floor_table TYPE none | array<record<category>> | null PERMISSIONS FULL;
DEFINE FIELD color ON floor_table TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD deleted_at ON floor_table TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD floor ON floor_table TYPE none | record<floor> | null PERMISSIONS FULL;
DEFINE FIELD height ON floor_table TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD is_block ON floor_table TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD is_locked ON floor_table TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD locked_at ON floor_table TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD locked_by ON floor_table TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD name ON floor_table TYPE string PERMISSIONS FULL;
DEFINE FIELD number ON floor_table TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD order_types ON floor_table TYPE none | array<record<order_type>> | null PERMISSIONS FULL;
DEFINE FIELD payment_types ON floor_table TYPE none | array<record<payment_type>> | null PERMISSIONS FULL;
DEFINE FIELD priority ON floor_table TYPE int PERMISSIONS FULL;
DEFINE FIELD rounded ON floor_table TYPE none | string PERMISSIONS FULL;
DEFINE FIELD width ON floor_table TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD x ON floor_table TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD y ON floor_table TYPE none | float | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_category
-- ------------------------------

DEFINE TABLE inventory_category TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD name ON inventory_category TYPE string PERMISSIONS FULL;
DEFINE FIELD priority ON inventory_category TYPE none | int | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_issue
-- ------------------------------

DEFINE TABLE inventory_issue TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON inventory_issue TYPE datetime PERMISSIONS FULL;
DEFINE FIELD created_by ON inventory_issue TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD documents ON inventory_issue TYPE none | array<record<document>> | null PERMISSIONS FULL;
DEFINE FIELD invoice_number ON inventory_issue TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD issued_to ON inventory_issue TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD items ON inventory_issue TYPE array<record<inventory_issue_item>> PERMISSIONS FULL;
DEFINE FIELD kitchen ON inventory_issue TYPE none | record<kitchen> | null PERMISSIONS FULL;
DEFINE FIELD store ON inventory_issue TYPE none | record<inventory_store> | null PERMISSIONS FULL;

DEFINE INDEX invoice_number ON inventory_issue FIELDS invoice_number UNIQUE;


-- ------------------------------
-- TABLE: inventory_issue_item
-- ------------------------------

DEFINE TABLE inventory_issue_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD code ON inventory_issue_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD comments ON inventory_issue_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD issue ON inventory_issue_item TYPE none | record<inventory_issue> | null PERMISSIONS FULL;
DEFINE FIELD item ON inventory_issue_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD price ON inventory_issue_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD quantity ON inventory_issue_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD requested ON inventory_issue_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD store ON inventory_issue_item TYPE none | record<inventory_store> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_issue_return
-- ------------------------------

DEFINE TABLE inventory_issue_return TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON inventory_issue_return TYPE datetime PERMISSIONS FULL;
DEFINE FIELD created_by ON inventory_issue_return TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD documents ON inventory_issue_return TYPE none | array<record<document>> | null PERMISSIONS FULL;
DEFINE FIELD invoice_number ON inventory_issue_return TYPE int PERMISSIONS FULL;
DEFINE FIELD issuance ON inventory_issue_return TYPE none | record<inventory_issue> | null PERMISSIONS FULL;
DEFINE FIELD issued_to ON inventory_issue_return TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD items ON inventory_issue_return TYPE array<record<inventory_issue_return_item>> PERMISSIONS FULL;
DEFINE FIELD kitchen ON inventory_issue_return TYPE none | record<kitchen> | null PERMISSIONS FULL;
DEFINE FIELD store ON inventory_issue_return TYPE none | record<inventory_store> | null PERMISSIONS FULL;

DEFINE INDEX invoice_number ON inventory_issue_return FIELDS invoice_number UNIQUE;


-- ------------------------------
-- TABLE: inventory_issue_return_item
-- ------------------------------

DEFINE TABLE inventory_issue_return_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD comments ON inventory_issue_return_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD inventory_issue_return ON inventory_issue_return_item TYPE none | record<inventory_issue_return> | null PERMISSIONS FULL;
DEFINE FIELD issue_return ON inventory_issue_return_item TYPE none | record<inventory_issue_return> | null PERMISSIONS FULL;
DEFINE FIELD issued ON inventory_issue_return_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD issued_item ON inventory_issue_return_item TYPE none | record<inventory_issue_item> | null PERMISSIONS FULL;
DEFINE FIELD item ON inventory_issue_return_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD quantity ON inventory_issue_return_item TYPE float PERMISSIONS FULL;
DEFINE FIELD store ON inventory_issue_return_item TYPE none | record<inventory_store> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_item
-- ------------------------------

DEFINE TABLE inventory_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD average_price ON inventory_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD base_quantity ON inventory_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD category ON inventory_item TYPE none | record<inventory_category> | null PERMISSIONS FULL;
DEFINE FIELD code ON inventory_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD item_types ON inventory_item TYPE array<string> DEFAULT ['raw'] ASSERT array::len($value) > 0 PERMISSIONS FULL;
DEFINE FIELD name ON inventory_item TYPE string PERMISSIONS FULL;
DEFINE FIELD price ON inventory_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD stores ON inventory_item TYPE array<record<inventory_store>> PERMISSIONS FULL;
DEFINE FIELD suppliers ON inventory_item TYPE array<record<inventory_supplier>> PERMISSIONS FULL;
DEFINE FIELD uom ON inventory_item TYPE none | string | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_item_group
-- ------------------------------

DEFINE TABLE inventory_item_group TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD base_quantity ON inventory_item_group TYPE float PERMISSIONS FULL;
DEFINE FIELD main_item ON inventory_item_group TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD sub_items ON inventory_item_group TYPE array<record<inventory_item_group_item>> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_item_group_item
-- ------------------------------

DEFINE TABLE inventory_item_group_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD item ON inventory_item_group_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD quantity ON inventory_item_group_item TYPE float PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_item_waste
-- ------------------------------

DEFINE TABLE inventory_item_waste TYPE ANY SCHEMALESS PERMISSIONS NONE;

DEFINE FIELD created_at ON inventory_item_waste TYPE datetime PERMISSIONS FULL;
DEFINE FIELD created_by ON inventory_item_waste TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD documents ON inventory_item_waste TYPE none | array<record<document>> | null PERMISSIONS FULL;
DEFINE FIELD invoice_number ON inventory_item_waste TYPE int PERMISSIONS FULL;
DEFINE FIELD issue ON inventory_item_waste TYPE none | record<inventory_issue> | null PERMISSIONS FULL;
DEFINE FIELD items ON inventory_item_waste TYPE array<record<inventory_item_waste_item>> PERMISSIONS FULL;
DEFINE FIELD purchase ON inventory_item_waste TYPE none | record<inventory_purchase> | null PERMISSIONS FULL;

DEFINE INDEX invoice_number ON inventory_item_waste FIELDS invoice_number UNIQUE;


-- ------------------------------
-- TABLE: inventory_item_waste_item
-- ------------------------------

DEFINE TABLE inventory_item_waste_item TYPE ANY SCHEMALESS PERMISSIONS NONE;

DEFINE FIELD comments ON inventory_item_waste_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD documents ON inventory_item_waste_item TYPE none | array<string> | null PERMISSIONS FULL;
DEFINE FIELD issue_item ON inventory_item_waste_item TYPE none | record<inventory_issue_item> | null PERMISSIONS FULL;
DEFINE FIELD item ON inventory_item_waste_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD purchase_item ON inventory_item_waste_item TYPE none | record<inventory_purchase_item> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON inventory_item_waste_item TYPE float PERMISSIONS FULL;
DEFINE FIELD source ON inventory_item_waste_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD store ON inventory_item_waste_item TYPE none | record<inventory_store> | null PERMISSIONS FULL;
DEFINE FIELD waste ON inventory_item_waste_item TYPE none | record<inventory_item_waste> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_purchase
-- ------------------------------

DEFINE TABLE inventory_purchase TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD comments ON inventory_purchase TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD created_at ON inventory_purchase TYPE datetime PERMISSIONS FULL;
DEFINE FIELD created_by ON inventory_purchase TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD documents ON inventory_purchase TYPE none | array<record<document>> | null PERMISSIONS FULL;
DEFINE FIELD invoice_number ON inventory_purchase TYPE int PERMISSIONS FULL;
DEFINE FIELD items ON inventory_purchase TYPE array<record<inventory_purchase_item>> PERMISSIONS FULL;
DEFINE FIELD method ON inventory_purchase TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD payment_method ON inventory_purchase TYPE none | record<payment_type> | null PERMISSIONS FULL;
DEFINE FIELD purchase_order ON inventory_purchase TYPE none | record<inventory_purchase_order> | null PERMISSIONS FULL;
DEFINE FIELD store ON inventory_purchase TYPE none | record<inventory_store> | null PERMISSIONS FULL;
DEFINE FIELD supplier ON inventory_purchase TYPE none | record<inventory_supplier> PERMISSIONS FULL;

DEFINE INDEX invoice_number ON inventory_purchase FIELDS invoice_number UNIQUE;


-- ------------------------------
-- TABLE: inventory_purchase_item
-- ------------------------------

DEFINE TABLE inventory_purchase_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD base_quantity ON inventory_purchase_item TYPE float PERMISSIONS FULL;
DEFINE FIELD code ON inventory_purchase_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD comments ON inventory_purchase_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD expiry_date ON inventory_purchase_item TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD is_done ON inventory_purchase_item TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD item ON inventory_purchase_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD manufacturing_date ON inventory_purchase_item TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD price ON inventory_purchase_item TYPE float PERMISSIONS FULL;
DEFINE FIELD purchase ON inventory_purchase_item TYPE none | record<inventory_purchase> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON inventory_purchase_item TYPE float PERMISSIONS FULL;
DEFINE FIELD requested ON inventory_purchase_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD store ON inventory_purchase_item TYPE none | record<inventory_store> | null PERMISSIONS FULL;
DEFINE FIELD supplier ON inventory_purchase_item TYPE none | record<inventory_supplier> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_purchase_order
-- ------------------------------

DEFINE TABLE inventory_purchase_order TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON inventory_purchase_order TYPE datetime PERMISSIONS FULL;
DEFINE FIELD documents ON inventory_purchase_order TYPE none | array<record<document>> | null PERMISSIONS FULL;
DEFINE FIELD items ON inventory_purchase_order TYPE array<record<inventory_purchase_order_item>> PERMISSIONS FULL;
DEFINE FIELD po_number ON inventory_purchase_order TYPE int PERMISSIONS FULL;
DEFINE FIELD status ON inventory_purchase_order TYPE string PERMISSIONS FULL;
DEFINE FIELD store ON inventory_purchase_order TYPE none | record<inventory_store> | null PERMISSIONS FULL;
DEFINE FIELD supplier ON inventory_purchase_order TYPE none | record<inventory_supplier> | null PERMISSIONS FULL;

DEFINE INDEX po_number ON inventory_purchase_order FIELDS po_number UNIQUE;


-- ------------------------------
-- TABLE: inventory_purchase_order_item
-- ------------------------------

DEFINE TABLE inventory_purchase_order_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD item ON inventory_purchase_order_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD price ON inventory_purchase_order_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD purchase_order ON inventory_purchase_order_item TYPE none | record<inventory_purchase_order> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON inventory_purchase_order_item TYPE float PERMISSIONS FULL;
DEFINE FIELD supplier ON inventory_purchase_order_item TYPE none | record<inventory_supplier> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_purchase_payment
-- ------------------------------

DEFINE TABLE inventory_purchase_payment TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD amount ON inventory_purchase_payment TYPE float PERMISSIONS FULL;
DEFINE FIELD created_at ON inventory_purchase_payment TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD payment_type ON inventory_purchase_payment TYPE record<payment_type> PERMISSIONS FULL;
DEFINE FIELD purchase ON inventory_purchase_payment TYPE none | record<inventory_purchase> | null PERMISSIONS FULL;
DEFINE FIELD supplier ON inventory_purchase_payment TYPE record<inventory_supplier> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_purchase_return
-- ------------------------------

DEFINE TABLE inventory_purchase_return TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON inventory_purchase_return TYPE datetime PERMISSIONS FULL;
DEFINE FIELD created_by ON inventory_purchase_return TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD documents ON inventory_purchase_return TYPE none | array<record<document>> | null PERMISSIONS FULL;
DEFINE FIELD invoice_number ON inventory_purchase_return TYPE int PERMISSIONS FULL;
DEFINE FIELD items ON inventory_purchase_return TYPE array<record<inventory_purchase_return_item>> PERMISSIONS FULL;
DEFINE FIELD purchase ON inventory_purchase_return TYPE none | record<inventory_purchase> | null PERMISSIONS FULL;
DEFINE FIELD store ON inventory_purchase_return TYPE none | record<inventory_store> | null PERMISSIONS FULL;

DEFINE INDEX invoice_number ON inventory_purchase_return FIELDS invoice_number UNIQUE;


-- ------------------------------
-- TABLE: inventory_purchase_return_item
-- ------------------------------

DEFINE TABLE inventory_purchase_return_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD comments ON inventory_purchase_return_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD item ON inventory_purchase_return_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD price ON inventory_purchase_return_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD purchase_item ON inventory_purchase_return_item TYPE none | record<inventory_purchase_item> | null PERMISSIONS FULL;
DEFINE FIELD purchase_return ON inventory_purchase_return_item TYPE none | record<inventory_purchase_return> | null PERMISSIONS FULL;
DEFINE FIELD purchased ON inventory_purchase_return_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD quantity ON inventory_purchase_return_item TYPE float PERMISSIONS FULL;
DEFINE FIELD store ON inventory_purchase_return_item TYPE none | record<inventory_store> | null PERMISSIONS FULL;
DEFINE FIELD supplier ON inventory_purchase_return_item TYPE none | record<inventory_supplier> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_store
-- ------------------------------

DEFINE TABLE inventory_store TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD name ON inventory_store TYPE string PERMISSIONS FULL;



-- ------------------------------
-- TABLE: inventory_supplier
-- ------------------------------

DEFINE TABLE inventory_supplier TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD address ON inventory_supplier TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD email ON inventory_supplier TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD name ON inventory_supplier TYPE string PERMISSIONS FULL;
DEFINE FIELD payments ON inventory_supplier TYPE none | array<record<inventory_purchase_payment>> | null PERMISSIONS FULL;
DEFINE FIELD phone ON inventory_supplier TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD purchases ON inventory_supplier TYPE none | array<record<inventory_purchase>> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: kitchen
-- ------------------------------

DEFINE TABLE kitchen TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD deleted_at ON kitchen TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD items ON kitchen TYPE array<record<menu_item>> PERMISSIONS FULL;
DEFINE FIELD name ON kitchen TYPE string PERMISSIONS FULL;
DEFINE FIELD printers ON kitchen TYPE none | array<record<printer>> | null PERMISSIONS FULL;
DEFINE FIELD priority ON kitchen TYPE int PERMISSIONS FULL;



-- ------------------------------
-- TABLE: kitchen_complimentary_item
-- ------------------------------

DEFINE TABLE kitchen_complimentary_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON kitchen_complimentary_item TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON kitchen_complimentary_item TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD item ON kitchen_complimentary_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD ledger_waste_item ON kitchen_complimentary_item TYPE none | record<inventory_item_waste_item> | null PERMISSIONS FULL;
DEFINE FIELD order_item ON kitchen_complimentary_item TYPE none | record<order_item> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON kitchen_complimentary_item TYPE float PERMISSIONS FULL;
DEFINE FIELD reconciliation ON kitchen_complimentary_item TYPE record<kitchen_reconciliation> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: kitchen_reconciliation
-- ------------------------------

DEFINE TABLE kitchen_reconciliation TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD business_date ON kitchen_reconciliation TYPE string PERMISSIONS FULL;
DEFINE FIELD created_at ON kitchen_reconciliation TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON kitchen_reconciliation TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD date_from ON kitchen_reconciliation TYPE datetime PERMISSIONS FULL;
DEFINE FIELD date_to ON kitchen_reconciliation TYPE datetime PERMISSIONS FULL;
DEFINE FIELD kitchen ON kitchen_reconciliation TYPE record<kitchen> PERMISSIONS FULL;
DEFINE FIELD notes ON kitchen_reconciliation TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD parent ON kitchen_reconciliation TYPE none | record<kitchen_reconciliation> | null PERMISSIONS FULL;
DEFINE FIELD revision ON kitchen_reconciliation TYPE int DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD status ON kitchen_reconciliation TYPE string ASSERT $value INSIDE ['draft', 'verified', 'missed'] PERMISSIONS FULL;
DEFINE FIELD superseded_by ON kitchen_reconciliation TYPE none | record<kitchen_reconciliation> | null PERMISSIONS FULL;
DEFINE FIELD verified_at ON kitchen_reconciliation TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD verified_by ON kitchen_reconciliation TYPE none | record<user> | null PERMISSIONS FULL;

DEFINE INDEX kr_kitchen_date_rev ON kitchen_reconciliation FIELDS kitchen, business_date, revision UNIQUE;


-- ------------------------------
-- TABLE: kitchen_reconciliation_item
-- ------------------------------

DEFINE TABLE kitchen_reconciliation_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD actual_consumption ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD complimentary_qty ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD expected_stock ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD issued_qty ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD item ON kitchen_reconciliation_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD opening_stock ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD physical_count ON kitchen_reconciliation_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD posted_to_ledger ON kitchen_reconciliation_item TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD reconciliation ON kitchen_reconciliation_item TYPE record<kitchen_reconciliation> PERMISSIONS FULL;
DEFINE FIELD staff_meal_qty ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD theoretical_consumption ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD transfers_in ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD transfers_out ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD variance ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD waste_qty ON kitchen_reconciliation_item TYPE float DEFAULT 0 PERMISSIONS FULL;

DEFINE INDEX kr_item_unique ON kitchen_reconciliation_item FIELDS reconciliation, item UNIQUE;


-- ------------------------------
-- TABLE: kitchen_reconciliation_revision
-- ------------------------------

DEFINE TABLE kitchen_reconciliation_revision TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD change_type ON kitchen_reconciliation_revision TYPE string PERMISSIONS FULL;
DEFINE FIELD changed_at ON kitchen_reconciliation_revision TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD changed_by ON kitchen_reconciliation_revision TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD field_changes ON kitchen_reconciliation_revision TYPE any DEFAULT [] PERMISSIONS FULL;
DEFINE FIELD reconciliation ON kitchen_reconciliation_revision TYPE record<kitchen_reconciliation> PERMISSIONS FULL;
DEFINE FIELD revision_number ON kitchen_reconciliation_revision TYPE int PERMISSIONS FULL;
DEFINE FIELD snapshot_after ON kitchen_reconciliation_revision TYPE any PERMISSIONS FULL;
DEFINE FIELD snapshot_before ON kitchen_reconciliation_revision TYPE any PERMISSIONS FULL;



-- ------------------------------
-- TABLE: kitchen_staff_meal
-- ------------------------------

DEFINE TABLE kitchen_staff_meal TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON kitchen_staff_meal TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON kitchen_staff_meal TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD dish ON kitchen_staff_meal TYPE none | record<menu_item> | null PERMISSIONS FULL;
DEFINE FIELD item ON kitchen_staff_meal TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD ledger_waste_item ON kitchen_staff_meal TYPE none | record<inventory_item_waste_item> | null PERMISSIONS FULL;
DEFINE FIELD notes ON kitchen_staff_meal TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD quantity ON kitchen_staff_meal TYPE float PERMISSIONS FULL;
DEFINE FIELD reconciliation ON kitchen_staff_meal TYPE record<kitchen_reconciliation> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: kitchen_stock_count
-- ------------------------------

DEFINE TABLE kitchen_stock_count TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD counted_at ON kitchen_stock_count TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD counted_by ON kitchen_stock_count TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD item ON kitchen_stock_count TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD quantity ON kitchen_stock_count TYPE float PERMISSIONS FULL;
DEFINE FIELD reconciliation ON kitchen_stock_count TYPE record<kitchen_reconciliation> PERMISSIONS FULL;

DEFINE INDEX ksc_recon_item ON kitchen_stock_count FIELDS reconciliation, item UNIQUE;


-- ------------------------------
-- TABLE: kitchen_waste
-- ------------------------------

DEFINE TABLE kitchen_waste TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON kitchen_waste TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON kitchen_waste TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD item ON kitchen_waste TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD ledger_waste_item ON kitchen_waste TYPE none | record<inventory_item_waste_item> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON kitchen_waste TYPE float PERMISSIONS FULL;
DEFINE FIELD reason ON kitchen_waste TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD reconciliation ON kitchen_waste TYPE record<kitchen_reconciliation> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: menu
-- ------------------------------

DEFINE TABLE menu TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD active ON menu TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD deleted_at ON menu TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD end_time ON menu TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD ends_on_next_day ON menu TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD items ON menu TYPE array<record<menu_menu_item>> PERMISSIONS FULL;
DEFINE FIELD name ON menu TYPE string PERMISSIONS FULL;
DEFINE FIELD start_from ON menu TYPE none | datetime | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: menu_item
-- ------------------------------

DEFINE TABLE menu_item TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD allow_half ON menu_item TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD allow_service_charges ON menu_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD categories ON menu_item TYPE array<record<category>> PERMISSIONS FULL;
DEFINE FIELD cost ON menu_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD created_at ON menu_item TYPE none | datetime | null DEFAULT time::now() VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD deleted_at ON menu_item TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD discount ON menu_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD discount_type ON menu_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD dish_photo ON menu_item TYPE none | record<document> | null PERMISSIONS FULL;
DEFINE FIELD items ON menu_item TYPE none | array<record<menu_item_recipe>> | null PERMISSIONS FULL;
DEFINE FIELD name ON menu_item TYPE string PERMISSIONS FULL;
DEFINE FIELD number ON menu_item TYPE string PERMISSIONS FULL;
DEFINE FIELD photo ON menu_item TYPE none | bytes | null PERMISSIONS FULL;
DEFINE FIELD position ON menu_item TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD price ON menu_item TYPE float PERMISSIONS FULL;
DEFINE FIELD priority ON menu_item TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD stage_overrides ON menu_item TYPE none | object | null PERMISSIONS FULL;
DEFINE FIELD tax ON menu_item TYPE none | record<tax> | null PERMISSIONS FULL;
DEFINE FIELD workflow ON menu_item TYPE none | record<workflow> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: menu_item_modifier_group
-- ------------------------------

DEFINE TABLE menu_item_modifier_group TYPE RELATION IN menu_item OUT modifier_group SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD has_required_modifiers ON menu_item_modifier_group TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD in ON menu_item_modifier_group TYPE record<menu_item> PERMISSIONS FULL;
DEFINE FIELD out ON menu_item_modifier_group TYPE record<modifier_group> PERMISSIONS FULL;
DEFINE FIELD priority ON menu_item_modifier_group TYPE none | int | null DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD required_modifiers ON menu_item_modifier_group TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD should_auto_open ON menu_item_modifier_group TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD should_auto_select ON menu_item_modifier_group TYPE none | bool | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: menu_item_recipe
-- ------------------------------

DEFINE TABLE menu_item_recipe TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD cost ON menu_item_recipe TYPE float PERMISSIONS FULL;
DEFINE FIELD is_price_locked ON menu_item_recipe TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD item ON menu_item_recipe TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD menu_item ON menu_item_recipe TYPE none | record<menu_item> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON menu_item_recipe TYPE float PERMISSIONS FULL;



-- ------------------------------
-- TABLE: menu_menu_item
-- ------------------------------

DEFINE TABLE menu_menu_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD active ON menu_menu_item TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD menu_item ON menu_menu_item TYPE record<menu_item> PERMISSIONS FULL;
DEFINE FIELD price ON menu_menu_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD tax ON menu_menu_item TYPE none | record<tax> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: modifier
-- ------------------------------

DEFINE TABLE modifier TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD allowed_next_groups ON modifier TYPE none | array<record<modifier_group> | none> PERMISSIONS FULL;
DEFINE FIELD modifier ON modifier TYPE record<menu_item> PERMISSIONS FULL;
DEFINE FIELD next_group_overrides ON modifier TYPE any PERMISSIONS FULL;
DEFINE FIELD price ON modifier TYPE float PERMISSIONS FULL;



-- ------------------------------
-- TABLE: modifier_group
-- ------------------------------

DEFINE TABLE modifier_group TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD background ON modifier_group TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD color ON modifier_group TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD deleted_at ON modifier_group TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD modifiers ON modifier_group TYPE array<record<modifier>> PERMISSIONS FULL;
DEFINE FIELD name ON modifier_group TYPE string PERMISSIONS FULL;
DEFINE FIELD priority ON modifier_group TYPE int PERMISSIONS FULL;



-- ------------------------------
-- TABLE: notes
-- ------------------------------

DEFINE TABLE notes TYPE ANY SCHEMALESS PERMISSIONS NONE;

DEFINE FIELD payments_data ON notes TYPE string | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order
-- ------------------------------

DEFINE TABLE order TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD auto_id ON order TYPE int DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD cashier ON order TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD completed_at ON order TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD coupon ON order TYPE none | record<order_coupon> | null PERMISSIONS FULL;
DEFINE FIELD covers ON order TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD created_at ON order TYPE datetime PERMISSIONS FULL;
DEFINE FIELD customer ON order TYPE none | record<customer> | null PERMISSIONS FULL;
DEFINE FIELD delivery ON order TYPE any PERMISSIONS FULL;
DEFINE FIELD discount ON order TYPE none | record<discount> | null PERMISSIONS FULL;
DEFINE FIELD discount_amount ON order TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD discount_manager ON order TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD discount_rate ON order TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD extras ON order TYPE none | array<record<order_extras>> | null PERMISSIONS FULL;
DEFINE FIELD floor ON order TYPE none | record<floor> | null PERMISSIONS FULL;
DEFINE FIELD invoice_number ON order TYPE int PERMISSIONS FULL;
DEFINE FIELD invoice_prefix ON order TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD items ON order TYPE array<record<order_item>> PERMISSIONS FULL;
DEFINE FIELD notes ON order TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD order_type ON order TYPE record<order_type> PERMISSIONS FULL;
DEFINE FIELD payments ON order TYPE none | array<record<order_payment>> | null PERMISSIONS FULL;
DEFINE FIELD service_charge ON order TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD service_charge_amount ON order TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD service_charge_type ON order TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD split ON order TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD status ON order TYPE string PERMISSIONS FULL;
DEFINE FIELD `table` ON order TYPE none | record<floor_table> | null PERMISSIONS FULL;
DEFINE FIELD tags ON order TYPE none | array<string> | null PERMISSIONS FULL;
DEFINE FIELD tax ON order TYPE none | record<tax> | null PERMISSIONS FULL;
DEFINE FIELD tax_amount ON order TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD tip ON order TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD tip_amount ON order TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD tip_type ON order TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD updated_at ON order TYPE none | datetime | null DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD user ON order TYPE none | record<user> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_coupon
-- ------------------------------

DEFINE TABLE order_coupon TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD coupon ON order_coupon TYPE record<coupon> PERMISSIONS FULL;
DEFINE FIELD created_at ON order_coupon TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD discount ON order_coupon TYPE float PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_discount
-- ------------------------------

DEFINE TABLE order_discount TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD application_type ON order_discount TYPE string PERMISSIONS FULL;
DEFINE FIELD applied_amount ON order_discount TYPE float PERMISSIONS FULL;
DEFINE FIELD applied_by ON order_discount TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD applied_rate ON order_discount TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD approved_by ON order_discount TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD auth_method ON order_discount TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD base_amount ON order_discount TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD created_at ON order_discount TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD discount ON order_discount TYPE record<discount> PERMISSIONS FULL;
DEFINE FIELD line_allocations ON order_discount TYPE any DEFAULT [] PERMISSIONS FULL;
DEFINE FIELD name ON order_discount TYPE string PERMISSIONS FULL;
DEFINE FIELD order ON order_discount TYPE record<order> PERMISSIONS FULL;
DEFINE FIELD order_items ON order_discount TYPE array<record<order_item>> DEFAULT [] PERMISSIONS FULL;
DEFINE FIELD reason ON order_discount TYPE none | record<discount_reason> | null PERMISSIONS FULL;
DEFINE FIELD reason_text ON order_discount TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD removed_at ON order_discount TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD removed_by ON order_discount TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD scope ON order_discount TYPE string PERMISSIONS FULL;
DEFINE FIELD tax_treatment ON order_discount TYPE string DEFAULT 'tax_before_discount' PERMISSIONS FULL;
DEFINE FIELD value_type ON order_discount TYPE string PERMISSIONS FULL;

DEFINE INDEX od_order ON order_discount FIELDS order;
DEFINE INDEX od_order_active ON order_discount FIELDS order, removed_at;


-- ------------------------------
-- TABLE: order_extras
-- ------------------------------

DEFINE TABLE order_extras TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON order_extras TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD name ON order_extras TYPE string PERMISSIONS FULL;
DEFINE FIELD `value` ON order_extras TYPE float PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_item
-- ------------------------------

DEFINE TABLE order_item TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD category ON order_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD category_id ON order_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD comments ON order_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD cost ON order_item TYPE none | float PERMISSIONS FULL;
DEFINE FIELD created_at ON order_item TYPE datetime PERMISSIONS FULL;
DEFINE FIELD created_by ON order_item TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD current_sequence ON order_item TYPE none | int | null DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD deleted_at ON order_item TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD discount ON order_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD is_addition ON order_item TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD is_refunded ON order_item TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD is_suspended ON order_item TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD item ON order_item TYPE none | record<menu_item> | null PERMISSIONS FULL;
DEFINE FIELD level ON order_item TYPE int PERMISSIONS FULL;
DEFINE FIELD menu ON order_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD modifiers ON order_item TYPE any PERMISSIONS FULL;
DEFINE FIELD order ON order_item TYPE none | record<order> | null PERMISSIONS FULL;
DEFINE FIELD original_price ON order_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD position ON order_item TYPE int PERMISSIONS FULL;
DEFINE FIELD price ON order_item TYPE float PERMISSIONS FULL;
DEFINE FIELD quantity ON order_item TYPE float PERMISSIONS FULL;
DEFINE FIELD seat ON order_item TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD service_charges ON order_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD tax ON order_item TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD updated_at ON order_item TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD workflow ON order_item TYPE none | record<workflow> | null PERMISSIONS FULL;
DEFINE FIELD workflow_status ON order_item TYPE none | string | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_item_kitchen
-- ------------------------------

DEFINE TABLE order_item_kitchen TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD activated_at ON order_item_kitchen TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD completed_at ON order_item_kitchen TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD completed_by ON order_item_kitchen TYPE none | array<record<user>> DEFAULT [] PERMISSIONS FULL;
DEFINE FIELD created_at ON order_item_kitchen TYPE datetime PERMISSIONS FULL;
DEFINE FIELD is_terminal ON order_item_kitchen TYPE none | bool | null DEFAULT false PERMISSIONS FULL;
DEFINE FIELD kitchen ON order_item_kitchen TYPE record<kitchen> PERMISSIONS FULL;
DEFINE FIELD order_item ON order_item_kitchen TYPE record<order_item> PERMISSIONS FULL;
DEFINE FIELD `sequence` ON order_item_kitchen TYPE none | int | null DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD stage ON order_item_kitchen TYPE none | record<workflow_stage> | null PERMISSIONS FULL;
DEFINE FIELD stage_name ON order_item_kitchen TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD started_at ON order_item_kitchen TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD status ON order_item_kitchen TYPE none | string | null DEFAULT 'pending' PERMISSIONS FULL;
DEFINE FIELD user ON order_item_kitchen TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD workflow ON order_item_kitchen TYPE none | record<workflow> | null PERMISSIONS FULL;

DEFINE INDEX oik_kitchen_status ON order_item_kitchen FIELDS kitchen, status;
DEFINE INDEX oik_order_item ON order_item_kitchen FIELDS order_item;


-- ------------------------------
-- TABLE: order_merge
-- ------------------------------

DEFINE TABLE order_merge TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON order_merge TYPE datetime PERMISSIONS FULL;
DEFINE FIELD created_by ON order_merge TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD new_items ON order_merge TYPE any PERMISSIONS FULL;
DEFINE FIELD new_order ON order_merge TYPE record<order> PERMISSIONS FULL;
DEFINE FIELD old_items ON order_merge TYPE any PERMISSIONS FULL;
DEFINE FIELD old_orders ON order_merge TYPE array<record<order>> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_meta
-- ------------------------------

DEFINE TABLE order_meta TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD name ON order_meta TYPE string PERMISSIONS FULL;
DEFINE FIELD `value` ON order_meta PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_payment
-- ------------------------------

DEFINE TABLE order_payment TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD amount ON order_payment TYPE float PERMISSIONS FULL;
DEFINE FIELD comments ON order_payment TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD payable ON order_payment TYPE float PERMISSIONS FULL;
DEFINE FIELD payment_type ON order_payment TYPE record<payment_type> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_refund
-- ------------------------------

DEFINE TABLE order_refund TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON order_refund TYPE datetime PERMISSIONS FULL;
DEFINE FIELD items ON order_refund TYPE array<record<order_item>> PERMISSIONS FULL;
DEFINE FIELD logged_in_user ON order_refund TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD manager ON order_refund TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD order ON order_refund TYPE record<order> PERMISSIONS FULL;
DEFINE FIELD reason ON order_refund TYPE none | string | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_split
-- ------------------------------

DEFINE TABLE order_split TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON order_split TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON order_split TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD new_items ON order_split TYPE any PERMISSIONS FULL;
DEFINE FIELD new_orders ON order_split TYPE array<record<order>> PERMISSIONS FULL;
DEFINE FIELD old_items ON order_split TYPE any PERMISSIONS FULL;
DEFINE FIELD old_order ON order_split TYPE record<order> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_type
-- ------------------------------

DEFINE TABLE order_type TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD allow_service_charges ON order_type TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD deleted_at ON order_type TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD name ON order_type TYPE string PERMISSIONS FULL;
DEFINE FIELD priority ON order_type TYPE int PERMISSIONS FULL;



-- ------------------------------
-- TABLE: order_void
-- ------------------------------

DEFINE TABLE order_void TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD comments ON order_void TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD created_at ON order_void TYPE datetime PERMISSIONS FULL;
DEFINE FIELD deleted_by ON order_void TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD items ON order_void TYPE array<record<order_item>> PERMISSIONS FULL;
DEFINE FIELD logged_in_user ON order_void TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD order ON order_void TYPE none | record<order> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON order_void TYPE float PERMISSIONS FULL;
DEFINE FIELD reason ON order_void TYPE string PERMISSIONS FULL;



-- ------------------------------
-- TABLE: payment_type
-- ------------------------------

DEFINE TABLE payment_type TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD deleted_at ON payment_type TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD discounts ON payment_type TYPE none | array<record<discount>> | null PERMISSIONS FULL;
DEFINE FIELD gateway ON payment_type TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD gateway_config ON payment_type TYPE none | record<payment_type_gateway_config> | null PERMISSIONS FULL;
DEFINE FIELD gateway_mode ON payment_type TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD has_discount ON payment_type TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD name ON payment_type TYPE string PERMISSIONS FULL;
DEFINE FIELD priority ON payment_type TYPE int PERMISSIONS FULL;
DEFINE FIELD tax ON payment_type TYPE none | record<tax> | null PERMISSIONS FULL;
DEFINE FIELD type ON payment_type TYPE string PERMISSIONS FULL;



-- ------------------------------
-- TABLE: payment_type_gateway_config
-- ------------------------------

DEFINE TABLE payment_type_gateway_config TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD client_id ON payment_type_gateway_config TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD client_secret ON payment_type_gateway_config TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD integrity_salt ON payment_type_gateway_config TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD merchant_id ON payment_type_gateway_config TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD public_key ON payment_type_gateway_config TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD secret_key ON payment_type_gateway_config TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD webhook_secret ON payment_type_gateway_config TYPE none | string | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: payment_webhook
-- ------------------------------

DEFINE TABLE payment_webhook TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON payment_webhook TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD data ON payment_webhook TYPE any PERMISSIONS FULL;
DEFINE FIELD gateway ON payment_webhook TYPE string PERMISSIONS FULL;
DEFINE FIELD key ON payment_webhook TYPE string PERMISSIONS FULL;

DEFINE INDEX payment_webhook_key_gateway ON payment_webhook FIELDS key, gateway UNIQUE;


-- ------------------------------
-- TABLE: printer
-- ------------------------------

DEFINE TABLE printer TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD deleted_at ON printer TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD ip_address ON printer TYPE string PERMISSIONS FULL;
DEFINE FIELD name ON printer TYPE string PERMISSIONS FULL;
DEFINE FIELD pid ON printer TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD port ON printer TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD prints ON printer TYPE int PERMISSIONS FULL;
DEFINE FIELD priority ON printer TYPE none | int | null PERMISSIONS FULL;
DEFINE FIELD type ON printer TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD vid ON printer TYPE none | string | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: production_batch
-- ------------------------------

DEFINE TABLE production_batch TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD batch_number ON production_batch TYPE string PERMISSIONS FULL;
DEFINE FIELD completed_at ON production_batch TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD cost_allocation ON production_batch TYPE string DEFAULT 'yield' ASSERT $value INSIDE ['yield', 'value'] PERMISSIONS FULL;
DEFINE FIELD created_at ON production_batch TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON production_batch TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD notes ON production_batch TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD produced_qty ON production_batch TYPE float PERMISSIONS FULL;
DEFINE FIELD recipe ON production_batch TYPE record<recipe> PERMISSIONS FULL;
DEFINE FIELD scale_factor ON production_batch TYPE float PERMISSIONS FULL;
DEFINE FIELD status ON production_batch TYPE string DEFAULT 'completed' ASSERT $value INSIDE ['completed', 'voided'] PERMISSIONS FULL;
DEFINE FIELD store ON production_batch TYPE record<inventory_store> PERMISSIONS FULL;
DEFINE FIELD total_input_cost ON production_batch TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD total_output_cost ON production_batch TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD yield_loss_percent ON production_batch TYPE float DEFAULT 0 PERMISSIONS FULL;

DEFINE INDEX pb_store_date ON production_batch FIELDS store, created_at;


-- ------------------------------
-- TABLE: production_batch_input
-- ------------------------------

DEFINE TABLE production_batch_input TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD batch ON production_batch_input TYPE record<production_batch> PERMISSIONS FULL;
DEFINE FIELD item ON production_batch_input TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD quantity ON production_batch_input TYPE float PERMISSIONS FULL;
DEFINE FIELD store ON production_batch_input TYPE record<inventory_store> PERMISSIONS FULL;
DEFINE FIELD total_cost ON production_batch_input TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD unit_cost ON production_batch_input TYPE float DEFAULT 0 PERMISSIONS FULL;

DEFINE INDEX pbi_item_store ON production_batch_input FIELDS item, store;


-- ------------------------------
-- TABLE: production_batch_output
-- ------------------------------

DEFINE TABLE production_batch_output TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD allocated_cost ON production_batch_output TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD batch ON production_batch_output TYPE record<production_batch> PERMISSIONS FULL;
DEFINE FIELD disposition ON production_batch_output TYPE string DEFAULT 'inventory' ASSERT $value INSIDE ['inventory', 'waste'] PERMISSIONS FULL;
DEFINE FIELD item ON production_batch_output TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD ledger_waste_item ON production_batch_output TYPE none | record<inventory_item_waste_item> | null PERMISSIONS FULL;
DEFINE FIELD quantity ON production_batch_output TYPE float PERMISSIONS FULL;
DEFINE FIELD store ON production_batch_output TYPE record<inventory_store> PERMISSIONS FULL;
DEFINE FIELD unit_cost ON production_batch_output TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD yield_percent ON production_batch_output TYPE float DEFAULT 0 PERMISSIONS FULL;

DEFINE INDEX pbo_item_store ON production_batch_output FIELDS item, store;


-- ------------------------------
-- TABLE: recipe
-- ------------------------------

DEFINE TABLE recipe TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD base_batch_qty ON recipe TYPE float DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD code ON recipe TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD cost_allocation ON recipe TYPE string DEFAULT 'yield' ASSERT $value INSIDE ['yield', 'value'] PERMISSIONS FULL;
DEFINE FIELD created_at ON recipe TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON recipe TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD is_active ON recipe TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD name ON recipe TYPE string PERMISSIONS FULL;
DEFINE FIELD notes ON recipe TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD primary_output ON recipe TYPE none | record<recipe_output> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: recipe_item
-- ------------------------------

DEFINE TABLE recipe_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD item ON recipe_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD quantity ON recipe_item TYPE float PERMISSIONS FULL;
DEFINE FIELD recipe ON recipe_item TYPE record<recipe> PERMISSIONS FULL;
DEFINE FIELD sort_order ON recipe_item TYPE int DEFAULT 0 PERMISSIONS FULL;



-- ------------------------------
-- TABLE: recipe_output
-- ------------------------------

DEFINE TABLE recipe_output TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD disposition ON recipe_output TYPE string DEFAULT 'inventory' ASSERT $value INSIDE ['inventory', 'waste'] PERMISSIONS FULL;
DEFINE FIELD is_primary ON recipe_output TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD item ON recipe_output TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD recipe ON recipe_output TYPE record<recipe> PERMISSIONS FULL;
DEFINE FIELD sort_order ON recipe_output TYPE int DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD value_weight ON recipe_output TYPE float DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD yield_percent ON recipe_output TYPE float PERMISSIONS FULL;



-- ------------------------------
-- TABLE: role_discount_policy
-- ------------------------------

DEFINE TABLE role_discount_policy TYPE ANY SCHEMALESS PERMISSIONS NONE;

DEFINE FIELD allowed_categories ON role_discount_policy TYPE array<string> DEFAULT [] PERMISSIONS FULL;
DEFINE FIELD can_apply_manual ON role_discount_policy TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD can_override_approval ON role_discount_policy TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD max_fixed_amount ON role_discount_policy TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD max_percent ON role_discount_policy TYPE none | float | null PERMISSIONS FULL;
DEFINE FIELD user_role ON role_discount_policy TYPE record<user_role> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: setting
-- ------------------------------

DEFINE TABLE setting TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD is_global ON setting TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD key ON setting TYPE string PERMISSIONS FULL;
DEFINE FIELD user ON setting TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD values ON setting TYPE any PERMISSIONS FULL;



-- ------------------------------
-- TABLE: shift
-- ------------------------------

DEFINE TABLE shift TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD deleted_at ON shift TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD end_time ON shift TYPE string PERMISSIONS FULL;
DEFINE FIELD ends_next_day ON shift TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD name ON shift TYPE string PERMISSIONS FULL;
DEFINE FIELD start_time ON shift TYPE string PERMISSIONS FULL;



-- ------------------------------
-- TABLE: stock_transfer
-- ------------------------------

DEFINE TABLE stock_transfer TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON stock_transfer TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON stock_transfer TYPE record<user> PERMISSIONS FULL;
DEFINE FIELD from_kitchen ON stock_transfer TYPE none | record<kitchen> | null PERMISSIONS FULL;
DEFINE FIELD from_store ON stock_transfer TYPE none | record<inventory_store> | null PERMISSIONS FULL;
DEFINE FIELD notes ON stock_transfer TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD to_kitchen ON stock_transfer TYPE none | record<kitchen> | null PERMISSIONS FULL;
DEFINE FIELD to_store ON stock_transfer TYPE none | record<inventory_store> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: stock_transfer_item
-- ------------------------------

DEFINE TABLE stock_transfer_item TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD item ON stock_transfer_item TYPE record<inventory_item> PERMISSIONS FULL;
DEFINE FIELD quantity ON stock_transfer_item TYPE float PERMISSIONS FULL;
DEFINE FIELD transfer ON stock_transfer_item TYPE record<stock_transfer> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: tax
-- ------------------------------

DEFINE TABLE tax TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD deleted_at ON tax TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD name ON tax TYPE string PERMISSIONS FULL;
DEFINE FIELD priority ON tax TYPE int PERMISSIONS FULL;
DEFINE FIELD rate ON tax TYPE float PERMISSIONS FULL;



-- ------------------------------
-- TABLE: time_entry
-- ------------------------------

DEFINE TABLE time_entry TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD clock_in ON time_entry TYPE datetime PERMISSIONS FULL;
DEFINE FIELD clock_out ON time_entry TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD duration_seconds ON time_entry VALUE (IF $after.clock_out != NONE { time::unix($after.clock_out) - time::unix($after.clock_in) } ELSE { NONE }) PERMISSIONS FULL;
DEFINE FIELD platform ON time_entry TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD user ON time_entry TYPE record<user> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: tip_distribution
-- ------------------------------

DEFINE TABLE tip_distribution TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON tip_distribution TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON tip_distribution TYPE none | record<user> | null PERMISSIONS FULL;
DEFINE FIELD from_at ON tip_distribution TYPE datetime PERMISSIONS FULL;
DEFINE FIELD shift ON tip_distribution TYPE record<shift> PERMISSIONS FULL;
DEFINE FIELD to_at ON tip_distribution TYPE datetime PERMISSIONS FULL;
DEFINE FIELD total_tips ON tip_distribution TYPE float PERMISSIONS FULL;
DEFINE FIELD users ON tip_distribution TYPE array<record<tip_distribution_user_share>> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: tip_distribution_user_share
-- ------------------------------

DEFINE TABLE tip_distribution_user_share TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD amount ON tip_distribution_user_share TYPE float PERMISSIONS FULL;
DEFINE FIELD user ON tip_distribution_user_share TYPE none | record<user> | string PERMISSIONS FULL;
DEFINE FIELD weight ON tip_distribution_user_share TYPE float PERMISSIONS FULL;



-- ------------------------------
-- TABLE: tracking
-- ------------------------------

DEFINE TABLE tracking TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD auth_method ON tracking TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD coords ON tracking TYPE none | object | null PERMISSIONS FULL;
DEFINE FIELD created_at ON tracking TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD manager ON tracking TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD manager_role ON tracking TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD module ON tracking TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD page ON tracking TYPE string PERMISSIONS FULL;
DEFINE FIELD payload ON tracking TYPE any PERMISSIONS FULL;
DEFINE FIELD resolution ON tracking TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD user ON tracking TYPE string PERMISSIONS FULL;
DEFINE FIELD user_agent ON tracking TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD user_role ON tracking TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD user_shift ON tracking TYPE none | string | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: user
-- ------------------------------

DEFINE TABLE user TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD deleted_at ON user TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD first_name ON user TYPE string PERMISSIONS FULL;
DEFINE FIELD last_name ON user TYPE string PERMISSIONS FULL;
DEFINE FIELD login ON user TYPE string PERMISSIONS FULL;
DEFINE FIELD login_method ON user TYPE none | string | null DEFAULT pin PERMISSIONS FULL;
DEFINE FIELD password ON user TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD roles ON user TYPE array<string> PERMISSIONS FULL;
DEFINE FIELD user_role ON user TYPE none | record<user_role> | null PERMISSIONS FULL;
DEFINE FIELD user_shift ON user TYPE none | record<shift> | null PERMISSIONS FULL;



-- ------------------------------
-- TABLE: user_role
-- ------------------------------

DEFINE TABLE user_role TYPE ANY SCHEMALESS PERMISSIONS NONE;

DEFINE FIELD deleted_at ON user_role TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD name ON user_role TYPE string PERMISSIONS FULL;
DEFINE FIELD roles ON user_role TYPE array<string> PERMISSIONS FULL;



-- ------------------------------
-- TABLE: workflow
-- ------------------------------

DEFINE TABLE workflow TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON workflow TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD deleted_at ON workflow TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD name ON workflow TYPE string PERMISSIONS FULL;



-- ------------------------------
-- TABLE: workflow_stage
-- ------------------------------

DEFINE TABLE workflow_stage TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD created_at ON workflow_stage TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD is_terminal ON workflow_stage TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD kitchen ON workflow_stage TYPE record<kitchen> PERMISSIONS FULL;
DEFINE FIELD name ON workflow_stage TYPE string PERMISSIONS FULL;
DEFINE FIELD `sequence` ON workflow_stage TYPE int DEFAULT 1 PERMISSIONS FULL;
DEFINE FIELD workflow ON workflow_stage TYPE record<workflow> PERMISSIONS FULL;

DEFINE INDEX workflow_stage_seq ON workflow_stage FIELDS workflow, `sequence`;


