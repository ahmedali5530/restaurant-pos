import { Button } from "@/components/common/input/button.tsx";
import { getRemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/registry.ts";
import { PendingRemoteIntent } from "@/components/orders/payment/remote/core/types.ts";
import { withCurrency } from "@/lib/utils.ts";

type Props = {
  intents: PendingRemoteIntent[];
  verifyingIntentId: string | null;
  onVerify: (intent: PendingRemoteIntent) => void;
  onRemove: (localIntentId: string) => void;
};

export function RemotePaymentPendingList({
  intents,
  verifyingIntentId,
  onVerify,
  onRemove,
}: Props) {
  if (intents.length === 0) return null;

  return (
    <>
      {intents.map((intent) => {
        const adapter = getRemoteGatewayAdapter(intent.gateway);
        return (
          <div key={intent.id} className="border border-warning-400 rounded p-2">
            <div className="flex justify-between text-sm mb-2">
              <strong>{intent.paymentType.name} (Remote)</strong>
              <span>{withCurrency(intent.amount)}</span>
            </div>
            <div className="text-xs text-neutral-600 mb-2">
              Status: {intent.status}
              {adapter.renderPendingDetail?.(intent)}
            </div>
            {adapter.renderPendingExtra?.(intent)}
            <div className="flex gap-2">
              {intent.paymentUrl && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    window.open(intent.paymentUrl as string, "_blank", "noopener,noreferrer")
                  }
                >
                  Open link
                </Button>
              )}
              <Button
                size="sm"
                variant="success"
                onClick={() => onVerify(intent)}
                disabled={verifyingIntentId === intent.id}
              >
                Verify
              </Button>
              <Button size="sm" variant="danger" onClick={() => onRemove(intent.id)}>
                Remove
              </Button>
            </div>
          </div>
        );
      })}
    </>
  );
}
