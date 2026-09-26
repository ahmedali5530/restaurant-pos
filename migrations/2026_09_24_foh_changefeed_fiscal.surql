-- Add fiscal submission rows to the local-to-cloud FOH changefeed allowlist.
-- Safe if 2026_09_24_foh_changefeed already ran without this table.

ALTER TABLE IF EXISTS integration_order_fiscal CHANGEFEED 14d;
