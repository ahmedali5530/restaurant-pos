import {
  ACCOUNTS,
  ADMIN,
  CLOCK,
  HR,
  INTEGRATIONS,
  INVENTORY,
  LOGIN,
  REPORTS,
  REPORTS_AI,
  TIP_DISTRIBUTION,
} from "@/routes/posr.ts";

/**
 * Routes where the floating AI assistant should appear. Hidden on cashier-facing
 * screens (menu, orders, kitchen, delivery, etc.).
 */
export const isAssistantWidgetPath = (pathname: string): boolean => {
  if (!pathname || pathname === LOGIN) return false;

  if (pathname === CLOCK) return true;
  if (pathname === ADMIN) return true;
  if (pathname === HR) return true;
  if (pathname === TIP_DISTRIBUTION) return true;
  if (pathname === ACCOUNTS) return true;
  if (pathname === INTEGRATIONS) return true;

  if (pathname === INVENTORY || pathname.startsWith(`${INVENTORY}/`)) return true;

  if (pathname === REPORTS || pathname.startsWith(`${REPORTS}/`)) {
    // Dedicated full-page AI report — no floating widget on top.
    return pathname !== REPORTS_AI;
  }

  return false;
};
