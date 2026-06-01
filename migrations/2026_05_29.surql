DEFINE FIELD OVERWRITE tip ON TABLE order TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE tip_amount ON TABLE order TYPE option<float|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE tip_type ON TABLE order TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;