DEFINE TABLE payment_webhook SCHEMAFULL;
DEFINE FIELD key ON TABLE payment_webhook TYPE string;
DEFINE FIELD data ON TABLE payment_webhook TYPE any;
DEFINE FIELD gateway ON TABLE payment_webhook TYPE string;
DEFINE FIELD created_at ON TABLE payment_webhook TYPE datetime DEFAULT time::now();
DEFINE INDEX payment_webhook_key_gateway ON TABLE payment_webhook FIELDS key, gateway UNIQUE;
