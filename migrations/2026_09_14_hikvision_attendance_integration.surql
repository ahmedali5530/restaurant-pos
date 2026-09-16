-- Hikvision attendance integration: raw event dedupe + per-device poll state.
-- time_entry.source remains a free string (already includes clock|manual|import|adjustment);
-- device punches use source = 'device'.

DEFINE TABLE IF NOT EXISTS integration_hikvision_event SCHEMALESS;
DEFINE FIELD IF NOT EXISTS device_id ON integration_hikvision_event TYPE string;
DEFINE FIELD IF NOT EXISTS serial_no ON integration_hikvision_event TYPE option<int>;
DEFINE FIELD IF NOT EXISTS employee_no ON integration_hikvision_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS event_time ON integration_hikvision_event TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS attendance_status ON integration_hikvision_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS verify_mode ON integration_hikvision_event TYPE option<string>;
DEFINE FIELD IF NOT EXISTS dedupe_key ON integration_hikvision_event TYPE string;
DEFINE FIELD IF NOT EXISTS raw ON integration_hikvision_event TYPE any DEFAULT {};
DEFINE FIELD IF NOT EXISTS imported_at ON integration_hikvision_event TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS time_entry ON integration_hikvision_event TYPE option<record<time_entry>>;

DEFINE INDEX IF NOT EXISTS idx_hikvision_event_dedupe ON integration_hikvision_event
  FIELDS dedupe_key UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_hikvision_event_device_serial ON integration_hikvision_event
  FIELDS device_id, serial_no;
DEFINE INDEX IF NOT EXISTS idx_hikvision_event_employee_time ON integration_hikvision_event
  FIELDS device_id, employee_no, event_time;

DEFINE TABLE IF NOT EXISTS integration_hikvision_device_state SCHEMALESS;
DEFINE FIELD IF NOT EXISTS device_id ON integration_hikvision_device_state TYPE string;
DEFINE FIELD IF NOT EXISTS last_poll_at ON integration_hikvision_device_state TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS last_event_time ON integration_hikvision_device_state TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS last_error ON integration_hikvision_device_state TYPE option<string>;
DEFINE FIELD IF NOT EXISTS last_success_at ON integration_hikvision_device_state TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS updated_at ON integration_hikvision_device_state TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_hikvision_device_state_id ON integration_hikvision_device_state
  FIELDS device_id UNIQUE;
