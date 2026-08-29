import {normalizeQueryDate, parseDateRangeWithPhrase, resolveNaturalDateRange} from "@/api/reports/shared/filters.ts";
import type {DateRangeFilter, DbClient} from "@/api/reports/shared/types.ts";
import {getProductMix, getSalesSummary, getTopSellingDishes, getUnsoldProducts, listMenuItems} from "@/api/reports/sales";
import {getDiscountSummary} from "@/api/reports/sales/discounts.ts";
import {
  getHourlyProductSales,
  getOrderFinanceSummary,
  getSalesDashboardSnapshot,
  getServerSales,
  getVoids,
  getWeeklySales,
  listCategories,
  listStaff,
} from "@/api/reports/sales/extended.ts";
import {
  getMenuItems,
  listCoupons,
  listDiscounts,
  listExtras,
  listFloors,
  listKitchens,
  listMenus,
  listModifierGroups,
  listOrderTypes,
  listPaymentTypes,
  listPrinters,
  listRoles,
  listShifts,
  listTables,
  listTaxes,
  listUsers,
  listWorkflows,
} from "@/api/reports/manage/lists.ts";
import {getTips} from "@/api/reports/sales/tips.ts";
import {
  estimatePriceChangeImpact,
  getMenuEngineeringMatrix,
  getMenuSalesTrends,
} from "@/api/reports/sales/menu-engineering.ts";
import {
  getServerTicketTimes,
  getStaffAccountabilityMetrics,
} from "@/api/reports/sales/server-analytics.ts";
import {getHourlyLaborVsSales} from "@/api/reports/labor/hourly.ts";
import {
  getConsumptionSummary,
  getCurrentInventory,
  getInventoryMovements,
  getIssuanceSummary,
  getKitchenReconciliationSummary,
  getPurchaseOrders,
  getSaleVsConsumption,
  getWasteSummary,
  listInventoryItems,
  type InventoryMovementType,
} from "@/api/reports/inventory/index.ts";
import {getEmployeeDetail, listEmployees} from "@/api/reports/hr/employees.ts";
import {listCostCenters, listDepartments, listHrLeaveRequests, listPositions} from "@/api/reports/hr/org.ts";
import {getInventoryDocuments} from "@/api/reports/inventory/documents.ts";
import type {InventoryDocumentStatus} from "@/api/model/inventory_document.ts";
import type {InventoryDocumentType} from "@/lib/ai/inventory-operation-query.ts";
import {getOrders} from "@/api/reports/operations/orders.ts";
import {getOrderDetail} from "@/api/reports/operations/order-detail.ts";
import {extractOrderStatusesFromArgs, inferOrderStatusesFromPrompt, isOrderListByStatusPrompt} from "@/lib/ai/order-query.ts";
import {
  getActivityLog,
  getCashClosing,
  getExpenses,
  getOrderLifecycleStats,
} from "@/api/reports/operations/index.ts";
import {getActiveSessions, getCurrentSessionServerSales} from "@/api/reports/operations/sessions.ts";
import {getVoidAndCancelSummary} from "@/api/reports/operations/void-cancel.ts";
import {
  getKitchenStationDelays,
  getPrepTimesByOrderType,
} from "@/api/reports/operations/kitchen-timing.ts";
import {getCashSettlementAudit} from "@/api/reports/operations/cash-audit.ts";
import {
  getAccountStatement,
  getBalanceSheet,
  getCashFlow,
  getGeneralLedger,
  getJournalEntries,
  getProfitLoss,
  getTrialBalance,
  listAccounts,
} from "@/api/reports/accounts/index.ts";
import {comparePeriods, getTimeSeries, type TimeSeriesMetric} from "@/api/reports/time-series.ts";
import {forecastFromPoints, forecastInventoryConsumption} from "@/lib/ai/forecast.ts";
import {parseLocalEventsArg} from "@/lib/ai/demand-query.ts";
import {forecastInventoryNeed} from "@/api/reports/inventory/need-forecast.ts";
import {forecastStaffNeed} from "@/api/reports/labor/staff-need.ts";
import {type AiChartSpec, validateChartSpec, dedupeCharts} from "@/lib/ai/charts.ts";
import {
  getAttendanceReport,
  getDailyLaborCost,
  getLaborPercent,
  getLaborTrend,
  getOvertimeReport,
  getPayrollSummary,
  getScheduledVsActual,
} from "@/api/reports/labor/facade.ts";
import {getLaborDashboardSnapshot} from "@/api/reports/labor/dashboard.ts";
import {getAiLaborDatasets} from "@/api/reports/labor/ai-datasets.ts";

const hasDateValue = (value: unknown) => {
  if (value === undefined || value === null) {
    return false;
  }

  const trimmed = String(value).trim();
  return trimmed.length > 0 && trimmed !== "undefined" && trimmed !== "null";
};

const parseOptionalDateRangeArgs = (args: Record<string, unknown>): DateRangeFilter => {
  const range: DateRangeFilter = {};

  if (hasDateValue(args.startDate)) {
    range.startDate = normalizeQueryDate(String(args.startDate));
  }

  if (hasDateValue(args.endDate)) {
    range.endDate = normalizeQueryDate(String(args.endDate));
  }

  return range;
};

export interface ExecuteToolContext {
  charts: AiChartSpec[];
}

export const executeAiReportTool = async (
  db: DbClient,
  toolName: string,
  args: Record<string, unknown>,
  context: ExecuteToolContext = {charts: []},
): Promise<unknown> => {
  switch (toolName) {
    case "resolve_date_range": {
      const phrase = String(args.phrase ?? "");
      return resolveNaturalDateRange({phrase});
    }

    case "get_top_selling_dishes": {
      return getTopSellingDishes(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 10,
        sortBy: (args.sortBy as "revenue" | "quantity" | undefined) ?? "revenue",
      });
    }

    case "get_sales_summary": {
      const summary = await getSalesSummary(db, parseDateRangeWithPhrase(args));

      return {
        totalNetSales: summary.totalNetSales,
        amountDue: summary.paymentSummary.amountDue,
        amountCollected: summary.paymentSummary.amountCollected,
        cashPayments: summary.paymentSummary.cashPayments,
        nonCashPayments: summary.paymentSummary.nonCashPayments,
        nonCashBreakdown: summary.paymentSummary.nonCashBreakdown,
        roundingBenefit: summary.roundingBenefit,
        serviceCharges: summary.serviceCharges,
        taxes: summary.taxes,
        totalDiscounts: summary.totalDiscounts,
        totalCoupons: summary.totalCoupons,
        totalVoids: summary.totalVoids,
        dayPartTotals: summary.dayPartTotals,
        orderTypeBreakdown: summary.orderTypeBreakdown,
        discountRows: summary.discountRows,
      };
    }

    case "get_unsold_products":
      return getUnsoldProducts(db, {
        ...parseDateRangeWithPhrase(args),
        limit: args.limit ? Number(args.limit) : 100,
      });

    case "get_product_mix": {
      const fullMenu = args.fullMenu === true || args.fullMenu === "true";
      const mix = await getProductMix(db, {
        ...parseDateRangeWithPhrase(args),
        limit: args.limit ? Number(args.limit) : undefined,
      });

      if (fullMenu) {
        return mix;
      }

      return {
        categories: mix.categories.map(category => ({
          categoryName: category.categoryName,
          totals: category.totals,
          topItems: category.items.slice(0, 5).map(item => ({
            name: item.name,
            numSold: item.numSold,
            amount: item.amount,
            profit: item.profit,
          })),
        })),
        topItems: mix.topItems,
      };
    }

    case "get_voids":
      return getVoids(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_tips":
      return getTips(db, {
        ...parseDateRangeWithPhrase(args),
        shiftId: args.shiftId ? String(args.shiftId) : undefined,
        includeProjectedDistribution: args.includeProjectedDistribution !== false,
      });

    case "get_current_session_sales":
      return getCurrentSessionServerSales(db);

    case "list_active_sessions":
      return getActiveSessions(db);

    case "get_server_sales":
      return getServerSales(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 20,
      });

    case "get_tax_summary":
      return getOrderFinanceSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        metric: "tax_amount",
      });

    case "get_discount_summary":
      return getDiscountSummary(db, {
        ...parseDateRangeWithPhrase(args),
        billPercentThreshold: args.billPercentThreshold
          ? Number(args.billPercentThreshold)
          : undefined,
      });

    case "get_coupon_summary":
      return getOrderFinanceSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        metric: "coupon_discount",
      });

    case "get_weekly_sales":
      return getWeeklySales(db, parseOptionalDateRangeArgs(args));

    case "get_hourly_product_sales":
      return getHourlyProductSales(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 20,
      });

    case "get_current_inventory":
      return getCurrentInventory(db, {limit: args.limit ? Number(args.limit) : 100});

    case "get_inventory_movements":
      return getInventoryMovements(db, {
        ...parseOptionalDateRangeArgs(args),
        type: String(args.type) as InventoryMovementType,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_inventory_documents":
      return getInventoryDocuments(db, {
        ...parseOptionalDateRangeArgs(args),
        documentType: String(args.documentType) as InventoryDocumentType,
        documentStatus: args.documentStatus ? String(args.documentStatus) as InventoryDocumentStatus : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_consumption":
      return getConsumptionSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_issuance":
      return getIssuanceSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_waste_summary":
      return getWasteSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_sale_vs_consumption":
      return getSaleVsConsumption(db, parseOptionalDateRangeArgs(args));

    case "get_kitchen_reconciliation":
      return getKitchenReconciliationSummary(db, {
        ...parseOptionalDateRangeArgs(args),
        limit: args.limit ? Number(args.limit) : 20,
      });

    case "get_purchase_orders":
      return getPurchaseOrders(db, {
        ...parseDateRangeWithPhrase(args),
        status: args.status ? String(args.status) : undefined,
        statuses: Array.isArray(args.statuses) ? args.statuses.map(String) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_expenses":
      return getExpenses(db, parseOptionalDateRangeArgs(args));

    case "get_activity_log":
      return getActivityLog(db, {
        ...parseDateRangeWithPhrase(args),
        limit: args.limit ? Number(args.limit) : 50,
        module: args.module ? String(args.module) : undefined,
        modules: Array.isArray(args.modules) ? args.modules.map(String) : undefined,
      });

    case "get_cash_closing":
      return getCashClosing(db, {date: args.date ? String(args.date) : undefined});

    case "get_orders":
      return getOrders(db, {
        ...parseOptionalDateRangeArgs(args),
        statuses: extractOrderStatusesFromArgs(args),
        deliveryOnly: args.deliveryOnly === true || args.deliveryOnly === "true",
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_order_detail":
      return getOrderDetail(db, {
        orderId: args.orderId ? String(args.orderId) : undefined,
        autoId: args.autoId !== undefined ? Number(args.autoId) : undefined,
        invoiceNumber: args.invoiceNumber !== undefined ? Number(args.invoiceNumber) : undefined,
        trackingLimit: args.trackingLimit !== undefined ? Number(args.trackingLimit) : undefined,
      });

    case "get_order_lifecycle":
      return getOrderLifecycleStats(db, parseOptionalDateRangeArgs(args));

    case "get_time_series":
      return getTimeSeries(db, {
        ...parseOptionalDateRangeArgs(args),
        metric: String(args.metric) as TimeSeriesMetric,
        granularity: (args.granularity as "daily" | "weekly" | "hourly" | undefined) ?? "daily",
      });

    case "forecast_sales": {
      const points = (args.points as Array<{period: string; value: number}>) ?? [];
      const forecastDays = args.forecastDays ? Number(args.forecastDays) : 7;
      const method = (args.method as "linear_regression" | "moving_average" | "exponential_smoothing") ?? "linear_regression";
      return forecastFromPoints(
        points.map(p => ({period: p.period, value: p.value})),
        forecastDays,
        method,
      );
    }

    case "forecast_inventory": {
      const consumptionPoints = (args.consumptionPoints as Array<{period: string; value: number}>) ?? [];
      return forecastInventoryConsumption(
        Number(args.currentStock ?? 0),
        consumptionPoints.map(p => ({period: p.period, value: p.value})),
        args.forecastDays ? Number(args.forecastDays) : 14,
        args.reorderLevel ? Number(args.reorderLevel) : undefined,
      );
    }

    case "forecast_inventory_need":
      return forecastInventoryNeed(db, {
        days: args.days !== undefined ? Number(args.days) : undefined,
        phrase: args.phrase ? String(args.phrase) : undefined,
        targetDate: args.targetDate ? String(args.targetDate) : undefined,
        prompt: args.prompt ? String(args.prompt) : undefined,
        store: args.store ? String(args.store) : undefined,
        localEvents: parseLocalEventsArg(args.localEvents),
      });

    case "forecast_staff_need":
      return forecastStaffNeed(db, {
        days: args.days !== undefined ? Number(args.days) : undefined,
        phrase: args.phrase ? String(args.phrase) : undefined,
        targetDate: args.targetDate ? String(args.targetDate) : undefined,
        prompt: args.prompt ? String(args.prompt) : undefined,
        localEvents: parseLocalEventsArg(args.localEvents),
      });

    case "compare_periods":
      return comparePeriods(db, {
        metric: String(args.metric) as Parameters<typeof comparePeriods>[1]["metric"],
        period1: {
          startDate: normalizeQueryDate(String(args.period1Start)),
          endDate: normalizeQueryDate(String(args.period1End)),
        },
        period2: {
          startDate: normalizeQueryDate(String(args.period2Start)),
          endDate: normalizeQueryDate(String(args.period2End)),
        },
      });

    case "get_dashboard_snapshot":
      return getSalesDashboardSnapshot(db, parseOptionalDateRangeArgs(args));

    case "render_chart": {
      const spec = validateChartSpec(args);
      const next = dedupeCharts([...context.charts, spec]);
      context.charts.length = 0;
      context.charts.push(...next);
      return {success: true, chartId: spec.id, message: `Chart "${spec.title}" registered.`};
    }

    case "list_staff":
      return listStaff(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_categories":
      return listCategories(db, {limit: args.limit ? Number(args.limit) : 50});

    case "list_menu_items":
      return listMenuItems(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 500,
      });

    case "list_inventory_items":
      return listInventoryItems(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_floors":
      return listFloors(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_tables":
      return listTables(db, {
        floor_name: args.floor_name ? String(args.floor_name) : undefined,
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_modifier_groups":
      return listModifierGroups(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_kitchens":
      return listKitchens(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_taxes":
      return listTaxes(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_discounts":
      return listDiscounts(db, {
        search: args.search ? String(args.search) : undefined,
        active_only: args.active_only === true,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_order_types":
      return listOrderTypes(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_payment_types":
      return listPaymentTypes(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_extras":
      return listExtras(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_coupons":
      return listCoupons(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_menus":
      return listMenus(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_menu_items":
      return getMenuItems(db, {
        menu_name: args.menu_name ? String(args.menu_name) : undefined,
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 100,
      });

    case "list_workflows":
      return listWorkflows(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_printers":
      return listPrinters(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_users":
      return listUsers(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_roles":
      return listRoles(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_shifts":
      return listShifts(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_employees":
      return listEmployees(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_employee_detail":
      return getEmployeeDetail(db, {
        employeeNumber: args.employee_number ? String(args.employee_number) : undefined,
        employeeId: args.employee_id ? String(args.employee_id) : undefined,
      });

    case "list_departments":
      return listDepartments(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_positions":
      return listPositions(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_cost_centers":
      return listCostCenters(db, {
        search: args.search ? String(args.search) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "list_hr_leave_requests":
      return listHrLeaveRequests(db, {
        ...parseOptionalDateRangeArgs(args),
        employeeNumber: args.employee_number ? String(args.employee_number) : undefined,
        employeeId: args.employee_id ? String(args.employee_id) : undefined,
        status: args.status ? String(args.status) : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_labor_dashboard_snapshot":
      return getLaborDashboardSnapshot(db);

    case "get_daily_labor_cost":
      return getDailyLaborCost(db, parseDateRangeWithPhrase(args));

    case "get_labor_percent":
      return getLaborPercent(db, parseDateRangeWithPhrase(args));

    case "get_overtime_report": {
      const rows = await getOvertimeReport(db, parseDateRangeWithPhrase(args));
      const limit = args.limit ? Number(args.limit) : 20;
      return rows.slice(0, limit);
    }

    case "get_attendance_report":
      return getAttendanceReport(db, parseDateRangeWithPhrase(args));

    case "get_payroll_summary":
      return getPayrollSummary(db, parseDateRangeWithPhrase(args));

    case "get_scheduled_vs_actual":
      return getScheduledVsActual(db, parseDateRangeWithPhrase(args));

    case "get_labor_trend":
      return getLaborTrend(db, parseDateRangeWithPhrase(args));

    case "get_ai_labor_datasets":
      return getAiLaborDatasets(db, {
        ...parseDateRangeWithPhrase(args),
        topLimit: args.topLimit ? Number(args.topLimit) : 10,
      });

    case "get_server_ticket_times":
      return getServerTicketTimes(db, {
        ...parseDateRangeWithPhrase(args),
        limit: args.limit ? Number(args.limit) : 3,
        dineInOnly: args.dineInOnly === true || args.dineInOnly === "true",
      });

    case "get_staff_accountability_metrics":
      return getStaffAccountabilityMetrics(db, {
        ...parseDateRangeWithPhrase(args),
        thresholdMultiplier: args.thresholdMultiplier
          ? Number(args.thresholdMultiplier)
          : undefined,
      });

    case "get_menu_engineering_matrix":
      return getMenuEngineeringMatrix(db, parseDateRangeWithPhrase(args));

    case "get_menu_sales_trends":
      return getMenuSalesTrends(db, {
        volumeDropPercent: args.volumeDropPercent ? Number(args.volumeDropPercent) : undefined,
        highProfitOnly: args.highProfitOnly !== false && args.highProfitOnly !== "false",
      });

    case "estimate_price_change_impact":
      return estimatePriceChangeImpact(db, {
        ...parseDateRangeWithPhrase(args),
        priceChangePercent: args.priceChangePercent ? Number(args.priceChangePercent) : undefined,
        topN: args.topN ? Number(args.topN) : undefined,
      });

    case "get_void_and_cancel_summary":
      return getVoidAndCancelSummary(db, {
        ...parseDateRangeWithPhrase(args),
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_hourly_labor_vs_sales":
      return getHourlyLaborVsSales(db, {
        ...parseDateRangeWithPhrase(args),
        startHour: args.startHour !== undefined ? Number(args.startHour) : undefined,
        endHour: args.endHour !== undefined ? Number(args.endHour) : undefined,
        hourPhrase: args.hourPhrase ? String(args.hourPhrase) : undefined,
        laborPercentThreshold: args.laborPercentThreshold
          ? Number(args.laborPercentThreshold)
          : undefined,
      });

    case "get_prep_times_by_order_type":
      return getPrepTimesByOrderType(db, parseDateRangeWithPhrase(args));

    case "get_kitchen_station_delays":
      return getKitchenStationDelays(db, {
        ...parseDateRangeWithPhrase(args),
        startHour: args.startHour !== undefined ? Number(args.startHour) : undefined,
        endHour: args.endHour !== undefined ? Number(args.endHour) : undefined,
        hourPhrase: args.hourPhrase ? String(args.hourPhrase) : undefined,
      });

    case "get_cash_settlement_audit":
      return getCashSettlementAudit(db, {
        ...parseDateRangeWithPhrase(args),
        minutesBeforeClose: args.minutesBeforeClose
          ? Number(args.minutesBeforeClose)
          : undefined,
        limit: args.limit ? Number(args.limit) : 50,
      });

    case "get_trial_balance":
      return getTrialBalance(db, {
        ...parseDateRangeWithPhrase(args),
        asOf: args.asOf ? String(args.asOf) : undefined,
      });

    case "get_balance_sheet":
      return getBalanceSheet(db, {
        ...parseDateRangeWithPhrase(args),
        asOf: args.asOf ? String(args.asOf) : undefined,
      });

    case "get_profit_loss":
      return getProfitLoss(db, parseDateRangeWithPhrase(args));

    case "get_cash_flow":
      return getCashFlow(db, parseDateRangeWithPhrase(args));

    case "get_general_ledger":
      return getGeneralLedger(db, {
        ...parseDateRangeWithPhrase(args),
        accountCode: args.accountCode ? String(args.accountCode) : undefined,
        accountId: args.accountId ? String(args.accountId) : undefined,
      });

    case "get_journal_entries":
      return getJournalEntries(db, {
        ...parseDateRangeWithPhrase(args),
        status: args.status ? String(args.status) as "draft" | "posted" | "reversed" : undefined,
        sourceModule: args.sourceModule ? String(args.sourceModule) : undefined,
        limit: args.limit ? Number(args.limit) : undefined,
      });

    case "get_account_statement":
      return getAccountStatement(db, {
        ...parseDateRangeWithPhrase(args),
        accountCode: args.accountCode ? String(args.accountCode) : undefined,
        accountId: args.accountId ? String(args.accountId) : undefined,
        statementType: args.statementType === "supplier" ? "supplier" : "customer",
      });

    case "list_accounts":
      return listAccounts(db, {
        headType: args.headType ? String(args.headType) as "asset" | "liability" | "equity" | "income" | "expense" : undefined,
        search: args.search ? String(args.search) : undefined,
        customerOnly: args.customerOnly === true || args.customerOnly === "true",
        supplierOnly: args.supplierOnly === true || args.supplierOnly === "true",
        activeOnly: args.activeOnly !== false && args.activeOnly !== "false",
      });

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
};
