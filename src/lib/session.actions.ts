import { NavigateFunction } from 'react-router';
import { AppPageInterface } from '@/store/jotai.ts';
import { LOGIN } from '@/routes/posr.ts';
import {
  clearSessionTokens,
  gatewayLogout,
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

export const logoutSession = async (
  setPage: SetAppPage,
  navigate: NavigateFunction
): Promise<void> => {
  await clearGatewaySession();

  setPage((prev) => ({
    ...prev,
    page: 'Login',
    user: undefined,
    locked: false,
    lockedBy: undefined,
  }));
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
