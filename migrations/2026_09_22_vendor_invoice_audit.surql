-- Migration: 2026_09_22_vendor_invoice_audit.surql
--
-- AI Vendor Invoice Audit Automator — 101st POSR-exclusive differentiator.
--
-- Research finding: Restaurants lose $200-1,000/mo per location from vendor
-- invoice errors (NRA, Restaurant Supply Chain Report):
--   - Price discrepancies: vendor charges 5-15% above contracted price
--   - Quantity mismatches: invoiced quantity > delivered quantity
--   - Unauthorized items: items added to invoice not on purchase order
--   - Overcharge patterns: systematic overbilling across multiple invoices
--   - Missing discounts: contracted volume discounts not applied
--   - Late invoices: delayed billing causing cash flow surprises
--   - Duplicate charges: same item charged twice across invoices
--   - Contract expiry: paying expired contract prices (5-20% above market)
--
-- Classic POS systems (Toast, Square, Lightspeed) have NO invoice auditing.
-- vendor-performance tracks supplier SCORECARDS. procurement tracks PRICE
-- forecasting. Neither audits invoices against contracts/POs.
-- Third-party AP automation (Bill.com, Stampli, AvidXchange) cost $200-500/mo
-- and are general-purpose — not restaurant-specific, don't know ingredient
-- prices or contracted terms.
--
-- POSR's existing services:
--   - vendor-performance.service = supplier scorecards (on-time, quality) — NOT
--     invoice auditing
--   - procurement.service = PRICE forecasting (buy-now vs wait) — NOT invoice
--     verification
--   - supplier-negotiation.service = negotiation STRATEGY — NOT invoice audit
--   - food-cost-trend.service = ingredient COST trends — NOT invoice checking
--   - reorder-point-optimizer.service = inventory REORDER points — NOT invoices
--
-- This new service AUTOMATES VENDOR INVOICE AUDITING:
--   - Compares invoice line items against purchase orders
--   - Verifies prices against contracted rates
--   - Detects quantity discrepancies
--   - Flags unauthorized items
--   - Identifies systematic overcharge patterns
--   - Tracks missing volume discounts
--   - Detects duplicate charges across invoices
--   - Alerts on expired contracts being charged

DEFINE TABLE IF NOT EXISTS invoice_audit_alert TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id              ON invoice_audit_alert TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS rule_id         ON invoice_audit_alert TYPE string;
  -- 'price_discrepancy' | 'quantity_mismatch' | 'unauthorized_item' |
--   'overcharge_pattern' | 'missing_discount' | 'late_invoice' |
--   'duplicate_charge' | 'contract_expiry'
DEFINE FIELD IF NOT EXISTS severity        ON invoice_audit_alert TYPE string;
  -- 'critical' | 'high' | 'medium' | 'low'
DEFINE FIELD IF NOT EXISTS vendor_name     ON invoice_audit_alert TYPE string;
DEFINE FIELD IF NOT EXISTS invoice_number  ON invoice_audit_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS item_name       ON invoice_audit_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS contracted_price ON invoice_audit_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS invoiced_price  ON invoice_audit_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS ordered_qty     ON invoice_audit_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS invoiced_qty    ON invoice_audit_alert TYPE option<float>;
DEFINE FIELD IF NOT EXISTS discrepancy_amount ON invoice_audit_alert TYPE float DEFAULT 0;
  -- $ overcharged
DEFINE FIELD IF NOT EXISTS est_monthly_loss ON invoice_audit_alert TYPE float DEFAULT 0;
  -- $ monthly loss if pattern continues
DEFINE FIELD IF NOT EXISTS description     ON invoice_audit_alert TYPE string;
DEFINE FIELD IF NOT EXISTS ai_insight      ON invoice_audit_alert TYPE option<string>;
DEFINE FIELD IF NOT EXISTS ai_recommendation ON invoice_audit_alert TYPE option<string>;
  -- 'dispute_now' | 'renegotiate_contract' | 'request_credit' | 'switch_vendor' |
--   'monitor' | 'skip'
DEFINE FIELD IF NOT EXISTS status          ON invoice_audit_alert TYPE string DEFAULT 'open';
  -- 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired'
DEFINE FIELD IF NOT EXISTS detected_at     ON invoice_audit_alert TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS expires_at      ON invoice_audit_alert TYPE option<datetime>;

DEFINE INDEX IF NOT EXISTS idx_invoice_rule      ON invoice_audit_alert FIELDS rule_id;
DEFINE INDEX IF NOT EXISTS idx_invoice_status    ON invoice_audit_alert FIELDS status;
DEFINE INDEX IF NOT EXISTS idx_invoice_severity  ON invoice_audit_alert FIELDS severity;
DEFINE INDEX IF NOT EXISTS idx_invoice_vendor    ON invoice_audit_alert FIELDS vendor_name;

-- Settings
DEFINE FIELD IF NOT EXISTS invoice_ai_enabled      ON settings TYPE option<bool> DEFAULT true;
DEFINE FIELD IF NOT EXISTS invoice_price_tolerance_pct ON settings TYPE option<float> DEFAULT 2.0;
  -- max % price deviation before alert (default 2%)
DEFINE FIELD IF NOT EXISTS invoice_qty_tolerance_pct ON settings TYPE option<float> DEFAULT 3.0;
  -- max % quantity deviation before alert (default 3%)
DEFINE FIELD IF NOT EXISTS invoice_late_threshold_days ON settings TYPE option<int> DEFAULT 30;
  -- days after delivery before invoice is "late" (default 30)
