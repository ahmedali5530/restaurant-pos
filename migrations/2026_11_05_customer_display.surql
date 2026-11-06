-- Per-terminal customer display cart snapshot (Tauri POS ↔ browser display pairing).
DEFINE TABLE OVERWRITE customer_display TYPE ANY SCHEMALESS PERMISSIONS NONE;
DEFINE FIELD OVERWRITE phone ON customer TYPE none | string | null | int PERMISSIONS FULL;