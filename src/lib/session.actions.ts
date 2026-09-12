import { NavigateFunction } from 'react-router';
import { AppPageInterface } from '@/store/jotai.ts';
import { LOGIN } from '@/routes/posr.ts';
import {
  clearSessionTokens,
  gatewayLogout,
  invalidateGatewaySession,
  isGatewayAuthEnabled,
} from '@/lib/session.ts';

type SetAppPage = (
  updater: AppPageInterface | ((prev: AppPageInterface) => AppPageInterface)
) => void;

const SESSION_EVENT = 'posr-session';

async function clearGatewaySession(): Promise<void> {
  if (!isGatewayAuthEnabled()) {
    return;
  }
  await gatewayLogout();
  clearSessionTokens();
  window.dispatchEvent(new Event(SESSION_EVENT));
}

const clearLocalAuthState = (setPage: SetAppPage) => {
  setPage((prev) => ({
    ...prev,
    page: 'Login',
    user: undefined,
    locked: false,
    lockedBy: undefined,
  }));
};

/**
 * Hard session kill when the gateway rejects the POS JWT (e.g. sync 401).
 * Clears tokens + jotai user and navigates to login. Does not call gateway
 * logout (the session is already invalid).
 */
export const forceSessionExpiredLogout = (
  setPage: SetAppPage,
  navigate: NavigateFunction
): void => {
  invalidateGatewaySession();
  clearLocalAuthState(setPage);
  navigate(LOGIN, { replace: true });
};

export const logoutSession = async (
  setPage: SetAppPage,
  navigate: NavigateFunction
): Promise<void> => {
  await clearGatewaySession();
  clearLocalAuthState(setPage);
  navigate(LOGIN);
};

export const lockSession = (setPage: SetAppPage, navigate: NavigateFunction) => {
  setPage((prev) => {
    const lockedBy = prev.user ?? prev.lockedBy;
    return {
      ...prev,
      page: 'Login',
      // Keep the user on the session so unlock + lock banner work like the sidebar lock.
      user: lockedBy,
      locked: true,
      lockedBy,
    };
  });
  navigate(LOGIN);
};
