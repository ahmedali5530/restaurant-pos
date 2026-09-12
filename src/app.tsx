import './assets/css/app.scss';
import 'react-indiana-drag-scroll/dist/style.css'
import ConfigProvider from "antd/es/config-provider";
import {QueryClient, QueryClientProvider,} from '@tanstack/react-query'
import {getAppAntdTheme} from "@/lib/antd-theme.ts";
import {Toaster} from "sonner";
import {Alert} from "./components/common/alert/dialog.tsx";
import React, {useEffect} from "react";
import {PrintProvider} from "@/providers/print.provider.tsx";
import {DatabaseProvider} from "@/providers/database.provider.tsx";
import {DeliveryOrdersProvider} from "@/providers/delivery-orders.provider.tsx";
import {SecurityProvider} from "@/providers/security.provider.tsx";
import {SecurityModal} from "@/components/security/security-modal.tsx";
import {useDeliveryOrders} from "@/hooks/useDeliveryOrders.ts";
import {DeliveryOrderPopup} from "@/components/delivery/delivery-order-popup.tsx";
import {BrowserRouter} from "react-router";
import {TableLockProvider} from "@/providers/table.lock.provider.tsx";
import {AutoCheckCloseProvider} from "@/providers/auto-check-close.provider.tsx";
import {ClosingCycleEnforcementProvider} from "@/providers/closing-cycle-enforcement.provider.tsx";
import {SessionIdleProvider} from "@/providers/session-idle.provider.tsx";
import {AutoClockOutProvider} from "@/providers/auto-clock-out.provider.tsx";
import {I18nProvider} from "@/providers/i18n.provider.tsx";
import {ThemeProvider, useTheme} from "@/providers/theme.provider.tsx";
import {AppRoutes} from "@/routes/app.routes.tsx";
import {IntegrationProvider} from "@/providers/integration.provider.tsx";
import {AiAssistantWidget} from "@/components/ai-assistant/assistant-widget.tsx";
import {AppToolbar} from "./components/common/app-toolbar.tsx";
import {PosStoreProvider} from "@/providers/pos-store.provider.tsx";
import {TerminalSyncProvider} from "@/providers/terminal-sync.provider.tsx";
import {SessionExpiryBridge} from "@/providers/session-expiry.bridge.tsx";

const queryClient = new QueryClient();

/** Renders the delivery order popup when a new order is detected or opened from context (works on any page). */
function GlobalDeliveryOrderPopup() {
  const {selectedOrder, isPopupOpen, closeOrderPopup, refetchDeliveryOrders} = useDeliveryOrders();
  if (!selectedOrder || !isPopupOpen) return null;
  const handleClose = () => {
    closeOrderPopup();
    refetchDeliveryOrders();
  };
  return (
    <DeliveryOrderPopup
      order={selectedOrder}
      open={true}
      onClose={handleClose}
      onOrderUpdate={refetchDeliveryOrders}
    />
  );
}

function AntdThemeBridge({ children }: { children: React.ReactNode }) {
  const { isDark, palette } = useTheme();
  const theme = React.useMemo(
    () => getAppAntdTheme(isDark, palette),
    [isDark, palette],
  );
  return (
    <ConfigProvider theme={theme}>
      {children}
    </ConfigProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      theme={resolvedTheme}
      richColors
      position="top-right"
      closeButton={true}
      duration={2000}
    />
  );
}

function App() {
  useEffect(() => {
    // initializePrintTemplates();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AntdThemeBridge>
          <DatabaseProvider>
            <PosStoreProvider>
              <TerminalSyncProvider>
                <IntegrationProvider>
                  <AutoCheckCloseProvider>
                    <ClosingCycleEnforcementProvider>
                      <DeliveryOrdersProvider>
                        <PrintProvider>
                          <TableLockProvider>
                            <SecurityProvider>
                              <BrowserRouter>
                                <SessionExpiryBridge />
                                <AppToolbar />
                                <I18nProvider>
                                  <SessionIdleProvider>
                                    <AutoClockOutProvider>
                                      <GlobalDeliveryOrderPopup/>
                                      <AiAssistantWidget/>
                                      <AppRoutes/>
                                    </AutoClockOutProvider>
                                  </SessionIdleProvider>
                                </I18nProvider>
                              </BrowserRouter>
                              <SecurityModal/>
                            </SecurityProvider>
                          </TableLockProvider>
                        </PrintProvider>
                      </DeliveryOrdersProvider>
                    </ClosingCycleEnforcementProvider>
                  </AutoCheckCloseProvider>
                </IntegrationProvider>
              </TerminalSyncProvider>
            </PosStoreProvider>

            <Alert/>
            <ThemedToaster/>
          </DatabaseProvider>
        </AntdThemeBridge>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App
