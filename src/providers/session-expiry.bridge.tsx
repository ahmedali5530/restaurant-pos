import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useSetAtom } from 'jotai';
import { appPage } from '@/store/jotai.ts';
import {
  getSessionToken,
  isGatewayAuthEnabled,
} from '@/lib/session.ts';
import { LOGIN } from '@/routes/posr.ts';

/**
 * When tokens are cleared (sync 401, Surreal refresh failure, etc.), force the
 * UI back to login — invalidateGatewaySession alone does not clear jotai user.
 */
export function SessionExpiryBridge() {
  const setPage = useSetAtom(appPage);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isGatewayAuthEnabled()) {
      return;
    }

    const onSession = () => {
      if (getSessionToken()) {
        return;
      }
      setPage((prev) => ({
        ...prev,
        page: 'Login',
        user: undefined,
        locked: false,
        lockedBy: undefined,
      }));
      navigate(LOGIN, { replace: true });
    };

    window.addEventListener('posr-session', onSession);
    return () => {
      window.removeEventListener('posr-session', onSession);
    };
  }, [navigate, setPage]);

  return null;
}
