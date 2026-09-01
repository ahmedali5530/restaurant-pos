-- Multi-stage kitchen workflow (KDS)

-- Reusable workflow template
DEFINE TABLE workflow SCHEMAFULL;
DEFINE FIELD name ON TABLE workflow TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON TABLE workflow TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD deleted_at ON TABLE workflow TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- Ordered workflow stage (step -> kitchen)
DEFINE TABLE workflow_stage SCHEMAFULL;
DEFINE FIELD workflow ON TABLE workflow_stage TYPE record<workflow> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD kitchen ON TABLE workflow_stage TYPE record<kitchen> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD sequence ON TABLE workflow_stage TYPE int DEFAULT 1 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD name ON TABLE workflow_stage TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_terminal ON TABLE workflow_stage TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON TABLE workflow_stage TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX workflow_stage_seq ON TABLE workflow_stage FIELDS workflow, sequence;

-- menu_item workflow assignment + per-product stage->kitchen overrides
DEFINE FIELD OVERWRITE workflow ON TABLE menu_item TYPE option<record<workflow>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE stage_overrides ON TABLE menu_item TYPE option<object|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- order_item workflow snapshot + progress
DEFINE FIELD OVERWRITE workflow ON TABLE order_item TYPE option<record<workflow>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE current_sequence ON TABLE order_item TYPE option<int|null> DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE workflow_status ON TABLE order_item TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- order_item_kitchen becomes a per-stage instance row
DEFINE FIELD OVERWRITE stage ON TABLE order_item_kitchen TYPE option<record<workflow_stage>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE stage_name ON TABLE order_item_kitchen TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE workflow ON TABLE order_item_kitchen TYPE option<record<workflow>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE sequence ON TABLE order_item_kitchen TYPE option<int|null> DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE status ON TABLE order_item_kitchen TYPE option<string|null> DEFAULT 'pending' PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE activated_at ON TABLE order_item_kitchen TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE started_at ON TABLE order_item_kitchen TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE is_terminal ON TABLE order_item_kitchen TYPE option<bool|null> DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE user ON TABLE order_item_kitchen TYPE option<record<user>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

-- KDS performance indexes
DEFINE INDEX oik_kitchen_status ON TABLE order_item_kitchen FIELDS kitchen, status;
DEFINE INDEX oik_order_item ON TABLE order_item_kitchen FIELDS order_item;

-- Backfill existing kitchen rows so in-flight orders stay visible/consistent on the KDS.
-- Existing rows are treated as single terminal stages (legacy parallel routing).
UPDATE order_item_kitchen SET status = 'completed', is_terminal = true, sequence = 0 WHERE status = NONE AND completed_at != NONE;
UPDATE order_item_kitchen SET status = 'pending', is_terminal = true, sequence = 0 WHERE status = NONE AND completed_at = NONE;
