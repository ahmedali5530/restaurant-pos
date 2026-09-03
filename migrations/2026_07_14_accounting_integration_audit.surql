-- Accounting integration audit trail + idempotency on journal entries

DEFINE FIELD OVERWRITE origin_event ON account_journal_entry TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE origin_module ON account_journal_entry TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE origin_record_id ON account_journal_entry TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE integration_provider_id ON account_journal_entry TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE posting_rule_id ON account_journal_entry TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE journal_template_id ON account_journal_entry TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE idempotency_key ON account_journal_entry TYPE none | string | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE generated_at ON account_journal_entry TYPE none | datetime | null PERMISSIONS FULL;
DEFINE FIELD OVERWRITE generated_by ON account_journal_entry TYPE none | string | null PERMISSIONS FULL;

DEFINE INDEX OVERWRITE account_journal_entry_idempotency_key ON account_journal_entry FIELDS idempotency_key;
