import {OrderStatus} from "@/api/model/order.ts";
import {normalizeOrderStatus} from "@/api/reports/operations/orders.ts";

const STATUS_PATTERNS: Array<{pattern: RegExp; status: string}> = [
  {pattern: /\b(?:in[\s_-]*)?progress\b/i, status: OrderStatus["In Progress"]},
  {pattern: /\bopen\s+orders?\b/i, status: OrderStatus["In Progress"]},
  {pattern: /\bpending\b/i, status: OrderStatus.Pending},
  {pattern: /\bpaid\b/i, status: OrderStatus.Paid},
  {pattern: /\bcancel(?:led|ed)\b/i, status: OrderStatus.Cancelled},
  {pattern: /\brefunded?\b/i, status: OrderStatus.Refunded},
  {pattern: /\bmerged?\b/i, status: OrderStatus.Merged},
  {pattern: /\b(split|spilt)\b/i, status: OrderStatus.Spilt},
];

export const isDeliveryOrderListPrompt = (prompt: string): boolean => {
  // Require an explicit delivery channel mention — not just "pending" or "progress"
  return /\bdelivery\b/i.test(prompt) && /\borders?\b/i.test(prompt);
};

/** Active delivery pipeline — matches the Delivery screen, not OrderStatus.Pending alone. */
export const inferDeliveryOrderStatuses = (prompt: string): string[] => {
  const lower = prompt.toLowerCase();

  if (/\bpaid\b/.test(lower)) {
    return [OrderStatus.Paid];
  }

  if (/\bcancel(?:led|ed)\b/.test(lower)) {
    return [OrderStatus.Cancelled];
  }

  if (/\bin[\s_-]*progress\b/.test(lower) && !/\bpending\b/.test(lower)) {
    return [OrderStatus["In Progress"]];
  }

  // "pending delivery", "active delivery", or plain "delivery orders" → both open statuses
  return [OrderStatus.Pending, OrderStatus["In Progress"]];
};

export const isOrderStatusPhrase = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const normalized = normalizeOrderStatus(trimmed);
  return Object.values(OrderStatus).includes(normalized as OrderStatus);
};

export const inferOrderStatusesFromPrompt = (prompt: string): string[] => {
  const statuses = new Set<string>();
  const isDelivery = isDeliveryOrderListPrompt(prompt);

  for (const {pattern, status} of STATUS_PATTERNS) {
    if (isDelivery && status === OrderStatus.Pending) {
      continue;
    }
    if (pattern.test(prompt)) {
      statuses.add(status);
    }
  }

  return Array.from(statuses);
};

export const isOrderListByStatusPrompt = (prompt: string): boolean => {
  if (!/\borders?\b/i.test(prompt)) {
    return false;
  }

  if (isDeliveryOrderListPrompt(prompt)) {
    return true;
  }

  return inferOrderStatusesFromPrompt(prompt).length > 0;
};

export const extractOrderStatusesFromArgs = (args: Record<string, unknown>): string[] | undefined => {
  if (Array.isArray(args.statuses) && args.statuses.length > 0) {
    return args.statuses.map(status => String(status));
  }

  if (args.status) {
    return [String(args.status)];
  }

  if (args.phrase && isOrderStatusPhrase(String(args.phrase))) {
    return [normalizeOrderStatus(String(args.phrase))];
  }

  return undefined;
};

export const resolveOrderListQueryFromPrompt = (prompt: string): {
  statuses: string[];
  deliveryOnly: boolean;
} => {
  if (isDeliveryOrderListPrompt(prompt)) {
    return {
      statuses: inferDeliveryOrderStatuses(prompt),
      deliveryOnly: true,
    };
  }

  return {
    statuses: inferOrderStatusesFromPrompt(prompt),
    deliveryOnly: false,
  };
};
