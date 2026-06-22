import './assets/css/app.scss';
import 'react-indiana-drag-scroll/dist/style.css'
import {ConfigProvider} from "antd";
import {QueryClient, QueryClientProvider,} from '@tanstack/react-query'
import {appAntdTheme} from "@/lib/antd-theme.ts";
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
import {initializePrintTemplates} from "@/lib/print.registry.tsx";
import {BrowserRouter} from "react-router";
import {TableLockProvider} from "@/providers/table.lock.provider.tsx";
import {AutoCheckCloseProvider} from "@/providers/auto-check-close.provider.tsx";
import {ClosingCycleEnforcementProvider} from "@/providers/closing-cycle-enforcement.provider.tsx";
import {I18nProvider} from "@/providers/i18n.provider.tsx";
import {AppRoutes} from "@/routes/app.routes.tsx";


// react query client wrapper
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


// Wrapper for app
function App() {
  // initialize print templates once
  useEffect(() => {
    initializePrintTemplates();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={appAntdTheme}>
        <DatabaseProvider>
          <AutoCheckCloseProvider>
            <ClosingCycleEnforcementProvider>
              <DeliveryOrdersProvider>
                <PrintProvider>
                  <TableLockProvider>
                    <SecurityProvider>
                      <BrowserRouter>
                        <I18nProvider>
                        <GlobalDeliveryOrderPopup/>
                        <AppRoutes/>
                        </I18nProvider>
                      </BrowserRouter>
                      <SecurityModal/>
                    </SecurityProvider>
                  </TableLockProvider>
                </PrintProvider>
              </DeliveryOrdersProvider>
            </ClosingCycleEnforcementProvider>
          </AutoCheckCloseProvider>

          <Alert/>
          <Toaster richColors position="top-right" closeButton={true}/>
        </DatabaseProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App
