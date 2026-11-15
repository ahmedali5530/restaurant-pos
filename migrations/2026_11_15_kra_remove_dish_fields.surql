-- KRA per-dish fiscal overrides moved to integration_entity_mapping.external_payload.
-- Data copy runs in backfill-kra-dish-fields-to-mapping.cjs before this migration.

REMOVE FIELD IF EXISTS kra_item_cls_cd ON TABLE menu_item;
REMOVE FIELD IF EXISTS kra_tax_ty_cd ON TABLE menu_item;
