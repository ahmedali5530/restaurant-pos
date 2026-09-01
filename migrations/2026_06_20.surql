-- Multi-type inventory items

DEFINE FIELD OVERWRITE item_types ON TABLE inventory_item
  TYPE array<string> DEFAULT ['raw']
  ASSERT array::len($value) > 0
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

UPDATE inventory_item
  SET item_types = [item_type]
  WHERE item_type != NONE AND (item_types = NONE OR array::len(item_types) = 0);

UPDATE inventory_item
  SET item_types = ['raw']
  WHERE item_types = NONE OR array::len(item_types) = 0;

REMOVE FIELD item_type ON TABLE inventory_item;
