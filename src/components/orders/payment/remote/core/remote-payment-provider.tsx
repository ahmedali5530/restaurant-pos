import { Order } from "@/api/model/order.ts";
import { OrderPayment } from "@/api/model/order_payment.ts";
import {
  RemotePaymentContext,
  RemotePaymentContextValue,
} from "@/components/orders/payment/remote/core/remote-payment-context.ts";
import { useRemotePayments } from "@/components/orders/payment/remote/core/use-remote-payments.ts";
import {
  MpesaPhoneModal,
  useMpesaPhonePrompt,
} from "@/components/orders/payment/remote/gateways/mpesa/index.ts";
import { postOrderTracking } from "@/lib/tracking.service.ts";
import { Dispatch, ReactNode, SetStateAction, useMemo } from "react";

type PageUser = {
  id?: { toString(): string };
  first_name?: string;
  last_name?: string;
  role?: { name?: string };
  user_role?: { name?: string };
  user_shift?: { name?: string };
} | undefined;

type Props = {
  order: Order;
  setPayments: Dispatch<SetStateAction<OrderPayment[]>>;
  onRemotePaymentStarted?: () => void;
  page?: string;
  user?: PageUser;
  children: ReactNode;
};

export function RemotePaymentProvider({
  order,
  setPayments,
  onRemotePaymentStarted,
  page,
  user,
  children,
}: Props) {
  const mpesaPhone = useMpesaPhonePrompt();

  const tracking = useMemo(
    () => ({
      trackCreateIntent: (payload: Record<string, unknown>) => {
        postOrderTracking({
          module: "Create remote payment intent",
          page,
          orderId: order.id,
          payload,
          user,
        });
      },
      trackVerifyPayment: (payload: Record<string, unknown>) => {
        postOrderTracking({
          module: "Verify remote payment",
          page,
          orderId: order.id,
          payload,
          user,
        });
      },
    }),
    [order.id, page, user],
  );

  const remote = useRemotePayments({
    order,
    setPayments,
    onIntentSettled: onRemotePaymentStarted,
    onPaymentRequestFinished: mpesaPhone.dismissAfterPaymentRequest,
    ...tracking,
  });

  const contextValue = useMemo<RemotePaymentContextValue>(
    () => ({
      startRemotePayment: remote.startRemotePayment,
      isProcessing: remote.isProcessing,
      pendingIntents: remote.pendingIntents,
      verifyingIntentId: remote.verifyingIntentId,
      verifyPendingIntent: remote.verifyPendingIntent,
      removePendingIntent: remote.removePendingIntent,
    }),
    [
      remote.startRemotePayment,
      remote.isProcessing,
      remote.pendingIntents,
      remote.verifyingIntentId,
      remote.verifyPendingIntent,
      remote.removePendingIntent,
    ],
  );

  return (
    <RemotePaymentContext.Provider value={contextValue}>
      {children}
      <MpesaPhoneModal
        open={mpesaPhone.open}
        phoneInput={mpesaPhone.phoneInput}
        onPhoneChange={mpesaPhone.setPhoneInput}
        onConfirm={mpesaPhone.confirm}
        onCancel={mpesaPhone.cancel}
        isSubmitting={mpesaPhone.isSubmitting || remote.isProcessing}
      />
    </RemotePaymentContext.Provider>
  );
}
