import {
  InventoryDocumentStatus,
  normalizeDocumentStatus,
} from "@/api/model/inventory_document.ts";

const EDITABLE: InventoryDocumentStatus[] = ["draft", "approved"];
const DELETABLE: InventoryDocumentStatus[] = ["draft", "cancelled"];
const POSTABLE: InventoryDocumentStatus[] = ["draft", "approved"];
const APPROVABLE: InventoryDocumentStatus[] = ["draft"];
const CANCELLABLE: InventoryDocumentStatus[] = ["draft", "approved"];
const VOIDABLE: InventoryDocumentStatus[] = ["posted"];

const ALLOWED_TRANSITIONS: Record<InventoryDocumentStatus, InventoryDocumentStatus[]> = {
  draft: ["approved", "posted", "cancelled"],
  approved: ["posted", "cancelled", "draft"],
  posted: ["voided"],
  cancelled: [],
  voided: [],
};

export const canEdit = (status?: string | null): boolean => {
  return EDITABLE.includes(normalizeDocumentStatus(status));
};

export const canDelete = (status?: string | null): boolean => {
  return DELETABLE.includes(normalizeDocumentStatus(status));
};

export const canApprove = (status?: string | null): boolean => {
  return APPROVABLE.includes(normalizeDocumentStatus(status));
};

export const canPost = (status?: string | null): boolean => {
  return POSTABLE.includes(normalizeDocumentStatus(status));
};

export const canCancel = (status?: string | null): boolean => {
  return CANCELLABLE.includes(normalizeDocumentStatus(status));
};

export const canVoid = (status?: string | null): boolean => {
  return VOIDABLE.includes(normalizeDocumentStatus(status));
};

export const isLocked = (status?: string | null): boolean => {
  const s = normalizeDocumentStatus(status);
  return s === "posted" || s === "voided";
};

export class LifecycleTransitionError extends Error {
  constructor(
    public readonly from: InventoryDocumentStatus,
    public readonly to: InventoryDocumentStatus
  ) {
    super(`Invalid inventory document transition: ${from} → ${to}`);
    this.name = "LifecycleTransitionError";
  }
}

export const assertTransition = (
  from: string | null | undefined,
  to: InventoryDocumentStatus
): void => {
  const current = normalizeDocumentStatus(from);
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(to)) {
    throw new LifecycleTransitionError(current, to);
  }
};

export const statusBadgeClass = (status?: string | null): string => {
  const s = normalizeDocumentStatus(status);
  switch (s) {
    case "draft":
      return "bg-neutral-200 text-neutral-800";
    case "approved":
      return "bg-info-100 text-info-800";
    case "posted":
      return "bg-success-100 text-success-800";
    case "cancelled":
      return "bg-warning-100 text-warning-800";
    case "voided":
      return "bg-danger-100 text-danger-800";
    default:
      return "bg-neutral-200 text-neutral-800";
  }
};
