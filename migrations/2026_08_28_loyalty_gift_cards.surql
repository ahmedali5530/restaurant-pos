-- Migration: 2026_08_28_loyalty_gift_cards.surql
--
-- Loyalty program + gift card infrastructure.
--
-- Research finding: Loyalty + gift cards is the #3 most requested feature
-- on restaurant POS forums. All 5 top competitors (Toast, Square,
-- Lightspeed, TouchBistro, Clover) sell it as a paid add-on ($185/mo at
-- Toast). POSR offering it free is a major competitive differentiator.
--
-- Components:
--   1. loyalty_program — program configuration (points per currency, tiers)
--   2. loyalty_member — customer enrollment in the loyalty program
--   3. loyalty_transaction — point accrual/redemption log (append-only)
--   4. gift_card — issued gift cards with balance
--   5. gift_card_transaction — gift card usage log (issue/redeem/refund)
--
-- See: src/lib/loyalty.service.ts (loyalty logic)
-- See: src/lib/gift-card.service.ts (gift card logic)

-- ---------------------------------------------------------------------------
-- loyalty_program — program configuration (one record per restaurant/branch)
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS loyalty_program TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON loyalty_program TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS name          ON loyalty_program TYPE string;
DEFINE FIELD IF NOT EXISTS description   ON loyalty_program TYPE option<string>;
DEFINE FIELD IF NOT EXISTS points_per_currency ON loyalty_program TYPE float DEFAULT 1;
  -- How many points per 1 unit of currency spent (e.g. 1 point per $1)
DEFINE FIELD IF NOT EXISTS currency_per_point ON loyalty_program TYPE float DEFAULT 0.01;
  -- Redemption rate: 1 point = $0.01 (100 points = $1)
DEFINE FIELD IF NOT EXISTS min_redemption_points ON loyalty_program TYPE int DEFAULT 100;
  -- Minimum points needed before redemption is allowed
DEFINE FIELD IF NOT EXISTS is_active     ON loyalty_program TYPE bool DEFAULT true;
DEFINE FIELD IF NOT EXISTS created_at    ON loyalty_program TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at    ON loyalty_program TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS branch_id     ON loyalty_program TYPE option<record<inventory_store>>;

-- ---------------------------------------------------------------------------
-- loyalty_member — customer enrollment
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS loyalty_member TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON loyalty_member TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS customer      ON loyalty_member TYPE record<customer>;
DEFINE FIELD IF NOT EXISTS program       ON loyalty_member TYPE record<loyalty_program>;
DEFINE FIELD IF NOT EXISTS points_balance ON loyalty_member TYPE int DEFAULT 0;
  -- Current redeemable points balance
DEFINE FIELD IF NOT EXISTS lifetime_points ON loyalty_member TYPE int DEFAULT 0;
  -- Total points ever earned (for tier calculation — never decreases)
DEFINE FIELD IF NOT EXISTS tier          ON loyalty_member TYPE string DEFAULT 'bronze';
  -- 'bronze' | 'silver' | 'gold' | 'platinum'
DEFINE FIELD IF NOT EXISTS joined_at      ON loyalty_member TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS last_activity ON loyalty_member TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS is_active     ON loyalty_member TYPE bool DEFAULT true;

DEFINE INDEX IF NOT EXISTS loyalty_member_customer ON loyalty_member FIELDS customer;
DEFINE INDEX IF NOT EXISTS loyalty_member_program ON loyalty_member FIELDS program;

-- ---------------------------------------------------------------------------
-- loyalty_transaction — append-only log of point changes
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS loyalty_transaction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON loyalty_transaction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS member        ON loyalty_transaction TYPE record<loyalty_member>;
DEFINE FIELD IF NOT EXISTS customer       ON loyalty_transaction TYPE option<record<customer>>;
DEFINE FIELD IF NOT EXISTS type          ON loyalty_transaction TYPE string;
  -- 'earn' (purchase) | 'redeem' (discount applied) | 'adjust' (manual) | 'expire'
DEFINE FIELD IF NOT EXISTS points        ON loyalty_transaction TYPE int;
  -- Positive for earn, negative for redeem/expire
DEFINE FIELD IF NOT EXISTS order_id      ON loyalty_transaction TYPE option<record<order>>;
  -- Linked order (for earn/redeem)
DEFINE FIELD IF NOT EXISTS amount        ON loyalty_transaction TYPE option<float>;
  -- Currency amount that generated the points (for earn) or was discounted (for redeem)
DEFINE FIELD IF NOT EXISTS description   ON loyalty_transaction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS created_at    ON loyalty_transaction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS created_by    ON loyalty_transaction TYPE option<record<user>>;

DEFINE INDEX IF NOT EXISTS loyalty_txn_member ON loyalty_transaction FIELDS member;
DEFINE INDEX IF NOT EXISTS loyalty_txn_created_at ON loyalty_transaction FIELDS created_at;
DEFINE INDEX IF NOT EXISTS loyalty_txn_order ON loyalty_transaction FIELDS order_id;

-- ---------------------------------------------------------------------------
-- gift_card — issued gift cards
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS gift_card TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON gift_card TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS code          ON gift_card TYPE string;
  -- Unique gift card code (e.g. "GC-ABCD-1234")
DEFINE FIELD IF NOT EXISTS initial_balance ON gift_card TYPE float;
DEFINE FIELD IF NOT EXISTS balance       ON gift_card TYPE float;
DEFINE FIELD IF NOT EXISTS currency      ON gift_card TYPE string DEFAULT 'USD';
DEFINE FIELD IF NOT EXISTS status        ON gift_card TYPE string DEFAULT 'active';
  -- 'active' | 'used' (balance = 0) | 'expired' | 'voided'
DEFINE FIELD IF NOT EXISTS expires_at    ON gift_card TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS issued_at      ON gift_card TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS issued_by     ON gift_card TYPE option<record<user>>;
DEFINE FIELD IF NOT EXISTS customer      ON gift_card TYPE option<record<customer>>;
  -- Customer who purchased/received the card (optional)
DEFINE FIELD IF NOT EXISTS branch_id     ON gift_card TYPE option<record<inventory_store>>;

DEFINE INDEX IF NOT EXISTS gift_card_code ON gift_card FIELDS code UNIQUE;
DEFINE INDEX IF NOT EXISTS gift_card_status ON gift_card FIELDS status;
DEFINE INDEX IF NOT EXISTS gift_card_customer ON gift_card FIELDS customer;

-- ---------------------------------------------------------------------------
-- gift_card_transaction — usage log (append-only)
-- ---------------------------------------------------------------------------

DEFINE TABLE IF NOT EXISTS gift_card_transaction TYPE NORMAL SCHEMAFULL PERMISSIONS FULL;

DEFINE FIELD IF NOT EXISTS id            ON gift_card_transaction TYPE string DEFAULT rand::ulid();
DEFINE FIELD IF NOT EXISTS gift_card     ON gift_card_transaction TYPE record<gift_card>;
DEFINE FIELD IF NOT EXISTS type          ON gift_card_transaction TYPE string;
  -- 'issue' (card created) | 'redeem' (used for payment) | 'refund' (payment reversed) | 'topup' (balance added)
DEFINE FIELD IF NOT EXISTS amount        ON gift_card_transaction TYPE float;
  -- Positive for issue/topup/refund, negative for redeem
DEFINE FIELD IF NOT EXISTS balance_after ON gift_card_transaction TYPE float;
  -- Balance after this transaction (for audit trail)
DEFINE FIELD IF NOT EXISTS order_id      ON gift_card_transaction TYPE option<record<order>>;
DEFINE FIELD IF NOT EXISTS created_at    ON gift_card_transaction TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS created_by    ON gift_card_transaction TYPE option<record<user>>;

DEFINE INDEX IF NOT EXISTS gift_card_txn_card ON gift_card_transaction FIELDS gift_card;
DEFINE INDEX IF NOT EXISTS gift_card_txn_created_at ON gift_card_transaction FIELDS created_at;
DEFINE INDEX IF NOT EXISTS gift_card_txn_order ON gift_card_transaction FIELDS order_id;
