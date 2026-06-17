import React, { ReactNode, useCallback, useEffect, useRef } from "react";
import { useAtom } from "jotai";
import { toast } from "sonner";
import { useDB } from "@/api/db/db.ts";
import { appPage } from "@/store/jotai.ts";
import {
  closeOpenChecks,
  countOpenChecksForWindow,
  formatCountdown,
  getAutoCloseState,
  hasPaymentTypeConfigured,
  loadAutoCheckCloseSettings,
  markAutoCheckCloseCycle,
  WARNING_TOAST_ID,
} from "@/lib/auto-check-close.service.ts";
import { AutoCloseCycleState} from "@/lib/closing-cycle.ts";
import {useTranslation} from "react-i18next";

const CHECK_INTERVAL_MS = 5_000;

interface AutoCheckCloseProviderProps {
  children: ReactNode;
}

export const AutoCheckCloseProvider: React.FC<AutoCheckCloseProviderProps> = ({
  children,
}) => {
  const {t} = useTranslation(["closing", "toast"]);
  const db = useDB();
  const [page] = useAtom(appPage);
  const dbRef = useRef(db);
  const pageRef = useRef(page);
  const inFlightRef = useRef(false);
  const warningActiveRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  dbRef.current = db;
  pageRef.current = page;

  const dismissWarningToast = useCallback(() => {
    warningActiveRef.current = false;
    toast.dismiss(WARNING_TOAST_ID);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const executeAutoCloseIfNeeded = useCallback(async (state: AutoCloseCycleState) => {
    if (inFlightRef.current) {
      return;
    }

    const userId = pageRef.current?.user?.id?.toString();
    if (!userId) {
      return;
    }

    const {config} = await getAutoCloseState(dbRef.current);
    if (!config.enabled) {
      return;
    }

    const { setting, values } = await loadAutoCheckCloseSettings(dbRef.current);
    if (!values.enabled || !hasPaymentTypeConfigured(values.payment_type_id)) {
      return;
    }

    if (values.last_closed_cycle === state.cycleKey) {
      const remaining = await countOpenChecksForWindow(dbRef.current, state.window);
      if (remaining === 0) {
        return;
      }
    }

    if (!state.shouldClose) {
      return;
    }

    inFlightRef.current = true;
    try {
      const { closed, failed, candidates, skipped } = await closeOpenChecks({
        db: dbRef.current,
        paymentTypeId: values.payment_type_id,
        printOnClose: values.print_on_close,
        userId,
        window: state.window,
      });

      const shouldMarkCycle = closed > 0 || (candidates === 0 && failed === 0);

      if (shouldMarkCycle) {
        await markAutoCheckCloseCycle(dbRef.current, setting, state.cycleKey);
      }

      if (closed > 0) {
        toast.success(
          t("closing:autoCheckClose.autoClosed", {count: closed})
        );
      } else if (failed > 0) {
        toast.error(
          t("closing:autoCheckClose.failed", {count: failed})
        );
      } else if (candidates === 0) {
        toast.info(t("closing:autoCheckClose.noOpenChecks"));
      } else {
        const skippedSuffix = skipped > 0
          ? t("closing:autoCheckClose.skippedSuffix", {count: skipped})
          : "";
        toast.error(
          t("closing:autoCheckClose.retry", {count: candidates, skipped: skippedSuffix})
        );
      }
    } catch (error) {
      console.error('Auto check close execution failed:', error);
      toast.error(t("closing:autoCheckClose.executionFailed"));
    } finally {
      inFlightRef.current = false;
    }
  }, [t]);

  const evaluateAutoClose = useCallback(async () => {
    const userId = pageRef.current?.user?.id?.toString();
    if (!userId) {
      dismissWarningToast();
      return;
    }

    const {config, state} = await getAutoCloseState(dbRef.current);

    if (!config.enabled) {
      dismissWarningToast();
      return;
    }

    const { values } = await loadAutoCheckCloseSettings(dbRef.current);
    if (!values.enabled || !hasPaymentTypeConfigured(values.payment_type_id)) {
      dismissWarningToast();
      return;
    }

    if (state.shouldClose) {
      dismissWarningToast();
      await executeAutoCloseIfNeeded(state);
      return;
    }

    if (state.shouldWarn) {
      if (!warningActiveRef.current) {
        warningActiveRef.current = true;
        countdownIntervalRef.current = setInterval(() => {
          void evaluateAutoClose();
        }, 1000);
      }

      toast.warning(
        t("closing:autoCheckClose.warning", {countdown: formatCountdown(state.secondsUntilEnd)}),
        { id: WARNING_TOAST_ID, duration: Infinity }
      );
      return;
    }

    dismissWarningToast();
  }, [dismissWarningToast, executeAutoCloseIfNeeded, t]);

  useEffect(() => {
    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const runLoop = async () => {
      if (!isActive) {
        return;
      }

      if (!inFlightRef.current) {
        await evaluateAutoClose();
      }

      if (!isActive) {
        return;
      }

      timeoutId = setTimeout(() => {
        void runLoop();
      }, CHECK_INTERVAL_MS);
    };

    void runLoop();

    return () => {
      isActive = false;
      dismissWarningToast();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [dismissWarningToast, evaluateAutoClose]);

  return <>{children}</>;
};
