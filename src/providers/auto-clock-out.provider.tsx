import React, { ReactNode, useCallback, useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useDB } from '@/api/db/db.ts';
import { appPage } from '@/store/jotai.ts';
import {
  AUTO_CLOCK_OUT_WARNING_TOAST_ID,
  evaluateAutoClockOut,
  formatCountdown,
} from '@/lib/auto-clock-out.ts';
import { clockOut as laborClockOut } from '@/lib/labor-engine/attendance/attendance.service.ts';
import { logoutSession } from '@/lib/session.actions.ts';

const CHECK_INTERVAL_MS = 30_000;

interface AutoClockOutProviderProps {
  children: ReactNode;
}

export const AutoClockOutProvider: React.FC<AutoClockOutProviderProps> = ({ children }) => {
  const { t } = useTranslation(['toast']);
  const db = useDB();
  const [page, setPage] = useAtom(appPage);
  const navigate = useNavigate();

  const dbRef = useRef(db);
  const pageRef = useRef(page);
  const inFlightRef = useRef(false);
  const clockedOutKeyRef = useRef<string | null>(null);
  const warningActiveRef = useRef(false);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  dbRef.current = db;
  pageRef.current = page;

  const dismissWarningToast = useCallback(() => {
    warningActiveRef.current = false;
    toast.dismiss(AUTO_CLOCK_OUT_WARNING_TOAST_ID);
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const executeClockOut = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    const user = pageRef.current?.user;
    if (!user || pageRef.current?.locked) {
      return;
    }

    inFlightRef.current = true;
    try {
      const evaluation = await evaluateAutoClockOut(dbRef.current, user);
      if (!evaluation.shouldClockOut || !evaluation.timeEntry?.id || !evaluation.endAt) {
        return;
      }

      const dedupeKey = `${String(evaluation.timeEntry.id)}:${evaluation.endAt.toISO()}`;
      if (clockedOutKeyRef.current === dedupeKey) {
        return;
      }
      clockedOutKeyRef.current = dedupeKey;

      dismissWarningToast();

      // Re-check after awaits — idle lock may have run while we were evaluating.
      if (pageRef.current?.locked) {
        return;
      }

      await laborClockOut(dbRef.current, {
        timeEntryId: String(evaluation.timeEntry.id),
        user,
      });

      if (pageRef.current?.locked) {
        return;
      }

      toast.success(t('toast:autoClockOut.clockedOut'));
      void logoutSession(setPage, navigate);
    } catch (error) {
      console.error('Auto clock-out failed:', error);
      toast.error(t('toast:autoClockOut.failed'));
      clockedOutKeyRef.current = null;
    } finally {
      inFlightRef.current = false;
    }
  }, [dismissWarningToast, navigate, setPage, t]);

  const evaluate = useCallback(async () => {
    const user = pageRef.current?.user;
    if (!user || pageRef.current?.locked) {
      dismissWarningToast();
      return;
    }

    try {
      const state = await evaluateAutoClockOut(dbRef.current, user);

      if (state.shouldClockOut) {
        dismissWarningToast();
        await executeClockOut();
        return;
      }

      if (state.shouldWarn && state.secondsUntilEnd != null) {
        if (!warningActiveRef.current) {
          warningActiveRef.current = true;
          countdownIntervalRef.current = setInterval(() => {
            void evaluate();
          }, 1000);
        }

        toast.warning(
          t('toast:autoClockOut.warning', {
            countdown: formatCountdown(state.secondsUntilEnd),
          }),
          { id: AUTO_CLOCK_OUT_WARNING_TOAST_ID, duration: Infinity }
        );
        return;
      }

      dismissWarningToast();
    } catch (error) {
      console.error('Auto clock-out evaluation failed:', error);
    }
  }, [dismissWarningToast, executeClockOut, t]);

  useEffect(() => {
    let isActive = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const runLoop = async () => {
      if (!isActive) {
        return;
      }

      if (!inFlightRef.current) {
        await evaluate();
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
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      dismissWarningToast();
    };
  }, [evaluate, dismissWarningToast, page?.user?.id]);

  return <>{children}</>;
};
