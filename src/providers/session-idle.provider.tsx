import React, { ReactNode, useEffect, useRef } from 'react';
import { useAtom } from 'jotai';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useDB } from '@/api/db/db.ts';
import { appPage } from '@/store/jotai.ts';
import {
  DEFAULT_SESSION_SECURITY,
  SESSION_SECURITY_CHANGED_EVENT,
  SessionSecuritySettings,
  normalizeIdleMinutes,
  normalizeSessionAction,
  normalizeSessionSecurity,
} from '@/api/model/session_security.ts';
import { loadSessionSecuritySettings } from '@/lib/auto-clock-out.ts';
import { lockSession, logoutSession } from '@/lib/session.actions.ts';

/**
 * Discrete interactions — always reset idle immediately.
 * Includes mouse + touch + pointer (POS is often touch-first; mousemove alone is unreliable).
 */
const DISCRETE_ACTIVITY_EVENTS = [
  'pointerdown',
  'pointerup',
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
  'touchstart',
  'touchend',
  'touchcancel',
  'keydown',
  'keyup',
  'wheel',
  'scroll',
] as const;

/** Continuous move/drag — throttled so short idle timers still reset while dragging. */
const MOVE_ACTIVITY_EVENTS = ['pointermove', 'touchmove', 'mousemove'] as const;

const MOVE_THROTTLE_MS = 300;
const TICK_MS = 250;
const LISTENER_OPTS: AddEventListenerOptions = { passive: true, capture: true };

interface SessionIdleProviderProps {
  children: ReactNode;
}

const settingsSignature = (settings: SessionSecuritySettings): string => {
  const normalized = normalizeSessionSecurity(settings);
  return `${normalized.enabled}:${normalized.idle_minutes}:${normalized.idle_action}`;
};

export const SessionIdleProvider: React.FC<SessionIdleProviderProps> = ({ children }) => {
  const { t } = useTranslation(['toast']);
  const db = useDB();
  const [page, setPage] = useAtom(appPage);
  const navigate = useNavigate();

  const dbRef = useRef(db);
  const pageRef = useRef(page);
  const setPageRef = useRef(setPage);
  const navigateRef = useRef(navigate);
  const tRef = useRef(t);
  const settingsRef = useRef<SessionSecuritySettings>(DEFAULT_SESSION_SECURITY);
  const settingsSigRef = useRef(settingsSignature(DEFAULT_SESSION_SECURITY));
  const deadlineRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const lastMoveResetRef = useRef(0);

  dbRef.current = db;
  pageRef.current = page;
  setPageRef.current = setPage;
  navigateRef.current = navigate;
  tRef.current = t;

  const clearDeadline = () => {
    deadlineRef.current = null;
  };

  const armDeadline = () => {
    firedRef.current = false;
    const current = pageRef.current;
    const settings = settingsRef.current;
    if (!current?.user || current.locked || !settings.enabled) {
      clearDeadline();
      return;
    }

    const minutes = normalizeIdleMinutes(settings.idle_minutes);
    deadlineRef.current = Date.now() + minutes * 60_000;
  };

  const enforce = () => {
    if (firedRef.current) {
      return;
    }
    const current = pageRef.current;
    if (!current?.user || current.locked) {
      return;
    }
    const settings = settingsRef.current;
    if (!settings.enabled) {
      return;
    }

    // Last-chance guard: if activity armed a deadline in the future, do not fire.
    const deadline = deadlineRef.current;
    if (deadline != null && Date.now() < deadline) {
      return;
    }

    firedRef.current = true;
    clearDeadline();

    const idleAction = normalizeSessionAction(settings.idle_action ?? settings.action);
    if (idleAction === 'logout') {
      toast.info(tRef.current('toast:sessionSecurity.autoLogout'));
      void logoutSession(setPageRef.current, navigateRef.current);
    } else {
      toast.info(tRef.current('toast:sessionSecurity.autoLock'));
      lockSession(setPageRef.current, navigateRef.current);
    }
  };

  const applySettings = (settings: SessionSecuritySettings, resetDeadline: boolean) => {
    const normalized = normalizeSessionSecurity(settings);
    const nextSig = settingsSignature(normalized);
    const changed = nextSig !== settingsSigRef.current;
    settingsRef.current = normalized;
    settingsSigRef.current = nextSig;
    if (resetDeadline || changed) {
      armDeadline();
    }
  };

  // Load / refresh settings
  useEffect(() => {
    let cancelled = false;
    const userId = page?.user?.id != null ? String(page.user.id) : null;

    const load = async (resetDeadline: boolean) => {
      if (!userId || pageRef.current?.locked) {
        settingsRef.current = DEFAULT_SESSION_SECURITY;
        settingsSigRef.current = settingsSignature(DEFAULT_SESSION_SECURITY);
        clearDeadline();
        return;
      }

      try {
        const settings = await loadSessionSecuritySettings(dbRef.current, userId);
        if (cancelled) return;
        applySettings(settings, resetDeadline);
      } catch (error) {
        console.error('Failed to load session security settings:', error);
        if (cancelled) return;
        applySettings(DEFAULT_SESSION_SECURITY, true);
      }
    };

    void load(true);

    const onSettingsChanged = () => {
      void load(true);
    };
    window.addEventListener(SESSION_SECURITY_CHANGED_EVENT, onSettingsChanged);

    // Occasional refresh without resetting an in-progress idle countdown
    const intervalId = setInterval(() => {
      void load(false);
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener(SESSION_SECURITY_CHANGED_EVENT, onSettingsChanged);
    };
  }, [page?.user?.id, page?.locked]);

  // Activity + deadline ticker
  useEffect(() => {
    const userId = page?.user?.id;
    if (!userId || page?.locked) {
      clearDeadline();
      return;
    }

    const onDiscreteActivity = () => {
      armDeadline();
    };

    const onMoveActivity = () => {
      const now = Date.now();
      if (now - lastMoveResetRef.current < MOVE_THROTTLE_MS) {
        return;
      }
      lastMoveResetRef.current = now;
      armDeadline();
    };

    for (const event of DISCRETE_ACTIVITY_EVENTS) {
      window.addEventListener(event, onDiscreteActivity, LISTENER_OPTS);
    }
    for (const event of MOVE_ACTIVITY_EVENTS) {
      window.addEventListener(event, onMoveActivity, LISTENER_OPTS);
    }

    armDeadline();

    const tickId = setInterval(() => {
      const deadline = deadlineRef.current;
      if (deadline == null || firedRef.current) {
        return;
      }
      if (Date.now() >= deadline) {
        enforce();
      }
    }, TICK_MS);

    return () => {
      for (const event of DISCRETE_ACTIVITY_EVENTS) {
        window.removeEventListener(event, onDiscreteActivity, LISTENER_OPTS);
      }
      for (const event of MOVE_ACTIVITY_EVENTS) {
        window.removeEventListener(event, onMoveActivity, LISTENER_OPTS);
      }
      clearInterval(tickId);
      clearDeadline();
    };
  }, [page?.user?.id, page?.locked]);

  return <>{children}</>;
};
