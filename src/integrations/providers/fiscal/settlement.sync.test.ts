import { describe, expect, it } from 'vitest';
import { isOutboxRelatedToOrder } from '@/integrations/providers/fiscal/settlement.ts';
import type { DomainOperation } from '@/infrastructure/pos-store/types.ts';

const baseOp = (overrides: Partial<DomainOperation>): DomainOperation => ({
  operationId: 'op:1',
  terminalId: 'terminal:1',
  sequence: 1,
  aggregateType: 'order',
  aggregateId: 'order:abc',
  operationType: 'MERGE_RECORD',
  expectedVersion: 0,
  payload: {},
  createdAt: new Date().toISOString(),
  protocolVersion: 1,
  schemaVersion: 1,
  ...overrides,
});

describe('isOutboxRelatedToOrder', () => {
  it('matches aggregate id', () => {
    expect(isOutboxRelatedToOrder(baseOp({}), 'order:abc')).toBe(true);
    expect(isOutboxRelatedToOrder(baseOp({}), 'order:other')).toBe(false);
  });

  it('matches child item rows on add-items MERGE', () => {
    const op = baseOp({
      aggregateId: 'order:abc',
      payload: {
        table: 'order',
        recordId: 'order:abc',
        data: { updated_at: 'x' },
        items: [{ id: 'order_item:water', order: 'order:abc' }],
      },
    });
    expect(isOutboxRelatedToOrder(op, 'order:abc')).toBe(true);
  });

  it('matches order_item MERGE via payload.orderId', () => {
    const op = baseOp({
      aggregateType: 'order_item',
      aggregateId: 'order_item:1',
      payload: {
        table: 'order_item',
        recordId: 'order_item:1',
        orderId: 'order:abc',
        data: { deleted_at: 'x' },
      },
    });
    expect(isOutboxRelatedToOrder(op, 'order:abc')).toBe(true);
    expect(isOutboxRelatedToOrder(op, 'order:zzz')).toBe(false);
  });
});
