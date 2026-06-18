-- Production / yield management

DEFINE FIELD OVERWRITE item_type ON TABLE inventory_item TYPE string DEFAULT 'raw' ASSERT $value IN ['raw','semi_finished','finished'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE recipe SCHEMAFULL;
DEFINE FIELD name ON recipe TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD code ON recipe TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD notes ON recipe TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_active ON recipe TYPE bool DEFAULT true PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD base_batch_qty ON recipe TYPE float DEFAULT 1 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD primary_output ON recipe TYPE option<record<recipe_output>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD cost_allocation ON recipe TYPE string DEFAULT 'yield' ASSERT $value IN ['yield','value'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON recipe TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON recipe TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE recipe_item SCHEMAFULL;
DEFINE FIELD recipe ON recipe_item TYPE record<recipe> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON recipe_item TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON recipe_item TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD sort_order ON recipe_item TYPE int DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE recipe_output SCHEMAFULL;
DEFINE FIELD recipe ON recipe_output TYPE record<recipe> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON recipe_output TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD yield_percent ON recipe_output TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD disposition ON recipe_output TYPE string DEFAULT 'inventory' ASSERT $value IN ['inventory','waste'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD value_weight ON recipe_output TYPE float DEFAULT 1 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD is_primary ON recipe_output TYPE bool DEFAULT false PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD sort_order ON recipe_output TYPE int DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE TABLE production_batch SCHEMAFULL;
DEFINE FIELD recipe ON production_batch TYPE record<recipe> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD store ON production_batch TYPE record<inventory_store> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD batch_number ON production_batch TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD scale_factor ON production_batch TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD produced_qty ON production_batch TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD status ON production_batch TYPE string DEFAULT 'completed' ASSERT $value IN ['completed','voided'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD total_input_cost ON production_batch TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD total_output_cost ON production_batch TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD yield_loss_percent ON production_batch TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD cost_allocation ON production_batch TYPE string DEFAULT 'yield' ASSERT $value IN ['yield','value'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_at ON production_batch TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD created_by ON production_batch TYPE record<user> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD completed_at ON production_batch TYPE datetime DEFAULT time::now() PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD notes ON production_batch TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX pb_store_date ON production_batch FIELDS store, created_at;

DEFINE TABLE production_batch_input SCHEMAFULL;
DEFINE FIELD batch ON production_batch_input TYPE record<production_batch> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON production_batch_input TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD store ON production_batch_input TYPE record<inventory_store> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON production_batch_input TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD unit_cost ON production_batch_input TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD total_cost ON production_batch_input TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX pbi_item_store ON production_batch_input FIELDS item, store;

DEFINE TABLE production_batch_output SCHEMAFULL;
DEFINE FIELD batch ON production_batch_output TYPE record<production_batch> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD item ON production_batch_output TYPE record<inventory_item> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD store ON production_batch_output TYPE record<inventory_store> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD quantity ON production_batch_output TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD yield_percent ON production_batch_output TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD disposition ON production_batch_output TYPE string DEFAULT 'inventory' ASSERT $value IN ['inventory','waste'] PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD allocated_cost ON production_batch_output TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD unit_cost ON production_batch_output TYPE float DEFAULT 0 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD ledger_waste_item ON production_batch_output TYPE option<record<inventory_item_waste_item>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX pbo_item_store ON production_batch_output FIELDS item, store;
