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
  faUtensils, faUsers, faWarehouse, faWrench,
  faClock,
  faPowerOff,
  faReceipt,
  faUser,
  faPlug
} from "@fortawesome/free-solid-svg-icons";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { CSSProperties, useMemo } from "react";
import {NavLink, useNavigate} from "react-router";
import {
  ADMIN,
  CLOSING,
  CLOCK,
  DELIVERY,
  INVENTORY,
  HR,
  KITCHEN,
  ORDER_DISPLAY,
  MENU,
  ORDERS,
  REPORTS,
  SETTINGS,
  INTEGRATIONS,
  SUMMARY,
  TIP_DISTRIBUTION, ACCOUNTS
} from "@/routes/posr.ts";
import { getAccessRuleChildLabel } from "@/lib/access.rules.i18n.ts";
import { getUserModules, moduleMatchCandidates } from "@/lib/access.rules.ts";
import { useSecurity } from "@/hooks/useSecurity.ts";
import ScrollContainer from "react-indiana-drag-scroll";
import { useTranslation } from "react-i18next";
import { lockSession, logoutSession } from "@/lib/session.actions.ts";
import { SecurityAlertsBadge } from "@/components/admin/security-alerts/alert-badge.tsx";

const SIDEBAR_NAV_TEST_IDS: Partial<Record<string, string>> = {
  [MENU]: 'nav-menu',
  [ORDERS]: 'nav-orders',
  [SUMMARY]: 'nav-summary',
  [KITCHEN]: 'nav-kitchen',
  [ORDER_DISPLAY]: 'nav-order-display',
  [DELIVERY]: 'nav-delivery',
  [CLOSING]: 'nav-closing',
  [INVENTORY]: 'nav-inventory',
  [ADMIN]: 'nav-admin',
  [REPORTS]: 'nav-reports',
  [TIP_DISTRIBUTION]: 'nav-tip-distribution',
  [ACCOUNTS]: 'nav-accounts',
  [HR]: 'nav-hr',
  [INTEGRATIONS]: 'nav-integrations',
};

export const Sidebar = () => {
  const [page, setPage] = useAtom(appPage);
  const { t } = useTranslation(['navigation', 'common']);

  const pathInfo = location.pathname;

  const navigation = useNavigate();
  const { protectAction } = useSecurity();

  const logout = () => {
    void logoutSession(setPage, navigation);
  }

  const protectedNavigate = async (to: string, module?: string, description?: string) => {
    await protectAction(() => navigation(to), {
      description: description || t('authenticateToAccess', { module }),
      module,
    });
  }

  const lock = () => {
    void protectAction(() => lockSession(setPage, navigation), {
      description: getAccessRuleChildLabel('settings.access_control'),
      module: 'settings.access_control',
    });
  }

  const allSidebarItems = useMemo(() => [
    { title: t('sidebar.menu'), icon: <FontAwesomeIcon icon={faBars} size="lg"/>, link: MENU, role: 'menu' },
    { title: t('sidebar.orders'), icon: <FontAwesomeIcon icon={faList} size="lg"/>, link: ORDERS, role: 'orders' },
    { title: t('sidebar.summary'), icon: <FontAwesomeIcon icon={faClipboardList} size="lg"/>, link: SUMMARY, role: 'summary' },
    { title: t('sidebar.kitchen'), icon: <FontAwesomeIcon icon={faUtensils} size="lg"/>, link: KITCHEN, role: 'kitchen' },
    { title: t('sidebar.orderDisplay'), icon: <FontAwesomeIcon icon={faDisplay} size="lg"/>, link: ORDER_DISPLAY, role: 'order_display' },
    { title: t('sidebar.delivery'), icon: <FontAwesomeIcon icon={faMotorcycle} size="lg"/>, link: DELIVERY, role: 'delivery' },
    { title: t('sidebar.closing'), icon: <FontAwesomeIcon icon={faStore} size="lg"/>, link: CLOSING, role: 'closing' },
    { title: t('sidebar.inventory'), icon: <FontAwesomeIcon icon={faWarehouse} size="lg"/>, link: INVENTORY, role: 'inventory' },
    { title: t('sidebar.manage'), icon: <FontAwesomeIcon icon={faGear} size="lg"/>, link: ADMIN, role: 'admin' },
    { title: t('sidebar.reports'), icon: <FontAwesomeIcon icon={faLineChart} size="lg"/>, link: REPORTS, role: 'reports' },
    { title: t('sidebar.tipDist'), icon: <FontAwesomeIcon icon={faBarChart} size="lg"/>, link: TIP_DISTRIBUTION, role: 'tips' },
    { title: t('sidebar.accounts'), icon: <FontAwesomeIcon icon={faReceipt} size="lg"/>, link: ACCOUNTS, role: 'accounts' },
    { title: t('sidebar.hr'), icon: <FontAwesomeIcon icon={faUsers} size="lg"/>, link: HR, role: 'hr' },
    { title: t('sidebar.integrations'), icon: <FontAwesomeIcon icon={faPlug} size="lg"/>, link: INTEGRATIONS, role: 'integrations' },
  ], [t]);

  // Every section stays visible and tappable to everyone — the actual gate
  // is protectedNavigate's PIN prompt on click. hasModuleAccess is display
  // only: it dims/blurs sections the current user can't open directly, so
  // people aren't surprised by a PIN prompt on something that looked just
  // as available as everything else.
  const userRoles = getUserModules(page.user);
  const hasModuleAccess = (moduleId?: string) => {
    if (!moduleId) return true;
    return moduleMatchCandidates(moduleId).some((candidate) => userRoles.includes(candidate));
  };
  const sidebarItems = allSidebarItems;

  return (
    <div className="flex flex-col justify-between h-[calc(100vh_-_var(--app-toolbar-h))] items-center sidebar border border-y-0 border-border bg-surface-elevated/50 backdrop-blur text-foreground">
      <div className="w-full">
        <ScrollContainer className="h-[calc(100vh_-_150px_-_var(--app-toolbar-h))]" hideScrollbars={false}>
          <div className="p-2 flex flex-col">
            {sidebarItems.map(item => {
              const accessible = hasModuleAccess(item.role);
              return (
                <button
                  type="button"
                  data-testid={SIDEBAR_NAV_TEST_IDS[item.link] ?? undefined}
                  title={accessible ? undefined : t('sidebar.requiresApproval', {
                    defaultValue: 'Requires manager approval',
                  })}
                  onClick={() => {
                    protectedNavigate(item.link, item.role);
                  }}
                  className={cn(
                    'relative flex flex-col text-center cursor-pointer p-[0.4rem] gap-1 rounded-xl pressable no-underline w-full text-foreground',
                    pathInfo === item.link ? 'shadow-xl bg-gradient active:shadow-none' : 'border-[3px] border-transparent'
                  )}
                  key={item.title}
                  style={{
                    '--padding': '0.4rem'
                  } as CSSProperties}
                >
                  <span className={cn('flex flex-col gap-1', !accessible && 'opacity-50 grayscale blur-[1.5px]')}>
                    <span className="icon text-current">{item.icon}</span>
                    <span className="label text-[12px] text-current">{item.title}</span>
                  </span>
                  {!accessible && (
                    <FontAwesomeIcon
                      icon={faLock}
                      aria-hidden="true"
                      className="absolute top-0.5 right-0.5 text-[9px] text-muted"
                    />
                  )}
                  {item.link === ADMIN && <SecurityAlertsBadge />}
                </button>
              );
            })}
          </div>
        </ScrollContainer>
      </div>
      <div className="flex flex-col gap-2 w-full p-2">
        <div className="input-group">
          <button
            type="button"
            data-testid="nav-settings"
            onClick={() => protectedNavigate(SETTINGS, 'settings')}
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
            data-testid="nav-clock"
            className={cn(
              'btn btn-primary lg flex-1',
              pathInfo === CLOCK ? 'active' : ''
            )}
            style={{
              '--padding': '0.5rem'
            } as CSSProperties}
          >
            <FontAwesomeIcon icon={faUser} />
          </NavLink>
        </div>
        <div className="input-group">
          <IconTooltipButton
            label={t('common:actions.lock')}
            className="flex-1"
            variant="primary"
            onClick={lock}
            size="lg"
            data-testid="nav-lock"
          >
            <FontAwesomeIcon icon={faLock} />
          </IconTooltipButton>
          <IconTooltipButton
            label={t('common:actions.logout')}
            className="flex-1"
            variant="danger"
            onClick={logout}
            size="lg"
            data-testid="nav-logout"
          >
            <FontAwesomeIcon icon={faPowerOff} />
          </IconTooltipButton>
        </div>
      </div>
    </div>
  )
}
