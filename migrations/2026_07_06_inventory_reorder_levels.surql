-- Per-store reorder levels on inventory items

DEFINE FIELD reorder_levels ON inventory_item
  TYPE any
  DEFAULT {}
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
