import type { useDB } from "@/api/db/db.ts";
import {
  InventoryPurchaseOrder,
  PurchaseOrderStatus,
} from "@/api/model/inventory_purchase_order.ts";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import { toRecordId } from "@/lib/utils.ts";

type DatabaseClient = ReturnType<typeof useDB>;

const ALLOWED_TRANSITIONS: Record<string, PurchaseOrderStatus[]> = {
  [PurchaseOrderStatus.draft]: [PurchaseOrderStatus.pendingApproval],
  [PurchaseOrderStatus.pendingApproval]: [
    PurchaseOrderStatus.approved,
    PurchaseOrderStatus.draft,
  ],
  [PurchaseOrderStatus.approved]: [PurchaseOrderStatus.fulfilled],
  [PurchaseOrderStatus.fulfilled]: [],
};

export class PurchaseOrderTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid purchase order transition: ${from} → ${to}`);
    this.name = "PurchaseOrderTransitionError";
  }
}

export const assertPoTransition = (
  from: string | null | undefined,
  to: PurchaseOrderStatus,
): void => {
  const current = from ?? PurchaseOrderStatus.draft;
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(to)) {
    throw new PurchaseOrderTransitionError(current, to);
  }
};

const loadPurchaseOrder = async (
  db: DatabaseClient,
  id: string,
): Promise<InventoryPurchaseOrder> => {
  const recordId = toRecordId(id);
  const [result] = await db.query<[InventoryPurchaseOrder]>(
    `SELECT * FROM only ${recordId}`,
  );
  const record = (result as any)?.result?.[0] ?? result;
  if (!record?.id) {
    throw new Error("Purchase order not found");
  }
  return record as InventoryPurchaseOrder;
};

export const submitPurchaseOrder = async (
  db: DatabaseClient,
  id: string,
  userId?: string,
): Promise<void> => {
  const order = await loadPurchaseOrder(db, id);
  assertPoTransition(order.status, PurchaseOrderStatus.pendingApproval);

  const mergePayload: Record<string, unknown> = {
    status: PurchaseOrderStatus.pendingApproval,
    submitted_at: nowSurrealDateTime(),
  };
  if (userId) {
    mergePayload.submitted_by = toRecordId(userId);
  }
  await db.merge(toRecordId(id), mergePayload);
};

export const approvePurchaseOrder = async (
  db: DatabaseClient,
  id: string,
  userId?: string,
): Promise<void> => {
  const order = await loadPurchaseOrder(db, id);
  assertPoTransition(order.status, PurchaseOrderStatus.approved);

  const mergePayload: Record<string, unknown> = {
    status: PurchaseOrderStatus.approved,
    approved_at: nowSurrealDateTime(),
  };
  if (userId) {
    mergePayload.approved_by = toRecordId(userId);
  }
  await db.merge(toRecordId(id), mergePayload);
};

export const rejectPurchaseOrder = async (
  db: DatabaseClient,
  id: string,
  userId?: string,
): Promise<void> => {
  const order = await loadPurchaseOrder(db, id);
  assertPoTransition(order.status, PurchaseOrderStatus.draft);

  const mergePayload: Record<string, unknown> = {
    status: PurchaseOrderStatus.draft,
    rejected_at: nowSurrealDateTime(),
  };
  if (userId) {
    mergePayload.rejected_by = toRecordId(userId);
  }
  await db.merge(toRecordId(id), mergePayload);
};
