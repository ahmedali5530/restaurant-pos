import { useMemo, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';

interface StripePayProps {
  publishableKey: string;
  clientSecret: string;
  returnUrl: string;
  amountLabel: string;
  busy: boolean;
  onPaid: () => void;
  onError: (message: string) => void;
}

function StripeForm({ returnUrl, amountLabel, busy, onPaid, onError }: Omit<StripePayProps, 'publishableKey' | 'clientSecret'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const pay = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    try {
      // Methods needing a redirect (3-D Secure, wallets) come back to `returnUrl`,
      // where the app confirms the checkout on load.
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: returnUrl },
      });
      if (error) {
        onError(error.message || 'Payment failed. Please try again.');
        return;
      }
      // Only release the order once funds are guaranteed. `processing` is
      // transient and can still fail — releasing there would send food to the
      // kitchen for a payment that never settles.
      if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture')) {
        onPaid();
      } else if (paymentIntent?.status === 'processing') {
        onError('Your bank is still processing this payment. Please wait a moment and try again — if you were charged, ask a staff member.');
      } else {
        onError(`Payment not completed (${paymentIntent?.status ?? 'unknown'}).`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PaymentElement />
      <button
        disabled={!stripe || !elements || submitting || busy}
        onClick={pay}
        className="so-btn-primary"
      >
        <span>{submitting ? 'Processing…' : 'Pay now'}</span>
        <span className="tabular-nums text-[color:var(--so-gold-soft)]">{amountLabel}</span>
      </button>
    </div>
  );
}

export function StripePay({ publishableKey, clientSecret, ...rest }: StripePayProps) {
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);
  if (!stripePromise || !clientSecret) {
    return <p className="text-sm text-danger-800">Card payment is not set up correctly. Please ask a staff member.</p>;
  }
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'flat',
          variables: {
            colorPrimary: '#17140f',
            colorBackground: '#fffdf9',
            colorText: '#17140f',
            colorTextSecondary: '#7c7163',
            colorDanger: '#a4552f',
            borderRadius: '14px',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          },
          rules: {
            '.Input': { border: '1px solid #e6dccb', boxShadow: 'none' },
            '.Input:focus': { border: '1px solid #b8955a', boxShadow: '0 0 0 3px rgba(184,149,90,0.18)' },
            '.Tab': { border: '1px solid #e6dccb' },
            '.Tab--selected': { borderColor: '#17140f' },
          },
        },      }}
    >
      <StripeForm {...rest} />
    </Elements>
  );
}

export function PaypalPay({
  clientId,
  orderId,
  currency,
  onApproved,
  onError,
}: {
  clientId: string;
  orderId: string;
  currency: string;
  onApproved: () => void;
  onError: (message: string) => void;
}) {
  if (!clientId) {
    return <p className="text-sm text-danger-800">PayPal is not set up correctly. Please ask a staff member.</p>;
  }
  return (
    <PayPalScriptProvider options={{ clientId, currency, intent: 'capture', vault: false }}>
      <PayPalButtons
        style={{ layout: 'vertical', shape: 'rect', label: 'pay' }}
        createOrder={() => Promise.resolve(orderId)}
        onApprove={async () => onApproved()}
        onError={(err) => onError(err instanceof Error ? err.message : 'PayPal payment failed. Please try again.')}
      />
    </PayPalScriptProvider>
  );
}
