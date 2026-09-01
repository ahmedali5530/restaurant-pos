import { useCallback, useEffect, useRef, useState } from "react";
import { PaymentType } from "@/api/model/payment_type.ts";
import { Order } from "@/api/model/order.ts";
import { OrderPayment } from "@/api/model/order_payment.ts";
import { getRemoteGatewayAdapter } from "@/components/orders/payment/remote/gateways/registry.ts";
import {
  PendingRemoteIntent,
  RemotePaymentCallbacks,
  RemotePaymentContext,
} from "@/components/orders/payment/remote/core/types.ts";
import { getOrderCustomerPhone } from "@/components/orders/payment/remote/core/utils.ts";
import {
  createPaymentIntent,
  fetchWebhookPaymentResult,
  GatewayType,
  VerifyPaymentResponse,
  verifyPayment,
} from "@/lib/payment.service.ts";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";
import {
  registerRemotePaymentSettler,
} from "@/components/orders/payment/remote/core/remote-payment-settlement.ts";

type UseRemotePaymentsOptions = RemotePaymentCallbacks & {
  order: Order;
};

export function useRemotePayments({
  order,
  setPayments,
  onIntentSettled,
  onPaymentRequestFinished,
  trackCreateIntent,
  trackVerifyPayment,
}: UseRemotePaymentsOptions) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [verifyingIntentId, setVerifyingIntentId] = useState<string | null>(null);
  const [pendingIntents, setPendingIntents] = useState<PendingRemoteIntent[]>([]);
  const pollStopRefs = useRef<Map<string, () => void>>(new Map());
  const onPaymentRequestFinishedRef = useRef(onPaymentRequestFinished);

  useEffect(() => {
    onPaymentRequestFinishedRef.current = onPaymentRequestFinished;
  }, [onPaymentRequestFinished]);

  const stopPolling = useCallback((localIntentId: string) => {
    const stop = pollStopRefs.current.get(localIntentId);
    if (stop) {
      stop();
      pollStopRefs.current.delete(localIntentId);
    }
  }, []);

  useEffect(() => {
    return () => {
      pollStopRefs.current.forEach((stop) => stop());
      pollStopRefs.current.clear();
    };
  }, []);

  const completeRemotePayment = useCallback(
    (pendingIntent: PendingRemoteIntent, result: VerifyPaymentResponse) => {
      const adapter = getRemoteGatewayAdapter(pendingIntent.gateway);
      const comments = JSON.stringify({
        provider: pendingIntent.gateway,
        intentId: pendingIntent.intentId,
        reference: result.reference,
        verifiedAt: result.verifiedAt,
        status: result.status,
        paymentUrl: pendingIntent.paymentUrl,
        clientToken: pendingIntent.clientToken,
      });

      setPayments((prev) => [
        ...prev,
        {
          payment_type: pendingIntent.paymentType,
          amount: pendingIntent.amount,
          payable: pendingIntent.payable,
          comments,
          id: nanoid(),
        },
      ]);

      trackVerifyPayment({
        gateway: pendingIntent.gateway,
        amount: pendingIntent.amount,
        payment_type: pendingIntent.paymentType.id.toString(),
        intent_id: pendingIntent.intentId,
        status: result.status,
        reference: result.reference,
      });

      stopPolling(pendingIntent.id);
      setPendingIntents((prev) => prev.filter((item) => item.id !== pendingIntent.id));
      toast.success(
        adapter.getVerifiedSuccessMessage?.() ?? i18n.t('payment:remoteGateway.verifiedAndAdded'),
      );
    },
    [setPayments, stopPolling, trackVerifyPayment],
  );

  const startGatewayPolling = useCallback(
    (pendingIntent: PendingRemoteIntent, context: RemotePaymentContext) => {
      const adapter = getRemoteGatewayAdapter(pendingIntent.gateway);
      if (!adapter.startStatusPolling) return;

      stopPolling(pendingIntent.id);
      const stop = adapter.startStatusPolling(pendingIntent, context, {
        onSettled: (result) => completeRemotePayment(pendingIntent, result),
        onStatusChange: (status) => {
          setPendingIntents((prev) =>
            prev.map((item) =>
              item.id === pendingIntent.id ? { ...item, status } : item,
            ),
          );
        },
      });
      pollStopRefs.current.set(pendingIntent.id, stop);
    },
    [completeRemotePayment, stopPolling],
  );

  useEffect(() => {
    registerRemotePaymentSettler(completeRemotePayment);
    return () => registerRemotePaymentSettler(null);
  }, [completeRemotePayment]);

  const executeRemotePayment = useCallback(
    async (
      amount: string | number,
      paymentType: PaymentType,
      payable: number,
      customerPhone?: string,
    ) => {
      const numericAmount = Number(amount);
      const gateway = paymentType.gateway as GatewayType | undefined;

      setIsProcessing(true);
      try {
        if (!Number.isFinite(numericAmount) || numericAmount <= 0) return;

        if (!gateway) {
          toast.error(i18n.t('payment:remoteGateway.missingProvider'));
          return;
        }

        const adapter = getRemoteGatewayAdapter(gateway);
        const context: RemotePaymentContext = {
          order,
          paymentType,
          amount: numericAmount,
          payable,
        };
        const intent = await createPaymentIntent(
          {
            gateway,
            amount: numericAmount,
            currency: adapter.resolveCurrency(),
            orderId: order.id.toString(),
            customer: {
              name: order?.customer?.name || undefined,
              email: order?.customer?.email || undefined,
              phone: customerPhone ?? getOrderCustomerPhone(order),
            },
            metadata: {
              orderId: order.id.toString(),
              invoiceNumber: order.invoice_number,
              paymentTypeId: paymentType.id.toString(),
            },
          },
          {
            idempotencyKey: `${order.id}-${paymentType.id}-${numericAmount}-${Date.now()}`,
          },
        );

        const pendingIntent: PendingRemoteIntent = {
          id: nanoid(),
          amount: numericAmount,
          payable,
          paymentType,
          gateway,
          intentId: intent.intentId,
          paymentUrl: intent.paymentUrl,
          clientToken: intent.clientToken,
          gatewayPayload: intent.gatewayPayload,
          orderId: order.id.toString(),
          invoiceNumber: order.invoice_number,
          status: intent.status,
          expiresAt: intent.expiresAt,
        };

        setPendingIntents((prev) => [...prev, pendingIntent]);
        adapter.onIntentCreated?.({ intent, pendingIntent, context });
        startGatewayPolling(pendingIntent, context);

        trackCreateIntent({
          gateway,
          amount: numericAmount,
          payment_type: paymentType.id.toString(),
          intent_id: intent.intentId,
        });

        onIntentSettled?.();
      } catch (e) {
        const message =
          e instanceof Error ? e.message : i18n.t('payment:remoteGateway.generateFailed');
        toast.error(message);
      } finally {
        setIsProcessing(false);
        onPaymentRequestFinishedRef.current?.();
      }
    },
    [order, onIntentSettled, startGatewayPolling, trackCreateIntent],
  );

  const startRemotePayment = useCallback(
    async (amount: string | number, paymentType: PaymentType, payable: number) => {
      const gateway = paymentType.gateway as GatewayType | undefined;
      if (!gateway) {
        toast.error(i18n.t('payment:remoteGateway.missingProvider'));
        return;
      }

      const numericAmount = Number(amount);
      const context: RemotePaymentContext = {
        order,
        paymentType,
        amount: numericAmount,
        payable,
      };

      const adapter = getRemoteGatewayAdapter(gateway);
      const prepared = await adapter.preparePayment(context);

      if (!prepared.proceed) return;

      await executeRemotePayment(
        amount,
        paymentType,
        payable,
        prepared.customerPhone,
      );
    },
    [executeRemotePayment, order],
  );

  const verifyPendingIntent = useCallback(
    async (pendingIntent: PendingRemoteIntent) => {
      setVerifyingIntentId(pendingIntent.id);
      try {
        const orderId = order.id.toString();
        const webhookResult = await fetchWebhookPaymentResult(pendingIntent.gateway, orderId);
        const result =
          webhookResult ??
          (await verifyPayment({
            gateway: pendingIntent.gateway,
            intentId: pendingIntent.intentId,
            orderId,
            metadata: {
              orderId,
              invoiceNumber: order.invoice_number,
              paymentTypeId: pendingIntent.paymentType.id.toString(),
            },
          }));

        if (result.status !== "paid" && result.status !== "authorized") {
          toast.warning(
            i18n.t('payment:remoteGateway.mustBePaid', { status: result.status }),
          );
          setPendingIntents((prev) =>
            prev.map((item) =>
              item.id === pendingIntent.id ? { ...item, status: result.status } : item,
            ),
          );
          return;
        }

        completeRemotePayment(pendingIntent, result);
      } catch (e) {
        const message = e instanceof Error ? e.message : i18n.t('payment:remoteGateway.verifyFailed');
        toast.error(message);
      } finally {
        setVerifyingIntentId(null);
      }
    },
    [completeRemotePayment, order.id, order.invoice_number],
  );

  const removePendingIntent = useCallback(
    (localIntentId: string) => {
      stopPolling(localIntentId);
      setPendingIntents((prev) => prev.filter((item) => item.id !== localIntentId));
    },
    [stopPolling],
  );

  return {
    isProcessing,
    verifyingIntentId,
    pendingIntents,
    startRemotePayment,
    verifyPendingIntent,
    removePendingIntent,
  };
}
