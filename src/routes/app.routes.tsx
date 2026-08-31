import {Route, Routes} from "react-router";
import {Login} from "@/screens/login.tsx";
import {NotFound} from "@/screens/not-found.tsx";
import {Menu} from "@/screens/menu";
import {Orders} from "@/screens/orders.tsx";
import {Summary} from "@/screens/summary.tsx";
import {KitchenScreen} from "@/screens/kitchen.tsx";
import {Clock} from "@/screens/clock.tsx";
import {KioskScreen} from "@/screens/kiosk.tsx";
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
  LOGIN,
  MENU,
  ORDERS,
  REPORTS,
  REPORTS_ACTIVITY,
  REPORTS_AI,
  REPORTS_FORECAST,
  REPORTS_MENU_OPTIMIZATION,
  REPORTS_SENTIMENT,
  REPORTS_WASTE_INTELLIGENCE,
  REPORTS_SCHEDULING_OPTIMIZATION,
  REPORTS_CASH_FLOW,
  REPORTS_VENDOR_PERFORMANCE,
  REPORTS_TABLE_TURNOVER,
  REPORTS_DYNAMIC_PRICING,
  REPORTS_FORECAST_ACCURACY,
  REPORTS_UPSELL_EFFECTIVENESS,
  REPORTS_AI_COMMAND_CENTER,
  REPORTS_ANOMALY_ALERTS,
  REPORTS_CUSTOMER_CLV,
  REPORTS_CHURN_PREDICTION,
  REPORTS_PROMO_EFFECTIVENESS,
  REPORTS_SERVER_PERFORMANCE,
  REPORTS_COMPETITOR_MONITORING,
  REPORTS_FOOD_COST_TRENDS,
  REPORTS_RECIPE_OPTIMIZATION,
  REPORTS_SEGMENTATION,
  REPORTS_LABOR_OPTIMIZATION,
  REPORTS_DELIVERY_ANALYTICS,
  REPORTS_PEAK_HOUR,
  REPORTS_TIP_ANALYTICS,
  REPORTS_REVPASH,
  REPORTS_CUSTOMER_JOURNEY,
  REPORTS_SEASONAL_TRENDS,
  REPORTS_GUEST_PREFERENCES,
  REPORTS_SHRINKAGE,
  REPORTS_REVENUE_FORECAST,
  REPORTS_NOSHOW_PREDICTION,
  REPORTS_ORDER_FRAUD,
  REPORTS_FOOD_SAFETY,
  REPORTS_ENERGY_OPTIMIZATION,
  REPORTS_STAFF_TURNOVER,
  REPORTS_YIELD_VARIANCE,
  REPORTS_KITCHEN_BOTTLENECK,
  REPORTS_WIN_BACK,
  REPORTS_CHARGEBACK_RISK,
  REPORTS_PRICE_ELASTICITY,
  REPORTS_PROMO_ABUSE,
  REPORTS_MENU_PAIRING,
  REPORTS_WAIT_PREDICTION,
  REPORTS_PROMO_FORECAST,
  REPORTS_CLV_TRAJECTORY,
  REPORTS_SPOILAGE_PREDICTION,
  REPORTS_VISIT_CADENCE,
  REPORTS_RECIPE_SUBSTITUTION,
  REPORTS_TRAINING_NEED,
  REPORTS_SEATING_OPTIMIZATION,
  REPORTS_SATISFACTION_PREDICTION,
  REPORTS_ABANDONED_CART,
  REPORTS_BRANCH_COMPARISON,
  REPORTS_COMPLIANCE_TRACKING,
  REPORTS_GIFTCARD_FRAUD,
  REPORTS_REFUND_ABUSE,
  REPORTS_BUFFET_DEMAND,
  REPORTS_DELIVERY_ROUTE,
  REPORTS_SERVER_LOAD_BALANCER,
  REPORTS_DISH_PROFITABILITY,
  REPORTS_CASH_DRAWER_ANOMALY,
  REPORTS_CASH_EARLY_WARNING,
  REPORTS_COMPLAINT_PATTERN,
  REPORTS_WEATHER_IMPACT,
  REPORTS_PEAK_PRICING,
  REPORTS_TABLE_UTILIZATION,
  REPORTS_OVERTIME_PREDICTION,
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
  TABLESIDE,
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
  MergeOrdersReport,
  OrderDisplayScreen,
  OrderFiscalReport,
  OrderLifecycleReport,
  OrderReceiptReport,
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
  TablesSummaryReport,
  TaxReport,
  TipDistributionScreen,
  TipsReport,
  VoidsReport,
  WasteReport,
  DemandForecastScreen,
  MenuOptimizationScreen,
  SentimentReportScreen,
  WasteIntelligenceScreen,
  SchedulingOptimizationScreen,
  CashFlowReportScreen,
  VendorPerformanceScreen,
  TableTurnoverScreen,
  DynamicPricingScreen,
  ForecastAccuracyScreen,
  UpsellEffectivenessScreen,
  AiCommandCenterScreen,
  AnomalyAlertsScreen,
  CustomerCLVScreen,
  ChurnPredictionScreen,
  PromoEffectivenessScreen,
  ServerPerformanceScreen,
  CompetitorMonitoringScreen,
  FoodCostTrendScreen,
  RecipeOptimizationScreen,
  SegmentationScreen,
  LaborOptimizationScreen,
  DeliveryAnalyticsScreen,
  PeakHourScreen,
  TipAnalyticsScreen,
  RevPASHScreen,
  JourneyScreen,
  SeasonalScreen,
  GuestPreferenceScreen,
  ShrinkageScreen,
  RevenueForecastScreen,
  NoShowPredictionScreen,
  OrderFraudScreen,
  FoodSafetyScreen,
  EnergyOptimizationScreen,
  StaffTurnoverScreen,
  YieldVarianceScreen,
  KitchenBottleneckScreen,
  WinBackScreen,
  ChargebackRiskScreen,
  PriceElasticityScreen,
  PromoAbuseScreen,
  MenuPairingScreen,
  WaitPredictionScreen,
  PromoForecastScreen,
  CLVTrajectoryScreen,
  SpoilagePredictionScreen,
  VisitCadenceScreen,
  RecipeSubstitutionScreen,
  TrainingNeedScreen,
  SeatingOptimizationScreen,
  SatisfactionPredictionScreen,
  AbandonedCartScreen,
  BranchComparisonScreen,
  ComplianceTrackingScreen,
  GiftCardFraudScreen,
  RefundAbuseScreen,
  BuffetDemandScreen,
  DeliveryRouteScreen,
  ServerLoadBalancerScreen,
  DishProfitabilityScreen,
  CashDrawerAnomalyScreen,
  CashEarlyWarningScreen,
  ComplaintPatternScreen,
  WeatherImpactScreen,
  PeakPricingScreen,
  TableUtilizationScreen,
  OvertimePredictionScreen,
  TablesideScreen,
} from "@/routes/lazy-screens.ts";

export const AppRoutes = () => (
  <Routes>
    <Route path={LOGIN} element={<Login/>}/>
    {/* Kiosk mode — public route, no login required */}
    <Route path="/kiosk" element={<KioskScreen/>}/>
    <Route element={<ProtectedRoute/>}>
      <Route path={MENU} element={<Menu/>}/>
      <Route path={ORDERS} element={<Orders/>}/>
      <Route path={SUMMARY} element={<Summary/>}/>
      <Route path={KITCHEN} element={<KitchenScreen/>}/>
      <Route path={CLOCK} element={<Clock/>}/>
      <Route path={TABLESIDE} element={<TablesideScreen/>}/>

      <Route element={<SuspenseOutlet/>}>
        <Route path={CLOSING} element={<Closing/>}/>
        <Route path={ORDER_DISPLAY} element={<OrderDisplayScreen/>}/>
        <Route path={DELIVERY} element={<Delivery/>}/>
        <Route path={ADMIN} element={<Admin/>}/>
        <Route path={SETTINGS} element={<Settings/>}/>
        <Route path={INTEGRATIONS} element={<IntegrationsScreen/>}/>
        <Route path={INVENTORY} element={<Inventory/>}/>
        <Route path={HR} element={<HrScreen/>}/>
        <Route path={TIP_DISTRIBUTION} element={<TipDistributionScreen/>}/>
        <Route path={ACCOUNTS} element={<AccountsScreen/>}/>
        <Route path={REPORTS} element={<Reports/>}/>
        <Route path={INVENTORY_PRINT} element={<InventoryDocumentPrintPage/>}/>
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
        <Route path={REPORTS_ORDER_RECEIPT} element={<OrderReceiptReport/>}/>
        <Route path={REPORTS_ORDER_FISCAL} element={<OrderFiscalReport/>}/>
        <Route path={REPORTS_EXPENSE} element={<ExpenseReport/>}/>
        <Route path={REPORTS_ACTIVITY} element={<ActivityReport/>}/>
        <Route path={REPORTS_AI} element={<AiReport/>}/>
        <Route path={REPORTS_FORECAST} element={<DemandForecastScreen/>}/>
        <Route path={REPORTS_MENU_OPTIMIZATION} element={<MenuOptimizationScreen/>}/>
        <Route path={REPORTS_SENTIMENT} element={<SentimentReportScreen/>}/>
        <Route path={REPORTS_WASTE_INTELLIGENCE} element={<WasteIntelligenceScreen/>}/>
        <Route path={REPORTS_SCHEDULING_OPTIMIZATION} element={<SchedulingOptimizationScreen/>}/>
        <Route path={REPORTS_CASH_FLOW} element={<CashFlowReportScreen/>}/>
        <Route path={REPORTS_VENDOR_PERFORMANCE} element={<VendorPerformanceScreen/>}/>
        <Route path={REPORTS_TABLE_TURNOVER} element={<TableTurnoverScreen/>}/>
        <Route path={REPORTS_DYNAMIC_PRICING} element={<DynamicPricingScreen/>}/>
        <Route path={REPORTS_FORECAST_ACCURACY} element={<ForecastAccuracyScreen/>}/>
        <Route path={REPORTS_UPSELL_EFFECTIVENESS} element={<UpsellEffectivenessScreen/>}/>
        <Route path={REPORTS_AI_COMMAND_CENTER} element={<AiCommandCenterScreen/>}/>
        <Route path={REPORTS_ANOMALY_ALERTS} element={<AnomalyAlertsScreen/>}/>
        <Route path={REPORTS_CUSTOMER_CLV} element={<CustomerCLVScreen/>}/>
        <Route path={REPORTS_CHURN_PREDICTION} element={<ChurnPredictionScreen/>}/>
        <Route path={REPORTS_PROMO_EFFECTIVENESS} element={<PromoEffectivenessScreen/>}/>
        <Route path={REPORTS_SERVER_PERFORMANCE} element={<ServerPerformanceScreen/>}/>
        <Route path={REPORTS_COMPETITOR_MONITORING} element={<CompetitorMonitoringScreen/>}/>
        <Route path={REPORTS_FOOD_COST_TRENDS} element={<FoodCostTrendScreen/>}/>
        <Route path={REPORTS_RECIPE_OPTIMIZATION} element={<RecipeOptimizationScreen/>}/>
        <Route path={REPORTS_SEGMENTATION} element={<SegmentationScreen/>}/>
        <Route path={REPORTS_LABOR_OPTIMIZATION} element={<LaborOptimizationScreen/>}/>
        <Route path={REPORTS_DELIVERY_ANALYTICS} element={<DeliveryAnalyticsScreen/>}/>
        <Route path={REPORTS_PEAK_HOUR} element={<PeakHourScreen/>}/>
        <Route path={REPORTS_TIP_ANALYTICS} element={<TipAnalyticsScreen/>}/>
        <Route path={REPORTS_REVPASH} element={<RevPASHScreen/>}/>
        <Route path={REPORTS_CUSTOMER_JOURNEY} element={<JourneyScreen/>}/>
        <Route path={REPORTS_SEASONAL_TRENDS} element={<SeasonalScreen/>}/>
        <Route path={REPORTS_GUEST_PREFERENCES} element={<GuestPreferenceScreen/>}/>
        <Route path={REPORTS_SHRINKAGE} element={<ShrinkageScreen/>}/>
        <Route path={REPORTS_REVENUE_FORECAST} element={<RevenueForecastScreen/>}/>
        <Route path={REPORTS_NOSHOW_PREDICTION} element={<NoShowPredictionScreen/>}/>
        <Route path={REPORTS_ORDER_FRAUD} element={<OrderFraudScreen/>}/>
        <Route path={REPORTS_FOOD_SAFETY} element={<FoodSafetyScreen/>}/>
        <Route path={REPORTS_ENERGY_OPTIMIZATION} element={<EnergyOptimizationScreen/>}/>
        <Route path={REPORTS_STAFF_TURNOVER} element={<StaffTurnoverScreen/>}/>
        <Route path={REPORTS_YIELD_VARIANCE} element={<YieldVarianceScreen/>}/>
        <Route path={REPORTS_KITCHEN_BOTTLENECK} element={<KitchenBottleneckScreen/>}/>
        <Route path={REPORTS_WIN_BACK} element={<WinBackScreen/>}/>
        <Route path={REPORTS_CHARGEBACK_RISK} element={<ChargebackRiskScreen/>}/>
        <Route path={REPORTS_PRICE_ELASTICITY} element={<PriceElasticityScreen/>}/>
        <Route path={REPORTS_PROMO_ABUSE} element={<PromoAbuseScreen/>}/>
        <Route path={REPORTS_MENU_PAIRING} element={<MenuPairingScreen/>}/>
        <Route path={REPORTS_WAIT_PREDICTION} element={<WaitPredictionScreen/>}/>
        <Route path={REPORTS_PROMO_FORECAST} element={<PromoForecastScreen/>}/>
        <Route path={REPORTS_CLV_TRAJECTORY} element={<CLVTrajectoryScreen/>}/>
        <Route path={REPORTS_SPOILAGE_PREDICTION} element={<SpoilagePredictionScreen/>}/>
        <Route path={REPORTS_VISIT_CADENCE} element={<VisitCadenceScreen/>}/>
        <Route path={REPORTS_RECIPE_SUBSTITUTION} element={<RecipeSubstitutionScreen/>}/>
        <Route path={REPORTS_TRAINING_NEED} element={<TrainingNeedScreen/>}/>
        <Route path={REPORTS_SEATING_OPTIMIZATION} element={<SeatingOptimizationScreen/>}/>
        <Route path={REPORTS_SATISFACTION_PREDICTION} element={<SatisfactionPredictionScreen/>}/>
        <Route path={REPORTS_ABANDONED_CART} element={<AbandonedCartScreen/>}/>
        <Route path={REPORTS_BRANCH_COMPARISON} element={<BranchComparisonScreen/>}/>
        <Route path={REPORTS_COMPLIANCE_TRACKING} element={<ComplianceTrackingScreen/>}/>
        <Route path={REPORTS_GIFTCARD_FRAUD} element={<GiftCardFraudScreen/>}/>
        <Route path={REPORTS_REFUND_ABUSE} element={<RefundAbuseScreen/>}/>
        <Route path={REPORTS_BUFFET_DEMAND} element={<BuffetDemandScreen/>}/>
        <Route path={REPORTS_DELIVERY_ROUTE} element={<DeliveryRouteScreen/>}/>
        <Route path={REPORTS_SERVER_LOAD_BALANCER} element={<ServerLoadBalancerScreen/>}/>
        <Route path={REPORTS_DISH_PROFITABILITY} element={<DishProfitabilityScreen/>}/>
        <Route path={REPORTS_CASH_DRAWER_ANOMALY} element={<CashDrawerAnomalyScreen/>}/>
        <Route path={REPORTS_CASH_EARLY_WARNING} element={<CashEarlyWarningScreen/>}/>
        <Route path={REPORTS_COMPLAINT_PATTERN} element={<ComplaintPatternScreen/>}/>
        <Route path={REPORTS_WEATHER_IMPACT} element={<WeatherImpactScreen/>}/>
        <Route path={REPORTS_PEAK_PRICING} element={<PeakPricingScreen/>}/>
        <Route path={REPORTS_TABLE_UTILIZATION} element={<TableUtilizationScreen/>}/>
        <Route path={REPORTS_OVERTIME_PREDICTION} element={<OvertimePredictionScreen/>}/>
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
        <Route path={REPORTS_PURCHASE_ORDER} element={<PurchaseOrderReport/>}/>
        <Route path={REPORTS_PURCHASE_RETURN} element={<PurchaseReturnReport/>}/>
        <Route path={REPORTS_ISSUE} element={<IssueReport/>}/>
        <Route path={REPORTS_ISSUE_RETURN} element={<IssueReturnReport/>}/>
        <Route path={REPORTS_WASTE} element={<WasteReport/>}/>
        <Route path={REPORTS_CONSUMPTION} element={<ConsumptionReport/>}/>
        <Route path={REPORTS_SALE_VS_CONSUMPTION} element={<SaleVsConsumptionReport/>}/>
        <Route path={REPORTS_KITCHEN_RECONCILIATION} element={<KitchenReconciliationReport/>}/>
        <Route path={REPORTS_PRODUCTION} element={<ProductionReport/>}/>
        <Route path={REPORTS_BUFFET} element={<BuffetReport/>}/>
        <Route path={REPORTS_LABOR_DASHBOARD} element={<LaborDashboardReport/>}/>
        <Route path={REPORTS_LABOR_DAILY_COST} element={<LaborDailyCostReport/>}/>
        <Route path={REPORTS_LABOR_OVERTIME} element={<LaborOvertimeReport/>}/>
        <Route path={REPORTS_LABOR_ATTENDANCE} element={<LaborAttendanceReport/>}/>
        <Route path={REPORTS_LABOR_PAYROLL_SUMMARY} element={<LaborPayrollSummaryReport/>}/>
        <Route path={REPORTS_LABOR_SCHEDULED_VS_ACTUAL} element={<LaborScheduledVsActualReport/>}/>
        <Route path={REPORTS_LABOR_SCHEDULE_ROSTER} element={<LaborScheduleRosterReport/>}/>
      </Route>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes>
);
