import type {ComponentType, LazyExoticComponent} from "react";
import {Route, Routes} from "react-router";
import {Login} from "@/screens/login.tsx";
import {NotFound} from "@/screens/not-found.tsx";
import {Clock} from "@/screens/clock.tsx";
import {ProtectedRoute} from "@/routes/protected-route.tsx";
import {SuspenseOutlet} from "@/routes/suspense-outlet.tsx";
import {
  ADMIN,
  CLOCK,
  CLOSING,
  DELIVERY,
  INVENTORY,
  INVENTORY_PRINT,
  HR,
  KITCHEN,
  ORDER_DISPLAY,
  CUSTOMER_DISPLAY,
  LOGIN,
  QUICK,
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
  REPORTS_ORDER_FISCAL,
  REPORTS_ORDER_LIFECYCLE,
  REPORTS_ORDER_RECEIPT,
  REPORTS_PRODUCT_HOURLY,
  REPORTS_PRODUCT_LIST,
  REPORTS_PRODUCT_MIX_SUMMARY,
  REPORTS_PRODUCT_MIX_WEEKLY,
  REPORTS_PURCHASE,
  REPORTS_PURCHASE_ORDER,
  REPORTS_PURCHASE_RETURN,
  REPORTS_SALE_VS_CONSUMPTION,
  REPORTS_KITCHEN_RECONCILIATION,
  REPORTS_PRODUCTION,
  REPORTS_BUFFET,
  REPORTS_LABOR_ATTENDANCE,
  REPORTS_LABOR_DAILY_COST,
  REPORTS_LABOR_DASHBOARD,
  REPORTS_LABOR_OVERTIME,
  REPORTS_LABOR_PAYROLL_SUMMARY,
  REPORTS_LABOR_SCHEDULED_VS_ACTUAL,
  REPORTS_LABOR_SCHEDULE_ROSTER,
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
  INTEGRATIONS,
  SUMMARY,
  TIP_DISTRIBUTION, ACCOUNTS,
} from "@/routes/posr.ts";
import {
  AccountsScreen,
  ActivityReport,
  Admin,
  AiReport,
  AuditReport,
  BuffetReport,
  Closing,
  Delivery,
  HrScreen,
  IntegrationsScreen,
  Inventory,
  KitchenScreen,
  LaborAttendanceReport,
  LaborDailyCostReport,
  LaborDashboardReport,
  LaborOvertimeReport,
  LaborPayrollSummaryReport,
  LaborScheduledVsActualReport,
  LaborScheduleRosterReport,
  CashClosingReport,
  ConsumptionReport,
  CouponReport,
  CurrentInventoryReport,
  DeliveryDensityReport,
  DetailedInventoryReport,
  DiscountsReport,
  ExpenseReport,
  InventoryDashboardReport,
  InventoryDocumentPrintPage,
  IssueReport,
  IssueReturnReport,
  KitchenReconciliationReport,
  Menu,
  MergeOrdersReport,
  OrderDisplayScreen,
  CustomerDisplayScreen,
  QuickOrder,
  OrderFiscalReport,
  OrderLifecycleReport,
  OrderReceiptReport,
  Orders,
  ProductHourlyReport,
  ProductListReport,
  ProductMixSummaryReport,
  ProductMixWeeklyReport,
  ProductionReport,
  PurchaseOrderReport,
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

function gated(
  enabled: boolean,
  Comp: LazyExoticComponent<ComponentType<any>> | null,
  path: string,
) {
  if (!enabled || !Comp) return null;
  return <Route path={path} element={<Comp />} />;
}

export const AppRoutes = () => (
  <Routes>
    <Route path={LOGIN} element={<Login/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route element={<SuspenseOutlet/>}>
        {gated(__BUILD_MODULE_menu__, Menu, MENU)}
        {gated(__BUILD_MODULE_orders__, Orders, ORDERS)}
        {gated(__BUILD_MODULE_summary__, Summary, SUMMARY)}
        {gated(__BUILD_MODULE_kitchen__, KitchenScreen, KITCHEN)}
        <Route path={CLOCK} element={<Clock/>}/>
        {gated(__BUILD_MODULE_closing__, Closing, CLOSING)}
        {gated(__BUILD_MODULE_order_display__, OrderDisplayScreen, ORDER_DISPLAY)}
        {gated(__BUILD_MODULE_menu__, CustomerDisplayScreen, CUSTOMER_DISPLAY)}
        {gated(__BUILD_MODULE_menu__, QuickOrder, QUICK)}
        {gated(__BUILD_MODULE_delivery__, Delivery, DELIVERY)}
        {gated(__BUILD_MODULE_admin__, Admin, ADMIN)}
        {gated(__BUILD_MODULE_settings__, Settings, SETTINGS)}
        {gated(__BUILD_MODULE_integrations__, IntegrationsScreen, INTEGRATIONS)}
        {gated(__BUILD_MODULE_inventory__, Inventory, INVENTORY)}
        {gated(__BUILD_MODULE_hr__, HrScreen, HR)}
        {gated(__BUILD_MODULE_tips__, TipDistributionScreen, TIP_DISTRIBUTION)}
        {gated(__BUILD_MODULE_accounts__, AccountsScreen, ACCOUNTS)}
        {gated(__BUILD_MODULE_reports__, Reports, REPORTS)}
        {gated(__BUILD_MODULE_inventory__, InventoryDocumentPrintPage, INVENTORY_PRINT)}
        {gated(__BUILD_MODULE_reports__, SalesDashboardReport, REPORTS_SALES_DASHBOARD)}
        {gated(__BUILD_MODULE_reports__, InventoryDashboardReport, REPORTS_INVENTORY_DASHBOARD)}
        {gated(__BUILD_MODULE_reports__, AuditReport, REPORTS_AUDIT)}
        {gated(__BUILD_MODULE_reports__, CashClosingReport, REPORTS_CASH_CLOSING)}
        {gated(__BUILD_MODULE_reports__, DiscountsReport, REPORTS_DISCOUNTS)}
        {gated(__BUILD_MODULE_reports__, TaxReport, REPORTS_TAX)}
        {gated(__BUILD_MODULE_reports__, CouponReport, REPORTS_COUPON)}
        {gated(__BUILD_MODULE_reports__, MergeOrdersReport, REPORTS_MERGE_ORDERS)}
        {gated(__BUILD_MODULE_reports__, SplitOrdersReport, REPORTS_SPLIT_ORDERS)}
        {gated(__BUILD_MODULE_reports__, OrderLifecycleReport, REPORTS_ORDER_LIFECYCLE)}
        {gated(__BUILD_MODULE_reports__, OrderReceiptReport, REPORTS_ORDER_RECEIPT)}
        {gated(__BUILD_MODULE_reports__, OrderFiscalReport, REPORTS_ORDER_FISCAL)}
        {gated(__BUILD_MODULE_reports__, ExpenseReport, REPORTS_EXPENSE)}
        {gated(__BUILD_MODULE_reports__, ActivityReport, REPORTS_ACTIVITY)}
        {gated(__BUILD_MODULE_reports__, AiReport, REPORTS_AI)}
        {gated(__BUILD_MODULE_reports__, ProductHourlyReport, REPORTS_PRODUCT_HOURLY)}
        {gated(__BUILD_MODULE_reports__, ProductListReport, REPORTS_PRODUCT_LIST)}
        {gated(__BUILD_MODULE_reports__, ProductMixSummaryReport, REPORTS_PRODUCT_MIX_SUMMARY)}
        {gated(__BUILD_MODULE_reports__, ProductMixWeeklyReport, REPORTS_PRODUCT_MIX_WEEKLY)}
        {gated(__BUILD_MODULE_reports__, SalesAdvancedReport, REPORTS_SALES_ADVANCED)}
        {gated(__BUILD_MODULE_reports__, DeliveryDensityReport, REPORTS_DELIVERY_DENSITY)}
        {gated(__BUILD_MODULE_reports__, SalesHourlyLabourReport, REPORTS_SALES_HOURLY_LABOUR)}
        {gated(__BUILD_MODULE_reports__, SalesHourlyLabourWeeklyReport, REPORTS_SALES_HOURLY_LABOUR_WEEKLY)}
        {gated(__BUILD_MODULE_reports__, SalesServerReport, REPORTS_SALES_SERVER)}
        {gated(__BUILD_MODULE_reports__, SalesSummaryReport, REPORTS_SALES_SUMMARY)}
        {gated(__BUILD_MODULE_reports__, SalesSummary2Report, REPORTS_SALES_SUMMARY2)}
        {gated(__BUILD_MODULE_reports__, TipsReport, REPORTS_TIPS)}
        {gated(__BUILD_MODULE_reports__, SalesWeeklyReport, REPORTS_SALES_WEEKLY)}
        {gated(__BUILD_MODULE_reports__, TablesSummaryReport, REPORTS_TABLES_SUMMARY)}
        {gated(__BUILD_MODULE_reports__, VoidsReport, REPORTS_VOIDS)}
        {gated(__BUILD_MODULE_reports__, DetailedInventoryReport, REPORTS_DETAILED_INVENTORY)}
        {gated(__BUILD_MODULE_reports__, CurrentInventoryReport, REPORTS_CURRENT_INVENTORY)}
        {gated(__BUILD_MODULE_reports__, PurchaseReport, REPORTS_PURCHASE)}
        {gated(__BUILD_MODULE_reports__, PurchaseOrderReport, REPORTS_PURCHASE_ORDER)}
        {gated(__BUILD_MODULE_reports__, PurchaseReturnReport, REPORTS_PURCHASE_RETURN)}
        {gated(__BUILD_MODULE_reports__, IssueReport, REPORTS_ISSUE)}
        {gated(__BUILD_MODULE_reports__, IssueReturnReport, REPORTS_ISSUE_RETURN)}
        {gated(__BUILD_MODULE_reports__, WasteReport, REPORTS_WASTE)}
        {gated(__BUILD_MODULE_reports__, ConsumptionReport, REPORTS_CONSUMPTION)}
        {gated(__BUILD_MODULE_reports__, SaleVsConsumptionReport, REPORTS_SALE_VS_CONSUMPTION)}
        {gated(__BUILD_MODULE_reports__, KitchenReconciliationReport, REPORTS_KITCHEN_RECONCILIATION)}
        {gated(__BUILD_MODULE_reports__, ProductionReport, REPORTS_PRODUCTION)}
        {gated(__BUILD_MODULE_reports__, BuffetReport, REPORTS_BUFFET)}
        {gated(__BUILD_MODULE_reports__, LaborDashboardReport, REPORTS_LABOR_DASHBOARD)}
        {gated(__BUILD_MODULE_reports__, LaborDailyCostReport, REPORTS_LABOR_DAILY_COST)}
        {gated(__BUILD_MODULE_reports__, LaborOvertimeReport, REPORTS_LABOR_OVERTIME)}
        {gated(__BUILD_MODULE_reports__, LaborAttendanceReport, REPORTS_LABOR_ATTENDANCE)}
        {gated(__BUILD_MODULE_reports__, LaborPayrollSummaryReport, REPORTS_LABOR_PAYROLL_SUMMARY)}
        {gated(__BUILD_MODULE_reports__, LaborScheduledVsActualReport, REPORTS_LABOR_SCHEDULED_VS_ACTUAL)}
        {gated(__BUILD_MODULE_reports__, LaborScheduleRosterReport, REPORTS_LABOR_SCHEDULE_ROSTER)}
      </Route>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes>
);
