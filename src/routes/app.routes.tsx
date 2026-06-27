import {Route, Routes} from "react-router";
import {Login} from "@/screens/login.tsx";
import {NotFound} from "@/screens/not-found.tsx";
import {Menu} from "@/screens/menu";
import {Orders} from "@/screens/orders.tsx";
import {Summary} from "@/screens/summary.tsx";
import {Closing} from "@/screens/closing.tsx";
import {KitchenScreen} from "@/screens/kitchen.tsx";
import {OrderDisplayScreen} from "@/screens/order-display.tsx";
import {Index as Delivery} from "@/screens/delivery/";
import {Admin} from "@/screens/admin";
import {Reports} from "@/screens/reports/";
import {Settings} from "@/screens/settings.tsx";
import {Clock} from "@/screens/clock.tsx";
import {Inventory} from "@/screens/inventory/";
import {TipDistributionScreen} from "@/screens/tip.distribution.tsx";
import {ProtectedRoute} from "@/routes/protected-route.tsx";
import {SuspenseOutlet} from "@/routes/suspense-outlet.tsx";
import {
  ADMIN,
  CLOCK,
  CLOSING,
  DELIVERY,
  INVENTORY,
  KITCHEN,
  ORDER_DISPLAY,
  LOGIN,
  MENU,
  ORDERS,
  REPORTS,
  REPORTS_ACTIVITY,
  REPORTS_AI,
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
  REPORTS_PURCHASE,
  REPORTS_PURCHASE_RETURN,
  REPORTS_SALE_VS_CONSUMPTION,
  REPORTS_KITCHEN_RECONCILIATION,
  REPORTS_PRODUCTION,
  REPORTS_BUFFET,
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
  TIP_DISTRIBUTION, ACCOUNTS,
} from "@/routes/posr.ts";
import {
  ActivityReport,
  AiReport,
  AuditReport,
  BuffetReport,
  CashClosingReport,
  ConsumptionReport,
  CouponReport,
  CurrentInventoryReport,
  DeliveryDensityReport,
  DetailedInventoryReport,
  DiscountsReport,
  ExpenseReport,
  InventoryDashboardReport,
  IssueReport,
  IssueReturnReport,
  KitchenReconciliationReport,
  MergeOrdersReport,
  OrderLifecycleReport,
  ProductHourlyReport,
  ProductListReport,
  ProductMixSummaryReport,
  ProductMixWeeklyReport,
  ProductionReport,
  PurchaseReport,
  PurchaseReturnReport,
  SaleVsConsumptionReport,
  SalesAdvancedReport,
  SalesDashboardReport,
  SalesHourlyLabourReport,
  SalesHourlyLabourWeeklyReport,
  SalesServerReport,
  SalesSummary2Report,
  SalesSummaryReport,
  SalesWeeklyReport,
  SplitOrdersReport,
  TablesSummaryReport,
  TaxReport,
  TipsReport,
  VoidsReport,
  WasteReport,
} from "@/routes/lazy-screens.ts";
import {AccountsScreen} from "@/screens/accounts.tsx";

export const AppRoutes = () => (
  <Routes>
    <Route path={LOGIN} element={<Login/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route path={MENU} element={<Menu/>}/>
      <Route path={ORDERS} element={<Orders/>}/>
      <Route path={SUMMARY} element={<Summary/>}/>
      <Route path={CLOSING} element={<Closing/>}/>
      <Route path={KITCHEN} element={<KitchenScreen/>}/>
      <Route path={ORDER_DISPLAY} element={<OrderDisplayScreen/>}/>
      <Route path={DELIVERY} element={<Delivery/>}/>
      <Route path={ADMIN} element={<Admin/>}/>
      <Route path={SETTINGS} element={<Settings/>}/>
      <Route path={CLOCK} element={<Clock/>}/>
      <Route path={INVENTORY} element={<Inventory/>}/>
      <Route path={TIP_DISTRIBUTION} element={<TipDistributionScreen/>}/>
      <Route path={ACCOUNTS} element={<AccountsScreen/>}/>
      <Route path={REPORTS} element={<Reports/>}/>

      <Route element={<SuspenseOutlet/>}>
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
        <Route path={REPORTS_AI} element={<AiReport/>}/>
        <Route path={REPORTS_PRODUCT_HOURLY} element={<ProductHourlyReport/>}/>
        <Route path={REPORTS_PRODUCT_LIST} element={<ProductListReport/>}/>
        <Route path={REPORTS_PRODUCT_MIX_SUMMARY} element={<ProductMixSummaryReport/>}/>
        <Route path={REPORTS_PRODUCT_MIX_WEEKLY} element={<ProductMixWeeklyReport/>}/>
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
        <Route path={REPORTS_KITCHEN_RECONCILIATION} element={<KitchenReconciliationReport/>}/>
        <Route path={REPORTS_PRODUCTION} element={<ProductionReport/>}/>
        <Route path={REPORTS_BUFFET} element={<BuffetReport/>}/>
      </Route>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes>
);
