import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { PendingRemoteIntent } from "@/components/orders/payment/remote/core/types.ts";
import { settleRemotePayment } from "@/components/orders/payment/remote/core/remote-payment-settlement.ts";
import { capturePayment, verifyPayment } from "@/lib/payment.service.ts";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";

type Props = {
  intent: PendingRemoteIntent;
};

export function PaypalButtonsPanel({ intent }: Props) {
  const clientId = intent.gatewayPayload?.clientId;

  if (!clientId || typeof clientId !== "string") {
    return null;
  }

  const metadata = {
    orderId: intent.orderId,
    invoiceNumber: intent.invoiceNumber,
    paymentTypeId: intent.paymentType.id.toString(),
  };

  return (
    <PayPalScriptProvider
      options={{
        clientId,
        currency: (import.meta.env.VITE_CURRENCY as string) || "USD",
        intent: "capture",
        vault: false,
      }}
    >
      <div className="py-2">
        <PayPalButtons
          style={{ layout: "vertical", shape: "rect", label: "pay" }}
          createOrder={() => Promise.resolve(intent.intentId)}
          onApprove={async () => {
            try {
              const captured = await capturePayment({
                gateway: "paypal",
                intentId: intent.intentId,
                orderId: intent.orderId,
                metadata,
              });

              const result =
                captured.status === "paid" || captured.status === "authorized"
                  ? captured
                  : await verifyPayment({
                      gateway: "paypal",
                      intentId: intent.intentId,
                      orderId: intent.orderId,
                      metadata,
                    });

              if (result.status !== "paid" && result.status !== "authorized") {
                toast.warning(i18n.t('payment:remoteGateway.paypalPaymentIs', { status: result.status }));
                return;
              }

              settleRemotePayment(intent, result);
            } catch (e) {
              const message = e instanceof Error ? e.message : i18n.t('payment:remoteGateway.paymentFailed');
              toast.error(message);
            }
          }}
          onError={(err) => {
            const message =
              err instanceof Error ? err.message : i18n.t('payment:remoteGateway.paymentFailed');
            toast.error(message);
          }}
        />
      </div>
    </PayPalScriptProvider>
  );
}
