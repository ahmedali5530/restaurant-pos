-- Migration: 2026_08_27_payment_credential_encryption.surql
--
-- Adds encrypted credential storage fields to the payment_type table.
--
-- Previously the `gateway_config` field held gateway credentials (Stripe secret
-- key, M-Pesa consumer secret, Telebirr RSA private key, etc.) as a plain
-- JSON object. Anyone with DB read access got live payment keys.
--
-- This migration adds a parallel `gateway_config_encrypted` field that holds
-- an AES-256-GCM encrypted blob (format: "enc:v1:<base64>"). The legacy
-- `gateway_config` field is kept for backward compatibility — new writes go
-- to the encrypted field and clear the plaintext field.
--
-- See: payments/src/lib/payment-credential.crypto.js
-- See: payments/src/routes/credentials.routes.js  (POST /payments/credentials/:id)
-- See: migrations/scripts/encrypt-existing-payment-credentials.cjs  (backfill)

-- payment_type is SCHEMAFULL, so the new field must be declared.
DEFINE FIELD IF NOT EXISTS gateway_config_encrypted ON payment_type TYPE option<string>;
DEFINE FIELD IF NOT EXISTS credentials_updated_at ON payment_type TYPE option<datetime>;

-- No index needed — credentials are always looked up by payment_type record id
-- (which is already the primary key).
