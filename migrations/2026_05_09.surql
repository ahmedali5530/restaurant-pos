DEFINE FIELD OVERWRITE allow_service_charges ON TABLE order_type TYPE option<bool|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE user_shift ON TABLE tracking TYPE option<string|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE FIELD OVERWRITE deleted_at ON TABLE modifier_group TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE floor_table TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE discount TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE coupon TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE kitchen TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE printer TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE payment_type TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE order_type TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE tax TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE user TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE user_role TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE shift TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE floor TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE menu TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD OVERWRITE deleted_at ON TABLE category TYPE option<datetime|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

DEFINE FIELD OVERWRITE auto_id ON TABLE order TYPE int DEFAULT 1 PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
