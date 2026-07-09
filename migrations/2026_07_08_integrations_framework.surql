-- Generic Integration Framework tables

DEFINE TABLE integration_provider SCHEMAFULL;
DEFINE FIELD id ON integration_provider TYPE string;
DEFINE FIELD manifest ON integration_provider TYPE any;
DEFINE FIELD enabled ON integration_provider TYPE bool DEFAULT true;
DEFINE FIELD created_at ON integration_provider TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON integration_provider TYPE datetime DEFAULT time::now();

DEFINE TABLE integration_provider_config SCHEMAFULL;
DEFINE FIELD provider_id ON integration_provider_config TYPE string;
DEFINE FIELD values ON integration_provider_config TYPE any DEFAULT {};
DEFINE FIELD updated_at ON integration_provider_config TYPE datetime DEFAULT time::now();

DEFINE TABLE integration_installed_provider SCHEMAFULL;
DEFINE FIELD provider_id ON integration_installed_provider TYPE string;
DEFINE FIELD enabled ON integration_installed_provider TYPE bool DEFAULT true;
DEFINE FIELD updated_at ON integration_installed_provider TYPE datetime DEFAULT time::now();

DEFINE TABLE integration_queue SCHEMAFULL;
DEFINE FIELD provider_id ON integration_queue TYPE string;
DEFINE FIELD action ON integration_queue TYPE string;
DEFINE FIELD payload ON integration_queue TYPE any DEFAULT {};
DEFINE FIELD status ON integration_queue TYPE string;
DEFINE FIELD attempts ON integration_queue TYPE int DEFAULT 0;
DEFINE FIELD max_retries ON integration_queue TYPE int DEFAULT 5;
DEFINE FIELD dedupe_key ON integration_queue TYPE option<string>;
DEFINE FIELD partition_key ON integration_queue TYPE option<string>;
DEFINE FIELD next_run_at ON integration_queue TYPE option<datetime>;
DEFINE FIELD created_at ON integration_queue TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON integration_queue TYPE datetime DEFAULT time::now();

DEFINE TABLE integration_queue_attempt SCHEMAFULL;
DEFINE FIELD job_id ON integration_queue_attempt TYPE string;
DEFINE FIELD provider_id ON integration_queue_attempt TYPE string;
DEFINE FIELD status ON integration_queue_attempt TYPE string;
DEFINE FIELD attempts ON integration_queue_attempt TYPE int;
DEFINE FIELD error ON integration_queue_attempt TYPE option<string>;
DEFINE FIELD created_at ON integration_queue_attempt TYPE datetime DEFAULT time::now();

DEFINE TABLE integration_provider_health SCHEMAFULL;
DEFINE FIELD provider_id ON integration_provider_health TYPE string;
DEFINE FIELD status ON integration_provider_health TYPE string;
DEFINE FIELD authentication_status ON integration_provider_health TYPE string;
DEFINE FIELD average_response_time_ms ON integration_provider_health TYPE option<number>;
DEFINE FIELD pending_jobs ON integration_provider_health TYPE int DEFAULT 0;
DEFINE FIELD failed_jobs ON integration_provider_health TYPE int DEFAULT 0;
DEFINE FIELD last_synchronization ON integration_provider_health TYPE option<datetime>;
DEFINE FIELD certificate_expiry ON integration_provider_health TYPE option<datetime>;
DEFINE FIELD version ON integration_provider_health TYPE string;
DEFINE FIELD errors ON integration_provider_health TYPE any DEFAULT [];
DEFINE FIELD updated_at ON integration_provider_health TYPE datetime DEFAULT time::now();

DEFINE TABLE integration_provider_secret SCHEMALESS;
DEFINE TABLE integration_provider_certificate SCHEMAFULL;
DEFINE FIELD provider_id ON integration_provider_certificate TYPE string;
DEFINE FIELD name ON integration_provider_certificate TYPE string;
DEFINE FIELD expires_at ON integration_provider_certificate TYPE option<datetime>;
DEFINE FIELD created_at ON integration_provider_certificate TYPE datetime DEFAULT time::now();

DEFINE TABLE integration_provider_webhook SCHEMAFULL;
DEFINE FIELD provider_id ON integration_provider_webhook TYPE string;
DEFINE FIELD event_name ON integration_provider_webhook TYPE string;
DEFINE FIELD payload ON integration_provider_webhook TYPE any DEFAULT {};
DEFINE FIELD received_at ON integration_provider_webhook TYPE datetime DEFAULT time::now();

DEFINE TABLE integration_schedule SCHEMAFULL;
DEFINE FIELD provider_id ON integration_schedule TYPE string;
DEFINE FIELD name ON integration_schedule TYPE string;
DEFINE FIELD interval_ms ON integration_schedule TYPE int;
DEFINE FIELD enabled ON integration_schedule TYPE bool DEFAULT true;
DEFINE FIELD next_run_at ON integration_schedule TYPE option<datetime>;
DEFINE FIELD updated_at ON integration_schedule TYPE datetime DEFAULT time::now();

DEFINE TABLE integration_execution_history SCHEMAFULL;
DEFINE FIELD provider_id ON integration_execution_history TYPE string;
DEFINE FIELD action ON integration_execution_history TYPE string;
DEFINE FIELD status ON integration_execution_history TYPE string;
DEFINE FIELD request_payload ON integration_execution_history TYPE any DEFAULT {};
DEFINE FIELD response_payload ON integration_execution_history TYPE any DEFAULT {};
DEFINE FIELD error ON integration_execution_history TYPE option<string>;
DEFINE FIELD created_at ON integration_execution_history TYPE datetime DEFAULT time::now();
