/**
 * Loyalty service — points accrual, redemption, and tier management.
 *
 * Research finding: Loyalty programs are the #3 most requested feature
 * on restaurant POS forums. Toast charges $185/mo for it. POSR offers
 * it free.
 *
 * Features:
 *   - Earn points on every purchase (configurable rate)
 *   - Redeem points for discounts at checkout
 *   - Tier system (bronze → silver → gold → platinum) based on lifetime points
 *   - Tier benefits (e.g. gold = 1.5x points, platinum = 2x points)
 *   - Points expiration (configurable, default: never)
 *   - Transaction log (append-only audit trail)
 *
 * Integration points:
 *   - Order payment: accrue points based on order total
 *   - Checkout: allow point redemption as a payment method
 *   - Admin: manage program config + manual adjustments
 */

import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";

// Add loyalty tables to the Tables enum
const LOYALTY_PROGRAM = "loyalty_program";
const LOYALTY_MEMBER = "loyalty_member";
const LOYALTY_TRANSACTION = "loyalty_transaction";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export interface LoyaltyProgram {
  id: string;
  name: string;
  points_per_currency: number;
  currency_per_point: number;
  min_redemption_points: number;
  is_active: boolean;
}

export interface LoyaltyMember {
  id: string;
  customer: string;
  program: string;
  points_balance: number;
  lifetime_points: number;
  tier: LoyaltyTier;
  joined_at: string;
  last_activity?: string;
  is_active: boolean;
}

export interface LoyaltyTransaction {
  id: string;
  member: string;
  customer?: string;
  type: "earn" | "redeem" | "adjust" | "expire";
  points: number;
  order_id?: string;
  amount?: number;
  description?: string;
  created_at: string;
}

// Tier thresholds (based on lifetime points)
const TIER_THRESHOLDS: Record<LoyaltyTier, number> = {
  bronze: 0,
  silver: 500,
  gold: 2000,
  platinum: 5000,
};

// Tier point multipliers (how many extra points per tier)
const TIER_MULTIPLIERS: Record<LoyaltyTier, number> = {
  bronze: 1.0,
  silver: 1.0,
  gold: 1.5,
  platinum: 2.0,
};

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Calculate tier from lifetime points.
 */
export function calculateTier(lifetimePoints: number): LoyaltyTier {
  if (lifetimePoints >= TIER_THRESHOLDS.platinum) return "platinum";
  if (lifetimePoints >= TIER_THRESHOLDS.gold) return "gold";
  if (lifetimePoints >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

/**
 * Get the point multiplier for a tier.
 * Gold = 1.5x, Platinum = 2x.
 */
export function getTierMultiplier(tier: LoyaltyTier): number {
  return TIER_MULTIPLIERS[tier] || 1.0;
}

/**
 * Calculate how many points a customer earns for a given order amount.
 * Formula: amount × points_per_currency × tier_multiplier
 */
export function calculateEarnedPoints(
  amount: number,
  program: Pick<LoyaltyProgram, "points_per_currency">,
  tier: LoyaltyTier
): number {
  const basePoints = amount * program.points_per_currency;
  const multiplier = getTierMultiplier(tier);
  return Math.floor(basePoints * multiplier);
}

/**
 * Calculate the monetary value of a points balance.
 * Formula: points × currency_per_point
 */
export function pointsToCurrency(
  points: number,
  program: Pick<LoyaltyProgram, "currency_per_point">
): number {
  return Math.round(points * program.currency_per_point * 100) / 100;
}

/**
 * Enroll a customer in the loyalty program.
 * Creates a loyalty_member record if one doesn't exist.
 */
export async function enrollCustomer(
  db: ReturnType<typeof useDB>,
  customerId: string,
  programId: string
): Promise<string> {
  // Check if already enrolled
  const existing = await db.query<any[]>(`
    SELECT * FROM ${LOYALTY_MEMBER}
    WHERE customer = $customerId AND program = $programId AND is_active = true
    LIMIT 1;
  `, { customerId });

  if (existing && Array.isArray(existing) && existing.length > 0) {
    return String(existing[0].id);
  }

  // Create new member
  const [member] = await db.create(LOYALTY_MEMBER, {
    customer: customerId,
    program: programId,
    points_balance: 0,
    lifetime_points: 0,
    tier: "bronze",
    joined_at: new Date().toISOString(),
    is_active: true,
  });

  return String(member?.id || "");
}

/**
 * Earn points for a purchase.
 * Called after an order is paid.
 */
export async function earnPoints(
  db: ReturnType<typeof useDB>,
  memberId: string,
  amount: number,
  orderId: string,
  program: Pick<LoyaltyProgram, "points_per_currency" | "currency_per_point">,
  tier: LoyaltyTier
): Promise<{ earned: number; newBalance: number; newTier: LoyaltyTier }> {
  const earned = calculateEarnedPoints(amount, program, tier);

  // Get current member state
  const member = await db.query<any[]>(`
    SELECT * FROM ${LOYALTY_MEMBER} WHERE id = $memberId LIMIT 1;
  `, { memberId });

  const currentMember = Array.isArray(member) ? member[0] : null;
  if (!currentMember) throw new Error("Loyalty member not found");

  const newBalance = (currentMember.points_balance || 0) + earned;
  const newLifetime = (currentMember.lifetime_points || 0) + earned;
  const newTier = calculateTier(newLifetime);

  // Update member balance
  await db.update(memberId, {
    points_balance: newBalance,
    lifetime_points: newLifetime,
    tier: newTier,
    last_activity: new Date().toISOString(),
  });

  // Log transaction
  await db.create(LOYALTY_TRANSACTION, {
    member: memberId,
    customer: currentMember.customer,
    type: "earn",
    points: earned,
    order_id: orderId,
    amount,
    description: `Earned ${earned} points for order`,
    created_at: new Date().toISOString(),
  });

  return { earned, newBalance, newTier };
}

/**
 * Redeem points for a discount at checkout.
 * Returns the monetary value of the redeemed points.
 */
export async function redeemPoints(
  db: ReturnType<typeof useDB>,
  memberId: string,
  pointsToRedeem: number,
  orderId: string,
  program: Pick<LoyaltyProgram, "currency_per_point" | "min_redemption_points">
): Promise<{ redeemed: number; discountAmount: number; newBalance: number }> {
  if (pointsToRedeem < program.min_redemption_points) {
    throw new Error(`Minimum ${program.min_redemption_points} points required for redemption`);
  }

  // Get current balance
  const member = await db.query<any[]>(`
    SELECT * FROM ${LOYALTY_MEMBER} WHERE id = $memberId LIMIT 1;
  `, { memberId });

  const currentMember = Array.isArray(member) ? member[0] : null;
  if (!currentMember) throw new Error("Loyalty member not found");

  if ((currentMember.points_balance || 0) < pointsToRedeem) {
    throw new Error("Insufficient points balance");
  }

  const discountAmount = pointsToCurrency(pointsToRedeem, program);
  const newBalance = currentMember.points_balance - pointsToRedeem;

  // Update member balance
  await db.update(memberId, {
    points_balance: newBalance,
    last_activity: new Date().toISOString(),
  });

  // Log transaction
  await db.create(LOYALTY_TRANSACTION, {
    member: memberId,
    customer: currentMember.customer,
    type: "redeem",
    points: -pointsToRedeem,
    order_id: orderId,
    amount: discountAmount,
    description: `Redeemed ${pointsToRedeem} points for ${discountAmount} discount`,
    created_at: new Date().toISOString(),
  });

  return { redeemed: pointsToRedeem, discountAmount, newBalance };
}

/**
 * Look up a customer's loyalty info by customer ID.
 */
export async function getCustomerLoyalty(
  db: ReturnType<typeof useDB>,
  customerId: string
): Promise<{ member: LoyaltyMember | null; program: LoyaltyProgram | null }> {
  const result = await db.query<any[]>(`
    SELECT member.*, program.* FROM ${LOYALTY_MEMBER} AS member
    WHERE member.customer = $customerId AND member.is_active = true
    FETCH program
    LIMIT 1;
  `, { customerId });

  const row = Array.isArray(result) ? result[0] : null;
  if (!row) return { member: null, program: null };

  return {
    member: row,
    program: row.program || null,
  };
}
