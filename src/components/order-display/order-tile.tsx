import { Order } from '@/api/model/order.ts';
import { getInvoiceNumber } from '@/lib/order.ts';
import { cn } from '@/lib/utils.ts';
import { Countdown } from '@/components/floor/countdown.tsx';
import { toLuxonDateTime } from '@/lib/datetime.ts';
import { useTranslation } from 'react-i18next';

interface Props {
  order: Order;
  variant: 'preparing' | 'ready';
  celebrate?: boolean;
}

export const OrderTile = ({ order, variant, celebrate = false }: Props) => {
  const { t } = useTranslation('order-display');

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl p-6 shadow-lg animate-in fade-in zoom-in-95 duration-300',
        variant === 'ready'
          ? 'bg-success-100 text-success-900 border-2 border-success-300'
          : 'bg-warning-100 text-warning-900 border-2 border-warning-300',
        celebrate && 'ring-4 ring-success-500 scale-105 shadow-2xl order-ready-tile-celebrate'
      )}
    >
      <span className="text-5xl font-black tracking-tight leading-none">
        {getInvoiceNumber(order)}
      </span>
      {order.order_type?.name && (
        <span className="mt-2 text-lg font-semibold uppercase opacity-80">
          {order.order_type.name}
        </span>
      )}
      <div className="mt-4 flex flex-col items-center gap-1">
        <span className="font-medium opacity-70">
          {t('orderTime')} {toLuxonDateTime(order.created_at).toFormat('hh:mm a')}
        </span>
        {variant === 'preparing' && (
          <span className="text-xl font-bold">
            <Countdown time={order.created_at} />
          </span>
        )}
      </div>
    </div>
  );
};
