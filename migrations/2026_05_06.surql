-- day_closing
DEFINE FIELD OVERWRITE cash_added ON TABLE day_closing TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE cash_withdrawn ON TABLE day_closing TYPE option<float | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE closed_at ON TABLE day_closing TYPE option<datetime | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE closed_by ON TABLE day_closing TYPE option<record<user> | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE closing_balance ON TABLE day_closing TYPE option<float | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE created_at ON TABLE day_closing TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE date_from ON TABLE day_closing TYPE option<datetime | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE date_to ON TABLE day_closing TYPE option<datetime | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE denominations ON TABLE day_closing TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE expenses ON TABLE day_closing TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE expenses_data ON TABLE day_closing TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE notes ON TABLE day_closing TYPE option<string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE opened_by ON TABLE day_closing TYPE option< record<user> | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE opening_balance ON TABLE day_closing TYPE option<float | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE payments_data ON TABLE day_closing TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE status ON TABLE day_closing TYPE option< string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE terminal_cash ON TABLE day_closing TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE net_amount ON TABLE day_closing TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE total_cash ON TABLE day_closing TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE total_other_payments ON TABLE day_closing TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE previous_day_balance ON TABLE day_closing TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- tracking table
DEFINE FIELD OVERWRITE auth_method ON TABLE tracking TYPE option<string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE coords ON TABLE tracking TYPE option<object | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE created_at ON TABLE tracking TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE manager ON TABLE tracking TYPE option<string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE manager_role ON TABLE tracking TYPE option<string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE module ON TABLE tracking TYPE option<string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE page ON TABLE tracking TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE resolution ON TABLE tracking TYPE option<string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE user ON TABLE tracking TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE user_agent ON TABLE tracking TYPE option<string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE user_role ON TABLE tracking TYPE option<string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE payload ON TABLE tracking TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- order_merge
DEFINE FIELD OVERWRITE created_at ON TABLE order_merge TYPE datetime PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE created_by ON TABLE order_merge TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE new_order ON TABLE order_merge TYPE record<order> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE old_orders ON TABLE order_merge TYPE array<record<order>> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE old_items ON TABLE order_merge TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE new_items ON TABLE order_merge TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- order_split
DEFINE TABLE order_split SCHEMAFULL;
DEFINE FIELD OVERWRITE old_items ON TABLE order_split TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE new_items ON TABLE order_split TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE old_order ON TABLE order_split TYPE record<order> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE new_orders ON TABLE order_split TYPE array<record<order>> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE created_at ON TABLE order_split TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE created_by ON TABLE order_split TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;