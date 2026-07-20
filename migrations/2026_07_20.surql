REMOVE FIELD extras.* ON TABLE inventory_purchase;
DEFINE FIELD OVERWRITE extras ON TABLE inventory_purchase TYPE any PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
