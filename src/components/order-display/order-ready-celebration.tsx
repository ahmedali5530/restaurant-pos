import { useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils.ts';
import { useTranslation } from 'react-i18next';

interface Props {
  orderNumber: string;
  onComplete: () => void;
}

const CONFETTI_COLORS = [
  'bg-primary-500',
  'bg-success-500',
  'bg-warning-500',
  'bg-danger-500',
  'bg-info-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-yellow-400',
];

export const OrderReadyCelebration = ({ orderNumber, onComplete }: Props) => {
  const { t } = useTranslation('order-display');

  const confetti = useMemo(
    () =>
      Array.from({ length: 48 }, (_, index) => ({
        id: index,
        left: `${(index * 17) % 100}%`,
        delay: `${(index % 12) * 0.08}s`,
        duration: `${2.4 + (index % 5) * 0.2}s`,
        color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
        size: index % 3 === 0 ? 'h-3 w-2' : 'h-2 w-2',
        rotate: `${(index * 37) % 360}deg`,
      })),
    []
  );

  useEffect(() => {
    const timer = window.setTimeout(onComplete, 2800);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 bg-black/20 animate-in fade-in duration-300" />

      {confetti.map((piece) => (
        <span
          key={piece.id}
          className={cn(
            'absolute top-0 rounded-sm opacity-90 order-ready-confetti',
            piece.color,
            piece.size
          )}
          style={{
            left: piece.left,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            transform: `rotate(${piece.rotate})`,
          }}
        />
      ))}

      <div className="relative z-10 flex flex-col items-center gap-4 rounded-3xl border-4 border-success-400 bg-white px-10 py-8 shadow-2xl animate-in zoom-in-95 fade-in duration-500">
        <span className="text-6xl animate-bounce" aria-hidden>
          🎉
        </span>
        <p className="text-2xl font-bold uppercase tracking-wide text-success-700">
          {t('celebrationTitle')}
        </p>
        <p className="text-7xl font-black text-success-900 tabular-nums">
          {orderNumber}
        </p>
        <p className="text-xl font-semibold text-neutral-600">
          {t('orderReadyAnnouncement', { number: orderNumber })}
        </p>
      </div>
    </div>
  );
};
