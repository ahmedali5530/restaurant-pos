import { ReactQrCode } from '@/lib/react-qr-code.tsx';

type Props = {
  value: string;
  amount?: number;
};

export function TelebirrQrDisplay({ value, amount }: Props) {
  if (!value) return null;

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="bg-surface-elevated p-3 rounded border border-border">
        <ReactQrCode value={value} size={160} />
      </div>
      {amount !== undefined && (
        <span className="text-sm font-medium">Amount: {amount.toFixed(2)} ETB</span>
      )}
      <span className="text-xs text-muted text-center">
        Scan with Telebirr app to pay
      </span>
    </div>
  );
}
