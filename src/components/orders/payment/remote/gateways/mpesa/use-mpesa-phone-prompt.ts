import { useCallback, useEffect, useRef, useState } from "react";
import {
  MpesaPhonePromptRequest,
  registerMpesaPhonePrompt,
} from "@/components/orders/payment/remote/gateways/mpesa/mpesa.gateway.tsx";
import { normalizeMpesaPhone } from "@/components/orders/payment/remote/gateways/mpesa/mpesa.utils.ts";
import { toast } from "sonner";
import i18n from "@/lib/i18n.ts";

export function useMpesaPhonePrompt() {
  const [open, setOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestRef = useRef<MpesaPhonePromptRequest | null>(null);
  const resolveRef = useRef<((phone: string | null) => void) | null>(null);
  /** Set on confirm; cleared on dismiss. Ref avoids stale isSubmitting in async callbacks. */
  const awaitingCloseAfterRequestRef = useRef(false);

  const dismiss = useCallback(() => {
    awaitingCloseAfterRequestRef.current = false;
    setOpen(false);
    setIsSubmitting(false);
    requestRef.current = null;
    resolveRef.current = null;
  }, []);

  const requestPhone = useCallback((request: MpesaPhonePromptRequest) => {
    return new Promise<string | null>((resolve) => {
      requestRef.current = request;
      resolveRef.current = resolve;
      awaitingCloseAfterRequestRef.current = false;
      setPhoneInput(request.initialPhone || "");
      setIsSubmitting(false);
      setOpen(true);
    });
  }, []);

  useEffect(() => {
    registerMpesaPhonePrompt({ requestPhone });
    return () => registerMpesaPhonePrompt(null);
  }, [requestPhone]);

  const confirm = useCallback(() => {
    if (isSubmitting) return;

    const normalized = normalizeMpesaPhone(phoneInput);
    if (!normalized) {
      toast.error(i18n.t('payment:remoteGateway.mpesaInvalidPhone'));
      return;
    }

    awaitingCloseAfterRequestRef.current = true;
    setIsSubmitting(true);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(normalized);
  }, [isSubmitting, phoneInput]);

  const cancel = useCallback(() => {
    if (isSubmitting) return;

    awaitingCloseAfterRequestRef.current = false;
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(null);
    dismiss();
  }, [dismiss, isSubmitting]);

  const dismissAfterPaymentRequest = useCallback(() => {
    if (!awaitingCloseAfterRequestRef.current) return;
    dismiss();
  }, [dismiss]);

  return {
    open,
    phoneInput,
    setPhoneInput,
    confirm,
    cancel,
    isSubmitting,
    dismissAfterPaymentRequest,
  };
}
