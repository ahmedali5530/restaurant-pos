-- Local-to-cloud sync: durable changefeeds on FOH / sales tables.
-- Use ALTER so existing SCHEMAFULL definitions and fields stay intact.
-- sync_cloud_cursor stores per-table versionstamp + backfill state for the
-- sync-service uploader; it is never uploaded to master.

DEFINE TABLE IF NOT EXISTS sync_cloud_cursor SCHEMALESS PERMISSIONS NONE;

ALTER TABLE IF EXISTS order CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_item CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_item_kitchen CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_payment CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_tax CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_discount CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_coupon CHANGEFEED 14d;
ALTER TABLE IF EXISTS coupon_redemption CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_void CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_refund CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_split CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_merge CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_print CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_extras CHANGEFEED 14d;
ALTER TABLE IF EXISTS order_meta CHANGEFEED 14d;
ALTER TABLE IF EXISTS day_closing CHANGEFEED 14d;
ALTER TABLE IF EXISTS shift CHANGEFEED 14d;
ALTER TABLE IF EXISTS time_entry CHANGEFEED 14d;
ALTER TABLE IF EXISTS tip_distribution CHANGEFEED 14d;
ALTER TABLE IF EXISTS tip_distribution_user_share CHANGEFEED 14d;
ALTER TABLE IF EXISTS customer CHANGEFEED 14d;
ALTER TABLE IF EXISTS integration_order_fiscal CHANGEFEED 14d;
