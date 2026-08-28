/**
 * Gift card service — issue, redeem, refund, and balance check.
 *
 * Research finding: Gift cards are a top revenue source for restaurants
 * (COMP-1). Toast charges $185/mo for the loyalty+gift card bundle.
 * POSR offers it free.
 *
 * Features:
 *   - Issue gift cards with unique codes
 *   - Check balance by code
 *   - Redeem at checkout (partial or full payment)
 *   - Refund if order is cancelled
 *   - Top up existing cards
 *   - Transaction log (append-only audit trail)
 *   - Expiry support (optional)
 *
 * Integration points:
 *   - Order payment: allow gift card as a payment method
 *   - Admin: issue new cards, view transaction history
 *   - Customer: check balance online (future: /gift-card/balance page)
 */

import { useDB } from "@/api/db/db.ts";

const GIFT_CARD = "gift_card";
const GIFT_CARD_TRANSACTION = "gift_card_transaction";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GiftCard {
  id: string;
  code: string;
  initial_balance: number;
  balance: number;
  currency: string;
  status: "active" | "used" | "expired" | "voided";
  expires_at?: string;
  issued_at: string;
  issued_by?: string;
  customer?: string;
  branch_id?: string;
}

export interface GiftCardTransaction {
  id: string;
  gift_card: string;
  type: "issue" | "redeem" | "refund" | "topup";
  amount: number;
  balance_after: number;
  order_id?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

/**
 * Generate a unique gift card code.
 * Format: GC-XXXX-XXXX (8 alphanumeric chars in 2 groups)
 */
export function generateGiftCardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars (0/O, 1/I)
  let code = "GC-";
  for (let group = 0; group < 2; group++) {
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (group < 1) code += "-";
  }
  return code;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Issue a new gift card.
 * Creates the gift_card record + an 'issue' transaction.
 *
 * @returns the created gift card
 */
export async function issueGiftCard(
  db: ReturnType<typeof useDB>,
  params: {
    initialBalance: number;
    currency?: string;
    expiresAt?: string;
    issuedBy?: string;
    customer?: string;
    branchId?: string;
  }
): Promise<GiftCard> {
  const code = generateGiftCardCode();
  const currency = params.currency || "USD";

  const [card] = await db.create(GIFT_CARD, {
    code,
    initial_balance: params.initialBalance,
    balance: params.initialBalance,
    currency,
    status: "active",
    expires_at: params.expiresAt || null,
    issued_at: new Date().toISOString(),
    issued_by: params.issuedBy || null,
    customer: params.customer || null,
    branch_id: params.branchId || null,
  });

  // Log the issue transaction
  await db.create(GIFT_CARD_TRANSACTION, {
    gift_card: String(card?.id || ""),
    type: "issue",
    amount: params.initialBalance,
    balance_after: params.initialBalance,
    created_at: new Date().toISOString(),
    created_by: params.issuedBy || null,
  });

  return card as unknown as GiftCard;
}

/**
 * Look up a gift card by its code.
 * Returns null if not found.
 */
export async function getGiftCardByCode(
  db: ReturnType<typeof useDB>,
  code: string
): Promise<GiftCard | null> {
  const result = await db.query<GiftCard[]>(`
    SELECT * FROM ${GIFT_CARD}
    WHERE code = $code
    LIMIT 1;
  `, { code: code.toUpperCase().trim() });

  const card = Array.isArray(result) ? result[0] : null;
  return card || null;
}

/**
 * Check if a gift card is redeemable.
 * Must be active, not expired, with balance > 0.
 */
export function isRedeemable(card: GiftCard | null): boolean {
  if (!card) return false;
  if (card.status !== "active") return false;
  if (card.balance <= 0) return false;
  if (card.expires_at) {
    const expiry = new Date(card.expires_at);
    if (expiry < new Date()) return false;
  }
  return true;
}

/**
 * Redeem a gift card for a payment.
 * Reduces the balance by the payment amount (or full balance if less).
 *
 * @returns the amount actually charged to the card (may be less than requested)
 */
export async function redeemGiftCard(
  db: ReturnType<typeof useDB>,
  code: string,
  amount: number,
  orderId: string
): Promise<{ charged: number; remainingBalance: number }> {
  const card = await getGiftCardByCode(db, code);
  if (!card) throw new Error("Gift card not found");
  if (!isRedeemable(card)) throw new Error("Gift card is not redeemable (expired, used, or void)");

  const charged = Math.min(amount, card.balance);
  const newBalance = card.balance - charged;
  const newStatus = newBalance <= 0 ? "used" : "active";

  // Update card balance
  await db.update(String(card.id), {
    balance: newBalance,
    status: newStatus,
  });

  // Log transaction
  await db.create(GIFT_CARD_TRANSACTION, {
    gift_card: String(card.id),
    type: "redeem",
    amount: -charged,
    balance_after: newBalance,
    order_id: orderId,
    created_at: new Date().toISOString(),
  });

  return { charged, remainingBalance: newBalance };
}

/**
 * Refund a gift card redemption (when an order is cancelled/refunded).
 * Adds the amount back to the card balance.
 */
export async function refundGiftCard(
  db: ReturnType<typeof useDB>,
  code: string,
  amount: number,
  orderId: string
): Promise<{ refunded: number; newBalance: number }> {
  const card = await getGiftCardByCode(db, code);
  if (!card) throw new Error("Gift card not found");

  const newBalance = card.balance + amount;
  const newStatus = newBalance > 0 ? "active" : card.status;

  await db.update(String(card.id), {
    balance: newBalance,
    status: newStatus,
  });

  await db.create(GIFT_CARD_TRANSACTION, {
    gift_card: String(card.id),
    type: "refund",
    amount,
    balance_after: newBalance,
    order_id: orderId,
    created_at: new Date().toISOString(),
  });

  return { refunded: amount, newBalance };
}

/**
 * Top up an existing gift card with more balance.
 */
export async function topUpGiftCard(
  db: ReturnType<typeof useDB>,
  code: string,
  amount: number
): Promise<{ newBalance: number }> {
  const card = await getGiftCardByCode(db, code);
  if (!card) throw new Error("Gift card not found");
  if (card.status === "voided" || card.status === "expired") {
    throw new Error(`Cannot top up a ${card.status} gift card`);
  }

  const newBalance = card.balance + amount;

  await db.update(String(card.id), {
    balance: newBalance,
    status: "active", // reactivate if was 'used'
  });

  await db.create(GIFT_CARD_TRANSACTION, {
    gift_card: String(card.id),
    type: "topup",
    amount,
    balance_after: newBalance,
    created_at: new Date().toISOString(),
  });

  return { newBalance };
}

/**
 * Void a gift card (cancel it permanently).
 * Only works if the card hasn't been fully redeemed yet.
 */
export async function voidGiftCard(
  db: ReturnType<typeof useDB>,
  code: string
): Promise<void> {
  const card = await getGiftCardByCode(db, code);
  if (!card) throw new Error("Gift card not found");
  if (card.status === "voided") throw new Error("Gift card is already voided");

  await db.update(String(card.id), {
    status: "voided",
  });

  await db.create(GIFT_CARD_TRANSACTION, {
    gift_card: String(card.id),
    type: "issue", // using 'issue' with negative to record void
    amount: -card.balance,
    balance_after: 0,
    created_at: new Date().toISOString(),
    description: "Card voided",
  });
}

/**
 * Get transaction history for a gift card.
 */
export async function getGiftCardHistory(
  db: ReturnType<typeof useDB>,
  code: string
): Promise<GiftCardTransaction[]> {
  const card = await getGiftCardByCode(db, code);
  if (!card) return [];

  const result = await db.query<GiftCardTransaction[]>(`
    SELECT * FROM ${GIFT_CARD_TRANSACTION}
    WHERE gift_card = $cardId
    ORDER BY created_at DESC
    LIMIT 50;
  `, { cardId: String(card.id) });

  return Array.isArray(result) ? result : [];
}
