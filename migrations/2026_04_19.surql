DEFINE FIELD OVERWRITE content ON TABLE document TYPE option<bytes|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE name ON TABLE document TYPE string PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE size ON TABLE document TYPE option<int | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE type ON TABLE document TYPE option<string | null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE path ON TABLE document TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE FIELD OVERWRITE dish_photo ON TABLE menu_item TYPE option<record<document>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE FIELD OVERWRITE discount_rate ON TABLE order TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;