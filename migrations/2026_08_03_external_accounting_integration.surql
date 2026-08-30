-- External accounting integration tables (provider-agnostic).
-- Shared by QuickBooks Online, Xero, and future cloud accounting providers.

-- Maps POSR entity IDs to external accounting system IDs.
DEFINE TABLE IF NOT EXISTS integration_entity_mapping SCHEMALESS;

DEFINE FIELD IF NOT EXISTS provider_id ON integration_entity_mapping TYPE string;
DEFINE FIELD IF NOT EXISTS tenant_id ON integration_entity_mapping TYPE string;
DEFINE FIELD IF NOT EXISTS entity_type ON integration_entity_mapping TYPE string;
DEFINE FIELD IF NOT EXISTS posr_id ON integration_entity_mapping TYPE string;
DEFINE FIELD IF NOT EXISTS external_id ON integration_entity_mapping TYPE string;
DEFINE FIELD IF NOT EXISTS external_payload ON integration_entity_mapping TYPE any DEFAULT {};
DEFINE FIELD IF NOT EXISTS updated_at ON integration_entity_mapping TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_entity_mapping_posr ON integration_entity_mapping
  FIELDS provider_id, tenant_id, entity_type, posr_id UNIQUE;

DEFINE INDEX IF NOT EXISTS idx_entity_mapping_external ON integration_entity_mapping
  FIELDS provider_id, tenant_id, entity_type, external_id UNIQUE;

-- Encrypted OAuth credentials (server-only; never exposed to browser).
DEFINE TABLE IF NOT EXISTS integration_oauth_credential SCHEMALESS;

DEFINE FIELD IF NOT EXISTS provider_id ON integration_oauth_credential TYPE string;
DEFINE FIELD IF NOT EXISTS tenant_id ON integration_oauth_credential TYPE string;
DEFINE FIELD IF NOT EXISTS company_name ON integration_oauth_credential TYPE option<string>;
DEFINE FIELD IF NOT EXISTS access_token_enc ON integration_oauth_credential TYPE string;
DEFINE FIELD IF NOT EXISTS refresh_token_enc ON integration_oauth_credential TYPE option<string>;
DEFINE FIELD IF NOT EXISTS token_type ON integration_oauth_credential TYPE string DEFAULT 'bearer';
DEFINE FIELD IF NOT EXISTS expires_at ON integration_oauth_credential TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS scopes ON integration_oauth_credential TYPE option<string>;
DEFINE FIELD IF NOT EXISTS status ON integration_oauth_credential TYPE string DEFAULT 'connected';
DEFINE FIELD IF NOT EXISTS updated_at ON integration_oauth_credential TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_oauth_credential ON integration_oauth_credential
  FIELDS provider_id, tenant_id UNIQUE;

-- Anti-CSRF OAuth state store (single-use with expiry).
DEFINE TABLE IF NOT EXISTS integration_oauth_state SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS state ON integration_oauth_state TYPE string;
DEFINE FIELD IF NOT EXISTS provider_id ON integration_oauth_state TYPE string;
DEFINE FIELD IF NOT EXISTS user_id ON integration_oauth_state TYPE string;
DEFINE FIELD IF NOT EXISTS redirect_path ON integration_oauth_state TYPE string DEFAULT '/';
DEFINE FIELD IF NOT EXISTS expires_at ON integration_oauth_state TYPE datetime;
DEFINE FIELD IF NOT EXISTS used_at ON integration_oauth_state TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_oauth_state ON integration_oauth_state
  FIELDS state UNIQUE;

-- Sync run history (one row per sync operation).
DEFINE TABLE IF NOT EXISTS integration_sync_run SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS provider_id ON integration_sync_run TYPE string;
DEFINE FIELD IF NOT EXISTS tenant_id ON integration_sync_run TYPE string;
DEFINE FIELD IF NOT EXISTS mode ON integration_sync_run TYPE string;
DEFINE FIELD IF NOT EXISTS status ON integration_sync_run TYPE string;
DEFINE FIELD IF NOT EXISTS progress ON integration_sync_run TYPE option<string>;
DEFINE FIELD IF NOT EXISTS cursor ON integration_sync_run TYPE option<string>;
DEFINE FIELD IF NOT EXISTS error ON integration_sync_run TYPE option<string>;
DEFINE FIELD IF NOT EXISTS started_at ON integration_sync_run TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS finished_at ON integration_sync_run TYPE option<datetime>;

-- Failed sync records for retry and error display.
DEFINE TABLE IF NOT EXISTS integration_sync_failure SCHEMAFULL;

DEFINE FIELD IF NOT EXISTS provider_id ON integration_sync_failure TYPE string;
DEFINE FIELD IF NOT EXISTS tenant_id ON integration_sync_failure TYPE string;
DEFINE FIELD IF NOT EXISTS entity_type ON integration_sync_failure TYPE string;
DEFINE FIELD IF NOT EXISTS posr_id ON integration_sync_failure TYPE string;
DEFINE FIELD IF NOT EXISTS action ON integration_sync_failure TYPE string;
DEFINE FIELD IF NOT EXISTS error ON integration_sync_failure TYPE string;
DEFINE FIELD IF NOT EXISTS error_category ON integration_sync_failure TYPE string;
DEFINE FIELD IF NOT EXISTS retriable ON integration_sync_failure TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS retry_count ON integration_sync_failure TYPE int DEFAULT 0;
DEFINE FIELD IF NOT EXISTS created_at ON integration_sync_failure TYPE datetime DEFAULT time::now();
