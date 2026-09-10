import { describe, expect, it } from 'vitest';
import {
  hasHydratedOrderItems,
  mergeOrderCardSnapshot,
  mergeRemoteRelations,
} from '@/lib/pos-order-merge.ts';

describe('pos-order-merge', () => {
  it('keeps local items and fills remote-only relations', () => {
    const local = {
      id: 'order:1',
      items: [{ id: 'order_item:a', price: 10, quantity: 1 }],
      owner_terminal_id: 'terminal-a',
      customer: { id: 'customer:1' },
      payments: [],
    };
    const remote = {
      id: 'order:1',
      items: [{ id: 'order_item:old', price: 1, quantity: 1 }],
      customer: { id: 'customer:1', name: 'Ada' },
      payments: [{ id: 'order_payment:1', amount: 10 }],
    };

    const merged = mergeRemoteRelations(local, remote);
    expect(merged.items).toEqual(local.items);
    expect(merged.owner_terminal_id).toBe('terminal-a');
    expect(merged.customer.name).toBe('Ada');
    expect(merged.payments).toHaveLength(1);
  });

  it('does not let Surreal card overwrite hydrated PosStore items', () => {
    const snapshot = {
      id: 'order:1',
      items: [{ id: 'order_item:new', price: 12, quantity: 2, item: { name: 'Soup' } }],
      server_version: 3,
    };
    const remoteCard = {
      id: 'order:1',
      items: [{ id: 'order_item:old', price: 5, quantity: 1 }],
      payments: [{ id: 'order_payment:1' }],
    };
    expect(hasHydratedOrderItems(snapshot)).toBe(true);
    const merged = mergeOrderCardSnapshot(snapshot, remoteCard);
    expect(merged.items[0].price).toBe(12);
    expect(merged.payments).toHaveLength(1);
  });

  it('prefers remote closed status over stale local In Progress', () => {
    const merged = mergeRemoteRelations(
      { id: 'order:1', status: 'In Progress', items: [{ id: 'a', price: 1 }] },
      { id: 'order:1', status: 'Cancelled', tags: ['Cancelled'], items: [{ id: 'a', price: 1 }] },
    );
    expect(merged.status).toBe('Cancelled');
    expect(merged.tags).toEqual(['Cancelled']);
  });

  it('keeps local deleted_at when merging card items', () => {
    const snapshot = {
      id: 'order:1',
      items: [
        { id: 'order_item:a', price: 5, quantity: 1, deleted_at: '2026-09-07T00:00:00.000Z', item: { name: 'Soup' } },
        { id: 'order_item:b', price: 3, quantity: 1, item: { name: 'Tea' } },
      ],
    };
    const remote = {
      id: 'order:1',
      items: [
        { id: 'order_item:a', price: 5, quantity: 1, item: { name: 'Soup' } },
        { id: 'order_item:b', price: 3, quantity: 1, item: { name: 'Tea' } },
      ],
      payments: [],
    };
    const merged = mergeOrderCardSnapshot(snapshot, remote);
    expect(merged.items[0].deleted_at).toBeTruthy();
    expect(merged.items[1].deleted_at).toBeFalsy();
  });

  it('prefers Surreal FETCH payments over PosStore id stubs', () => {
    const local = {
      id: 'order:1',
      items: [{ id: 'order_item:a', price: 10, quantity: 1 }],
      payments: ['order_payment:1', { id: 'order_payment:2' }],
    };
    const remote = {
      id: 'order:1',
      items: [{ id: 'order_item:a', price: 10, quantity: 1 }],
      payments: [
        { id: 'order_payment:1', amount: 5, payable: 10 },
        { id: 'order_payment:2', amount: 5, payable: 10 },
      ],
    };
    const merged = mergeRemoteRelations(local, remote);
    expect(merged.payments).toHaveLength(2);
    expect(merged.payments[0].amount).toBe(5);
  });
});
