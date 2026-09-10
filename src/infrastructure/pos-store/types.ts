/** Shared types for local-first PosStore + gateway sync protocol v1. */

export const POS_SYNC_PROTOCOL_VERSION = 1;
export const POS_SCHEMA_VERSION = 1;

export type SyncPhase =
  | 'idle'
  | 'initializing'
  | 'hydrating'
  | 'syncing'
  | 'offline'
  | 'conflict'
  | 'initialization_required'
  | 'error';

export type DomainOperationType =
  | 'CREATE_RECORD'
  | 'MERGE_RECORD'
  | 'PATCH_RECORD'
  | 'DELETE_RECORD'
  | 'CLAIM_ORDER'
  | 'RELEASE_ORDER'
  | 'STEAL_ORDER'
  | 'COMPLETE_KITCHEN_STAGE'
  | 'CREATE_PAYMENT'
  /**
   * Replace a whole order relation (`order_taxes` / `order_discounts` /
   * `extras`) with the given child rows. Gateway upserts rows, deletes stale
   * ones and sets `order.<relation>` in one step.
   */
  | 'REPLACE_ORDER_RELATION';

export type CashierMutationTypes = Exclude<
  DomainOperationType,
  'COMPLETE_KITCHEN_STAGE'
>;

/** Order relations that are replaced wholesale (non-financial, recomputable). */
export type ReplaceableOrderRelation = 'order_taxes' | 'order_discounts' | 'extras';

export const REPLACEABLE_RELATION_TABLES: Record<ReplaceableOrderRelation, string> = {
  order_taxes: 'order_tax',
  order_discounts: 'order_discount',
  extras: 'order_extras',
};

/** Surreal child tables → Dexie store names for generic projection. */
export const CHILD_TABLE_STORES = {
  order_item: 'orderItems',
  order_item_kitchen: 'orderItemKitchens',
  order_payment: 'orderPayments',
  order_void: 'orderVoids',
  order_refund: 'orderRefunds',
  order_tax: 'orderTaxes',
  order_discount: 'orderDiscounts',
  order_coupon: 'orderCoupons',
  order_extras: 'orderExtras',
  coupon_redemption: 'couponRedemptions',
  order_split: 'orderSplits',
  order_merge: 'orderMerges',
  order_print: 'orderPrints',
  customer: 'customers',
} as const;

export type ChildTableName = keyof typeof CHILD_TABLE_STORES;

export interface TerminalIdentity {
  terminalId: string;
  installationId: string;
  nextSequence: number;
  schemaVersion: number;
  protocolVersion: number;
}

export interface DomainOperation {
  operationId: string;
  terminalId: string;
  sequence: number;
  aggregateType: string;
  aggregateId: string;
  operationType: DomainOperationType;
  expectedVersion: number;
  payload: any;
  createdAt: string;
  protocolVersion: number;
  schemaVersion: number;
}

/**
 * `pending`   — waiting for the next push.
 * `failed`    — pushed ≥ OUTBOX_MAX_ATTEMPTS times without reaching the gateway;
 *               still retried (with backoff) but surfaced to the operator.
 * `conflict`  — gateway rejected it (NOT_OWNER, VERSION_CONFLICT, …); needs a
 *               retry / discard decision.
 * `discarded` — operator dropped a conflicted op; kept for audit only.
 */
export type OutboxStatus = 'pending' | 'syncing' | 'accepted' | 'conflict' | 'failed' | 'discarded';

export interface SyncOutboxRow {
  operationId: string;
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  /** ISO time before which the push loop must not retry this row (exponential backoff). */
  nextAttemptAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** After this many transport failures a row is flagged `failed` (still retried). */
export const OUTBOX_MAX_ATTEMPTS = 8;
/** Backoff: 2s, 4s, 8s … capped at 5 minutes. */
export const OUTBOX_BACKOFF_BASE_MS = 2_000;
export const OUTBOX_BACKOFF_MAX_MS = 5 * 60_000;

export interface SyncCursorRow {
  id: 'singleton';
  cursor: number;
  highWatermark?: number;
  hydrated: boolean;
  snapshotResumeToken?: string | null;
}

export interface SyncConflictRow {
  id: string;
  operationId: string;
  code: string;
  message: string;
  createdAt: string;
  resolved: boolean;
  /** Denormalised from the domain operation so the banner can group per order. */
  aggregateType?: string;
  aggregateId?: string;
  operationType?: string;
}

export interface OrderRecord {
  id: string;
  status: string;
  invoice_number?: number;
  auto_id?: number;
  covers?: number;
  floor?: string | null;
  table?: string | null;
  order_type?: string | null;
  customer?: string | null;
  user?: string | null;
  cashier?: string | null;
  items: string[];
  /** Record-id links to local child rows (mirrors Surreal arrays). */
  payments?: string[];
  order_taxes?: string[];
  order_discounts?: string[];
  extras?: string[];
  coupon?: string | null;
  discount?: string | null;
  discount_rate?: number | null;
  discount_manager?: string | null;
  tags?: string[];
  tax?: string | null;
  tax_amount?: number;
  discount_amount?: number;
  service_charge?: number;
  service_charge_amount?: number;
  service_charge_type?: string;
  tip?: number;
  tip_amount?: number;
  tip_type?: string;
  notes?: string;
  /** Delivery payload when the order is a delivery ticket. */
  delivery?: any;
  /**
   * Local-only cashier progress on the payment screen (tendered lines before
   * settle). Never pushed to Surreal — stripped at the gateway.
   */
  draft_payments?: any[];
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
  deleted_at?: string | null;
  /** Terminal that may mutate cashier fields on this check. */
  owner_terminal_id: string;
  owner_heartbeat_at: string;
  /** Aggregate version for expectedVersion checks. */
  server_version: number;
  [key: string]: any;
}

export interface OrderItemRecord {
  id: string;
  order?: string | null;
  item: string;
  price: number;
  quantity: number;
  comments?: string;
  modifiers?: any[];
  tax?: number;
  taxes?: string[];
  tax_mode?: string;
  /**
   * Surreal schema: `none | string | null`. Left `undefined` (not `null`) when
   * unseated — the cart matches lines with `item.seat === state.seat`, and the
   * "no seat" state is `undefined`.
   */
  seat?: string;
  is_suspended?: boolean;
  is_addition?: boolean;
  /** Required int in Surreal; index of the line within the order. */
  position: number;
  /** Required int in Surreal. */
  level: number;
  category?: string;
  category_id?: string | null;
  menu?: string;
  created_at: string;
  created_by?: string | null;
  workflow?: string | null;
  workflow_status?: string | null;
  current_sequence?: number;
  [key: string]: any;
}

export interface OrderItemKitchenRecord {
  id: string;
  kitchen: string;
  order_item: string;
  status: string;
  sequence: number;
  is_terminal: boolean;
  workflow?: string | null;
  /** `record<workflow_stage>` link — schema field is `stage`, not `workflow_stage`. */
  stage?: string | null;
  stage_name?: string | null;
  created_at: string;
  activated_at?: string | null;
  completed_at?: string | null;
  [key: string]: any;
}

export interface CatalogRecord {
  id: string;
  table: string;
  payload: any;
  updated_at?: string;
}

export type NumberSeries = 'invoice' | 'receipt' | 'auto_id';

export interface NumberReservationRow {
  id: string;
  series: NumberSeries;
  value: number;
  status: 'reserved' | 'consumed';
  reserved_at: string;
  consumed_at?: string;
}

/** Generic Surreal child row mirrored in Dexie. `order` is kept locally for
 * indexing even when the Surreal schema lacks it (gateway strips it). */
export interface ChildRecord {
  id: string;
  order?: string | null;
  created_at?: string;
  [key: string]: any;
}

export interface OrderPaymentRecord extends ChildRecord {
  amount: number;
  payable: number;
  payment_type: string;
  comments?: string | null;
}

export interface OrderVoidRecord extends ChildRecord {
  items: string[];
  quantity: number;
  reason: string;
  comments?: string | null;
  deleted_by: string;
  logged_in_user?: string | null;
}

export interface OrderRefundRecord extends ChildRecord {
  items: string[];
  reason?: string | null;
  logged_in_user: string;
  manager?: string | null;
}

export interface OrderTaxRecord extends ChildRecord {
  tax: string;
  amount: number;
}

export interface OrderDiscountRecord extends ChildRecord {
  discount: string;
  name: string;
  scope: string;
  application_type: string;
  value_type: string;
  applied_amount: number;
  applied_rate?: number | null;
  base_amount?: number;
  order_items?: string[];
}

export interface OrderCouponRecord extends ChildRecord {
  coupon: string;
  discount: number;
}

export interface OrderExtraRecord extends ChildRecord {
  name: string;
  value: number;
}

export interface CouponRedemptionRecord extends ChildRecord {
  coupon: string;
  customer?: string | null;
  user?: string | null;
  discount_amount: number;
  redeemed_at: string;
}

export interface OrderSplitRecord extends ChildRecord {
  old_order: string;
  new_orders: string[];
  old_items: any;
  new_items: any;
  created_by: string;
}

export interface OrderMergeRecord extends ChildRecord {
  old_orders: string[];
  new_order: string;
  old_items: any;
  new_items: any;
  created_by: string;
}

export interface OrderPrintRecord extends ChildRecord {
  print_type: 'temp' | 'final';
  printed_by?: string | null;
  printed_at: string;
  is_override?: boolean;
  is_duplicate?: boolean;
}

export interface CustomerRecord {
  id: string;
  name: string;
  phone?: string | number | null;
  email?: string | null;
  address?: string | null;
  tags?: string[];
  [key: string]: any;
}

/** Live lock state of a floor table (mirrors `floor_table.is_locked/locked_*`). */
export interface TableLockRecord {
  id: string;
  is_locked: boolean;
  locked_by?: string | null;
  locked_at?: string | null;
  updated_at: string;
}

export interface CreateOrderItemInput {
  id?: string;
  dishId: string;
  price: number;
  /** Pre-override dish price when the cashier changed the line price. */
  originalPrice?: number;
  quantity: number;
  comments?: string;
  modifiers?: any[];
  tax?: number;
  taxes?: string[];
  taxMode?: string;
  /** Per-line service charge / discount amounts (amount splits clone them pro-rata). */
  serviceCharges?: number;
  discount?: number;
  /** Cart seat key (nanoid string); undefined = no seat. */
  seat?: string | null;
  isHold?: boolean;
  isAddition?: boolean;
  level?: number;
  category?: string;
  categoryId?: string | null;
  menuName?: string;
  createdBy?: string | null;
  /** Pre-resolved kitchen stage rows (optional). */
  kitchenStages?: Array<{
    kitchenId: string;
    sequence: number;
    isTerminal: boolean;
    workflowId?: string;
    stageId?: string;
    stageName?: string | null;
    status: string;
  }>;
}

export interface CreateOrderInput {
  orderId?: string;
  invoiceNumber?: number;
  autoId?: number;
  covers?: number;
  floorId?: string | null;
  tableId?: string | null;
  orderTypeId?: string | null;
  customerId?: string | null;
  userId?: string | null;
  tags?: string[];
  serviceCharge?: number;
  serviceChargeAmount?: number;
  serviceChargeType?: string;
  items: CreateOrderItemInput[];
  createdAt?: string;
}

export class PosStoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PosStoreError';
    this.code = code;
  }
}

export const OWNER_HEARTBEAT_STALE_MS = 45_000;
