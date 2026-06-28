-- Journal entry status field (replaces posted boolean)

DEFINE FIELD OVERWRITE status ON TABLE account_journal_entry
  TYPE string
  DEFAULT 'draft'
  ASSERT $value IN ['draft', 'posted', 'reversed']
  PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;

UPDATE account_journal_entry SET status = 'posted' WHERE posted = true;
UPDATE account_journal_entry SET status = 'draft' WHERE posted = false OR posted = NONE;

REMOVE FIELD posted ON TABLE account_journal_entry;

DEFINE FIELD documents ON TABLE account_journal_entry TYPE option<array<record<document>>|null> PERMISSIONS FOR create FULL FOR select FULL FOR update FULL;