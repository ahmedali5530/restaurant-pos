import {lazy} from "react";

export const TablesideScreen = lazy(() =>
  import('@/screens/tableside').then(m => ({default: m.TablesideScreen}))
);

export const Closing = lazy(() =>
  import('@/screens/closing.tsx').then(m => ({default: m.Closing}))
);
export const OrderDisplayScreen = lazy(() =>
  import('@/screens/order-display.tsx').then(m => ({default: m.OrderDisplayScreen}))
);
export const Delivery = lazy(() =>
  import('@/screens/delivery/').then(m => ({default: m.Index}))
);
export const Admin = lazy(() =>
  import('@/screens/admin').then(m => ({default: m.Admin}))
);
export const Settings = lazy(() =>
  import('@/screens/settings.tsx').then(m => ({default: m.Settings}))
);
export const IntegrationsScreen = lazy(() =>
  import('@/screens/integrations/index.tsx').then(m => ({default: m.IntegrationsScreen}))
);
export const Inventory = lazy(() =>
  import('@/screens/inventory/').then(m => ({default: m.Inventory}))
);
export const HrScreen = lazy(() =>
  import('@/screens/hr/').then(m => ({default: m.HrScreen}))
);
export const TipDistributionScreen = lazy(() =>
  import('@/screens/tip.distribution.tsx').then(m => ({default: m.TipDistributionScreen}))
);
export const AccountsScreen = lazy(() =>
  import('@/screens/accounts.tsx').then(m => ({default: m.AccountsScreen}))
);
export const Reports = lazy(() =>
  import('@/screens/reports/').then(m => ({default: m.Reports}))
);

export const ProductMixWeeklyReport = lazy(() =>
  import('@/screens/reports/product.mix.weekly.report.tsx').then(m => ({default: m.ProductMixWeeklyReport}))
);
export const AuditReport = lazy(() =>
  import('@/screens/reports/audit.report.tsx').then(m => ({default: m.AuditReport}))
);
export const CashClosingReport = lazy(() =>
  import('@/screens/reports/cash.closing.report.tsx').then(m => ({default: m.CashClosingReport}))
);
export const DiscountsReport = lazy(() =>
  import('@/screens/reports/discounts.report.tsx').then(m => ({default: m.DiscountsReport}))
);
export const ProductHourlyReport = lazy(() =>
  import('@/screens/reports/product.hourly.report.tsx').then(m => ({default: m.ProductHourlyReport}))
);
export const ProductListReport = lazy(() =>
  import('@/screens/reports/product.list.report.tsx').then(m => ({default: m.ProductListReport}))
);
export const ProductMixSummaryReport = lazy(() =>
  import('@/screens/reports/product.mix.summary.report.tsx').then(m => ({default: m.ProductMixSummaryReport}))
);
export const SalesAdvancedReport = lazy(() =>
  import('@/screens/reports/sales.advanced.report.tsx').then(m => ({default: m.SalesAdvancedReport}))
);
export const SalesHourlyLabourReport = lazy(() =>
  import('@/screens/reports/sales.hourly.labour.report.tsx').then(m => ({default: m.SalesHourlyLabourReport}))
);
export const SalesHourlyLabourWeeklyReport = lazy(() =>
  import('@/screens/reports/sales.hourly.labour.weekly.report.tsx').then(m => ({default: m.SalesHourlyLabourWeeklyReport}))
);
export const SalesServerReport = lazy(() =>
  import('@/screens/reports/sales.server.report.tsx').then(m => ({default: m.SalesServerReport}))
);
export const SalesSummaryReport = lazy(() =>
  import('@/screens/reports/sales.summary.report.tsx').then(m => ({default: m.SalesSummaryReport}))
);
export const SalesSummary2Report = lazy(() =>
  import('@/screens/reports/sales.summary2.report.tsx').then(m => ({default: m.SalesSummary2Report}))
);
export const SalesWeeklyReport = lazy(() =>
  import('@/screens/reports/sales.weekly.report.tsx').then(m => ({default: m.SalesWeeklyReport}))
);
export const TablesSummaryReport = lazy(() =>
  import('@/screens/reports/tables.summary.report.tsx').then(m => ({default: m.TablesSummaryReport}))
);
export const VoidsReport = lazy(() =>
  import('@/screens/reports/voids.report.tsx').then(m => ({default: m.VoidsReport}))
);
export const CurrentInventoryReport = lazy(() =>
  import('@/screens/reports/current.inventory.report.tsx').then(m => ({default: m.CurrentInventoryReport}))
);
export const DetailedInventoryReport = lazy(() =>
  import('@/screens/reports/detailed.inventory.report.tsx').then(m => ({default: m.DetailedInventoryReport}))
);
export const PurchaseReport = lazy(() =>
  import('@/screens/reports/purchase.report.tsx').then(m => ({default: m.PurchaseReport}))
);
export const PurchaseOrderReport = lazy(() =>
  import('@/screens/reports/purchase.order.report.tsx').then(m => ({default: m.PurchaseOrderReport}))
);
export const PurchaseReturnReport = lazy(() =>
  import('@/screens/reports/purchase.return.report.tsx').then(m => ({default: m.PurchaseReturnReport}))
);
export const IssueReport = lazy(() =>
  import('@/screens/reports/issue.report.tsx').then(m => ({default: m.IssueReport}))
);
export const IssueReturnReport = lazy(() =>
  import('@/screens/reports/issue.return.report.tsx').then(m => ({default: m.IssueReturnReport}))
);
export const WasteReport = lazy(() =>
  import('@/screens/reports/waste.report.tsx').then(m => ({default: m.WasteReport}))
);
export const ConsumptionReport = lazy(() =>
  import('@/screens/reports/consumption.report.tsx').then(m => ({default: m.ConsumptionReport}))
);
export const SaleVsConsumptionReport = lazy(() =>
  import('@/screens/reports/sale.vs.consumption.report.tsx').then(m => ({default: m.SaleVsConsumptionReport}))
);
export const KitchenReconciliationReport = lazy(() =>
  import('@/screens/reports/kitchen.reconciliation.report.tsx').then(m => ({default: m.KitchenReconciliationReport}))
);
export const ProductionReport = lazy(() =>
  import('@/screens/reports/production.report.tsx').then(m => ({default: m.ProductionReport}))
);
export const BuffetReport = lazy(() =>
  import('@/screens/reports/buffet.report.tsx').then(m => ({default: m.BuffetReport}))
);
export const TipsReport = lazy(() =>
  import('@/screens/reports/tips.report.tsx').then(m => ({default: m.TipsReport}))
);
export const SalesDashboardReport = lazy(() =>
  import('@/screens/reports/sales.dashboard.report.tsx').then(m => ({default: m.SalesDashboardReport}))
);
export const InventoryDashboardReport = lazy(() =>
  import('@/screens/reports/inventory.dashboard.report.tsx').then(m => ({default: m.InventoryDashboardReport}))
);
export const DeliveryDensityReport = lazy(() =>
  import('@/screens/reports/delivery.density.report.tsx').then(m => ({default: m.DeliveryDensityReport}))
);
export const TaxReport = lazy(() =>
  import('@/screens/reports/tax.report.tsx').then(m => ({default: m.TaxReport}))
);
export const CouponReport = lazy(() =>
  import('@/screens/reports/coupon.report.tsx').then(m => ({default: m.CouponReport}))
);
export const MergeOrdersReport = lazy(() =>
  import('@/screens/reports/merge.orders.report.tsx').then(m => ({default: m.MergeOrdersReport}))
);
export const SplitOrdersReport = lazy(() =>
  import('@/screens/reports/split.orders.report.tsx').then(m => ({default: m.SplitOrdersReport}))
);
export const OrderLifecycleReport = lazy(() =>
  import('@/screens/reports/order.lifecycle.report.tsx').then(m => ({default: m.OrderLifecycleReport}))
);
export const OrderReceiptReport = lazy(() =>
  import('@/screens/reports/order.receipt.report.tsx').then(m => ({default: m.OrderReceiptReport}))
);
export const OrderFiscalReport = lazy(() =>
  import('@/screens/reports/order.fiscal.report.tsx').then(m => ({default: m.OrderFiscalReport}))
);
export const ExpenseReport = lazy(() =>
  import('@/screens/reports/expense.report.tsx').then(m => ({default: m.ExpenseReport}))
);
export const ActivityReport = lazy(() =>
  import('@/screens/reports/activity.report.tsx').then(m => ({default: m.ActivityReport}))
);
export const AiReport = lazy(() =>
  import('@/screens/reports/ai.report.tsx').then(m => ({default: m.AiReport}))
);
export const LaborDashboardReport = lazy(() =>
  import('@/screens/reports/labor.dashboard.report.tsx').then(m => ({default: m.LaborDashboardReport}))
);
export const LaborDailyCostReport = lazy(() =>
  import('@/screens/reports/labor.daily.cost.report.tsx').then(m => ({default: m.LaborDailyCostReport}))
);
export const LaborOvertimeReport = lazy(() =>
  import('@/screens/reports/labor.overtime.report.tsx').then(m => ({default: m.LaborOvertimeReport}))
);
export const LaborAttendanceReport = lazy(() =>
  import('@/screens/reports/labor.attendance.report.tsx').then(m => ({default: m.LaborAttendanceReport}))
);
export const LaborPayrollSummaryReport = lazy(() =>
  import('@/screens/reports/labor.payroll.summary.report.tsx').then(m => ({default: m.LaborPayrollSummaryReport}))
);
export const LaborScheduledVsActualReport = lazy(() =>
  import('@/screens/reports/labor.scheduled.vs.actual.report.tsx').then(m => ({default: m.LaborScheduledVsActualReport}))
);
export const LaborScheduleRosterReport = lazy(() =>
  import('@/screens/reports/labor.schedule.roster.report.tsx').then(m => ({default: m.LaborScheduleRosterReport}))
);
export const InventoryDocumentPrintPage = lazy(() =>
  import('@/screens/inventory/document.print.tsx').then(m => ({default: m.InventoryDocumentPrintPage}))
);
export const DemandForecastScreen = lazy(() =>
  import('@/screens/reports/demand.forecast.report.tsx').then(m => ({default: m.DemandForecastScreen}))
);

export const MenuOptimizationScreen = lazy(() =>
  import('@/screens/reports/menu.optimization.report.tsx').then(m => ({default: m.MenuOptimizationScreen}))
);

export const SentimentReportScreen = lazy(() =>
  import('@/screens/reports/sentiment.report.tsx').then(m => ({default: m.SentimentReportScreen}))
);

export const WasteIntelligenceScreen = lazy(() =>
  import('@/screens/reports/waste.intelligence.report.tsx').then(m => ({default: m.WasteIntelligenceScreen}))
);

export const SchedulingOptimizationScreen = lazy(() =>
  import('@/screens/reports/scheduling.optimization.report.tsx').then(m => ({default: m.SchedulingOptimizationScreen}))
);

export const CashFlowReportScreen = lazy(() =>
  import('@/screens/reports/cash.flow.report.tsx').then(m => ({default: m.CashFlowReportScreen}))
);

export const VendorPerformanceScreen = lazy(() =>
  import('@/screens/reports/vendor.performance.report.tsx').then(m => ({default: m.VendorPerformanceScreen}))
);

export const TableTurnoverScreen = lazy(() =>
  import('@/screens/reports/turnover.report.tsx').then(m => ({default: m.TableTurnoverScreen}))
);
