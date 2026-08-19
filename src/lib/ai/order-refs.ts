export interface AiOrderRef {
  orderId: string;
  invoiceNumber?: number;
  autoId?: number;
}

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return undefined;
};

const pushRef = (
  refs: AiOrderRef[],
  seen: Set<string>,
  orderId?: string,
  invoiceNumber?: unknown,
  autoId?: unknown,
) => {
  if (!orderId || seen.has(orderId)) {
    return;
  }
  seen.add(orderId);
  refs.push({
    orderId,
    invoiceNumber: toFiniteNumber(invoiceNumber),
    autoId: toFiniteNumber(autoId),
  });
};

export const collectOrderRefs = (
  toolResults: Array<{name: string; result: unknown}>,
): AiOrderRef[] => {
  const refs: AiOrderRef[] = [];
  const seen = new Set<string>();

  for (const {name, result} of toolResults) {
    if (!result || typeof result !== "object") {
      continue;
    }
    const data = result as Record<string, unknown>;

    if (name === "get_orders" && Array.isArray(data.orders)) {
      for (const row of data.orders) {
        if (!row || typeof row !== "object") {
          continue;
        }
        const order = row as Record<string, unknown>;
        pushRef(
          refs,
          seen,
          typeof order.orderId === "string" ? order.orderId : undefined,
          order.invoiceNumber,
        );
      }
    }

    if (name === "get_order_detail" && data.order && typeof data.order === "object") {
      const order = data.order as Record<string, unknown>;
      pushRef(
        refs,
        seen,
        typeof order.id === "string" ? order.id : undefined,
        order.invoiceNumber,
        order.autoId,
      );
    }
  }

  return refs;
};
