DEFINE FIELD OVERWRITE allowed_next_groups ON TABLE modifier
  TYPE option<array<record<modifier_group>|none>>
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
