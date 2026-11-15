import { Order } from '@/api/model/order.ts';

/**
 * KRA payment type codes (Spec 4.10):
 * 01 cash, 02 cheque, 03 credit/mixed, 04 gift, 05 card, 06 mobile money, 07 other
 */
export const mapKraPaymentType = (order: Order): string => {
  const payments = order.payments ?? [];
  if (payments.length === 0) return '07';

  const types = new Set(
    payments.map((payment) => {
      const paymentType = payment?.payment_type;
      const raw =
        typeof paymentType === 'object' && paymentType
          ? String(
              (paymentType as { type?: string; name?: string; gateway?: string }).type ??
                (paymentType as { name?: string }).name ??
                (paymentType as { gateway?: string }).gateway ??
                ''
            )
          : '';
      return raw.toLowerCase();
    })
  );

  if (types.size > 1) return '03';

  const [only] = [...types];
  if (!only) return '07';
  if (only.includes('cash')) return '01';
  if (only.includes('cheque') || only.includes('check')) return '02';
  if (only.includes('card') || only.includes('visa') || only.includes('master')) return '05';
  if (
    only.includes('mpesa') ||
    only.includes('m-pesa') ||
    only.includes('mobile') ||
    only.includes('telebirr') ||
    only.includes('jazzcash')
  ) {
    return '06';
  }
  if (only.includes('credit') || only.includes('account')) return '03';
  return '07';
};
