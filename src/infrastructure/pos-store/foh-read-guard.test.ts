/**
 * Architecture guard (ADR 0001): offline-capable FOH paths must not require
 * Surreal reads. Catalog/order operational data comes from PosStore/Dexie.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

/** Required local-read surfaces from the hardening plan (section 4 + P0). */
const GUARDED_FILES: Array<{ file: string; reason: string }> = [
  {
    file: 'components/orders/payment/order.payment.receiving.tsx',
    reason: 'payment types / taxes must come from hydrated catalog',
  },
  {
    file: 'components/orders/payment/order.payment.tax.tsx',
    reason: 'tax selector must use local taxes',
  },
  {
    file: 'components/orders/order.totals.tsx',
    reason: 'cart tax preview must use local taxes',
  },
  {
    file: 'components/orders/order.payment.tsx',
    reason: 'extras, coupons, and final print must not require Surreal',
  },
  {
    file: 'components/orders/payment/order.payment.discount-engine.tsx',
    reason: 'discount rules/reasons must be local',
  },
  {
    file: 'components/orders/payment/order.payment.service_charges.tsx',
    reason: 'service charge defaults must use local settings',
  },
  {
    file: 'hooks/useDiscountCache.ts',
    reason: 'discount cache must not live-query Surreal',
  },
  {
    file: 'lib/discount-engine/service.ts',
    reason: 'active discount rules load from PosStore',
  },
  {
    file: 'screens/menu.tsx',
    reason: 'tableless open orders come from PosStore',
  },
  {
    file: 'components/customer/customer.tsx',
    reason: 'customer search uses Dexie',
  },
  {
    file: 'hooks/useFetchDeliveryOrders.ts',
    reason: 'delivery list is local-first',
  },
  {
    file: 'providers/delivery-orders.provider.tsx',
    reason: 'delivery popup/print hydrate from PosStore',
  },
  {
    file: 'screens/order-display.tsx',
    reason: 'order display reads recent orders from PosStore',
  },
  {
    file: 'screens/kitchen.tsx',
    reason: 'kitchen station list and board are PosStore-backed',
  },
  {
    file: 'lib/kitchen/workflow.service.ts',
    reason: 'KOT print payload is built from Dexie',
  },
  {
    file: 'lib/kitchen/print-duplicate-kot.ts',
    reason: 'duplicate KOT uses hydrated kitchens',
  },
];

/**
 * Explicit exceptions (capability-gated online enrichment / integrations).
 * Keep reasons short — prune when the call site moves fully local.
 */
const ALLOWLIST: Array<{ file: string; pattern: RegExp; reason: string }> = [
  {
    file: 'components/orders/payment/order.payment.receiving.tsx',
    pattern: /fiscalShouldBlockBeforePaid|loadOrderForFiscal|runFiscalSettlementForOrder|useRemotePayment/,
    reason: 'fiscal / remote processor paths are capability-gated online integrations',
  },
  {
    file: 'components/orders/order.payment.tsx',
    pattern: /getFiscalQrcodesForOrderPrint/,
    reason: 'fiscal QR enrichment is online-optional and already catch-guarded',
  },
  {
    file: 'screens/menu.tsx',
    pattern: /\bdb\.live\s*\(/,
    reason: 'Surreal live is sync-wake only; list data comes from PosStore',
  },
  {
    file: 'providers/delivery-orders.provider.tsx',
    pattern: /\bdb\.live\s*\(/,
    reason: 'Surreal live is sync-wake only; list data comes from PosStore',
  },
  {
    file: 'screens/order-display.tsx',
    pattern: /\bdb\.live\s*\(/,
    reason: 'Surreal live is sync-wake only; board data comes from PosStore',
  },
  {
    file: 'screens/kitchen.tsx',
    pattern: /\bdb\.live\s*\(/,
    reason: 'Surreal live is sync-wake only; board data comes from PosStore',
  },
];

const FORBIDDEN = [
  /\buseApi\s*[<(]/,
  /\bdb\.query\s*\(/,
  /\bdb\.select\s*\(/,
  /\bdb\.live\s*\(/,
];

describe('FOH read guard', () => {
  it('blocks required Surreal reads on payment/cart local-read surfaces', () => {
    const violations: string[] = [];

    for (const entry of GUARDED_FILES) {
      const full = join(ROOT, entry.file);
      expect(() => statSync(full), entry.reason).not.toThrow();
      const source = readFileSync(full, 'utf8');
      const lines = source.split('\n');

      lines.forEach((line, index) => {
        for (const pattern of FORBIDDEN) {
          if (!pattern.test(line)) continue;
          pattern.lastIndex = 0;
          const allowed = ALLOWLIST.some(
            (rule) =>
              rule.file === entry.file &&
              (rule.pattern.test(line) || rule.pattern.test(source)),
          );
          if (allowed) continue;
          violations.push(`${entry.file}:${index + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations, `Required Surreal reads in FOH paths:\n${violations.join('\n')}`).toEqual(
      [],
    );
  });
});
