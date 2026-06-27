import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBarChart,
  faBars,
  faClipboardList,
  faGear, faLineChart,
  faDisplay,
  faList, faLock,
  faMotorcycle,
  faStore,
  faUtensils, faWarehouse, faWrench,
  faClock,
  faPowerOff
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/common/input/button.tsx";
import { CSSProperties, useMemo } from "react";
import {NavLink, useNavigate} from "react-router";
import {
  ADMIN,
  CLOSING,
  CLOCK,
  DELIVERY,
  INVENTORY,
  KITCHEN,
  ORDER_DISPLAY,
  LOGIN,
  MENU,
  ORDERS,
  REPORTS,
  SETTINGS,
  SUMMARY,
  TIP_DISTRIBUTION, ACCOUNTS
} from "@/routes/posr.ts";
import { getUserModules } from "@/lib/access.rules.ts";
import { useSecurity } from "@/hooks/useSecurity.ts";
import ScrollContainer from "react-indiana-drag-scroll";
import { useTranslation } from "react-i18next";

export const Sidebar = () => {
  const [page, setPage] = useAtom(appPage);
  const { t } = useTranslation('navigation');

  const pathInfo = location.pathname;

  const navigation = useNavigate();
  const { protectAction } = useSecurity();

  const logout = () => {
    setPage(prev => ({
      ...prev,
      page: 'Login',
      user: undefined
    }));

    navigation(LOGIN);
  }

  const protectedNavigate = async (to: string, module?: string, description?: string) => {
    await protectAction(() => navigation(to), {
      description: description || t('authenticateToAccess', { module }),
      module,
    });
  }

  const lock = () => {
    setPage(prev => ({
      ...prev,
      page: 'Login',
      locked: true,
      lockedBy: prev.user
    }));

    navigation(LOGIN);
  }

  const allSidebarItems = useMemo(() => [
    { title: t('sidebar.menu'), icon: <FontAwesomeIcon icon={faBars} size="lg"/>, link: MENU, role: 'Menu' },
    { title: t('sidebar.orders'), icon: <FontAwesomeIcon icon={faList} size="lg"/>, link: ORDERS, role: 'Orders' },
    { title: t('sidebar.summary'), icon: <FontAwesomeIcon icon={faClipboardList} size="lg"/>, link: SUMMARY, role: 'Summary' },
    { title: t('sidebar.kitchen'), icon: <FontAwesomeIcon icon={faUtensils} size="lg"/>, link: KITCHEN, role: 'Kitchen' },
    // { title: t('sidebar.orderDisplay'), icon: <FontAwesomeIcon icon={faDisplay} size="lg"/>, link: ORDER_DISPLAY, role: 'Order Display' },
    { title: t('sidebar.delivery'), icon: <FontAwesomeIcon icon={faMotorcycle} size="lg"/>, link: DELIVERY, role: 'Delivery' },
    { title: t('sidebar.closing'), icon: <FontAwesomeIcon icon={faStore} size="lg"/>, link: CLOSING, role: 'Closing' },
    { title: t('sidebar.inventory'), icon: <FontAwesomeIcon icon={faWarehouse} size="lg"/>, link: INVENTORY, role: 'Inventory' },
    { title: t('sidebar.manage'), icon: <FontAwesomeIcon icon={faGear} size="lg"/>, link: ADMIN, role: 'Admin' },
    { title: t('sidebar.reports'), icon: <FontAwesomeIcon icon={faLineChart} size="lg"/>, link: REPORTS, role: 'Reports' },
    { title: t('sidebar.tipDist'), icon: <FontAwesomeIcon icon={faBarChart} size="lg"/>, link: TIP_DISTRIBUTION, role: 'Tips' },
    { title: t('sidebar.accounts'), icon: <FontAwesomeIcon icon={faBarChart} size="lg"/>, link: ACCOUNTS, role: 'Accounts' },
  ], [t]);

  // Filter sidebar items based on user roles
  const userRoles = getUserModules(page.user);
  const sidebarItems = allSidebarItems.filter(item => {
    return true; // show all pages and handle the auth to manage pages permissions

    // If user has no roles, show nothing (or you could show all if that's the desired behavior)
    if (userRoles.length === 0) {
      // return false;
    }
    // Check if user has the required role for this item
    return userRoles.includes(item.role);
  });

  return (
    <div className="flex flex-col justify-between h-screen items-center sidebar border border-y-0 border-white bg-white/50 backdrop-blur">
      <div className="w-full">
        <ScrollContainer className="h-[calc(100vh_-_150px)]">
          <div className="p-2 flex flex-col">
            {sidebarItems.map(item => (
              <button
                onClick={() => {
                  protectedNavigate(item.link, item.role);
                }}
                className={cn(
                  'flex flex-col text-center cursor-pointer p-[0.4rem] gap-1 rounded-xl pressable no-underline w-full',
                  pathInfo === item.link ? 'shadow-xl bg-gradient active:shadow-none' : 'text-neutral-900 border-[3px] border-transparent'
                )}
                key={item.title}
                style={{
                  '--padding': '0.4rem'
                } as CSSProperties}
              >
                <span className="icon">{item.icon}</span>
                <span className="label text-[12px]">{item.title}</span>
              </button>
            ))}
          </div>
        </ScrollContainer>
      </div>
      <div className="flex flex-col gap-2 w-full p-2">
        <div className="input-group">
          <button
            onClick={() => protectedNavigate(SETTINGS, 'Settings')}
            className={cn(
              'btn btn-primary lg flex-1',
              pathInfo === SETTINGS ? 'active' : ''
            )}
            key={'settings'}
            style={{
              '--padding': '0.5rem'
            } as CSSProperties}
          >
            <FontAwesomeIcon icon={faWrench} />
          </button>
          <NavLink
            to={CLOCK}
            className={cn(
              'btn btn-primary lg flex-1',
              pathInfo === CLOCK ? 'active' : ''
            )}
            style={{
              '--padding': '0.5rem'
            } as CSSProperties}
          >
            <FontAwesomeIcon icon={faClock} />
          </NavLink>
        </div>
        <div className="input-group">
          <Button className="flex-1" variant="primary" onClick={lock} size="lg">
            <FontAwesomeIcon icon={faLock} />
          </Button>
          <Button className="flex-1" variant="danger" onClick={logout} size="lg">
            <FontAwesomeIcon icon={faPowerOff} />
          </Button>
        </div>
      </div>
    </div>
  )
}
