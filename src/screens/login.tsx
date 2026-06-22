import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBackspace, faCircle, faClock } from "@fortawesome/free-solid-svg-icons";
import {faCircle as circleRegular} from '@fortawesome/free-regular-svg-icons';
import {useEffect, useLayoutEffect, useState} from "react";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { cn } from "@/lib/utils.ts";
import { useDB } from "@/api/db/db.ts";
import { User } from "@/api/model/user.ts";
import {useNavigate, useLocation} from "react-router";
import {MENU} from "@/routes/posr.ts";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Tables } from "@/api/db/tables.ts";
import { toast } from "sonner";
import { getUserModules } from "@/lib/access.rules.ts";
import { UserRole } from "@/api/model/user_role.ts";
import { Input } from "@/components/common/input/input.tsx";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n.ts";

export const Login = () => {
  const db = useDB();
  const { t } = useTranslation('auth');

  const [code, setCode] = useState('');
  const [loginMethod, setLoginMethod] = useState<'pin'|'form'>('pin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [page, setPage] = useAtom(appPage);
  const [error, setError] = useState(false);
  const [showClockInModal, setShowClockInModal] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  const navigation = useNavigate();
  const location = useLocation();

  const onClear = () => {
    setCode('');
  }

  const onBack = () => {
    setCode(prev => prev.slice(0, prev.length - 1));
  }

  const onKey = (key: string) => {
    if(code.trim().length <= 3){
      setCode(code + key);
    }
  }

  const checkLogin = async (login: string, pass: string, method: 'pin'|'form') => {
    if ((method === 'pin' && login.trim().length === 4) || (method === 'form' && login.trim() && pass.trim())) {
      const query = method === 'pin'
        ? `SELECT * from ${Tables.users} where login = $login and deleted_at = none and (login_method = 'pin' OR login_method = NONE) and crypto::bcrypt::compare(password, $password) = true fetch user_role, user_shift`
        : `SELECT * from ${Tables.users} where login = $login and deleted_at = none and login_method = 'form' and crypto::bcrypt::compare(password, $password) = true fetch user_role, user_shift`;

      const record: any = await db.query(query, {
        login: login,
        password: pass,
      });

      if(record[0].length > 0){
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

        if(page.locked && page.lockedBy?.login !== record[0][0].login){
          denyLogin();
          return false;
        }

        // Check for active time entry
        const timeEntryCheck: any = await db.query(`SELECT * from ${Tables.time_entries} where user = $userId and clock_out = NONE and platform = $platform`, {
          userId: record[0][0].id,
          platform: 'web'
        });

        if(timeEntryCheck[0].length === 0){
          // No active time entry, show clock-in modal
          setPendingUser(normalizedUser);
          setShowClockInModal(true);
        } else {
          // Active time entry exists, proceed with login
          allowLogin(normalizedUser);
        }
      }else{
        denyLogin();
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

    // redirect to menu
    navigation(MENU);
  }

  const handleClockIn = async () => {
    if(!pendingUser) return;

    try {
      const now = nowSurrealDateTime();
      await db.create(Tables.time_entries, {
        clock_in: now,
        user: (pendingUser.id),
        platform: 'web'
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
      checkLogin(code, code, 'pin');
    }
  }, [code]);

  useEffect(() => {
    if(error){
      setTimeout(() => setError(false), 400);
    }
  }, [error]);

  useLayoutEffect(() => {
    if(page.user && !page.locked){
      const from = (location.state as { from?: { pathname: string; search?: string } })?.from;
      const returnPath = from ? `${from.pathname}${from.search ?? ''}` : MENU;
      navigation(returnPath, { replace: true });
    }
  }, [page.user, page.locked, location.state, navigation]);

  return (
    <div className="relative">
      <div className="bg-neutral-900 flex justify-center items-center h-screen flex-col gap-8">
        <h4 className="text-4xl text-neutral-100">{t('login.title')}</h4>
        <div className="flex gap-3">
          <button
            className={cn(
              "w-56 border-2 transition-all duration-150 btn btn-filled lg",
              loginMethod === 'pin'
                ? "!bg-warning-500 text-black border-warning-500"
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
            className={cn(
              "w-56 border-2 transition-all duration-150 btn btn-filled lg",
              loginMethod === 'form'
                ? "!bg-warning-500 text-black border-warning-500"
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
          <div className="alert alert-warning">{t('login.systemLocked', {
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
            <div className="wrapper w-[400px]">
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
            onSubmit={async (event) => {
              event.preventDefault();
              await checkLogin(username, password, 'form');
            }}
          >
            <div>
              <label className="text-white" htmlFor="username">{t('login.username')}</label>
              <Input
                id="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            
            <div>
              <label className="text-white" htmlFor="password">{t('login.password')}</label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button type="submit" variant="primary">{t('login.submit')}</Button>
          </form>
        )}
        {error && loginMethod === 'form' && (
          <div className="text-danger-500 text-sm">{t('login.invalidCredentials')}</div>
        )}
      </div>
      <div className="size-[100px] bg-warning-500/10 absolute top-10 right-[30%] rounded-full pointer-events-none transition-all blur-lg"></div>
      <div className="size-[200px] bg-primary-500/10 animate-bounce absolute top-20 left-[20%] rounded-full pointer-events-none transition-all blur-2xl"></div>
      <div className="size-[200px] bg-white/20 absolute bottom-[100px] transition-all right-24 pointer-events-none rotate-45 blur-2xl"></div>
      <div className="size-[200px] bg-[tomato]/20 absolute bottom-[30%] transition-all left-[150px] pointer-events-none blur-2xl"></div>

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
