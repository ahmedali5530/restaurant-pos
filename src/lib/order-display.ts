import { Order } from '@/api/model/order.ts';
import { OrderItemKitchen, OrderItemKitchenStatus } from '@/api/model/order_item_kitchen.ts';
import { getOrderFilteredItems } from '@/lib/order.ts';
import { toLuxonDateTime } from '@/lib/datetime.ts';
import { DateTime } from 'luxon';

export type OrderDisplayColumn = 'running' | 'ready';

export type KitchenRowsByOrderItemId = Record<string, OrderItemKitchen[]>;

export const ORDER_DISPLAY_MAX_VISIBLE = 12;

const INCOMPLETE_KITCHEN_STATUSES = new Set<string>([
  OrderItemKitchenStatus.Waiting,
  OrderItemKitchenStatus.Pending,
  OrderItemKitchenStatus.InProgress,
]);

export function buildKitchenRowsMap(rows: OrderItemKitchen[] = []): KitchenRowsByOrderItemId {
  const map: KitchenRowsByOrderItemId = {};

  for (const row of rows) {
    const orderItem = row.order_item;
    if (!orderItem || orderItem.deleted_at) {
      continue;
    }

    const key = orderItem.id?.toString() ?? '';
    if (!key) {
      continue;
    }

    if (!map[key]) {
      map[key] = [];
    }

    map[key].push(row);
  }

  return map;
}

export function classifyOrder(
  order: Order,
  kitchenRowsByOrderItemId: KitchenRowsByOrderItemId
): OrderDisplayColumn | null {
  const items = getOrderFilteredItems(order);
  if (items.length === 0) {
    return null;
  }

  let hasKitchenWork = false;

  for (const item of items) {
    const rows = kitchenRowsByOrderItemId[item.id.toString()] ?? [];
    if (rows.length === 0) {
      continue;
    }

    hasKitchenWork = true;

    const hasIncomplete = rows.some(
      (row) => row.status && INCOMPLETE_KITCHEN_STATUSES.has(row.status)
    );
    if (hasIncomplete) {
      return 'running';
    }
  }

  if (!hasKitchenWork) {
    return 'ready';
  }

  return 'ready';
}

export function getReadyAt(
  order: Order,
  kitchenRowsByOrderItemId: KitchenRowsByOrderItemId
): DateTime {
  const items = getOrderFilteredItems(order);
  const timestamps: DateTime[] = [];

  for (const item of items) {
    const rows = kitchenRowsByOrderItemId[item.id.toString()] ?? [];
    for (const row of rows) {
      if (row.completed_at) {
        timestamps.push(toLuxonDateTime(row.completed_at));
      }
    }
  }

  if (timestamps.length > 0) {
    return DateTime.max(...timestamps);
  }

  return toLuxonDateTime(order.created_at);
}

export function partitionDisplayOrders(
  orders: Order[],
  kitchenRowsByOrderItemId: KitchenRowsByOrderItemId,
  maxVisible = ORDER_DISPLAY_MAX_VISIBLE
): { preparing: Order[]; ready: Order[] } {
  const preparing: Order[] = [];
  const ready: { order: Order; readyAt: DateTime }[] = [];

  for (const order of orders) {
    const column = classifyOrder(order, kitchenRowsByOrderItemId);
    if (column === 'running') {
      preparing.push(order);
    } else if (column === 'ready') {
      ready.push({ order, readyAt: getReadyAt(order, kitchenRowsByOrderItemId) });
    }
  }

  preparing.sort(
    (a, b) =>
      toLuxonDateTime(a.created_at).toMillis() - toLuxonDateTime(b.created_at).toMillis()
  );

  ready.sort((a, b) => b.readyAt.toMillis() - a.readyAt.toMillis());

  return {
    preparing: preparing.slice(0, maxVisible),
    ready: ready.slice(0, maxVisible).map((entry) => entry.order),
  };
}
