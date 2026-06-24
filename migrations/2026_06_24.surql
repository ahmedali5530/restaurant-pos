-- Discount Management Engine: expand discount table + supporting tables

DEFINE FIELD OVERWRITE category ON discount TYPE string DEFAULT 'manual' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE scope ON discount TYPE string DEFAULT 'cart' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE value_type ON discount TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE value ON discount TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE min_value ON discount TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE max_value ON discount TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE code ON discount TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE min_order_amount ON discount TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE application_mode ON discount TYPE string DEFAULT 'manual' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE schedules ON discount TYPE any DEFAULT [] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE targets ON discount TYPE any DEFAULT {} PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE conditions ON discount TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE stacking_mode ON discount TYPE string DEFAULT 'allow' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE stack_group ON discount TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE exclusive ON discount TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE stackable ON discount TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE tax_treatment ON discount TYPE string DEFAULT 'tax_before_discount' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE requires_reason ON discount TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE requires_approval ON discount TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE stackable_with_coupon ON discount TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE is_active ON discount TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE branch_id ON discount TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE applicable_floors ON discount TYPE array<record<floor>> DEFAULT [] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE INDEX IF NOT EXISTS d_active_priority ON discount FIELDS is_active, priority;

DEFINE FIELD OVERWRITE tags ON customer TYPE array<string> DEFAULT [] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE discount_reason SCHEMAFULL;
DEFINE FIELD name ON discount_reason TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD code ON discount_reason TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_active ON discount_reason TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD requires_approval ON discount_reason TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD deleted_at ON discount_reason TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX dr_code ON discount_reason FIELDS code UNIQUE;

DEFINE TABLE role_discount_policy SCHEMAFULL;
DEFINE FIELD user_role ON role_discount_policy TYPE record<user_role> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD max_percent ON role_discount_policy TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD max_fixed_amount ON role_discount_policy TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD can_apply_manual ON role_discount_policy TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD can_override_approval ON role_discount_policy TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD allowed_categories ON role_discount_policy TYPE array<string> DEFAULT [] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX rdp_role ON role_discount_policy FIELDS user_role UNIQUE;

DEFINE TABLE order_discount SCHEMAFULL;
DEFINE FIELD order ON order_discount TYPE record<order> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD discount ON order_discount TYPE record<discount> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD name ON order_discount TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD scope ON order_discount TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD value_type ON order_discount TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD applied_amount ON order_discount TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD applied_rate ON order_discount TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD base_amount ON order_discount TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD tax_treatment ON order_discount TYPE string DEFAULT 'tax_before_discount' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD application_type ON order_discount TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD reason ON order_discount TYPE option<record<discount_reason>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD reason_text ON order_discount TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD applied_by ON order_discount TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD approved_by ON order_discount TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD auth_method ON order_discount TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD order_items ON order_discount TYPE array<record<order_item>> DEFAULT [] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD line_allocations ON order_discount TYPE any DEFAULT [] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON order_discount TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD removed_at ON order_discount TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD removed_by ON order_discount TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX od_order ON order_discount FIELDS order;
DEFINE INDEX od_order_active ON order_discount FIELDS order, removed_at;
