/**
 * Reason codes for voids and refunds — structured taxonomy that replaces
 * free-text reasons.
 *
 * Research finding: "Broken refund/void flows" is a top complaint (COMP-1
 * pain point #8, FORUM-1 pain point #8). Toast and Square use structured
 * reason codes that enable reporting on WHY items are voided/refunded.
 * Free-text reasons are impossible to aggregate and analyze.
 *
 * This module defines a standard taxonomy of reason codes used across:
 *   - Order voids (entire order cancelled)
 *   - Item voids (single item removed from order)
 *   - Refunds (payment returned to customer)
 *   - Complimentary items (kitchen gave free item)
 *
 * Each reason has:
 *   - code: stable identifier stored in DB (not translated)
 *   - labelKey: i18n key for the display label
 *   - category: for grouping in reports (kitchen_error, customer_change, etc.)
 *   - requiresManagerApproval: some reasons need manager sign-off
 */

export type ReasonCategory =
  | "kitchen_error"
  | "customer_change"
  | "staff_error"
  | "payment_issue"
  | "complimentary"
  | "other";

export interface ReasonCode {
  code: string;
  labelKey: string;
  category: ReasonCategory;
  requiresManagerApproval: boolean;
  defaultValue: string;
}

export const VOID_REASON_CODES: ReasonCode[] = [
  {
    code: "kitchen_burnt",
    labelKey: "orders:voidReasons.kitchenBurnt",
    category: "kitchen_error",
    requiresManagerApproval: false,
    defaultValue: "Kitchen error — item burnt",
  },
  {
    code: "kitchen_wrong_item",
    labelKey: "orders:voidReasons.kitchenWrongItem",
    category: "kitchen_error",
    requiresManagerApproval: false,
    defaultValue: "Kitchen error — wrong item prepared",
  },
  {
    code: "kitchen_dropped",
    labelKey: "orders:voidReasons.kitchenDropped",
    category: "kitchen_error",
    requiresManagerApproval: false,
    defaultValue: "Kitchen error — food dropped",
  },
  {
    code: "kitchen_slow",
    labelKey: "orders:voidReasons.kitchenSlow",
    category: "kitchen_error",
    requiresManagerApproval: true,
    defaultValue: "Kitchen too slow — customer left",
  },
  {
    code: "customer_changed_mind",
    labelKey: "orders:voidReasons.customerChangedMind",
    category: "customer_change",
    requiresManagerApproval: false,
    defaultValue: "Customer changed mind",
  },
  {
    code: "customer_allergy",
    labelKey: "orders:voidReasons.customerAllergy",
    category: "customer_change",
    requiresManagerApproval: false,
    defaultValue: "Customer allergy discovered",
  },
  {
    code: "customer_duplicate_order",
    labelKey: "orders:voidReasons.customerDuplicateOrder",
    category: "customer_change",
    requiresManagerApproval: false,
    defaultValue: "Duplicate order — customer already ordered",
  },
  {
    code: "staff_wrong_table",
    labelKey: "orders:voidReasons.staffWrongTable",
    category: "staff_error",
    requiresManagerApproval: false,
    defaultValue: "Staff error — sent to wrong table",
  },
  {
    code: "staff_wrong_item",
    labelKey: "orders:voidReasons.staffWrongItem",
    category: "staff_error",
    requiresManagerApproval: false,
    defaultValue: "Staff error — entered wrong item",
  },
  {
    code: "payment_declined",
    labelKey: "orders:voidReasons.paymentDeclined",
    category: "payment_issue",
    requiresManagerApproval: true,
    defaultValue: "Payment declined — customer cannot pay",
  },
  {
    code: "complimentary_manager",
    labelKey: "orders:voidReasons.complimentaryManager",
    category: "complimentary",
    requiresManagerApproval: true,
    defaultValue: "Complimentary — manager approved",
  },
  {
    code: "complimentary_loyalty",
    labelKey: "orders:voidReasons.complimentaryLoyalty",
    category: "complimentary",
    requiresManagerApproval: true,
    defaultValue: "Complimentary — loyalty reward",
  },
  {
    code: "other",
    labelKey: "orders:voidReasons.other",
    category: "other",
    requiresManagerApproval: true,
    defaultValue: "Other (requires manager approval)",
  },
];

export const REFUND_REASON_CODES: ReasonCode[] = [
  {
    code: "customer_dissatisfied",
    labelKey: "orders:refundReasons.customerDissatisfied",
    category: "customer_change",
    requiresManagerApproval: true,
    defaultValue: "Customer dissatisfied with food quality",
  },
  {
    code: "kitchen_quality",
    labelKey: "orders:refundReasons.kitchenQuality",
    category: "kitchen_error",
    requiresManagerApproval: true,
    defaultValue: "Kitchen quality issue",
  },
  {
    code: "overcharged",
    labelKey: "orders:refundReasons.overcharged",
    category: "staff_error",
    requiresManagerApproval: true,
    defaultValue: "Customer was overcharged",
  },
  {
    code: "duplicate_charge",
    labelKey: "orders:refundReasons.duplicateCharge",
    category: "payment_issue",
    requiresManagerApproval: true,
    defaultValue: "Duplicate payment charge",
  },
  {
    code: "order_cancelled",
    labelKey: "orders:refundReasons.orderCancelled",
    category: "customer_change",
    requiresManagerApproval: true,
    defaultValue: "Order cancelled before preparation",
  },
  {
    code: "complimentary_refund",
    labelKey: "orders:refundReasons.complimentaryRefund",
    category: "complimentary",
    requiresManagerApproval: true,
    defaultValue: "Complimentary refund — goodwill gesture",
  },
  {
    code: "other",
    labelKey: "orders:refundReasons.other",
    category: "other",
    requiresManagerApproval: true,
    defaultValue: "Other (requires manager approval)",
  },
];

/**
 * Get reason codes filtered by manager approval requirement.
 * If the current user is a manager/admin, all codes are returned.
 * Otherwise, only codes that don't require manager approval.
 */
export function getReasonCodes(
  type: "void" | "refund",
  isManager: boolean
): ReasonCode[] {
  const codes = type === "void" ? VOID_REASON_CODES : REFUND_REASON_CODES;
  if (isManager) return codes;
  return codes.filter((c) => !c.requiresManagerApproval);
}

/**
 * Get a reason code by its stable code identifier.
 */
export function getReasonByCode(
  type: "void" | "refund",
  code: string
): ReasonCode | undefined {
  const codes = type === "void" ? VOID_REASON_CODES : REFUND_REASON_CODES;
  return codes.find((c) => c.code === code);
}

/**
 * Get all categories for a given reason type (for report grouping).
 */
export function getReasonCategories(type: "void" | "refund"): ReasonCategory[] {
  const codes = type === "void" ? VOID_REASON_CODES : REFUND_REASON_CODES;
  return [...new Set(codes.map((c) => c.category))];
}
