-- Persist per-tax amounts at order level (multi-tax support for mixed inclusive/exclusive orders)

DEFINE TABLE order_tax SCHEMAFULL;
DEFINE FIELD order ON order_tax TYPE record<order> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD tax ON order_tax TYPE record<tax> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD amount ON order_tax TYPE float PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE INDEX order_tax_unique ON order_tax FIELDS order, tax UNIQUE;

DEFINE FIELD order_taxes ON order TYPE option<array<record<order_tax>>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
