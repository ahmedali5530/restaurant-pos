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
  REPORTS_WEATHER_IMPACT,
  REPORTS_PEAK_PRICING,
  REPORTS_TABLE_UTILIZATION,
  REPORTS_OVERTIME_PREDICTION,
  REPORTS_LOYALTY_ROI,
  REPORTS_PROCUREMENT,
  REPORTS_MENU_ROTATION,
  REPORTS_SERVER_COACH,
  REPORTS_ALLERGEN_RISK,
  REPORTS_OVERBOOKING,
  REPORTS_RESERVATION_CASCADE,
  REPORTS_VIBE_OPTIMIZER,
  REPORTS_ENERGY_VAMPIRE,
  REPORTS_REVIEW_RESPONSE,
  REPORTS_SOCIAL_CONTENT,
  REPORTS_CATERING_OPTIMIZER,
  REPORTS_EQUIPMENT_MAINTENANCE,
  REPORTS_MILESTONE_CAMPAIGN,
  REPORTS_SCHEDULE_PREFERENCE,
  REPORTS_FLOOR_PLAN_OPTIMIZER,
  REPORTS_ONLINE_FRAUD_DETECTOR,
REPORTS_PACKAGING_OPTIMIZER,
  REPORTS_REORDER_POINT_OPTIMIZER,
  REPORTS_PREP_SHEET_OPTIMIZER,
  REPORTS_PAYMENT_FEE_OPTIMIZER,
  REPORTS_HEALTH_INSPECTION_READINESS,
  REPORTS_SCHEDULE_CONFLICT_RESOLVER,
  REPORTS_BREAK_EVEN_TRACKER,
  REPORTS_ALCOHOL_COMPLIANCE_MONITOR,
  REPORTS_RECIPE_NUTRITION_GENERATOR,
  REPORTS_ORDER_CUSTOMIZATION_ANALYZER,
  REPORTS_TABLE_TURNOVER_PREDICTOR,
  REPORTS_OPENING_CLOSING_AUTOMATOR,
  REPORTS_CARBON_FOOTPRINT_TRACKER,
  REPORTS_AD_ROI_TRACKER,
  REPORTS_COMPENSATION_OPTIMIZER,
  REPORTS_TAX_DEDUCTION_FINDER,
  REPORTS_PHONE_ORDER_OPTIMIZER,
  REPORTS_PREDICTIVE_ORDERING,
  REPORTS_COMPETITOR_INTELLIGENCE,
  REPORTS_MULTI_LOCATION_BENCHMARK,
  REPORTS_WASTE_TO_VALUE,
  REPORTS_SOCIAL_LISTENING,
  REPORTS_HIRING_PREDICTOR,
REPORTS_RECIPE_SCALING,
  REPORTS_VENDOR_INVOICE_AUDIT,
  REPORTS_WINE_PAIRING,
  REPORTS_STAFF_GAMIFICATION,
  REPORTS_KITCHEN_PREP_SCHEDULER,
  REPORTS_INVENTORY_TRANSFER,
  REPORTS_SENTIMENT_TREND,
  REPORTS_CLEANING_SCHEDULER,
  REPORTS_DRIVER_COACH,
  REPORTS_EXPIRY_TRACKER,
  REPORTS_AD_TARGETING,
  REPORTS_LOCAL_SEO,
  REPORTS_PRICE_PSYCHOLOGY,
  REPORTS_CASH_STRESS_TEST,
  REPORTS_EVENT_MENU,
  REPORTS_RETENTION_PROGRAM,
  REPORTS_SUPPLIER_NEGOTIATION,
  REPORTS_MAINTENANCE_BUDGET,
  REPORTS_FEEDBACK_LOOP,
  REPORTS_CROSS_SELL,
  REPORTS_DISH_POPULARITY,
  REPORTS_WAITLIST_OPTIMIZER,
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
  WeatherImpactScreen,
  PeakPricingScreen,
  TableUtilizationScreen,
  OvertimePredictionScreen,
  LoyaltyRoiScreen,
  ProcurementScreen,
  MenuRotationScreen,
  ServerCoachScreen,
  AllergenRiskScreen,
  OverbookingScreen,
  ReservationCascadeScreen,
  VibeOptimizerScreen,
  EnergyVampireScreen,
  ReviewResponseScreen,
  SocialContentScreen,
  CateringOptimizerScreen,
  EquipmentMaintenanceScreen,
  MilestoneCampaignScreen,
  SchedulePreferenceScreen,
  FloorPlanOptimizerScreen,
  OnlineFraudDetectorScreen,
PackagingOptimizerScreen,
  ReorderPointOptimizerScreen,
  PrepSheetOptimizerScreen,
  PaymentFeeOptimizerScreen,
  HealthInspectionReadinessScreen,
  ScheduleConflictResolverScreen,
  BreakEvenTrackerScreen,
  AlcoholComplianceMonitorScreen,
  RecipeNutritionGeneratorScreen,
  OrderCustomizationAnalyzerScreen,
  TableTurnoverPredictorScreen,
  OpeningClosingAutomatorScreen,
  CarbonFootprintTrackerScreen,
  AdRoiTrackerScreen,
  CompensationOptimizerScreen,
  TaxDeductionFinderScreen,
  PhoneOrderOptimizerScreen,
  PredictiveOrderingScreen,
  CompetitorIntelligenceScreen,
  MultiLocationBenchmarkScreen,
  WasteToValueConverterScreen,
  SocialListeningMonitorScreen,
  HiringPredictorScreen,
RecipeScalingScreen,
  VendorInvoiceAuditScreen,
  WinePairingScreen,
  StaffGamificationScreen,
  KitchenPrepSchedulerScreen,
  InventoryTransferScreen,
  SentimentTrendScreen,
  CleaningSchedulerScreen,
  DriverCoachScreen,
  ExpiryTrackerScreen,
  AdTargetingScreen,
  LocalSeoScreen,
  PricePsychologyScreen,
  CashStressTestScreen,
  EventMenuScreen,
  RetentionProgramScreen,
  SupplierNegotiationScreen,
  MaintenanceBudgetScreen,
  FeedbackLoopScreen,
  CrossSellScreen,
  DishPopularityScreen,
  WaitlistOptimizerScreen,
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
        <Route path={REPORTS_WEATHER_IMPACT} element={<WeatherImpactScreen/>}/>
        <Route path={REPORTS_PEAK_PRICING} element={<PeakPricingScreen/>}/>
        <Route path={REPORTS_TABLE_UTILIZATION} element={<TableUtilizationScreen/>}/>
        <Route path={REPORTS_OVERTIME_PREDICTION} element={<OvertimePredictionScreen/>}/>
        <Route path={REPORTS_LOYALTY_ROI} element={<LoyaltyRoiScreen/>}/>
        <Route path={REPORTS_PROCUREMENT} element={<ProcurementScreen/>}/>
        <Route path={REPORTS_MENU_ROTATION} element={<MenuRotationScreen/>}/>
        <Route path={REPORTS_SERVER_COACH} element={<ServerCoachScreen/>}/>
        <Route path={REPORTS_ALLERGEN_RISK} element={<AllergenRiskScreen/>}/>
        <Route path={REPORTS_OVERBOOKING} element={<OverbookingScreen/>}/>
        <Route path={REPORTS_RESERVATION_CASCADE} element={<ReservationCascadeScreen/>}/>
        <Route path={REPORTS_VIBE_OPTIMIZER} element={<VibeOptimizerScreen/>}/>
        <Route path={REPORTS_ENERGY_VAMPIRE} element={<EnergyVampireScreen/>}/>
        <Route path={REPORTS_REVIEW_RESPONSE} element={<ReviewResponseScreen/>}/>
        <Route path={REPORTS_SOCIAL_CONTENT} element={<SocialContentScreen/>}/>
        <Route path={REPORTS_CATERING_OPTIMIZER} element={<CateringOptimizerScreen/>}/>
        <Route path={REPORTS_EQUIPMENT_MAINTENANCE} element={<EquipmentMaintenanceScreen/>}/>
        <Route path={REPORTS_MILESTONE_CAMPAIGN} element={<MilestoneCampaignScreen/>}/>
        <Route path={REPORTS_SCHEDULE_PREFERENCE} element={<SchedulePreferenceScreen/>}/>
        <Route path={REPORTS_FLOOR_PLAN_OPTIMIZER} element={<FloorPlanOptimizerScreen/>}/>
        <Route path={REPORTS_ONLINE_FRAUD_DETECTOR} element={<OnlineFraudDetectorScreen/>}/>
<Route path={REPORTS_PACKAGING_OPTIMIZER} element={<PackagingOptimizerScreen/>}/>
        <Route path={REPORTS_REORDER_POINT_OPTIMIZER} element={<ReorderPointOptimizerScreen/>}/>
        <Route path={REPORTS_PREP_SHEET_OPTIMIZER} element={<PrepSheetOptimizerScreen/>}/>
        <Route path={REPORTS_PAYMENT_FEE_OPTIMIZER} element={<PaymentFeeOptimizerScreen/>}/>
        <Route path={REPORTS_HEALTH_INSPECTION_READINESS} element={<HealthInspectionReadinessScreen/>}/>
        <Route path={REPORTS_SCHEDULE_CONFLICT_RESOLVER} element={<ScheduleConflictResolverScreen/>}/>
        <Route path={REPORTS_BREAK_EVEN_TRACKER} element={<BreakEvenTrackerScreen/>}/>
        <Route path={REPORTS_ALCOHOL_COMPLIANCE_MONITOR} element={<AlcoholComplianceMonitorScreen/>}/>
        <Route path={REPORTS_RECIPE_NUTRITION_GENERATOR} element={<RecipeNutritionGeneratorScreen/>}/>
        <Route path={REPORTS_ORDER_CUSTOMIZATION_ANALYZER} element={<OrderCustomizationAnalyzerScreen/>}/>
        <Route path={REPORTS_TABLE_TURNOVER_PREDICTOR} element={<TableTurnoverPredictorScreen/>}/>
        <Route path={REPORTS_OPENING_CLOSING_AUTOMATOR} element={<OpeningClosingAutomatorScreen/>}/>
        <Route path={REPORTS_CARBON_FOOTPRINT_TRACKER} element={<CarbonFootprintTrackerScreen/>}/>
        <Route path={REPORTS_AD_ROI_TRACKER} element={<AdRoiTrackerScreen/>}/>
        <Route path={REPORTS_COMPENSATION_OPTIMIZER} element={<CompensationOptimizerScreen/>}/>
        <Route path={REPORTS_TAX_DEDUCTION_FINDER} element={<TaxDeductionFinderScreen/>}/>
        <Route path={REPORTS_PHONE_ORDER_OPTIMIZER} element={<PhoneOrderOptimizerScreen/>}/>
        <Route path={REPORTS_PREDICTIVE_ORDERING} element={<PredictiveOrderingScreen/>}/>
        <Route path={REPORTS_COMPETITOR_INTELLIGENCE} element={<CompetitorIntelligenceScreen/>}/>
        <Route path={REPORTS_MULTI_LOCATION_BENCHMARK} element={<MultiLocationBenchmarkScreen/>}/>
        <Route path={REPORTS_WASTE_TO_VALUE} element={<WasteToValueConverterScreen/>}/>
        <Route path={REPORTS_SOCIAL_LISTENING} element={<SocialListeningMonitorScreen/>}/>
        <Route path={REPORTS_HIRING_PREDICTOR} element={<HiringPredictorScreen/>}/>
        <Route path={REPORTS_VENDOR_INVOICE_AUDIT} element={<VendorInvoiceAuditScreen/>}/>
<Route path={REPORTS_RECIPE_SCALING} element={<RecipeScalingScreen/>}/>
        <Route path={REPORTS_WINE_PAIRING} element={<WinePairingScreen/>}/>
        <Route path={REPORTS_STAFF_GAMIFICATION} element={<StaffGamificationScreen/>}/>
        <Route path={REPORTS_KITCHEN_PREP_SCHEDULER} element={<KitchenPrepSchedulerScreen/>}/>
        <Route path={REPORTS_INVENTORY_TRANSFER} element={<InventoryTransferScreen/>}/>
        <Route path={REPORTS_SENTIMENT_TREND} element={<SentimentTrendScreen/>}/>
        <Route path={REPORTS_CLEANING_SCHEDULER} element={<CleaningSchedulerScreen/>}/>
        <Route path={REPORTS_DRIVER_COACH} element={<DriverCoachScreen/>}/>
        <Route path={REPORTS_EXPIRY_TRACKER} element={<ExpiryTrackerScreen/>}/>
        <Route path={REPORTS_AD_TARGETING} element={<AdTargetingScreen/>}/>
        <Route path={REPORTS_LOCAL_SEO} element={<LocalSeoScreen/>}/>
        <Route path={REPORTS_PRICE_PSYCHOLOGY} element={<PricePsychologyScreen/>}/>
        <Route path={REPORTS_CASH_STRESS_TEST} element={<CashStressTestScreen/>}/>
        <Route path={REPORTS_EVENT_MENU} element={<EventMenuScreen/>}/>
        <Route path={REPORTS_RETENTION_PROGRAM} element={<RetentionProgramScreen/>}/>
        <Route path={REPORTS_SUPPLIER_NEGOTIATION} element={<SupplierNegotiationScreen/>}/>
        <Route path={REPORTS_MAINTENANCE_BUDGET} element={<MaintenanceBudgetScreen/>}/>
        <Route path={REPORTS_FEEDBACK_LOOP} element={<FeedbackLoopScreen/>}/>
        <Route path={REPORTS_CROSS_SELL} element={<CrossSellScreen/>}/>
        <Route path={REPORTS_DISH_POPULARITY} element={<DishPopularityScreen/>}/>
        <Route path={REPORTS_WAITLIST_OPTIMIZER} element={<WaitlistOptimizerScreen/>}/>
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
