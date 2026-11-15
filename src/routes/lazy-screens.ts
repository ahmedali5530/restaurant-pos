import {lazy, type ComponentType, type LazyExoticComponent} from 'react';

type AnyComp = ComponentType<any>;
type LazyComp = LazyExoticComponent<AnyComp>;

function maybeLazy(enabled: boolean, loader: () => Promise<{ default: AnyComp }>): LazyComp | null {
  return enabled ? lazy(loader) : null;
}

export const Menu = maybeLazy(
  __BUILD_MODULE_menu__,
  () => import('@/screens/menu').then((m) => ({ default: m.Menu })),
);
export const Orders = maybeLazy(
  __BUILD_MODULE_orders__,
  () => import('@/screens/orders.tsx').then((m) => ({ default: m.Orders })),
);
export const Summary = maybeLazy(
  __BUILD_MODULE_summary__,
  () => import('@/screens/summary.tsx').then((m) => ({ default: m.Summary })),
);
export const KitchenScreen = maybeLazy(
  __BUILD_MODULE_kitchen__,
  () => import('@/screens/kitchen.tsx').then((m) => ({ default: m.KitchenScreen })),
);
export const Closing = maybeLazy(
  __BUILD_MODULE_closing__,
  () => import('@/screens/closing.tsx').then((m) => ({ default: m.Closing })),
);
export const OrderDisplayScreen = maybeLazy(
  __BUILD_MODULE_order_display__,
  () => import('@/screens/order-display.tsx').then((m) => ({ default: m.OrderDisplayScreen })),
);
export const CustomerDisplayScreen = maybeLazy(
  __BUILD_MODULE_menu__,
  () => import('@/screens/customer-display.tsx').then((m) => ({ default: m.CustomerDisplayScreen })),
);
export const QuickOrder = maybeLazy(
  __BUILD_MODULE_quick__,
  () => import('@/screens/quick-order.tsx').then((m) => ({ default: m.QuickOrder })),
);
export const Delivery = maybeLazy(
  __BUILD_MODULE_delivery__,
  () => import('@/screens/delivery/').then((m) => ({ default: m.Index })),
);
export const Admin = maybeLazy(
  __BUILD_MODULE_admin__,
  () => import('@/screens/admin').then((m) => ({ default: m.Admin })),
);
export const Settings = maybeLazy(
  __BUILD_MODULE_settings__,
  () => import('@/screens/settings.tsx').then((m) => ({ default: m.Settings })),
);
export const IntegrationsScreen = maybeLazy(
  __BUILD_MODULE_integrations__,
  () => import('@/screens/integrations/index.tsx').then((m) => ({ default: m.IntegrationsScreen })),
);
export const Inventory = maybeLazy(
  __BUILD_MODULE_inventory__,
  () => import('@/screens/inventory/').then((m) => ({ default: m.Inventory })),
);
export const HrScreen = maybeLazy(
  __BUILD_MODULE_hr__,
  () => import('@/screens/hr/').then((m) => ({ default: m.HrScreen })),
);
export const TipDistributionScreen = maybeLazy(
  __BUILD_MODULE_tips__,
  () => import('@/screens/tip.distribution.tsx').then((m) => ({ default: m.TipDistributionScreen })),
);
export const AccountsScreen = maybeLazy(
  __BUILD_MODULE_accounts__,
  () => import('@/screens/accounts.tsx').then((m) => ({ default: m.AccountsScreen })),
);
export const Reports = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/').then((m) => ({ default: m.Reports })),
);

export const ProductMixWeeklyReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/product.mix.weekly.report.tsx').then((m) => ({ default: m.ProductMixWeeklyReport })),
);
export const AuditReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/audit.report.tsx').then((m) => ({ default: m.AuditReport })),
);
export const CashClosingReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/cash.closing.report.tsx').then((m) => ({ default: m.CashClosingReport })),
);
export const DiscountsReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/discounts.report.tsx').then((m) => ({ default: m.DiscountsReport })),
);
export const ProductHourlyReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/product.hourly.report.tsx').then((m) => ({ default: m.ProductHourlyReport })),
);
export const ProductListReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/product.list.report.tsx').then((m) => ({ default: m.ProductListReport })),
);
export const ProductMixSummaryReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/product.mix.summary.report.tsx').then((m) => ({ default: m.ProductMixSummaryReport })),
);
export const SalesAdvancedReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/sales.advanced.report.tsx').then((m) => ({ default: m.SalesAdvancedReport })),
);
export const SalesHourlyLabourReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/sales.hourly.labour.report.tsx').then((m) => ({ default: m.SalesHourlyLabourReport })),
);
export const SalesHourlyLabourWeeklyReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/sales.hourly.labour.weekly.report.tsx').then((m) => ({ default: m.SalesHourlyLabourWeeklyReport })),
);
export const SalesServerReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/sales.server.report.tsx').then((m) => ({ default: m.SalesServerReport })),
);
export const SalesSummaryReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/sales.summary.report.tsx').then((m) => ({ default: m.SalesSummaryReport })),
);
export const SalesSummary2Report = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/sales.summary2.report.tsx').then((m) => ({ default: m.SalesSummary2Report })),
);
export const SalesWeeklyReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/sales.weekly.report.tsx').then((m) => ({ default: m.SalesWeeklyReport })),
);
export const TablesSummaryReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/tables.summary.report.tsx').then((m) => ({ default: m.TablesSummaryReport })),
);
export const VoidsReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/voids.report.tsx').then((m) => ({ default: m.VoidsReport })),
);
export const CurrentInventoryReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/current.inventory.report.tsx').then((m) => ({ default: m.CurrentInventoryReport })),
);
export const DetailedInventoryReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/detailed.inventory.report.tsx').then((m) => ({ default: m.DetailedInventoryReport })),
);
export const PurchaseReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/purchase.report.tsx').then((m) => ({ default: m.PurchaseReport })),
);
export const PurchaseOrderReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/purchase.order.report.tsx').then((m) => ({ default: m.PurchaseOrderReport })),
);
export const PurchaseReturnReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/purchase.return.report.tsx').then((m) => ({ default: m.PurchaseReturnReport })),
);
export const IssueReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/issue.report.tsx').then((m) => ({ default: m.IssueReport })),
);
export const IssueReturnReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/issue.return.report.tsx').then((m) => ({ default: m.IssueReturnReport })),
);
export const WasteReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/waste.report.tsx').then((m) => ({ default: m.WasteReport })),
);
export const ConsumptionReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/consumption.report.tsx').then((m) => ({ default: m.ConsumptionReport })),
);
export const SaleVsConsumptionReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/sale.vs.consumption.report.tsx').then((m) => ({ default: m.SaleVsConsumptionReport })),
);
export const KitchenReconciliationReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/kitchen.reconciliation.report.tsx').then((m) => ({ default: m.KitchenReconciliationReport })),
);
export const ProductionReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/production.report.tsx').then((m) => ({ default: m.ProductionReport })),
);
export const BuffetReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/buffet.report.tsx').then((m) => ({ default: m.BuffetReport })),
);
export const TipsReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/tips.report.tsx').then((m) => ({ default: m.TipsReport })),
);
export const SalesDashboardReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/sales.dashboard.report.tsx').then((m) => ({ default: m.SalesDashboardReport })),
);
export const InventoryDashboardReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/inventory.dashboard.report.tsx').then((m) => ({ default: m.InventoryDashboardReport })),
);
export const DeliveryDensityReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/delivery.density.report.tsx').then((m) => ({ default: m.DeliveryDensityReport })),
);
export const TaxReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/tax.report.tsx').then((m) => ({ default: m.TaxReport })),
);
export const CouponReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/coupon.report.tsx').then((m) => ({ default: m.CouponReport })),
);
export const MergeOrdersReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/merge.orders.report.tsx').then((m) => ({ default: m.MergeOrdersReport })),
);
export const SplitOrdersReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/split.orders.report.tsx').then((m) => ({ default: m.SplitOrdersReport })),
);
export const OrderLifecycleReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/order.lifecycle.report.tsx').then((m) => ({ default: m.OrderLifecycleReport })),
);
export const OrderReceiptReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/order.receipt.report.tsx').then((m) => ({ default: m.OrderReceiptReport })),
);
export const OrderFiscalReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/order.fiscal.report.tsx').then((m) => ({ default: m.OrderFiscalReport })),
);
export const ExpenseReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/expense.report.tsx').then((m) => ({ default: m.ExpenseReport })),
);
export const ActivityReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/activity.report.tsx').then((m) => ({ default: m.ActivityReport })),
);
export const AiReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/ai.report.tsx').then((m) => ({ default: m.AiReport })),
);
export const LaborDashboardReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/labor.dashboard.report.tsx').then((m) => ({ default: m.LaborDashboardReport })),
);
export const LaborDailyCostReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/labor.daily.cost.report.tsx').then((m) => ({ default: m.LaborDailyCostReport })),
);
export const LaborOvertimeReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/labor.overtime.report.tsx').then((m) => ({ default: m.LaborOvertimeReport })),
);
export const LaborAttendanceReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/labor.attendance.report.tsx').then((m) => ({ default: m.LaborAttendanceReport })),
);
export const LaborPayrollSummaryReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/labor.payroll.summary.report.tsx').then((m) => ({ default: m.LaborPayrollSummaryReport })),
);
export const LaborScheduledVsActualReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/labor.scheduled.vs.actual.report.tsx').then((m) => ({ default: m.LaborScheduledVsActualReport })),
);
export const LaborScheduleRosterReport = maybeLazy(
  __BUILD_MODULE_reports__,
  () => import('@/screens/reports/labor.schedule.roster.report.tsx').then((m) => ({ default: m.LaborScheduleRosterReport })),
);
export const InventoryDocumentPrintPage = maybeLazy(
  __BUILD_MODULE_inventory__,
  () => import('@/screens/inventory/document.print.tsx').then((m) => ({ default: m.InventoryDocumentPrintPage })),
);
