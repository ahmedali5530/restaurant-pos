import { normalizeDocumentStatus } from "@/api/model/inventory_document.ts";
import { statusBadgeClass } from "@/lib/inventory/lifecycle.ts";

type InventoryDocumentStatusBadgeProps = {
  status?: string | null;
  className?: string;
};

export const InventoryDocumentStatusBadge = ({
  status,
  className = "",
}: InventoryDocumentStatusBadgeProps) => {
  const normalized = normalizeDocumentStatus(status);
  const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);

  return (
    <span className={`tag ${statusBadgeClass(normalized)} ${className}`.trim()}>
      {label}
    </span>
  );
};
