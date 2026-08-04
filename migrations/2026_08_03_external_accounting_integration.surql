-- External accounting integration tables (provider-agnostic).
-- Shared by QuickBooks Online, Xero, and future cloud accounting providers.

-- Maps POSR entity IDs to external accounting system IDs.
DEFINE TABLE integration_entity_mapping SCHEMALESS;

DEFINE FIELD provider_id ON integration_entity_mapping TYPE string;
DEFINE FIELD tenant_id ON integration_entity_mapping TYPE string;
DEFINE FIELD entity_type ON integration_entity_mapping TYPE string;
DEFINE FIELD posr_id ON integration_entity_mapping TYPE string;
DEFINE FIELD external_id ON integration_entity_mapping TYPE string;
DEFINE FIELD external_payload ON integration_entity_mapping TYPE any DEFAULT {};
DEFINE FIELD updated_at ON integration_entity_mapping TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_entity_mapping_posr ON integration_entity_mapping
  FIELDS provider_id, tenant_id, entity_type, posr_id UNIQUE;

DEFINE INDEX idx_entity_mapping_external ON integration_entity_mapping
  FIELDS provider_id, tenant_id, entity_type, external_id UNIQUE;

-- Encrypted OAuth credentials (server-only; never exposed to browser).
DEFINE TABLE integration_oauth_credential SCHEMALESS;

DEFINE FIELD provider_id ON integration_oauth_credential TYPE string;
DEFINE FIELD tenant_id ON integration_oauth_credential TYPE string;
DEFINE FIELD company_name ON integration_oauth_credential TYPE option<string>;
DEFINE FIELD access_token_enc ON integration_oauth_credential TYPE string;
DEFINE FIELD refresh_token_enc ON integration_oauth_credential TYPE option<string>;
DEFINE FIELD token_type ON integration_oauth_credential TYPE string DEFAULT 'bearer';
DEFINE FIELD expires_at ON integration_oauth_credential TYPE option<datetime>;
DEFINE FIELD scopes ON integration_oauth_credential TYPE option<string>;
DEFINE FIELD status ON integration_oauth_credential TYPE string DEFAULT 'connected';
DEFINE FIELD updated_at ON integration_oauth_credential TYPE datetime DEFAULT time::now();

DEFINE INDEX idx_oauth_credential ON integration_oauth_credential
  FIELDS provider_id, tenant_id UNIQUE;

-- Anti-CSRF OAuth state store (single-use with expiry).
DEFINE TABLE integration_oauth_state SCHEMAFULL;

DEFINE FIELD state ON integration_oauth_state TYPE string;
DEFINE FIELD provider_id ON integration_oauth_state TYPE string;
DEFINE FIELD user_id ON integration_oauth_state TYPE string;
DEFINE FIELD redirect_path ON integration_oauth_state TYPE string DEFAULT '/';
DEFINE FIELD expires_at ON integration_oauth_state TYPE datetime;
DEFINE FIELD used_at ON integration_oauth_state TYPE option<datetime>;

DEFINE INDEX idx_oauth_state ON integration_oauth_state
  FIELDS state UNIQUE;

-- Sync run history (one row per sync operation).
DEFINE TABLE integration_sync_run SCHEMAFULL;

DEFINE FIELD provider_id ON integration_sync_run TYPE string;
DEFINE FIELD tenant_id ON integration_sync_run TYPE string;
DEFINE FIELD mode ON integration_sync_run TYPE string;
DEFINE FIELD status ON integration_sync_run TYPE string;
DEFINE FIELD progress ON integration_sync_run TYPE option<string>;
DEFINE FIELD cursor ON integration_sync_run TYPE option<string>;
DEFINE FIELD error ON integration_sync_run TYPE option<string>;
DEFINE FIELD started_at ON integration_sync_run TYPE datetime DEFAULT time::now();
DEFINE FIELD finished_at ON integration_sync_run TYPE option<datetime>;

-- Failed sync records for retry and error display.
DEFINE TABLE integration_sync_failure SCHEMAFULL;

DEFINE FIELD provider_id ON integration_sync_failure TYPE string;
DEFINE FIELD tenant_id ON integration_sync_failure TYPE string;
DEFINE FIELD entity_type ON integration_sync_failure TYPE string;
DEFINE FIELD posr_id ON integration_sync_failure TYPE string;
DEFINE FIELD action ON integration_sync_failure TYPE string;
DEFINE FIELD error ON integration_sync_failure TYPE string;
DEFINE FIELD error_category ON integration_sync_failure TYPE string;
DEFINE FIELD retriable ON integration_sync_failure TYPE bool DEFAULT true;
DEFINE FIELD retry_count ON integration_sync_failure TYPE int DEFAULT 0;
DEFINE FIELD created_at ON integration_sync_failure TYPE datetime DEFAULT time::now();
