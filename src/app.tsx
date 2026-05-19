import './assets/css/app.scss';
import 'react-indiana-drag-scroll/dist/style.css'
import {ConfigProvider} from "antd";
import {QueryClient, QueryClientProvider,} from '@tanstack/react-query'
import {appAntdTheme} from "@/lib/antd-theme.ts";
import {Toaster} from "sonner";
import {Alert} from "./components/common/alert/dialog.tsx";
import {Login} from "@/screens/login.tsx";
import {Menu} from "@/screens/menu";
import React, {useEffect} from "react";
import {PrintProvider} from "@/providers/print.provider.tsx";
import {DatabaseProvider} from "@/providers/database.provider.tsx";
import {DeliveryOrdersProvider} from "@/providers/delivery-orders.provider.tsx";
import {SecurityProvider} from "@/providers/security.provider.tsx";
import {SecurityModal} from "@/components/security/security-modal.tsx";
import {useDeliveryOrders} from "@/hooks/useDeliveryOrders.ts";
import {DeliveryOrderPopup} from "@/components/delivery/delivery-order-popup.tsx";
import {initializePrintTemplates} from "@/lib/print.registry.tsx";
import {Orders} from "@/screens/orders.tsx";
import {Summary} from "@/screens/summary.tsx";
import {Closing} from "@/screens/closing.tsx";
import {KitchenScreen} from "@/screens/kitchen.tsx";
import {Index as Delivery} from "@/screens/delivery/";
import {Admin} from "@/screens/admin";
import {Reports} from "@/screens/reports/";
import {BrowserRouter, Route, Routes} from "react-router";
import {
  ADMIN,
  CLOCK,
  CLOSING,
  DELIVERY,
  INVENTORY,
  KITCHEN,
  MENU,
  ORDERS,
  REPORTS,
  REPORTS_ACTIVITY,
  REPORTS_AUDIT,
  REPORTS_CASH_CLOSING,
  REPORTS_CONSUMPTION,
  REPORTS_COUPON,
  REPORTS_CURRENT_INVENTORY,
  REPORTS_DELIVERY_DENSITY,
  REPORTS_DETAILED_INVENTORY,
  REPORTS_DISCOUNTS,
  REPORTS_EXPENSE,
  REPORTS_INVENTORY_DASHBOARD,
  REPORTS_ISSUE,
  REPORTS_ISSUE_RETURN,
  REPORTS_MERGE_ORDERS,
  REPORTS_ORDER_LIFECYCLE,
  REPORTS_PRODUCT_HOURLY,
  REPORTS_PRODUCT_LIST,
  REPORTS_PRODUCT_MIX_SUMMARY,
  REPORTS_PRODUCT_MIX_WEEKLY,
  REPORTS_PRODUCT_SUMMARY,
  REPORTS_PURCHASE,
  REPORTS_PURCHASE_RETURN,
  REPORTS_SALE_VS_CONSUMPTION,
  REPORTS_SALES_ADVANCED,
  REPORTS_SALES_DASHBOARD,
  REPORTS_SALES_HOURLY_LABOUR,
  REPORTS_SALES_HOURLY_LABOUR_WEEKLY,
  REPORTS_SALES_SERVER,
  REPORTS_SALES_SUMMARY,
  REPORTS_SALES_SUMMARY2,
  REPORTS_SALES_WEEKLY,
  REPORTS_SPLIT_ORDERS,
  REPORTS_TABLES_SUMMARY,
  REPORTS_TAX,
  REPORTS_TIPS,
  REPORTS_VOIDS,
  REPORTS_WASTE,
  SETTINGS,
  SUMMARY,
  TIP_DISTRIBUTION
} from "@/routes/posr.ts";
import {Settings} from "@/screens/settings.tsx";
import {Clock} from "@/screens/clock.tsx";
import {Inventory} from "@/screens/inventory/";
import {ProductMixWeeklyReport} from "@/screens/reports/product.mix.weekly.report.tsx";
import {AuditReport} from "@/screens/reports/audit.report.tsx";
import {CashClosingReport} from "@/screens/reports/cash.closing.report.tsx";
import {DiscountsReport} from "@/screens/reports/discounts.report.tsx";
import {ProductHourlyReport} from "@/screens/reports/product.hourly.report.tsx";
import {ProductListReport} from "@/screens/reports/product.list.report.tsx";
import {ProductMixSummaryReport} from "@/screens/reports/product.mix.summary.report.tsx";
import {ProductSummaryReport} from "@/screens/reports/product.summary.report.tsx";
import {SalesAdvancedReport} from "@/screens/reports/sales.advanced.report.tsx";
import {SalesHourlyLabourReport} from "@/screens/reports/sales.hourly.labour.report.tsx";
import {SalesHourlyLabourWeeklyReport} from "@/screens/reports/sales.hourly.labour.weekly.report.tsx";
import {SalesServerReport} from "@/screens/reports/sales.server.report.tsx";
import {SalesSummaryReport} from "@/screens/reports/sales.summary.report.tsx";
import {SalesSummary2Report} from "@/screens/reports/sales.summary2.report.tsx";
import {SalesWeeklyReport} from "@/screens/reports/sales.weekly.report.tsx";
import {TablesSummaryReport} from "@/screens/reports/tables.summary.report.tsx";
import {VoidsReport} from "@/screens/reports/voids.report.tsx";
import {CurrentInventoryReport} from "@/screens/reports/current.inventory.report.tsx";
import {DetailedInventoryReport} from "@/screens/reports/detailed.inventory.report.tsx";
import {PurchaseReport} from "@/screens/reports/purchase.report.tsx";
import {PurchaseReturnReport} from "@/screens/reports/purchase.return.report.tsx";
import {IssueReport} from "@/screens/reports/issue.report.tsx";
import {IssueReturnReport} from "@/screens/reports/issue.return.report.tsx";
import {WasteReport} from "@/screens/reports/waste.report.tsx";
import {ConsumptionReport} from "@/screens/reports/consumption.report.tsx";
import {SaleVsConsumptionReport} from "@/screens/reports/sale.vs.consumption.report.tsx";
import {TipDistributionScreen} from "@/screens/tip.distribution.tsx";
import {TipsReport} from "@/screens/reports/tips.report.tsx";
import {SalesDashboardReport} from "@/screens/reports/sales.dashboard.report.tsx";
import {InventoryDashboardReport} from "@/screens/reports/inventory.dashboard.report.tsx";
import {DeliveryDensityReport} from "@/screens/reports/delivery.density.report.tsx";
import {TableLockProvider} from "@/providers/table.lock.provider.tsx";
import {TaxReport} from "@/screens/reports/tax.report.tsx";
import {CouponReport} from "@/screens/reports/coupon.report.tsx";
import {MergeOrdersReport} from "@/screens/reports/merge.orders.report.tsx";
import {SplitOrdersReport} from "@/screens/reports/split.orders.report.tsx";
import {OrderLifecycleReport} from "@/screens/reports/order.lifecycle.report.tsx";
import {ExpenseReport} from "@/screens/reports/expense.report.tsx";
import {ActivityReport} from "@/screens/reports/activity.report.tsx";


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
          <DeliveryOrdersProvider>
            <PrintProvider>
              <TableLockProvider>
                <SecurityProvider>
                  <BrowserRouter>
                    <GlobalDeliveryOrderPopup/>
                    <Routes>
                      <Route path="/" element={<Login/>}/>
                      <Route path={MENU} element={<Menu/>}/>
                      <Route path={ORDERS} element={<Orders/>}/>
                      <Route path={SUMMARY} element={<Summary/>}/>
                      <Route path={CLOSING} element={<Closing/>}/>
                      <Route path={KITCHEN} element={<KitchenScreen/>}/>
                      <Route path={DELIVERY} element={<Delivery/>}/>
                      <Route path={ADMIN} element={<Admin/>}/>
                      <Route path={SETTINGS} element={<Settings/>}/>
                      <Route path={CLOCK} element={<Clock/>}/>
                      <Route path={INVENTORY} element={<Inventory/>}/>
                      <Route path={TIP_DISTRIBUTION} element={<TipDistributionScreen/>}/>

                      <Route path={REPORTS} element={<Reports/>}/>
                      <Route path={REPORTS_SALES_DASHBOARD} element={<SalesDashboardReport/>}/>
                      <Route path={REPORTS_INVENTORY_DASHBOARD} element={<InventoryDashboardReport/>}/>
                      <Route path={REPORTS_AUDIT} element={<AuditReport/>}/>
                      <Route path={REPORTS_CASH_CLOSING} element={<CashClosingReport/>}/>
                      <Route path={REPORTS_DISCOUNTS} element={<DiscountsReport/>}/>
                      <Route path={REPORTS_TAX} element={<TaxReport/>}/>
                      <Route path={REPORTS_COUPON} element={<CouponReport/>}/>
                      <Route path={REPORTS_MERGE_ORDERS} element={<MergeOrdersReport/>}/>
                      <Route path={REPORTS_SPLIT_ORDERS} element={<SplitOrdersReport/>}/>
                      <Route path={REPORTS_ORDER_LIFECYCLE} element={<OrderLifecycleReport/>}/>
                      <Route path={REPORTS_EXPENSE} element={<ExpenseReport/>}/>
                      <Route path={REPORTS_ACTIVITY} element={<ActivityReport/>}/>
                      <Route path={REPORTS_PRODUCT_HOURLY} element={<ProductHourlyReport/>}/>
                      <Route path={REPORTS_PRODUCT_LIST} element={<ProductListReport/>}/>
                      <Route path={REPORTS_PRODUCT_MIX_SUMMARY} element={<ProductMixSummaryReport/>}/>
                      <Route path={REPORTS_PRODUCT_MIX_WEEKLY} element={<ProductMixWeeklyReport/>}/>
                      <Route path={REPORTS_PRODUCT_SUMMARY} element={<ProductSummaryReport/>}/>
                      <Route path={REPORTS_SALES_ADVANCED} element={<SalesAdvancedReport/>}/>
                      <Route path={REPORTS_DELIVERY_DENSITY} element={<DeliveryDensityReport/>}/>
                      <Route path={REPORTS_SALES_HOURLY_LABOUR} element={<SalesHourlyLabourReport/>}/>
                      <Route path={REPORTS_SALES_HOURLY_LABOUR_WEEKLY} element={<SalesHourlyLabourWeeklyReport/>}/>
                      <Route path={REPORTS_SALES_SERVER} element={<SalesServerReport/>}/>
                      <Route path={REPORTS_SALES_SUMMARY} element={<SalesSummaryReport/>}/>
                      <Route path={REPORTS_SALES_SUMMARY2} element={<SalesSummary2Report/>}/>
                      <Route path={REPORTS_TIPS} element={<TipsReport/>}/>
                      <Route path={REPORTS_SALES_WEEKLY} element={<SalesWeeklyReport/>}/>
                      <Route path={REPORTS_TABLES_SUMMARY} element={<TablesSummaryReport/>}/>
                      <Route path={REPORTS_VOIDS} element={<VoidsReport/>}/>
                      <Route path={REPORTS_DETAILED_INVENTORY} element={<DetailedInventoryReport/>}/>
                      <Route path={REPORTS_CURRENT_INVENTORY} element={<CurrentInventoryReport/>}/>
                      <Route path={REPORTS_PURCHASE} element={<PurchaseReport/>}/>
                      <Route path={REPORTS_PURCHASE_RETURN} element={<PurchaseReturnReport/>}/>
                      <Route path={REPORTS_ISSUE} element={<IssueReport/>}/>
                      <Route path={REPORTS_ISSUE_RETURN} element={<IssueReturnReport/>}/>
                      <Route path={REPORTS_WASTE} element={<WasteReport/>}/>
                      <Route path={REPORTS_CONSUMPTION} element={<ConsumptionReport/>}/>
                      <Route path={REPORTS_SALE_VS_CONSUMPTION} element={<SaleVsConsumptionReport/>}/>
                    </Routes>
                  </BrowserRouter>
                  <SecurityModal/>
                </SecurityProvider>
              </TableLockProvider>
            </PrintProvider>
          </DeliveryOrdersProvider>

          <Alert/>
          <Toaster richColors position="top-right" closeButton={true}/>
        </DatabaseProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

export default App
