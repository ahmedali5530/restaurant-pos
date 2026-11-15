-- KRA eTIMS: invoice/stock/item sequence counters.
-- Per-dish class/tax overrides originally lived on menu_item; they moved to
-- integration_entity_mapping.external_payload (see 2026_11_15_kra_remove_dish_fields).

DEFINE TABLE IF NOT EXISTS integration_kra_counter SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS tin ON TABLE integration_kra_counter TYPE string;
DEFINE FIELD IF NOT EXISTS bhf_id ON TABLE integration_kra_counter TYPE string;
DEFINE FIELD IF NOT EXISTS next_invc_no ON TABLE integration_kra_counter TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS next_sar_no ON TABLE integration_kra_counter TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS next_item_seq ON TABLE integration_kra_counter TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS created_at ON TABLE integration_kra_counter TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS updated_at ON TABLE integration_kra_counter TYPE option<datetime>;
DEFINE INDEX IF NOT EXISTS idx_kra_counter_tin_bhf ON TABLE integration_kra_counter COLUMNS tin, bhf_id UNIQUE;
