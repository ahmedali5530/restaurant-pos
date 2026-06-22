import {Suspense} from "react";
import {Route, Routes} from "react-router";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faSpinner} from "@fortawesome/free-solid-svg-icons";
import {Login} from "@/screens/login.tsx";
import {NotFound} from "@/screens/not-found.tsx";
import {ProtectedRoute} from "@/routes/protected-route.tsx";
import {
  ADMIN,
  CLOCK,
  CLOSING,
  DELIVERY,
  INVENTORY,
  KITCHEN,
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
  TIP_DISTRIBUTION,
} from "@/routes/posr.ts";
import {
  ActivityReport,
  Admin,
  AiReport,
  AuditReport,
  BuffetReport,
  CashClosingReport,
  Clock,
  Closing,
  ConsumptionReport,
  CouponReport,
  CurrentInventoryReport,
  Delivery,
  DeliveryDensityReport,
  DetailedInventoryReport,
  DiscountsReport,
  ExpenseReport,
  Inventory,
  InventoryDashboardReport,
  IssueReport,
  IssueReturnReport,
  KitchenReconciliationReport,
  KitchenScreen,
  Menu,
  MergeOrdersReport,
  OrderLifecycleReport,
  Orders,
  ProductHourlyReport,
  ProductListReport,
  ProductMixSummaryReport,
  ProductMixWeeklyReport,
  ProductionReport,
  PurchaseReport,
  PurchaseReturnReport,
  Reports,
  SaleVsConsumptionReport,
  SalesAdvancedReport,
  SalesDashboardReport,
  SalesHourlyLabourReport,
  SalesHourlyLabourWeeklyReport,
  SalesServerReport,
  SalesSummary2Report,
  SalesSummaryReport,
  SalesWeeklyReport,
  Settings,
  SplitOrdersReport,
  Summary,
  TablesSummaryReport,
  TaxReport,
  TipDistributionScreen,
  TipsReport,
  VoidsReport,
  WasteReport,
} from "@/routes/lazy-screens.ts";

const RouteFallback = () => (
  <div className="flex h-screen items-center justify-center bg-neutral-900">
    <FontAwesomeIcon icon={faSpinner} spin size="3x" className="text-neutral-400"/>
  </div>
);

export const AppRoutes = () => (
  <Suspense fallback={<RouteFallback/>}>
    <Routes>
      <Route path={LOGIN} element={<Login/>}/>
      <Route element={<ProtectedRoute/>}>
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
      <Route path="*" element={<NotFound/>}/>
    </Routes>
  </Suspense>
);
