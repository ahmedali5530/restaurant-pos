import {useEffect, useRef, useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
  faBan,
  faClock,
  faPercent,
  faRotateLeft,
  faShieldHalved,
  faThumbtack,
  faUserPlus,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {useMasterNotifications, type MasterNotification, type MasterNotificationType} from "@/hooks/useMasterNotifications.ts";
import i18n from "@/lib/i18n.ts";

const AUTO_DISMISS_MS = 6000;

const ICON_BY_TYPE: Record<MasterNotificationType, typeof faClock> = {
  clock_in: faClock,
  clock_out: faClock,
  void: faBan,
  refund: faRotateLeft,
  discount: faPercent,
  new_employee: faUserPlus,
  security_alert: faShieldHalved,
};

const SEVERITY_CLASSES: Record<MasterNotification["severity"], string> = {
  info: "border-primary-500 bg-surface-elevated",
  warning: "border-warning-500 bg-warning-50 dark:bg-warning-950",
  critical: "border-danger-500 bg-danger-50 dark:bg-danger-950",
};

function NotificationItem({
  notification,
  onDismiss,
}: {
  notification: MasterNotification;
  onDismiss: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (pinned) return;
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned]);

  return (
    <div
      role="status"
      onClick={() => setPinned(true)}
      className={`pointer-events-auto flex items-start gap-3 w-96 max-w-[90vw] rounded-lg border-l-4 shadow-lg px-4 py-3 cursor-pointer transition-all duration-300 ease-out ${SEVERITY_CLASSES[notification.severity]} ${
        mounted ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
      }`}
    >
      <FontAwesomeIcon icon={ICON_BY_TYPE[notification.type]} className="mt-0.5 text-lg opacity-80" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="font-semibold text-sm">{notification.title}</p>
          {pinned && <FontAwesomeIcon icon={faThumbtack} className="text-[10px] opacity-60" />}
        </div>
        <p className="text-sm text-muted break-words">{notification.message}</p>
      </div>
      <button
        type="button"
        aria-label={i18n.t('toast:notifications.dismiss', {defaultValue: 'Dismiss'})}
        onClick={(event) => {
          event.stopPropagation();
          onDismiss();
        }}
        className="opacity-50 hover:opacity-100 shrink-0"
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>
    </div>
  );
}

export function MasterNotificationCenter() {
  const {notifications, dismiss} = useMasterNotifications();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[2000] flex flex-col gap-2 pointer-events-none">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={() => dismiss(notification.id)}
        />
      ))}
    </div>
  );
}
