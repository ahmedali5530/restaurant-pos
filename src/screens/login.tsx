import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBackspace, faCircle, faClock } from "@fortawesome/free-solid-svg-icons";
import {faCircle as circleRegular} from '@fortawesome/free-regular-svg-icons';
import {useEffect, useLayoutEffect, useState} from "react";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { cn, toRecordId } from "@/lib/utils.ts";
import { DbNotReadyError, useDB } from "@/api/db/db.ts";
import { useDatabase } from "@/hooks/useDatabase.ts";
import { User } from "@/api/model/user.ts";
import {useNavigate, useLocation} from "react-router";
import {DESKTOP_SETUP, DESKTOP_LOGS} from "@/routes/posr.ts";
import {getDesktopStatus, isTauriDesktop, type DesktopStatus} from "@/lib/desktop.ts";
import {getDefaultAppPath} from "@/lib/build-modules.ts";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Tables } from "@/api/db/tables.ts";
import { toast } from "sonner";
import { getUserModules } from "@/lib/access.rules.ts";
import { UserRole } from "@/api/model/user_role.ts";
import { Input } from "@/components/common/input/input.tsx";
import { clockIn as laborClockIn } from "@/lib/labor-engine/attendance/attendance.service.ts";
import { ensureEmployeeForUser } from "@/lib/labor-engine/employee.resolver.ts";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n.ts";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { PageLoader } from "@/components/common/loader/page-loader.tsx";
import {
  clearSessionTokens,
  gatewayLogin,
  getSessionToken,
  isGatewayAuthEnabled,
  setSessionTokens,
  type GatewayLoginResponse,
} from "@/lib/session.ts";
import { fetchLoginBrandLogo } from "@/lib/branding.ts";
import { LoginAurora } from "@/screens/login-aurora.tsx";

const TIME_ENTRY_CHECK_RETRIES = 3;
const TIME_ENTRY_RETRY_DELAY_MS = 400;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

type LoginMethod = 'pin' | 'form';

/** Default login tab from VITE_DEFAULT_LOGIN_METHOD (`pin` | `form`). Falls back to pin. */
const getDefaultLoginMethod = (): LoginMethod => {
  const raw = String(import.meta.env.VITE_DEFAULT_LOGIN_METHOD ?? 'pin').toLowerCase().trim();
  return raw === 'form' ? 'form' : 'pin';
};

const sleep = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, ms);
});

const formatRetryMinutes = (retryAfterMs?: number, lockoutMs?: number) => {
  const ms = retryAfterMs ?? lockoutMs ?? LOGIN_LOCKOUT_MINUTES * 60 * 1000;
  return Math.max(1, Math.ceil(ms / 60000));
};

export const Login = () => {
  const db = useDB();
  const { connect } = useDatabase();
  const { t } = useTranslation('auth');
  const { t: tCommon } = useTranslation('common');
  const gatewayAuth = isGatewayAuthEnabled();

  const [code, setCode] = useState('');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>(getDefaultLoginMethod);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [page, setPage] = useAtom(appPage);
  const [error, setError] = useState(false);
  const [showClockInModal, setShowClockInModal] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);

  const navigation = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isTauriDesktop()) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await getDesktopStatus();
        if (cancelled) return;
        setDesktopStatus(status);
        if (status?.needsSetup) {
          navigation(DESKTOP_SETUP, { replace: true });
        }
      } catch {
        // Gateway may still be starting; stay on login.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;
    void fetchLoginBrandLogo(gatewayAuth ? null : db).then((logo) => {
      if (!cancelled) setBrandLogo(logo);
    });
    return () => {
      cancelled = true;
    };
  }, [gatewayAuth]);

  const onClear = () => {
    setCode('');
  }

  const onBack = () => {
    setCode(prev => prev.slice(0, prev.length - 1));
  }

  const onKey = (key: string) => {
    // Functional update so two keystrokes in the same tick can't both read a
    // stale `code` and drop one of the digits.
    setCode(prev => (prev.trim().length <= 3 ? prev + key : prev));
  }

  // The PIN pad only ever had onClick handlers on its visible buttons — a
  // physical keyboard's digit keys did nothing. Mirror the same digits,
  // Backspace, and Escape/Delete (clear) while the PIN method is active.
  useEffect(() => {
    if (loginMethod !== 'pin') return;

    const onPhysicalKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        onKey(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        onBack();
      } else if (event.key === 'Escape' || event.key === 'Delete') {
        event.preventDefault();
        onClear();
      }
    };

    window.addEventListener('keydown', onPhysicalKeyDown);
    return () => window.removeEventListener('keydown', onPhysicalKeyDown);
  }, [loginMethod, code]);

  const failConnection = () => {
    clearSessionTokens();
    toast.error(i18n.t('auth:login.connectionFailed', { defaultValue: 'Database connection failed after login' }));
    denyLogin();
  };

  const afterUserAuthenticated = async (normalizedUser: User) => {
    if (page.locked && page.lockedBy?.login !== normalizedUser.login) {
      denyLogin();
      return false;
    }

    for (let attempt = 0; attempt < TIME_ENTRY_CHECK_RETRIES; attempt++) {
      try {
        const timeEntryCheck = await db.query(
          `SELECT * from ${Tables.time_entries} where user = $userId and clock_out = NONE and platform = $platform`,
          {
            userId: toRecordId(normalizedUser.id),
            platform: 'web',
          }
        );

        const rows = timeEntryCheck?.[0];
        if (!Array.isArray(rows)) {
          throw new Error('Unexpected time entry query result');
        }

        if (rows.length === 0) {
          setPendingUser(normalizedUser);
          setShowClockInModal(true);
        } else {
          allowLogin(normalizedUser);
        }
        return true;
      } catch (err) {
        const errName = err instanceof Error ? err.name : '';
        const isNotReady =
          err instanceof DbNotReadyError ||
          errName === 'ConnectionUnavailable' ||
          errName === 'EngineDisconnected';
        console.error(err);

        if (attempt < TIME_ENTRY_CHECK_RETRIES - 1 && isNotReady) {
          try {
            await connect();
          } catch (connectErr) {
            console.error(connectErr);
          }
          await sleep(TIME_ENTRY_RETRY_DELAY_MS);
          continue;
        }

        if (gatewayAuth) {
          failConnection();
        } else {
          toast.error(i18n.t('auth:login.connectionFailed', { defaultValue: 'Database connection failed after login' }));
          denyLogin();
        }
        return false;
      }
    }

    return false;
  };

  const getLockoutPolicyMessage = () => t('login.lockoutPolicy', {
    maxAttempts: LOGIN_MAX_ATTEMPTS,
    lockoutMinutes: LOGIN_LOCKOUT_MINUTES,
    defaultValue: `After ${LOGIN_MAX_ATTEMPTS} failed attempts, your account will be locked for ${LOGIN_LOCKOUT_MINUTES} minutes.`,
  });

  const showLoginFailureToast = (result?: GatewayLoginResponse) => {
    const logsHint = isTauriDesktop()
      ? tCommon('desktopLogs.loginHint', {
          defaultValue: 'Open Desktop logs (gateway) for details.',
        })
      : undefined;

    if (result?.status === 429 || result?.retryAfterMs != null) {
      const minutes = formatRetryMinutes(result.retryAfterMs, result.lockoutMs);
      const message = result.code === 'rate_limited_ip'
        ? t('login.rateLimitedIp', { minutes, defaultValue: `Too many login attempts. Try again in ${minutes} minute(s).` })
        : t('login.rateLimited', { minutes, defaultValue: `Too many login attempts. Try again in ${minutes} minute(s).` });
      toast.error(message, { description: logsHint });
      return;
    }

    const lockoutPolicy = gatewayAuth ? getLockoutPolicyMessage() : undefined;
    const detail = [result?.error, result?.code ? `(${result.code})` : null, result?.status ? `HTTP ${result.status}` : null]
      .filter(Boolean)
      .join(' ');

    if (result?.attemptsRemaining != null && result.attemptsRemaining > 0) {
      toast.error(t('login.invalidCredentialsWithAttempts', {
        count: result.attemptsRemaining,
        defaultValue: `Invalid username or password. ${result.attemptsRemaining} attempt(s) remaining before lockout.`,
      }), { description: [lockoutPolicy, detail, logsHint].filter(Boolean).join(' ') });
      return;
    }

    toast.error(
      detail || t('login.invalidCredentials'),
      { description: [lockoutPolicy, logsHint].filter(Boolean).join(' ') },
    );
  };

  const handleLoginFailure = (result?: GatewayLoginResponse) => {
    showLoginFailureToast(result);
    denyLogin();
  };

  const checkLoginGateway = async (login: string, pass: string, method: 'pin'|'form') => {
    const result = await gatewayLogin({ method, login, password: pass });
    if (!result.ok || !result.token || !result.surrealToken || !result.user) {
      handleLoginFailure(result);
      return false;
    }

    setSessionTokens(result.token, result.surrealToken);

    try {
      // Connect before announcing the session so Login stays mounted.
      await connect();
    } catch (err) {
      console.error(err);
      failConnection();
      return false;
    }

    const loggedInUser = result.user as User;
    const normalizedUser = {
      ...loggedInUser,
      roles: (loggedInUser as User & { roles?: string[] }).roles?.length
        ? (loggedInUser as User & { roles?: string[] }).roles!
        : getUserModules(loggedInUser),
    } as User;

    // Finish clock-in status check while Login is still mounted (session not announced yet).
    const ok = await afterUserAuthenticated(normalizedUser);
    // Sync provider with token presence (cleared on connection failure).
    window.dispatchEvent(new Event('posr-session'));
    return ok;
  };

  const checkLoginLegacy = async (login: string, pass: string, method: 'pin'|'form') => {
    const query = method === 'pin'
      ? `SELECT * from ${Tables.users} where login = $login and deleted_at = none and (login_method = 'pin' OR login_method = NONE) and crypto::bcrypt::compare(password, $password) = true fetch user_role, user_shift`
      : `SELECT * from ${Tables.users} where login = $login and deleted_at = none and login_method = 'form' and crypto::bcrypt::compare(password, $password) = true fetch user_role, user_shift`;

    const record: any = await db.query(query, {
      login: login,
      password: pass,
    });

    if (record[0].length > 0) {
      const loggedInUser = record[0][0];
      const roleId = typeof loggedInUser.user_role === "object" ? loggedInUser.user_role?.id : loggedInUser.user_role;
      let fetchedRole: UserRole | undefined;

      if (roleId) {
        const [roleRecords]: any = await db.query(`SELECT * FROM ${Tables.user_roles} WHERE id = $roleId AND deleted_at = none LIMIT 1`, {
          roleId,
        });
        fetchedRole = roleRecords?.[0];
      }

      const normalizedUser = {
        ...loggedInUser,
        user_role: fetchedRole || loggedInUser.user_role,
        roles: fetchedRole
          ? [...new Set(fetchedRole.roles || [])]
          : getUserModules(loggedInUser),
      };

      return afterUserAuthenticated(normalizedUser);
    }

    showLoginFailureToast();
    denyLogin();
    return false;
  };

  const checkLogin = async (login: string, pass: string, method: 'pin'|'form') => {
    if ((method === 'pin' && login.trim().length === 4) || (method === 'form' && login.trim() && pass.trim())) {
      setIsAuthenticating(true);
      try {
        if (gatewayAuth) {
          return await checkLoginGateway(login, pass, method);
        }
        return await checkLoginLegacy(login, pass, method);
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : String(err);
        toast.error(t('login.networkError', {
          defaultValue: 'Login request failed',
        }), {
          description: [
            message,
            isTauriDesktop()
              ? tCommon('desktopLogs.loginHint', { defaultValue: 'Open Desktop logs (gateway) for details.' })
              : null,
          ].filter(Boolean).join(' — '),
        });
        denyLogin();
        return false;
      } finally {
        setIsAuthenticating(false);
      }
    }
  }

  const allowLogin = (user: User) => {
    setPage(prev => ({
      ...prev,
      page: 'Menu',
      locked: false,
      lockedBy: undefined,
      user: user
    }));

    setCode('');
    setUsername('');
    setPassword('');
    setShowClockInModal(false);
    setPendingUser(null);

    navigation(getDefaultAppPath());
  }

  const handleClockIn = async () => {
    if(!pendingUser) return;

    try {
      const employee = await ensureEmployeeForUser(db, pendingUser);
      await laborClockIn(db, {
        user: pendingUser,
        employeeId: employee.id,
        platform: 'web',
        shiftTemplateId: pendingUser.user_shift?.id,
      });

      toast.success(i18n.t('auth:clockIn.success'));
      allowLogin(pendingUser);
    } catch (error) {
      toast.error(i18n.t('auth:clockIn.failed'));
      console.error(error);
    }
  }

  const denyLogin = () => {
    setCode('');
    setPassword('');
    setError(true);
  }

  useEffect(() => {
    if (loginMethod === 'pin') {
      void checkLogin(code, code, 'pin').catch((err) => {
        console.error(err);
        setIsAuthenticating(false);
        denyLogin();
      });
    }
  }, [code]);

  useEffect(() => {
    if(error){
      setTimeout(() => setError(false), 400);
    }
  }, [error]);

  useLayoutEffect(() => {
    // Gateway mode: user may exist in localStorage from another tab without a JWT here —
    // do not bounce back to the protected route or we loop Login ↔ report forever.
    if (gatewayAuth && !getSessionToken()) {
      return;
    }
    if (page.user && !page.locked) {
      const from = (location.state as { from?: { pathname: string; search?: string } })?.from;
      const returnPath = from
        ? `${from.pathname}${from.search ?? ''}`
        : getDefaultAppPath();
      navigation(returnPath, { replace: true });
    }
  }, [gatewayAuth, page.user, page.locked, location.state, navigation]);

  if (isAuthenticating) {
    return (
      <>
        <DocumentTitle parts={[t('login.title')]} />
        <PageLoader message={tCommon('database.connecting')} />
      </>
    );
  }

  return (
    <div className="relative" data-testid="login-page">
      <DocumentTitle parts={[t('login.title')]} />
      <div className="bg-neutral-900 flex flex-col lg:flex-row min-h-screen">
        <aside
          className="relative z-10 flex flex-col items-center justify-center gap-6 px-8 py-10 lg:w-2/5 lg:min-h-screen border-b lg:border-b-0 lg:border-r border-neutral-700"
          data-testid="login-branding-panel"
        >
          {brandLogo && (
            <>

              {import.meta.env.VITE_RESTAURANT_NAME && (
                <h1 className="text-4xl">{import.meta.env.VITE_RESTAURANT_NAME}</h1>
              )}
              <img
                src={brandLogo}
                alt={t('login.brandLogoAlt')}
                className="max-h-28 sm:max-h-36 max-w-[220px] sm:max-w-[280px] object-contain"
                data-testid="login-brand-logo"
              />
              <div className="w-24 sm:w-32 border-t border-neutral-600" aria-hidden="true" />
            </>
          )}
          <img
            src="/pwa-512.png"
            alt={t('login.posrLogoAlt')}
            className="w-28 h-28 sm:w-36 sm:h-36 object-contain rounded-2xl"
            data-testid="login-posr-logo"
          />
        </aside>
        <div className="relative isolate flex-1 flex justify-center items-center flex-col gap-8 px-4 py-10 overflow-hidden">
          <LoginAurora />
          <h4 className="text-4xl text-neutral-100">{t('login.title')}</h4>
          {isTauriDesktop() && desktopStatus && (
            <div className="text-sm text-neutral-300 flex flex-col items-center gap-1">
              <span>
                Surreal: {desktopStatus.surrealReady ? 'up' : 'down'} · Gateway:{' '}
                {desktopStatus.gatewayReady ? 'up' : 'down'}
              </span>
              <button
                type="button"
                className="underline text-neutral-200"
                onClick={() => navigation(DESKTOP_LOGS)}
              >
                {tCommon('desktopLogs.openLink', { defaultValue: 'Open desktop logs' })}
              </button>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              data-testid="login-method-pin"
              className={cn(
                "w-56 border-2 transition-all duration-150 btn btn-filled lg",
                loginMethod === 'pin'
                  ? "!bg-warning text-black border-warning"
                  : "!bg-black text-white"
              )}
              onClick={() => {
                setLoginMethod('pin');
                setError(false);
                setUsername('');
                setPassword('');
                setCode('');
              }}
            >
              {t('login.pin')}
            </button>
            <button
              type="button"
              data-testid="login-method-form"
              className={cn(
                "w-56 border-2 transition-all duration-150 btn btn-filled lg",
                loginMethod === 'form'
                  ? "!bg-warning text-black border-warning"
                  : "!bg-black text-white"
              )}
              onClick={() => {
                setLoginMethod('form');
                setError(false);
                setUsername('');
                setPassword('');
                setCode('');
              }}
            >
              {t('login.form')}
            </button>
          </div>
          {page.locked && (
            <div className="alert alert-warning" data-testid="login-locked-banner">{t('login.systemLocked', {
              name: `${page?.lockedBy?.first_name ?? ''} ${page?.lockedBy?.last_name ?? ''}`.trim()
            })}</div>
          )}
          {loginMethod === 'pin' && (
            <>
              <div className={
                cn(
                  "flex gap-3 text-neutral-100",
                  error && 'login-error'
                )
              }>
                <FontAwesomeIcon size="lg" icon={code.trim().length >= 1 ? faCircle : circleRegular} />
                <FontAwesomeIcon size="lg" icon={code.trim().length >= 2 ? faCircle : circleRegular} />
                <FontAwesomeIcon size="lg" icon={code.trim().length >= 3 ? faCircle : circleRegular} />
                <FontAwesomeIcon size="lg" icon={code.trim().length === 4 ? faCircle : circleRegular} />
              </div>
              <div className="wrapper w-[400px]" data-testid="login-pin-pad">
                <div className="grid grid-cols-3 gap-2 sm:gap-5 place-items-center">
                  <button type="button" onClick={() => onKey('1')} className="btn-login">1</button>
                  <button type="button" onClick={() => onKey('2')} className="btn-login">2</button>
                  <button type="button" onClick={() => onKey('3')} className="btn-login">3</button>
                  <button type="button" onClick={() => onKey('4')} className="btn-login">4</button>
                  <button type="button" onClick={() => onKey('5')} className="btn-login">5</button>
                  <button type="button" onClick={() => onKey('6')} className="btn-login">6</button>
                  <button type="button" onClick={() => onKey('7')} className="btn-login">7</button>
                  <button type="button" onClick={() => onKey('8')} className="btn-login">8</button>
                  <button type="button" onClick={() => onKey('9')} className="btn-login">9</button>
                  <button type="button" onClick={onBack} className="btn-login danger"><FontAwesomeIcon icon={faBackspace}/>
                  </button>
                  <button type="button" onClick={() => onKey('0')} className="btn-login">0</button>
                  <button type="button" onClick={onClear} className="btn-login danger">C</button>
                </div>
              </div>
            </>
          )}
          {loginMethod === 'form' && (
            <form
              className="w-[400px] flex flex-col gap-3"
              data-testid="login-form"
              onSubmit={async (event) => {
                event.preventDefault();
                await checkLogin(username, password, 'form');
              }}
            >
              <div>
                <label className="text-white" htmlFor="username">{t('login.username')}</label>
                <Input
                  id="username"
                  data-testid="login-username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div>
                <label className="text-white" htmlFor="password">{t('login.password')}</label>
                <Input
                  id="password"
                  data-testid="login-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <Button type="submit" variant="primary" data-testid="login-submit">{t('login.submit')}</Button>
            </form>
          )}
        </div>
      </div>

      {showClockInModal && (
        <Modal
          open={showClockInModal}
          onClose={() => {
            setShowClockInModal(false);
            setPendingUser(null);
            setCode('');
          }}
          title={t('clockIn.title')}
          shouldCloseOnOverlayClick={false}
          shouldCloseOnEsc={false}
        >
          <div className="flex flex-col gap-4 items-center">
            <div className="text-lg alert alert-danger">
              {t('clockIn.message')}
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={handleClockIn}
                icon={faClock}
                size="xl"
                data-testid="login-clock-in"
              >
                {t('clockIn.action')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
