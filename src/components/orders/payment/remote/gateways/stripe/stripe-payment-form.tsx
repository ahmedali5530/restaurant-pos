import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, StripeElementsOptions } from "@stripe/stripe-js";
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

function StripePaymentFormInner({ intent }: Props) {
  const { t } = useTranslation(['payment', 'common']);
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!stripe || !elements || !intent.clientToken) return;

    setIsSubmitting(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (error) {
        toast.error(error.message || i18n.t('payment:remoteGateway.stripePaymentFailed'));
        return;
      }

      if (paymentIntent?.status !== "succeeded" && paymentIntent?.status !== "requires_capture") {
        toast.warning(i18n.t('payment:remoteGateway.paymentStatusLabel', { status: paymentIntent?.status || 'unknown' }));
        return;
      }

      const result = await verifyPayment({
        gateway: "stripe",
        intentId: intent.intentId,
        orderId: intent.orderId,
        metadata: {
          orderId: intent.orderId,
          invoiceNumber: intent.invoiceNumber,
          paymentTypeId: intent.paymentType.id.toString(),
        },
      });

      if (result.status !== "paid" && result.status !== "authorized") {
        toast.warning(i18n.t('payment:remoteGateway.paymentIs', { status: result.status }));
        return;
      }

      settleRemotePayment(intent, result);
    } catch (e) {
      const message = e instanceof Error ? e.message : i18n.t('payment:remoteGateway.stripePaymentFailed');
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 py-2">
      <PaymentElement />
      <Button
        size="sm"
        variant="primary"
        onClick={() => void handleSubmit()}
        disabled={!stripe || !elements || isSubmitting}
      >
        {isSubmitting ? t('common:actions.loading') : t('remoteGateway.payWithCard')}
      </Button>
    </div>
  );
}

export function StripePaymentForm({ intent }: Props) {
  const publishableKey = intent.gatewayPayload?.publishableKey;
  const stripePromise = useMemo(
    () =>
      publishableKey && typeof publishableKey === "string"
        ? loadStripe(publishableKey)
        : null,
    [publishableKey],
  );

  if (!stripePromise || !intent.clientToken) {
    return null;
  }

  const options: StripeElementsOptions = {
    clientSecret: intent.clientToken,
    appearance: { theme: "stripe" },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <StripePaymentFormInner intent={intent} />
    </Elements>
  );
}
