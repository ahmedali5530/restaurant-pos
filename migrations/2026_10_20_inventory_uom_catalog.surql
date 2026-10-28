-- Global inventory unit catalog (factor = size in family base: G / ML / PC).
-- System rows are seeded; factors may be edited later without rewriting ledger history.

DEFINE TABLE OVERWRITE inventory_uom TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

DEFINE FIELD OVERWRITE code ON inventory_uom TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE name ON inventory_uom TYPE string PERMISSIONS FULL;
DEFINE FIELD OVERWRITE family ON inventory_uom TYPE string ASSERT $value IN ["weight", "volume", "count", "pack"] PERMISSIONS FULL;
DEFINE FIELD OVERWRITE base_factor ON inventory_uom TYPE float ASSERT $value > 0 PERMISSIONS FULL;
DEFINE FIELD OVERWRITE is_system ON inventory_uom TYPE bool DEFAULT false PERMISSIONS FULL;
DEFINE FIELD OVERWRITE is_active ON inventory_uom TYPE bool DEFAULT true PERMISSIONS FULL;
DEFINE FIELD OVERWRITE sort ON inventory_uom TYPE int DEFAULT 0 PERMISSIONS FULL;

DEFINE INDEX OVERWRITE inventory_uom_code ON inventory_uom FIELDS code UNIQUE;
DEFINE INDEX OVERWRITE inventory_uom_family ON inventory_uom FIELDS family;
DEFINE INDEX OVERWRITE inventory_uom_sort ON inventory_uom FIELDS sort;

-- Weight (base = G)
UPSERT inventory_uom:KG SET code = "KG", name = "KG", family = "weight", base_factor = 1000, is_system = true, is_active = true, sort = 10;
UPSERT inventory_uom:G SET code = "G", name = "G", family = "weight", base_factor = 1, is_system = true, is_active = true, sort = 20;
UPSERT inventory_uom:MG SET code = "MG", name = "MG", family = "weight", base_factor = 0.001, is_system = true, is_active = true, sort = 30;
UPSERT inventory_uom:LB SET code = "LB", name = "LB", family = "weight", base_factor = 453.59237, is_system = true, is_active = true, sort = 40;
UPSERT inventory_uom:OZ SET code = "OZ", name = "OZ", family = "weight", base_factor = 28.349523125, is_system = true, is_active = true, sort = 50;

-- Volume (base = ML, US customary for imperial)
UPSERT inventory_uom:L SET code = "L", name = "L", family = "volume", base_factor = 1000, is_system = true, is_active = true, sort = 110;
UPSERT inventory_uom:ML SET code = "ML", name = "ML", family = "volume", base_factor = 1, is_system = true, is_active = true, sort = 120;
UPSERT inventory_uom:GAL SET code = "GAL", name = "GAL", family = "volume", base_factor = 3785.411784, is_system = true, is_active = true, sort = 130;
UPSERT inventory_uom:QT SET code = "QT", name = "QT", family = "volume", base_factor = 946.352946, is_system = true, is_active = true, sort = 140;
UPSERT inventory_uom:PT SET code = "PT", name = "PT", family = "volume", base_factor = 473.176473, is_system = true, is_active = true, sort = 150;
UPSERT inventory_uom:FLOZ SET code = "FLOZ", name = "FLOZ", family = "volume", base_factor = 29.5735295625, is_system = true, is_active = true, sort = 160;

-- Count (base = PC)
UPSERT inventory_uom:PC SET code = "PC", name = "PC", family = "count", base_factor = 1, is_system = true, is_active = true, sort = 210;
UPSERT inventory_uom:DZN SET code = "DZN", name = "DZN", family = "count", base_factor = 12, is_system = true, is_active = true, sort = 220;

-- Pack (no cross-unit conversion)
UPSERT inventory_uom:PK SET code = "PK", name = "PK", family = "pack", base_factor = 1, is_system = true, is_active = true, sort = 310;
