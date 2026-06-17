import { useEffect, useState } from "react";
import { Button } from "@/components/common/input/button.tsx";
import { PendingRemoteIntent } from "@/components/orders/payment/remote/core/types.ts";
import { settleRemotePayment } from "@/components/orders/payment/remote/core/remote-payment-settlement.ts";
import { verifyPayment } from "@/lib/payment.service.ts";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";
import { useTranslation } from "react-i18next";

type Props = {
  intent: PendingRemoteIntent;
};

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutInstance = {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
};

type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayCheckoutInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

function loadRazorpayScript(): Promise<RazorpayConstructor> {
  if (window.Razorpay) {
    return Promise.resolve(window.Razorpay);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.Razorpay) resolve(window.Razorpay);
        else reject(new Error("Razorpay failed to load"));
      });
      existing.addEventListener("error", () => reject(new Error("Razorpay failed to load")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay failed to load"));
    };
    script.onerror = () => reject(new Error("Razorpay failed to load"));
    document.body.appendChild(script);
  });
}

export function RazorpayCheckoutButton({ intent }: Props) {
  const { t } = useTranslation(['payment', 'common']);
  const keyId = intent.gatewayPayload?.keyId;
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!keyId || typeof keyId !== "string") return;
    void loadRazorpayScript()
      .then(() => setIsReady(true))
      .catch((e) => {
        const message = e instanceof Error ? e.message : "Failed to load Razorpay";
        toast.error(message);
      });
  }, [keyId]);

  const handlePay = async () => {
    if (!keyId || typeof keyId !== "string" || !window.Razorpay) return;

    setIsSubmitting(true);
    try {
      const Razorpay = await loadRazorpayScript();
      const metadata = {
        orderId: intent.orderId,
        invoiceNumber: intent.invoiceNumber,
        paymentTypeId: intent.paymentType.id.toString(),
      };

      const checkout = new Razorpay({
        key: keyId,
        amount: intent.gatewayPayload?.amount,
        currency: intent.gatewayPayload?.currency || "INR",
        name: intent.paymentType.name,
        order_id: intent.intentId,
        handler: (response: RazorpayHandlerResponse) => {
          void (async () => {
            try {
              const result = await verifyPayment({
                gateway: "razorpay",
                intentId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                orderId: intent.orderId,
                metadata,
                payload: { signature: response.razorpay_signature },
              });

              if (result.status !== "paid" && result.status !== "authorized") {
                toast.warning(i18n.t('payment:remoteGateway.paymentIs', { status: result.status }));
                return;
              }

              settleRemotePayment(intent, result);
            } catch (e) {
              const message = e instanceof Error ? e.message : "Razorpay verification failed";
              toast.error(message);
            } finally {
              setIsSubmitting(false);
            }
          })();
        },
        modal: {
          ondismiss: () => setIsSubmitting(false),
        },
      });

      checkout.on("payment.failed", (response) => {
        setIsSubmitting(false);
        toast.error(response.error?.description || i18n.t('payment:remoteGateway.razorpayPaymentFailed'));
      });

      checkout.open();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to open Razorpay checkout";
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  if (!keyId || typeof keyId !== "string") {
    return null;
  }

  return (
    <div className="py-2">
      <Button
        size="sm"
        variant="primary"
        onClick={() => void handlePay()}
        disabled={!isReady || isSubmitting}
      >
        {isSubmitting ? t('common:actions.loading') : t('remoteGateway.payWithRazorpay')}
      </Button>
    </div>
  );
}
