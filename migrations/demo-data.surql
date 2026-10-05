-- ------------------------------
-- OPTION
-- ------------------------------

OPTION IMPORT;

-- ------------------------------
-- TABLE: _schema_migration
-- ------------------------------

DEFINE TABLE _schema_migration TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD applied_at ON _schema_migration TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD name ON _schema_migration TYPE string PERMISSIONS FULL;
DEFINE FIELD note ON _schema_migration TYPE none | string PERMISSIONS FULL;

DEFINE INDEX _schema_migration_name ON _schema_migration FIELDS name UNIQUE;


-- ------------------------------
-- TABLE DATA: _schema_migration
-- ------------------------------

INSERT [ { applied_at: d'2026-09-06T06:26:45.827893847Z', id: _schema_migration:0dy0a3tx360ijcp8wfee, name: '2026_09_04_terminal_sync', note: '2026_09_04_terminal_sync.surql' }, { applied_at: d'2026-08-30T18:34:44.031692748Z', id: _schema_migration:1f9o70q17tp8ear299x2, name: '2026_08_08_order_discounts', note: '2026_08_08_order_discounts.surql' }, { applied_at: d'2026-08-30T18:35:59.321379648Z', id: _schema_migration:1k10b0yus5gi83fb2yas, name: '2026_08_27_revoked_session_store', note: '2026_08_27_revoked_session_store.surql' }, { applied_at: d'2026-09-01T17:15:30.303298951Z', id: _schema_migration:2t42fuezin4drc91a89t, name: '2026_08_28_audit_log_events', note: '2026_08_28_audit_log_events.surql' }, { applied_at: d'2026-08-30T18:26:57.258945828Z', id: _schema_migration:9c6q4gqsed3n5dnbwfui, name: '2026_07_18_location_stock_cutover', note: '2026_07_18_location_stock_cutover.surql' }, { applied_at: d'2026-08-30T18:36:31.459214831Z', id: _schema_migration:an1oiclzpu43tlag5h4q, name: '2026_08_27_payment_credential_encryption_backfill', note: 'encrypt-existing-payment-credentials.cjs' }, { applied_at: d'2026-08-30T18:26:57.212026824Z', id: _schema_migration:b09jxvsklpitcy6frs3i, name: '2026_07_18_inventory_phases_5_9', note: '2026_07_18_inventory_phases_5_9.surql' }, { applied_at: d'2026-08-30T18:35:59.208064448Z', id: _schema_migration:b0w74bwqhf0cl3hdsacv, name: '2026_08_22_order_list_indexes', note: '2026_08_22_order_list_indexes.surql' }, { applied_at: d'2026-08-30T18:27:59.890796576Z', id: _schema_migration:b36p00hp8kg26739h1cj, name: '2026_07_20_fix_purchase_extras', note: '2026_07_20.surql' }, { applied_at: d'2026-08-30T18:35:47.347501323Z', id: _schema_migration:bgp4agufhelrcmf7x60g, name: '2026_08_09_payment_type_discounts_backfill', note: 'backfill-payment-type-discounts.cjs' }, { applied_at: d'2026-08-30T18:35:59.200364125Z', id: _schema_migration:d6p76hyyhw4vma2q4nr6, name: '2026_08_18_flexible_payroll', note: '2026_08_18_flexible_payroll.surql' }, { applied_at: d'2026-08-30T18:34:43.336791910Z', id: _schema_migration:eza4jykqtutb8h8gkw8d, name: '2026_08_03_external_accounting_integration', note: '2026_08_03_external_accounting_integration.surql' }, { applied_at: d'2026-08-30T18:27:59.923617147Z', id: _schema_migration:f5ky0suioan53s7t7j6m, name: '2026_07_24_order_print', note: '2026_07_24_order_print.surql' }, { applied_at: d'2026-09-01T17:16:51.920528402Z', id: _schema_migration:gezad17gxvtax8hbycjf, name: '2026_08_28_security_alerts_access_backfill', note: 'backfill-security-alerts-access.cjs' }, { applied_at: d'2026-08-30T18:27:59.907890197Z', id: _schema_migration:hk236x8e0bsz0ok8yf33, name: '2026_07_23_purchase_order_approval', note: '2026_07_23_purchase_order_approval.surql' }, { applied_at: d'2026-09-01T17:15:48.668000360Z', id: _schema_migration:i5814zpdsnbnzd87wrie, name: '2026_08_28_security_alerts', note: '2026_08_28_security_alerts.surql' }, { applied_at: d'2026-08-30T18:26:57.123483814Z', id: _schema_migration:ix1tvotasssztxuo5grq, name: '2026_07_17_inventory_lifecycle', note: '2026_07_17_inventory_lifecycle.surql' }, { applied_at: d'2026-08-30T18:27:59.856451466Z', id: _schema_migration:jhs43enjco5n5odcqtp9, name: '2026_07_18_location_refs_backfill', note: 'backfill-location-refs.cjs' }, { applied_at: d'2026-08-30T18:33:51.316780770Z', id: _schema_migration:k97jae1oh75ie1q78f9b, name: '2026_07_30_ledger_business_date_tz', note: 'backfill-ledger-business-date.cjs' }, { applied_at: d'2026-08-30T18:32:44.533767433Z', id: _schema_migration:mdpxgw7hx85ylw9e3j0v, name: '2026_07_26_access_modules_backfill', note: 'backfill-access-modules.cjs' }, { applied_at: d'2026-08-30T18:27:59.882537396Z', id: _schema_migration:mmmg2z5qa423zy42krzl, name: '2026_07_18_purchase_landed_cost', note: '2026_07_18_purchase_landed_cost.surql' }, { applied_at: d'2026-08-30T18:31:42.490441085Z', id: _schema_migration:os12wqtow0yjv8o4ha6w, name: '2026_07_28_kitchen_reconciliation_location', note: '2026_07_28_kitchen_reconciliation_location.surql' }, { applied_at: d'2026-08-30T18:35:59.284715865Z', id: _schema_migration:r7a9wztcreu5807wdhky, name: '2026_08_30_hot_path_indexes', note: '2026_08_30_hot_path_indexes.surql' }, { applied_at: d'2026-08-30T18:34:43.351926720Z', id: _schema_migration:s80g702byiuo5j27zghu, name: '2026_08_06_order_number_seq', note: '2026_08_06_order_number_seq.surql' }, { applied_at: d'2026-09-06T06:26:45.886936490Z', id: _schema_migration:umpm73lnfgdqkeinn2tk, name: '2026_09_06_sync_schemaless_reset', note: '2026_09_06_sync_schemaless_reset.surql' }, { applied_at: d'2026-08-30T18:35:59.338936851Z', id: _schema_migration:wcpuvgczpym0uz7icyam, name: '2026_08_27_payment_credential_encryption', note: '2026_08_27_payment_credential_encryption.surql' }, { applied_at: d'2026-08-30T18:26:57.151239275Z', id: _schema_migration:wzgylz19ug994sxnh19u, name: '2026_07_17_inventory_ledger', note: '2026_07_17_inventory_ledger.surql' } ];

-- ------------------------------
-- TABLE: account
-- ------------------------------

DEFINE TABLE account TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD account_type ON account TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD code ON account TYPE string PERMISSIONS FULL;
DEFINE FIELD created_at ON account TYPE none | datetime | null VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD group ON account TYPE none | record<account_group> | null PERMISSIONS FULL;
DEFINE FIELD is_active ON account TYPE none | bool | null DEFAULT true PERMISSIONS FULL;
DEFINE FIELD name ON account TYPE string PERMISSIONS FULL;
DEFINE FIELD normal_balance ON account TYPE string PERMISSIONS FULL;
DEFINE FIELD notes ON account TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD parent ON account TYPE none | record<account> | null PERMISSIONS FULL;
DEFINE FIELD updated_at ON account TYPE none | datetime | null PERMISSIONS FULL;

DEFINE INDEX account_code_store_unique ON account FIELDS code UNIQUE;


-- ------------------------------
-- TABLE DATA: account
-- ------------------------------

INSERT [ { account_type: 'liability', code: '1006', created_at: d'2026-06-28T14:45:01.181786358Z', group: account_group:lnkh3dyo4j92awehf1k4, id: account:2kf91iqbab7hsy4cqbom, is_active: true, name: 'Supplier Maria', normal_balance: 'credit', notes: NULL, parent: NULL }, { account_type: 'asset', code: '1002', created_at: d'2026-06-26T17:00:10.149966878Z', group: account_group:ohh5yogchyn5adxwalma, id: account:2rx42i1itut2ui3n2col, is_active: true, name: 'Bank', normal_balance: 'debit', notes: NULL, parent: NULL }, { account_type: 'asset', code: '1001', created_at: d'2026-06-26T17:00:10.139396465Z', group: account_group:ohh5yogchyn5adxwalma, id: account:47veeffbivwz4hk1ieae, is_active: true, name: 'Cash', normal_balance: 'debit', notes: NULL, parent: NULL }, { account_type: 'liability', code: '1008', created_at: d'2026-07-14T18:03:30.905118422Z', group: account_group:lnkh3dyo4j92awehf1k4, id: account:9gvm3y2l7g6ijw3dv7qs, is_active: true, name: 'VAT', normal_balance: 'credit', notes: NULL, parent: NULL }, { account_type: 'expense', code: '1009', created_at: d'2026-07-14T18:03:43.460582939Z', group: account_group:pqq0gs3aiizl3bwsib4n, id: account:b74f7n3c05ntprs031wt, is_active: true, name: 'Discounts', normal_balance: 'debit', notes: NULL, parent: NULL }, { account_type: 'liability', code: '1013', created_at: d'2026-07-14T18:05:27.819566517Z', group: account_group:lnkh3dyo4j92awehf1k4, id: account:beb3ut8reg9gajlr5koy, is_active: true, name: 'Salary payable', normal_balance: 'credit', notes: NULL, parent: NULL }, { account_type: 'liability', code: '1004', created_at: d'2026-06-26T17:00:10.167471748Z', group: account_group:lnkh3dyo4j92awehf1k4, id: account:fs4omb61rgalwux3v2v1, is_active: true, name: 'Expenses', normal_balance: 'debit', notes: NULL, parent: NULL }, { account_type: 'asset', code: '1007', created_at: d'2026-06-26T17:00:10.185437304Z', group: account_group:ohh5yogchyn5adxwalma, id: account:gj00e7j5qy3pyyz6nn72, is_active: true, name: 'Salary', normal_balance: 'debit', notes: NULL, parent: NULL }, { account_type: 'equity', code: '1005', created_at: d'2026-06-26T17:00:53.943331480Z', group: account_group:iey1hji7f98ywwpshviq, id: account:gtm77dt4qtwdndgbdpdg, is_active: true, name: 'Equity', normal_balance: 'credit', notes: NULL, parent: NULL }, { account_type: 'equity', code: '251', created_at: d'2026-08-17T13:28:31.184442059Z', group: account_group:iey1hji7f98ywwpshviq, id: account:h418agzo119r7c80h889, is_active: false, name: 'Equity', normal_balance: 'credit', notes: NULL, parent: NULL }, { account_type: 'expense', code: '1003', created_at: d'2026-06-26T17:00:10.160424561Z', group: account_group:pqq0gs3aiizl3bwsib4n, id: account:muv9o5reu6huiogziqpa, is_active: true, name: 'Sale', normal_balance: 'credit', notes: NULL, parent: NULL }, { account_type: 'liability', code: '1010', created_at: d'2026-07-14T18:04:06.636220898Z', group: account_group:lnkh3dyo4j92awehf1k4, id: account:u9e3wb9p5qjv9q57grst, is_active: true, name: 'Tips', normal_balance: 'credit', notes: NULL, parent: NULL }, { account_type: 'asset', code: '1011', created_at: d'2026-07-14T18:04:32.041274914Z', group: account_group:ohh5yogchyn5adxwalma, id: account:utrslgslthtgrl2u6n3c, is_active: true, name: 'Inventory', normal_balance: 'debit', notes: NULL, parent: NULL }, { account_type: 'expense', code: '1012', created_at: d'2026-07-14T18:05:08.188747275Z', group: account_group:pqq0gs3aiizl3bwsib4n, id: account:xeqgulokr2rjqxbrh5s6, is_active: true, name: 'COGS', normal_balance: 'debit', notes: NULL, parent: NULL } ];

-- ------------------------------
-- TABLE: account_group
-- ------------------------------

DEFINE TABLE account_group TYPE ANY SCHEMALESS PERMISSIONS NONE;

DEFINE FIELD code ON account_group TYPE string PERMISSIONS FULL;
DEFINE FIELD created_at ON account_group TYPE none | datetime | null VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD head_type ON account_group TYPE string PERMISSIONS FULL;
DEFINE FIELD is_active ON account_group TYPE none | bool | null DEFAULT true PERMISSIONS FULL;
DEFINE FIELD name ON account_group TYPE string PERMISSIONS FULL;
DEFINE FIELD normal_balance ON account_group TYPE string PERMISSIONS FULL;
DEFINE FIELD notes ON account_group TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD updated_at ON account_group TYPE none | datetime | null PERMISSIONS FULL;

DEFINE INDEX account_group_code_store_unique ON account_group FIELDS code UNIQUE;


-- ------------------------------
-- TABLE DATA: account_group
-- ------------------------------

INSERT [ { code: '5000', created_at: d'2026-07-06T07:36:42.739473090Z', head_type: 'income', id: account_group:c43s88dsuc3w9306ej84, is_active: true, name: 'Revenue', normal_balance: 'credit', notes: NULL }, { code: '4000', created_at: d'2026-07-06T07:36:48.269319257Z', head_type: 'equity', id: account_group:iey1hji7f98ywwpshviq, is_active: true, name: 'Capital', normal_balance: 'credit', notes: NULL }, { code: '3000', created_at: d'2026-07-06T07:36:52.613909362Z', head_type: 'liability', id: account_group:lnkh3dyo4j92awehf1k4, is_active: true, name: 'Liability', normal_balance: 'credit', notes: NULL }, { code: '1000', created_at: d'2026-07-06T07:36:57.270215381Z', head_type: 'asset', id: account_group:ohh5yogchyn5adxwalma, is_active: true, name: 'Asset', normal_balance: 'debit', notes: NULL }, { code: '2000', created_at: d'2026-07-06T07:37:01.479197770Z', head_type: 'expense', id: account_group:pqq0gs3aiizl3bwsib4n, is_active: true, name: 'Expense', normal_balance: 'debit', notes: NULL } ];

-- ------------------------------
-- TABLE: department
-- ------------------------------

DEFINE TABLE department TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD code ON department TYPE string PERMISSIONS FULL;
DEFINE FIELD deleted_at ON department TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD description ON department TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD is_active ON department TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD name ON department TYPE string PERMISSIONS FULL;

DEFINE INDEX dept_code ON department FIELDS code UNIQUE;


-- ------------------------------
-- TABLE DATA: department
-- ------------------------------

INSERT [ { code: '00002', id: department:bvhmlt8cr6i0civ7ovvk, is_active: true, name: 'Kitchen staff' }, { code: '00001', id: department:ti8mzx4wvaji1qxkmlfn, is_active: true, name: 'Sales' } ];

-- ------------------------------
-- TABLE: employee
-- ------------------------------

DEFINE TABLE employee TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD cost_center ON employee TYPE none | record<cost_center> | null PERMISSIONS FULL;
DEFINE FIELD deleted_at ON employee TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD department ON employee TYPE none | record<department> | null PERMISSIONS FULL;
DEFINE FIELD emergency_contact ON employee TYPE any PERMISSIONS FULL;
DEFINE FIELD employee_number ON employee TYPE string PERMISSIONS FULL;
DEFINE FIELD employment_status ON employee TYPE string DEFAULT 'active' PERMISSIONS FULL;
DEFINE FIELD employment_type ON employee TYPE string DEFAULT 'hourly' PERMISSIONS FULL;
DEFINE FIELD first_name ON employee TYPE string PERMISSIONS FULL;
DEFINE FIELD hire_date ON employee TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD is_rehire ON employee TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD last_name ON employee TYPE string PERMISSIONS FULL;
DEFINE FIELD manager ON employee TYPE none | record<employee> | null PERMISSIONS FULL;
DEFINE FIELD notes ON employee TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD position ON employee TYPE none | record<position> | null PERMISSIONS FULL;
DEFINE FIELD rehire_date ON employee TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD termination_date ON employee TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD user ON employee TYPE none | record<user> | null PERMISSIONS FULL;

DEFINE INDEX emp_number ON employee FIELDS employee_number UNIQUE;
DEFINE INDEX emp_status ON employee FIELDS employment_status;
DEFINE INDEX emp_user ON employee FIELDS user;


-- ------------------------------
-- TABLE DATA: employee
-- ------------------------------

INSERT [ { cost_center: cost_center:o9uguskk9x9p0b4yvvcz, department: NULL, employee_number: 'EMP-8888-0K6S', employment_status: 'active', employment_type: 'hourly', first_name: 'cashier', hire_date: d'2026-06-29T19:00:00Z', id: employee:f3skacsj8zfq2jy77ozy, is_rehire: false, last_name: '2', manager: NULL, position: NULL, termination_date: NULL, user: user:w6f4w7l8sohm7xtwesn5 }, { cost_center: cost_center:o9uguskk9x9p0b4yvvcz, department: NULL, employee_number: '00001', employment_status: 'active', employment_type: 'hourly', first_name: 'Manager', hire_date: NULL, id: employee:ffjhcq1lilm4b9jlu3rf, is_rehire: false, last_name: 'Manager', manager: NULL, position: NULL, termination_date: NULL, user: user:ldor4zsa96nmrnrc2n8o }, { cost_center: cost_center:o9uguskk9x9p0b4yvvcz, department: NULL, employee_number: '00002', employment_status: 'active', employment_type: 'hourly', first_name: 'Kashif', hire_date: NULL, id: employee:nbwe1gdb963s2te6pxo2, is_rehire: false, last_name: 'ali', manager: NULL, position: NULL, termination_date: NULL, user: user:veds76b7flpx7gbps0cj }, { cost_center: cost_center:o9uguskk9x9p0b4yvvcz, department: NULL, employee_number: '00003', employment_status: 'active', employment_type: 'monthly_salary', first_name: 'cashier', hire_date: NULL, id: employee:rpxeiqbp1o4bpny0l27l, is_rehire: false, last_name: '1', manager: NULL, position: NULL, termination_date: NULL, user: user:gshwt74pxo5kmnim6ppd } ];

-- ------------------------------
-- TABLE: order_type
-- ------------------------------

DEFINE TABLE order_type TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD allow_service_charges ON order_type TYPE none | bool | null PERMISSIONS FULL;
DEFINE FIELD branch_id ON order_type TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD deleted_at ON order_type TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD name ON order_type TYPE string PERMISSIONS FULL;
DEFINE FIELD priority ON order_type TYPE int PERMISSIONS FULL;



-- ------------------------------
-- TABLE DATA: order_type
-- ------------------------------

INSERT [ { id: order_type:asv1e0weopsi8e3yhbh6, name: 'Take Away', priority: 2 }, { allow_service_charges: true, id: order_type:c1akh3xwlhn8sgom2rlc, name: 'Dine In', priority: 1 }, { id: order_type:qesdqe9t1eqzdczed590, name: 'Delivery', priority: 3 } ];

-- ------------------------------
-- TABLE: shift
-- ------------------------------

DEFINE TABLE shift TYPE NORMAL SCHEMAFULL CHANGEFEED 2w PERMISSIONS NONE;

DEFINE FIELD deleted_at ON shift TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD end_time ON shift TYPE string PERMISSIONS FULL;
DEFINE FIELD ends_next_day ON shift TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD name ON shift TYPE string PERMISSIONS FULL;
DEFINE FIELD start_time ON shift TYPE string PERMISSIONS FULL;



-- ------------------------------
-- TABLE DATA: shift
-- ------------------------------

INSERT [ { end_time: '15:59', ends_next_day: false, id: shift:dwkbywt5mfi88e8r8gwe, name: 'morning', start_time: '06:00' }, { end_time: '05:59', ends_next_day: true, id: shift:znycovff7hram01m67yf, name: 'Evening', start_time: '16:00' } ];

-- ------------------------------
-- TABLE: user
-- ------------------------------

DEFINE TABLE user TYPE ANY SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD branch_ids ON user TYPE none | array<string> | null PERMISSIONS FULL;
DEFINE FIELD branch_ids.* ON user TYPE string PERMISSIONS FULL;
DEFINE FIELD deleted_at ON user TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD first_name ON user TYPE string PERMISSIONS FULL;
DEFINE FIELD last_name ON user TYPE string PERMISSIONS FULL;
DEFINE FIELD login ON user TYPE string PERMISSIONS FULL;
DEFINE FIELD login_method ON user TYPE none | string | null DEFAULT pin PERMISSIONS FULL;
DEFINE FIELD password ON user TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD roles ON user TYPE array<string> PERMISSIONS FULL;
DEFINE FIELD roles.* ON user TYPE string PERMISSIONS FULL;
DEFINE FIELD user_role ON user TYPE none | record<user_role> | null PERMISSIONS FULL;
DEFINE FIELD user_shift ON user TYPE none | record<shift> | null PERMISSIONS FULL;


DEFINE EVENT audit_user_create ON user WHEN $event == 'CREATE' THEN { CREATE audit_log CONTENT { actor_id: <string> $auth.sub, actor_login: $auth.login, actor_roles: $auth.roles, action: 'create', table_name: 'user', record_id: <string> $after.id, changed_fields: [], source: 'surreal-event' } };
DEFINE EVENT audit_user_delete ON user WHEN $event == 'DELETE' THEN { CREATE audit_log CONTENT { actor_id: <string> $auth.sub, actor_login: $auth.login, actor_roles: $auth.roles, action: 'delete', table_name: 'user', record_id: <string> $before.id, changed_fields: [], source: 'surreal-event' } };
DEFINE EVENT audit_user_update ON user WHEN $event == 'UPDATE' THEN { CREATE audit_log CONTENT { actor_id: <string> $auth.sub, actor_login: $auth.login, actor_roles: $auth.roles, action: 'update', table_name: 'user', record_id: <string> $after.id, changed_fields: <array<string>> object::keys($after), source: 'surreal-event' } };

-- ------------------------------
-- TABLE DATA: user
-- ------------------------------

INSERT [ { first_name: 'Inventory', id: user:5h90rfhpigrx9w7uzmdj, last_name: 'User', login: '9999', login_method: 'pin', password: '$2b$12$X3LyzA4YhRfTddAoNxcTEOPXdy7geSDIs8sMJrqndLLlt9OYxVJ0O', roles: [], user_role: user_role:35nulgv7ko4e9ee2ss6r, user_shift: shift:dwkbywt5mfi88e8r8gwe }, { first_name: 'Rider', id: user:b4161q5ymh3r9y3lht8p, last_name: 'rider', login: 'rider', login_method: 'form', password: '$2b$12$/EhOmsgFAD2Phrb1cB0PUu9GrvL.5E4CFGZnhyHl.RQzMvUqaYumq', roles: [], user_role: user_role:qv1ohxg26hpdcp2fu2k4, user_shift: shift:dwkbywt5mfi88e8r8gwe }, { first_name: 'Cashier', id: user:gshwt74pxo5kmnim6ppd, last_name: '1', login: '9999', login_method: 'pin', password: '$2b$12$7XBwuCN/cDVZh8NxMj8VD.k8jmJ3GrHoqGvjvHcXEcFfQsCQDS4aS', roles: [], user_role: user_role:h5u3lx7xya6m9oxroebx, user_shift: shift:dwkbywt5mfi88e8r8gwe }, { first_name: 'Manager', id: user:ldor4zsa96nmrnrc2n8o, last_name: '1', login: '5555', login_method: 'pin', password: '$2b$12$dINjq9eBTcaXzuohFYT6mOlgg6zQ/F1ANo8XjQJxb/EmzmrPMcpQu', roles: [], user_role: user_role:4dqzxq9ks7iyijgfafl5, user_shift: NULL }, { first_name: 'Kashif', id: user:veds76b7flpx7gbps0cj, last_name: 'ali', login: '1234', login_method: 'pin', password: '$2b$12$oxTY7rstF/sYG0FqL4cKueJTY0zmQp4s2nobV2D3n9Fv/RPRp0fvG', roles: [], user_role: user_role:vixe1rlf7rox8256pg5t, user_shift: shift:dwkbywt5mfi88e8r8gwe }, { first_name: 'cashier', id: user:w6f4w7l8sohm7xtwesn5, last_name: '2', login: '8888', login_method: 'pin', password: '$2b$12$w7Ezxulpu8aIAJQO09FDeeWGka16Jrddrv2s10d5uVQvfeKeBGA5u', roles: [], user_role: user_role:h5u3lx7xya6m9oxroebx, user_shift: shift:dwkbywt5mfi88e8r8gwe }, { first_name: 'Ahmed', id: user:xctfnhj7nv11jvwl2i3n, last_name: 'Ali', login: '0000', login_method: 'pin', password: '$2b$12$aDh3K7WJGScketINMnWoOuiJ0ZO4AjShq4yiBRY9ZB.4SguVuJrda', roles: [], user_role: user_role:vixe1rlf7rox8256pg5t, user_shift: shift:dwkbywt5mfi88e8r8gwe } ];

-- ------------------------------
-- TABLE: user_role
-- ------------------------------

DEFINE TABLE user_role TYPE ANY SCHEMALESS PERMISSIONS NONE;

DEFINE FIELD deleted_at ON user_role TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD name ON user_role TYPE string PERMISSIONS FULL;
DEFINE FIELD roles ON user_role TYPE array<string> PERMISSIONS FULL;
DEFINE FIELD roles.* ON user_role TYPE string PERMISSIONS FULL;


DEFINE EVENT audit_user_role_create ON user_role WHEN $event == 'CREATE' THEN { CREATE audit_log CONTENT { actor_id: <string> $auth.sub, actor_login: $auth.login, actor_roles: $auth.roles, action: 'create', table_name: 'user_role', record_id: <string> $after.id, changed_fields: [], source: 'surreal-event' } };
DEFINE EVENT audit_user_role_update ON user_role WHEN $event == 'UPDATE' THEN { CREATE audit_log CONTENT { actor_id: <string> $auth.sub, actor_login: $auth.login, actor_roles: $auth.roles, action: 'update', table_name: 'user_role', record_id: <string> $after.id, changed_fields: <array<string>> object::keys($after), source: 'surreal-event' } };

-- ------------------------------
-- TABLE DATA: user_role
-- ------------------------------

INSERT [ { id: user_role:35nulgv7ko4e9ee2ss6r, name: 'Inventory', roles: ['reports', 'reports.detailed_inventory', 'reports.purchase', 'reports.purchase_return', 'reports.issue', 'reports.issue_return', 'reports.waste', 'reports.consumption', 'inventory', 'inventory.items', 'inventory.suppliers', 'inventory.item_categories', 'inventory.locations', 'inventory.item_groups', 'inventory.purchase_orders', 'inventory.purchases', 'inventory.purchase_returns', 'inventory.issues', 'inventory.issue_returns', 'inventory.wastes', 'inventory.current_inventory', 'reports.current_inventory', 'reports.forecast', 'reports.menu_optimization', 'reports.sentiment', 'reports.waste_intelligence', 'reports.scheduling_optimization', 'reports.cash_flow', 'reports.vendor_performance', 'reports.table_turnover', 'reports.dynamic_pricing', 'reports.forecast_accuracy', 'reports.upsell_effectiveness', 'reports.ai_command_center', 'reports.anomaly_alerts', 'reports.customer_clv', 'reports.churn_prediction', 'reports.promo_effectiveness', 'reports.server_performance', 'reports.competitor_monitoring', 'reports.food_cost_trends', 'reports.recipe_optimization', 'reports.segmentation', 'reports.labor_optimization', 'reports.delivery_analytics', 'reports.peak_hour', 'reports.tip_analytics', 'reports.revpash', 'reports.customer_journey', 'reports.seasonal_trends', 'reports.guest_preferences', 'reports.shrinkage_detection', 'reports.revenue_forecast', 'reports.no_show_prediction', 'reports.order_fraud', 'reports.food_safety', 'reports.energy_optimization', 'reports.staff_turnover', 'reports.yield_variance', 'reports.kitchen_bottleneck', 'reports.win_back', 'reports.chargeback_risk', 'reports.price_elasticity', 'reports.promo_abuse', 'reports.menu_pairing', 'reports.wait_prediction', 'reports.promo_forecast', 'reports.clv_trajectory', 'reports.spoilage_prediction', 'reports.visit_cadence', 'reports.recipe_substitution', 'reports.training_need', 'reports.seating_optimization', 'reports.satisfaction_prediction', 'reports.abandoned_cart'] }, { id: user_role:4dqzxq9ks7iyijgfafl5, name: 'Master', roles: ['menu', 'menu.change_table', 'summary', 'summary.print', 'summary.product_mix', 'summary.server_sales', 'Products Summary', 'closing', 'kitchen', 'delivery', 'Order Management', 'delivery.areas', 'delivery.settings', 'settings.menus', 'settings.printers', 'riders', 'tips.calculation', 'tips.payout', 'settings', 'settings.service_charges', 'delivery.orders', 'closing.edit', 'settings.auto_check_close', 'settings.closing_cycle', 'accounts', 'accounts.chart_of_accounts', 'accounts.account_groups', 'accounts.journal_entries', 'accounts.general_ledger', 'accounts.trial_balance', 'accounts.balance_sheet', 'accounts.profit_loss', 'accounts.cash_flow', 'accounts.customer_statement', 'accounts.supplier_statement', 'hr', 'hr.dashboard', 'hr.employees', 'hr.departments', 'hr.positions', 'hr.cost_centers', 'hr.pay_profiles', 'hr.pay_rules', 'hr.scheduling', 'hr.attendance', 'hr.leave', 'hr.holidays', 'hr.payroll_periods', 'hr.payroll_runs', 'hr.documents', 'hr.performance', 'integrations', 'integrations.health', 'integrations.queue', 'settings.show_inclusive_prices', 'reports', 'reports.delivery_density', 'reports.cash_closing', 'reports.sales_dashboard', 'reports.inventory_dashboard', 'reports.sales_hourly_labour', 'reports.sales_hourly_labour_weekly', 'reports.server_sales', 'reports.sales_summary', 'reports.sales_summary_2', 'reports.sales_weekly', 'tips', 'reports.tips', 'reports.advanced_sales', 'reports.discount', 'reports.tax', 'reports.coupon', 'reports.voids', 'reports.merge_orders', 'reports.split_orders', 'reports.order_life_cycle', 'reports.expense', 'reports.activity', 'reports.product_mix_weekly', 'reports.product_mix_summary', 'reports.products_hourly', 'reports.detailed_inventory', 'reports.purchase', 'reports.purchase_return', 'reports.issue', 'reports.issue_return', 'reports.waste', 'reports.consumption', 'reports.sale_vs_inventory', 'reports.production', 'reports.buffet', 'reports.ai', 'reports.labor_dashboard', 'reports.daily_labor_cost', 'reports.weekly_labor_cost', 'reports.monthly_labor_cost', 'reports.employee_labor_cost', 'reports.department_labor_cost', 'reports.cost_center_labor_cost', 'reports.average_hourly_cost', 'reports.labor_percent', 'reports.sales_per_labor_hour', 'reports.revenue_per_employee', 'reports.overtime', 'reports.attendance', 'reports.late_arrival', 'reports.absence', 'reports.leave', 'reports.holiday_cost', 'reports.scheduled_vs_actual', 'reports.manager_approval', 'reports.top_labor_cost_employees', 'reports.top_overtime_employees', 'reports.payroll_summary', 'reports.payroll_details', 'reports.labor_trend', 'reports.labor_forecast_dataset', 'order_display', 'settings.access_control', 'inventory.locations', 'settings.inventory', 'settings.auto_clock_out', 'settings.session_security', 'inventory', 'inventory.current_inventory', 'reports.current_inventory', 'inventory.items', 'inventory.suppliers', 'inventory.item_categories', 'inventory.item_groups', 'inventory.purchase_orders', 'inventory.purchase_orders.update', 'inventory.purchase_orders.delete', 'inventory.purchase_orders.approve', 'inventory.purchases', 'inventory.purchases.update', 'inventory.purchases.delete', 'inventory.purchase_returns', 'inventory.purchase_returns.update', 'inventory.purchase_returns.delete', 'inventory.issues', 'inventory.issues.update', 'inventory.issues.delete', 'inventory.issue_returns', 'inventory.issue_returns.update', 'inventory.issue_returns.delete', 'inventory.wastes', 'inventory.wastes.update', 'inventory.wastes.delete', 'inventory.adjustments', 'hr.adjustments', 'inventory.adjustments.update', 'inventory.adjustments.delete', 'inventory.stock_transfers', 'inventory.stock_transfers.update', 'inventory.kitchen_reconciliation', 'reports.kitchen_reconciliation', 'inventory.production_recipes', 'inventory.production', 'inventory.production_history', 'inventory.buffet_menus', 'inventory.buffet_sessions', 'reports.purchase_order', 'settings.print_options', 'orders', 'orders.cancel', 'orders.split_by_seats', 'orders.split_by_items', 'orders.split_by_amount', 'orders.merge', 'orders.refund', 'orders.print_final', 'orders.print_temp', 'orders.override_print_limit', 'orders.open_cash_drawer', 'orders.apply_tax', 'orders.apply_discount', 'orders.apply_coupon', 'orders.apply_service_charges', 'orders.apply_tips', 'orders.change_extras', 'orders.complete', 'orders.complete_payment', 'orders.update_payment', 'orders.move_table', 'orders.remote_payment_create', 'orders.remote_payment_verify', 'reports.order_fiscal', 'settings.currency_symbol', 'orders.print_kot', 'integrations.providers', 'integrations.configuration', 'integrations.toggle_provider', 'integrations.open_configuration', 'integrations.save_configuration', 'reports.order_receipt', 'reports.schedule_roster', 'admin.gift_cards', 'admin.marketing', 'admin.reservations', 'admin.currencies', 'admin.kds', 'admin.reorder', 'reports.forecast', 'reports.menu_optimization', 'reports.sentiment', 'reports.waste_intelligence', 'reports.scheduling_optimization', 'reports.cash_flow', 'reports.vendor_performance', 'reports.table_turnover', 'reports.dynamic_pricing', 'reports.forecast_accuracy', 'reports.upsell_effectiveness', 'reports.ai_command_center', 'reports.anomaly_alerts', 'reports.customer_clv', 'reports.churn_prediction', 'reports.promo_effectiveness', 'reports.server_performance', 'reports.competitor_monitoring', 'reports.food_cost_trends', 'reports.recipe_optimization', 'reports.segmentation', 'reports.labor_optimization', 'reports.delivery_analytics', 'reports.peak_hour', 'reports.tip_analytics', 'reports.revpash', 'reports.customer_journey', 'reports.seasonal_trends', 'reports.guest_preferences', 'reports.shrinkage_detection', 'reports.revenue_forecast', 'reports.no_show_prediction', 'reports.order_fraud', 'reports.food_safety', 'reports.energy_optimization', 'reports.staff_turnover', 'reports.yield_variance', 'reports.kitchen_bottleneck', 'reports.win_back', 'reports.chargeback_risk', 'reports.price_elasticity', 'reports.promo_abuse', 'reports.menu_pairing', 'reports.wait_prediction', 'reports.promo_forecast', 'reports.clv_trajectory', 'reports.spoilage_prediction', 'reports.visit_cadence', 'reports.recipe_substitution', 'reports.training_need', 'reports.seating_optimization', 'reports.satisfaction_prediction', 'reports.abandoned_cart', 'tableside', 'admin', 'admin.dishes', 'admin.dishes.create', 'admin.dishes.update', 'admin.dishes.delete', 'admin.dishes.import', 'admin.menus', 'admin.menus.create', 'admin.menus.update', 'admin.menus.delete', 'admin.categories', 'admin.categories.create', 'admin.categories.update', 'admin.categories.delete', 'admin.categories.import', 'admin.modifier_groups', 'admin.modifier_groups.create', 'admin.modifier_groups.update', 'admin.modifier_groups.delete', 'admin.modifier_groups.import', 'admin.tables', 'admin.tables.create', 'admin.tables.update', 'admin.tables.delete', 'admin.tables.import', 'admin.floors', 'admin.floors.create', 'admin.floors.update', 'admin.floors.delete', 'admin.floors.import', 'admin.discounts', 'admin.discounts.create', 'admin.discounts.update', 'admin.discounts.delete', 'admin.coupons', 'admin.coupons.create', 'admin.coupons.update', 'admin.coupons.delete', 'admin.kitchens', 'admin.kitchens.create', 'admin.kitchens.update', 'admin.kitchens.delete', 'admin.kitchens.import', 'admin.workflows', 'admin.workflows.create', 'admin.workflows.update', 'admin.workflows.delete', 'admin.printers', 'admin.printers.create', 'admin.printers.update', 'admin.printers.delete', 'admin.print_settings', 'admin.print_settings.update', 'admin.order_types', 'admin.order_types.create', 'admin.order_types.update', 'admin.order_types.delete', 'admin.order_types.import', 'admin.payment_types', 'admin.payment_types.create', 'admin.payment_types.update', 'admin.payment_types.delete', 'admin.payment_types.import', 'admin.extras', 'admin.extras.create', 'admin.extras.update', 'admin.extras.delete', 'admin.extras.import', 'admin.taxes', 'admin.taxes.create', 'admin.taxes.update', 'admin.taxes.delete', 'admin.taxes.import', 'admin.users', 'admin.users.create', 'admin.users.update', 'admin.users.delete', 'admin.roles', 'admin.roles.create', 'admin.roles.update', 'admin.roles.delete', 'admin.shifts', 'admin.shifts.create', 'admin.shifts.update', 'admin.shifts.delete', 'admin.tips_definition', 'admin.tips_definition.create', 'admin.tips_definition.update', 'admin.tips_definition.delete', 'admin.security_alerts', 'settings.translate_receipts', 'settings.number_policy', 'admin.catalog_publish'] }, { id: user_role:h5u3lx7xya6m9oxroebx, name: 'Cashier', roles: ['menu', 'menu.change_table', 'orders', 'orders.cancel', 'orders.split_by_seats', 'orders.split_by_items', 'orders.split_by_amount', 'orders.merge', 'orders.refund', 'orders.print_final', 'orders.print_temp', 'orders.apply_tax', 'orders.apply_discount', 'orders.apply_coupon', 'orders.apply_service_charges', 'orders.apply_tips', 'orders.change_extras', 'orders.complete', 'tableside'] }, { id: user_role:pbao0494m2fzmgdc1byf, name: 'Delivery', roles: ['delivery', 'Order Management', 'delivery.areas', 'delivery.settings', 'orders', 'orders.print_final', 'orders.print_temp', 'orders.apply_tax', 'orders.apply_discount', 'orders.apply_coupon', 'orders.apply_service_charges', 'orders.apply_tips', 'orders.change_extras', 'orders.complete', 'delivery.orders', 'tableside'] }, { id: user_role:qv1ohxg26hpdcp2fu2k4, name: 'Rider', roles: ['riders'] }, { id: user_role:vixe1rlf7rox8256pg5t, name: 'order taker', roles: ['menu', 'menu.change_table', 'orders', 'orders.cancel', 'orders.split_by_seats', 'orders.split_by_items', 'orders.split_by_amount', 'orders.merge', 'orders.refund', 'orders.print_final', 'orders.print_temp', 'orders.apply_coupon', 'orders.change_extras', 'orders.complete', 'reports', 'reports.sales_hourly_labour', 'reports.sales_hourly_labour_weekly', 'reports.server_sales', 'reports.sales_summary', 'reports.sales_summary_2', 'reports.sales_weekly', 'reports.advanced_sales', 'reports.voids', 'reports.product_mix_weekly', 'reports.product_mix_summary', 'reports.products_hourly', 'Products Summary', 'reports.detailed_inventory', 'reports.purchase', 'reports.purchase_return', 'reports.issue', 'reports.issue_return', 'reports.waste', 'reports.consumption', 'reports.sale_vs_inventory', 'closing', 'Modifier groups', 'Order types', 'Payment types', 'reports.inventory_dashboard', 'reports.sales_dashboard', 'orders.apply_tips', 'delivery', 'delivery.orders', 'settings', 'admin.printers', 'settings.printers', 'settings.service_charges', 'admin.security_alerts', 'admin.gift_cards', 'admin.marketing', 'admin.reservations', 'admin.currencies', 'admin.kds', 'admin.reorder', 'reports.forecast', 'reports.menu_optimization', 'reports.sentiment', 'reports.waste_intelligence', 'reports.scheduling_optimization', 'reports.cash_flow', 'reports.vendor_performance', 'reports.table_turnover', 'reports.dynamic_pricing', 'reports.forecast_accuracy', 'reports.upsell_effectiveness', 'reports.ai_command_center', 'reports.anomaly_alerts', 'reports.customer_clv', 'reports.churn_prediction', 'reports.promo_effectiveness', 'reports.server_performance', 'reports.competitor_monitoring', 'reports.food_cost_trends', 'reports.recipe_optimization', 'reports.segmentation', 'reports.labor_optimization', 'reports.delivery_analytics', 'reports.peak_hour', 'reports.tip_analytics', 'reports.revpash', 'reports.customer_journey', 'reports.seasonal_trends', 'reports.guest_preferences', 'reports.shrinkage_detection', 'reports.revenue_forecast', 'reports.no_show_prediction', 'reports.order_fraud', 'reports.food_safety', 'reports.energy_optimization', 'reports.staff_turnover', 'reports.yield_variance', 'reports.kitchen_bottleneck', 'reports.win_back', 'reports.chargeback_risk', 'reports.price_elasticity', 'reports.promo_abuse', 'reports.menu_pairing', 'reports.wait_prediction', 'reports.promo_forecast', 'reports.clv_trajectory', 'reports.spoilage_prediction', 'reports.visit_cadence', 'reports.recipe_substitution', 'reports.training_need', 'reports.seating_optimization', 'reports.satisfaction_prediction', 'reports.abandoned_cart', 'tableside'] } ];

