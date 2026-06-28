DEFINE TABLE account TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

-- ------------------------------
-- FIELDS
-- ------------------------------

DEFINE FIELD account_type ON account TYPE option<string | null> PERMISSIONS FULL;
DEFINE FIELD code ON account TYPE string PERMISSIONS FULL;
DEFINE FIELD created_at ON account TYPE option<datetime | null> VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD group ON account TYPE option<record<account_group> | null> PERMISSIONS FULL;
DEFINE FIELD is_active ON account TYPE option<bool | null> DEFAULT true PERMISSIONS FULL;
DEFINE FIELD name ON account TYPE string PERMISSIONS FULL;
DEFINE FIELD normal_balance ON account TYPE string PERMISSIONS FULL;
DEFINE FIELD notes ON account TYPE option<string | null> PERMISSIONS FULL;
DEFINE FIELD parent ON account TYPE option<record<account> | null> PERMISSIONS FULL;
DEFINE FIELD store ON account TYPE option<record<store> | null> PERMISSIONS FULL;
DEFINE FIELD updated_at ON account TYPE option<datetime | null> PERMISSIONS FULL;

-- ------------------------------
-- INDEXES
-- ------------------------------

DEFINE INDEX account_code_store_unique ON account FIELDS code, store UNIQUE;

DEFINE TABLE account_group TYPE ANY SCHEMALESS PERMISSIONS NONE;

-- ------------------------------
-- FIELDS
-- ------------------------------

DEFINE FIELD code ON account_group TYPE string PERMISSIONS FULL;
DEFINE FIELD created_at ON account_group TYPE option<datetime | null> VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD head_type ON account_group TYPE string PERMISSIONS FULL;
DEFINE FIELD is_active ON account_group TYPE option<bool | null> DEFAULT true PERMISSIONS FULL;
DEFINE FIELD name ON account_group TYPE string PERMISSIONS FULL;
DEFINE FIELD normal_balance ON account_group TYPE string PERMISSIONS FULL;
DEFINE FIELD notes ON account_group TYPE option<string | null> PERMISSIONS FULL;
DEFINE FIELD store ON account_group TYPE option<record<store> | null> PERMISSIONS FULL;
DEFINE FIELD updated_at ON account_group TYPE option<datetime | null> PERMISSIONS FULL;

-- ------------------------------
-- INDEXES
-- ------------------------------

DEFINE INDEX account_group_code_store_unique ON account_group FIELDS code, store UNIQUE;

DEFINE TABLE account_journal_entry TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

-- ------------------------------
-- FIELDS
-- ------------------------------

DEFINE FIELD created_at ON account_journal_entry TYPE option<datetime | null> VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD created_by ON account_journal_entry TYPE option<record<user_account> | null> PERMISSIONS FULL;
DEFINE FIELD date ON account_journal_entry TYPE datetime PERMISSIONS FULL;
DEFINE FIELD entry_number ON account_journal_entry TYPE int PERMISSIONS FULL;
DEFINE FIELD lines ON account_journal_entry TYPE option<array<record<account_journal_line>> | null> PERMISSIONS FULL;
DEFINE FIELD memo ON account_journal_entry TYPE option<string | null> PERMISSIONS FULL;
DEFINE FIELD source_id ON account_journal_entry TYPE option<string | null> PERMISSIONS FULL;
DEFINE FIELD source_module ON account_journal_entry TYPE option<string | null> PERMISSIONS FULL;
DEFINE FIELD store ON account_journal_entry TYPE option<record<store> | null> PERMISSIONS FULL;
DEFINE FIELD updated_at ON account_journal_entry TYPE option<datetime | null> PERMISSIONS FULL;
DEFINE FIELD OVERWRITE status ON TABLE account_journal_entry
  TYPE string
  DEFAULT 'draft'
  ASSERT $value IN ['draft', 'posted', 'reversed']
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
DEFINE FIELD documents ON TABLE account_journal_entry TYPE option<array<record<document>>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;
-- ------------------------------
-- INDEXES
-- ------------------------------

DEFINE INDEX account_journal_entry_number_store_unique ON account_journal_entry FIELDS entry_number, store UNIQUE;

DEFINE TABLE account_journal_line TYPE NORMAL SCHEMAFULL PERMISSIONS NONE;

-- ------------------------------
-- FIELDS
-- ------------------------------

DEFINE FIELD account ON account_journal_line TYPE record<account> PERMISSIONS FULL;
DEFINE FIELD created_at ON account_journal_line TYPE option<datetime | null> VALUE time::now() PERMISSIONS FULL;
DEFINE FIELD credit ON account_journal_line TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD debit ON account_journal_line TYPE float DEFAULT 0 PERMISSIONS FULL;
DEFINE FIELD description ON account_journal_line TYPE option<string | null> PERMISSIONS FULL;
DEFINE FIELD entry ON account_journal_line TYPE record<account_journal_entry> PERMISSIONS FULL;