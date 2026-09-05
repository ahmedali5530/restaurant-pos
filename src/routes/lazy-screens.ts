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

export const DynamicPricingScreen = lazy(() =>
  import('@/screens/reports/dynamic.pricing.report.tsx').then(m => ({default: m.DynamicPricingScreen}))
);

export const ForecastAccuracyScreen = lazy(() =>
  import('@/screens/reports/forecast.accuracy.report.tsx').then(m => ({default: m.ForecastAccuracyScreen}))
);

export const UpsellEffectivenessScreen = lazy(() =>
  import('@/screens/reports/upsell.effectiveness.report.tsx').then(m => ({default: m.UpsellEffectivenessScreen}))
);

export const AiCommandCenterScreen = lazy(() =>
  import('@/screens/reports/ai.command.center.tsx').then(m => ({default: m.AiCommandCenterScreen}))
);

export const AnomalyAlertsScreen = lazy(() =>
  import('@/screens/reports/anomaly.alerts.report.tsx').then(m => ({default: m.AnomalyAlertsScreen}))
);

export const CustomerCLVScreen = lazy(() =>
  import('@/screens/reports/customer.clv.report.tsx').then(m => ({default: m.CustomerCLVScreen}))
);

export const ChurnPredictionScreen = lazy(() =>
  import('@/screens/reports/churn.prediction.report.tsx').then(m => ({default: m.ChurnPredictionScreen}))
);

export const PromoEffectivenessScreen = lazy(() =>
  import('@/screens/reports/promo.effectiveness.report.tsx').then(m => ({default: m.PromoEffectivenessScreen}))
);

export const ServerPerformanceScreen = lazy(() =>
  import('@/screens/reports/server.performance.report.tsx').then(m => ({default: m.ServerPerformanceScreen}))
);

export const CompetitorMonitoringScreen = lazy(() =>
  import('@/screens/reports/competitor.monitoring.report.tsx').then(m => ({default: m.CompetitorMonitoringScreen}))
);

export const FoodCostTrendScreen = lazy(() =>
  import('@/screens/reports/food.cost.trend.report.tsx').then(m => ({default: m.FoodCostTrendScreen}))
);

export const RecipeOptimizationScreen = lazy(() =>
  import('@/screens/reports/recipe.optimization.report.tsx').then(m => ({default: m.RecipeOptimizationScreen}))
);

export const SegmentationScreen = lazy(() =>
  import('@/screens/reports/segmentation.report.tsx').then(m => ({default: m.SegmentationScreen}))
);

export const LaborOptimizationScreen = lazy(() =>
  import('@/screens/reports/labor.optimization.report.tsx').then(m => ({default: m.LaborOptimizationScreen}))
);

export const DeliveryAnalyticsScreen = lazy(() =>
  import('@/screens/reports/delivery.analytics.report.tsx').then(m => ({default: m.DeliveryAnalyticsScreen}))
);

export const PeakHourScreen = lazy(() =>
  import('@/screens/reports/peak.hour.report.tsx').then(m => ({default: m.PeakHourScreen}))
);

export const TipAnalyticsScreen = lazy(() =>
  import('@/screens/reports/tip.analytics.report.tsx').then(m => ({default: m.TipAnalyticsScreen}))
);

export const RevPASHScreen = lazy(() =>
  import('@/screens/reports/revpash.report.tsx').then(m => ({default: m.RevPASHScreen}))
);

export const JourneyScreen = lazy(() =>
  import('@/screens/reports/journey.report.tsx').then(m => ({default: m.JourneyScreen}))
);

export const SeasonalScreen = lazy(() =>
  import('@/screens/reports/seasonal.report.tsx').then(m => ({default: m.SeasonalScreen}))
);

export const GuestPreferenceScreen = lazy(() =>
  import('@/screens/reports/guest.preference.report.tsx').then(m => ({default: m.GuestPreferenceScreen}))
);

export const ShrinkageScreen = lazy(() =>
  import('@/screens/reports/shrinkage.report.tsx').then(m => ({default: m.ShrinkageScreen}))
);

export const RevenueForecastScreen = lazy(() =>
  import('@/screens/reports/revenue.forecast.report.tsx').then(m => ({default: m.RevenueForecastScreen}))
);

export const NoShowPredictionScreen = lazy(() =>
  import('@/screens/reports/noshow.prediction.report.tsx').then(m => ({default: m.NoShowPredictionScreen}))
);

export const OrderFraudScreen = lazy(() =>
  import('@/screens/reports/order.fraud.report.tsx').then(m => ({default: m.OrderFraudScreen}))
);

export const FoodSafetyScreen = lazy(() =>
  import('@/screens/reports/food.safety.report.tsx').then(m => ({default: m.FoodSafetyScreen}))
);

export const EnergyOptimizationScreen = lazy(() =>
  import('@/screens/reports/energy.optimization.report.tsx').then(m => ({default: m.EnergyOptimizationScreen}))
);

export const StaffTurnoverScreen = lazy(() =>
  import('@/screens/reports/staff.turnover.report.tsx').then(m => ({default: m.StaffTurnoverScreen}))
);

export const YieldVarianceScreen = lazy(() =>
  import('@/screens/reports/yield.variance.report.tsx').then(m => ({default: m.YieldVarianceScreen}))
);

export const KitchenBottleneckScreen = lazy(() =>
  import('@/screens/reports/kitchen.bottleneck.report.tsx').then(m => ({default: m.KitchenBottleneckScreen}))
);

export const WinBackScreen = lazy(() =>
  import('@/screens/reports/winback.report.tsx').then(m => ({default: m.WinBackScreen}))
);

export const ChargebackRiskScreen = lazy(() =>
  import('@/screens/reports/chargeback.risk.report.tsx').then(m => ({default: m.ChargebackRiskScreen}))
);

export const PriceElasticityScreen = lazy(() =>
  import('@/screens/reports/price.elasticity.report.tsx').then(m => ({default: m.PriceElasticityScreen}))
);

export const PromoAbuseScreen = lazy(() =>
  import('@/screens/reports/promo.abuse.report.tsx').then(m => ({default: m.PromoAbuseScreen}))
);

export const MenuPairingScreen = lazy(() =>
  import('@/screens/reports/menu.pairing.report.tsx').then(m => ({default: m.MenuPairingScreen}))
);

export const WeatherImpactScreen = lazy(() =>
  import('@/screens/reports/weather.impact.report.tsx').then(m => ({default: m.WeatherImpactScreen}))
);
export const PeakPricingScreen = lazy(() =>
  import('@/screens/reports/peak.pricing.report.tsx').then(m => ({default: m.PeakPricingScreen}))
);
export const TableUtilizationScreen = lazy(() =>
  import('@/screens/reports/table.utilization.report.tsx').then(m => ({default: m.TableUtilizationScreen}))
);
export const OvertimePredictionScreen = lazy(() =>
  import('@/screens/reports/overtime.prediction.report.tsx').then(m => ({default: m.OvertimePredictionScreen}))
);
export const LoyaltyRoiScreen = lazy(() =>
  import('@/screens/reports/loyalty.roi.report.tsx').then(m => ({default: m.LoyaltyRoiScreen}))
);
export const ProcurementScreen = lazy(() =>
  import('@/screens/reports/procurement.report.tsx').then(m => ({default: m.ProcurementScreen}))
);
export const MenuRotationScreen = lazy(() =>
  import('@/screens/reports/menu.rotation.report.tsx').then(m => ({default: m.MenuRotationScreen}))
);
export const ServerCoachScreen = lazy(() =>
  import('@/screens/reports/server.coach.report.tsx').then(m => ({default: m.ServerCoachScreen}))
);
export const AllergenRiskScreen = lazy(() =>
  import('@/screens/reports/allergen.risk.report.tsx').then(m => ({default: m.AllergenRiskScreen}))
);
export const OverbookingScreen = lazy(() =>
  import('@/screens/reports/overbooking.report.tsx').then(m => ({default: m.OverbookingScreen}))
);
export const ReservationCascadeScreen = lazy(() =>
  import('@/screens/reports/reservation.cascade.report.tsx').then(m => ({default: m.ReservationCascadeScreen}))
);
export const VibeOptimizerScreen = lazy(() =>
  import('@/screens/reports/vibe.optimizer.report.tsx').then(m => ({default: m.VibeOptimizerScreen}))
);
export const EnergyVampireScreen = lazy(() =>
  import('@/screens/reports/energy.vampire.report.tsx').then(m => ({default: m.EnergyVampireScreen}))
);
export const ReviewResponseScreen = lazy(() =>
  import('@/screens/reports/review.response.report.tsx').then(m => ({default: m.ReviewResponseScreen}))
);
export const SocialContentScreen = lazy(() =>
  import('@/screens/reports/social.content.report.tsx').then(m => ({default: m.SocialContentScreen}))
);
export const CateringOptimizerScreen = lazy(() =>
  import('@/screens/reports/catering.optimizer.report.tsx').then(m => ({default: m.CateringOptimizerScreen}))
);
export const EquipmentMaintenanceScreen = lazy(() =>
  import('@/screens/reports/equipment.maintenance.report.tsx').then(m => ({default: m.EquipmentMaintenanceScreen}))
);
export const MilestoneCampaignScreen = lazy(() =>
  import('@/screens/reports/milestone.campaign.report.tsx').then(m => ({default: m.MilestoneCampaignScreen}))
);
export const SchedulePreferenceScreen = lazy(() =>
  import('@/screens/reports/schedule.preference.report.tsx').then(m => ({default: m.SchedulePreferenceScreen}))
);
export const FloorPlanOptimizerScreen = lazy(() =>
  import('@/screens/reports/floor.plan.optimizer.report.tsx').then(m => ({default: m.FloorPlanOptimizerScreen}))
);
export const OnlineFraudDetectorScreen = lazy(() =>
  import('@/screens/reports/online.fraud.detector.report.tsx').then(m => ({default: m.OnlineFraudDetectorScreen}))
);

export const PackagingOptimizerScreen = lazy(() =>
  import('@/screens/reports/packaging.optimizer.report.tsx').then(m => ({default: m.PackagingOptimizerScreen}))
);

export const ReorderPointOptimizerScreen = lazy(() =>
  import('@/screens/reports/reorder.point.optimizer.report.tsx').then(m => ({default: m.ReorderPointOptimizerScreen}))
);

export const PrepSheetOptimizerScreen = lazy(() =>
  import('@/screens/reports/prep.sheet.optimizer.report.tsx').then(m => ({default: m.PrepSheetOptimizerScreen}))
);

export const PaymentFeeOptimizerScreen = lazy(() =>
  import('@/screens/reports/payment.fee.optimizer.report.tsx').then(m => ({default: m.PaymentFeeOptimizerScreen}))
);

export const HealthInspectionReadinessScreen = lazy(() =>
  import('@/screens/reports/health.inspection.readiness.report.tsx').then(m => ({default: m.HealthInspectionReadinessScreen}))
);

export const ScheduleConflictResolverScreen = lazy(() =>
  import('@/screens/reports/schedule.conflict.resolver.report.tsx').then(m => ({default: m.ScheduleConflictResolverScreen}))
);

export const BreakEvenTrackerScreen = lazy(() =>
  import('@/screens/reports/break.even.tracker.report.tsx').then(m => ({default: m.BreakEvenTrackerScreen}))
);

export const AlcoholComplianceMonitorScreen = lazy(() =>
  import('@/screens/reports/alcohol.compliance.monitor.report.tsx').then(m => ({default: m.AlcoholComplianceMonitorScreen}))
);

export const RecipeNutritionGeneratorScreen = lazy(() =>
  import('@/screens/reports/recipe.nutrition.generator.report.tsx').then(m => ({default: m.RecipeNutritionGeneratorScreen}))
);

export const OrderCustomizationAnalyzerScreen = lazy(() =>
  import('@/screens/reports/order.customization.analyzer.report.tsx').then(m => ({default: m.OrderCustomizationAnalyzerScreen}))
);

export const TableTurnoverPredictorScreen = lazy(() =>
  import('@/screens/reports/table.turnover.predictor.report.tsx').then(m => ({default: m.TableTurnoverPredictorScreen}))
);

export const OpeningClosingAutomatorScreen = lazy(() =>
  import('@/screens/reports/opening.closing.automator.report.tsx').then(m => ({default: m.OpeningClosingAutomatorScreen}))
);

export const CarbonFootprintTrackerScreen = lazy(() =>
  import('@/screens/reports/carbon.footprint.tracker.report.tsx').then(m => ({default: m.CarbonFootprintTrackerScreen}))
);

export const AdRoiTrackerScreen = lazy(() =>
  import('@/screens/reports/ad.roi.tracker.report.tsx').then(m => ({default: m.AdRoiTrackerScreen}))
);

export const CompensationOptimizerScreen = lazy(() =>
  import('@/screens/reports/compensation.optimizer.report.tsx').then(m => ({default: m.CompensationOptimizerScreen}))
);

export const TaxDeductionFinderScreen = lazy(() =>
  import('@/screens/reports/tax.deduction.finder.report.tsx').then(m => ({default: m.TaxDeductionFinderScreen}))
);

export const PhoneOrderOptimizerScreen = lazy(() =>
  import('@/screens/reports/phone.order.optimizer.report.tsx').then(m => ({default: m.PhoneOrderOptimizerScreen}))
);

export const PredictiveOrderingScreen = lazy(() =>
  import('@/screens/reports/predictive.ordering.report.tsx').then(m => ({default: m.PredictiveOrderingScreen}))
);

export const CompetitorIntelligenceScreen = lazy(() =>
  import('@/screens/reports/competitor.intelligence.report.tsx').then(m => ({default: m.CompetitorIntelligenceScreen}))
);

export const MultiLocationBenchmarkScreen = lazy(() =>
  import('@/screens/reports/multi.location.benchmark.report.tsx').then(m => ({default: m.MultiLocationBenchmarkScreen}))
);

export const WasteToValueConverterScreen = lazy(() =>
  import('@/screens/reports/waste.to.value.converter.report.tsx').then(m => ({default: m.WasteToValueConverterScreen}))
);

export const SocialListeningMonitorScreen = lazy(() =>
  import('@/screens/reports/social.listening.monitor.report.tsx').then(m => ({default: m.SocialListeningMonitorScreen}))
);

export const HiringPredictorScreen = lazy(() =>
  import('@/screens/reports/hiring.predictor.report.tsx').then(m => ({default: m.HiringPredictorScreen}))
);

export const RecipeScalingScreen = lazy(() =>
  import('@/screens/reports/recipe.scaling.report.tsx').then(m => ({default: m.RecipeScalingScreen}))
);

export const WinePairingScreen = lazy(() =>
  import('@/screens/reports/wine.pairing.report.tsx').then(m => ({default: m.WinePairingScreen}))
);

export const StaffGamificationScreen = lazy(() =>
  import('@/screens/reports/staff.gamification.report.tsx').then(m => ({default: m.StaffGamificationScreen}))
);

export const KitchenPrepSchedulerScreen = lazy(() =>
  import('@/screens/reports/kitchen.prep.scheduler.report.tsx').then(m => ({default: m.KitchenPrepSchedulerScreen}))
);

export const InventoryTransferScreen = lazy(() =>
  import('@/screens/reports/inventory.transfer.report.tsx').then(m => ({default: m.InventoryTransferScreen}))
);

export const SentimentTrendScreen = lazy(() =>
  import('@/screens/reports/sentiment.trend.report.tsx').then(m => ({default: m.SentimentTrendScreen}))
);

export const CleaningSchedulerScreen = lazy(() =>
  import('@/screens/reports/cleaning.scheduler.report.tsx').then(m => ({default: m.CleaningSchedulerScreen}))
);

export const DriverCoachScreen = lazy(() =>
  import('@/screens/reports/driver.coach.report.tsx').then(m => ({default: m.DriverCoachScreen}))
);

export const ExpiryTrackerScreen = lazy(() =>
  import('@/screens/reports/expiry.tracker.report.tsx').then(m => ({default: m.ExpiryTrackerScreen}))
);

export const AdTargetingScreen = lazy(() =>
  import('@/screens/reports/ad.targeting.report.tsx').then(m => ({default: m.AdTargetingScreen}))
);

export const LocalSeoScreen = lazy(() =>
  import('@/screens/reports/local.seo.report.tsx').then(m => ({default: m.LocalSeoScreen}))
);

export const PricePsychologyScreen = lazy(() =>
  import('@/screens/reports/price.psychology.report.tsx').then(m => ({default: m.PricePsychologyScreen}))
);

export const CashStressTestScreen = lazy(() =>
  import('@/screens/reports/cash.stress.test.report.tsx').then(m => ({default: m.CashStressTestScreen}))
);

export const EventMenuScreen = lazy(() =>
  import('@/screens/reports/event.menu.report.tsx').then(m => ({default: m.EventMenuScreen}))
);

export const RetentionProgramScreen = lazy(() =>
  import('@/screens/reports/retention.program.report.tsx').then(m => ({default: m.RetentionProgramScreen}))
);

export const SupplierNegotiationScreen = lazy(() =>
  import('@/screens/reports/supplier.negotiation.report.tsx').then(m => ({default: m.SupplierNegotiationScreen}))
);

export const MaintenanceBudgetScreen = lazy(() =>
  import('@/screens/reports/maintenance.budget.report.tsx').then(m => ({default: m.MaintenanceBudgetScreen}))
);

export const FeedbackLoopScreen = lazy(() =>
  import('@/screens/reports/feedback.loop.report.tsx').then(m => ({default: m.FeedbackLoopScreen}))
);

export const CrossSellScreen = lazy(() =>
  import('@/screens/reports/cross.sell.report.tsx').then(m => ({default: m.CrossSellScreen}))
);

export const DishPopularityScreen = lazy(() =>
  import('@/screens/reports/dish.popularity.report.tsx').then(m => ({default: m.DishPopularityScreen}))
);

export const WaitlistOptimizerScreen = lazy(() =>
  import('@/screens/reports/waitlist.optimizer.report.tsx').then(m => ({default: m.WaitlistOptimizerScreen}))
);

export const VendorInvoiceAuditScreen = lazy(() =>
  import('@/screens/reports/vendor.invoice.audit.report.tsx').then(m => ({default: m.VendorInvoiceAuditScreen}))
);

export const BreakComplianceTrackerScreen = lazy(() =>
  import('@/screens/reports/break.compliance.tracker.report.tsx').then(m => ({default: m.BreakComplianceTrackerScreen}))
);

export const UtilityBillOptimizerScreen = lazy(() =>
  import('@/screens/reports/utility.bill.optimizer.report.tsx').then(m => ({default: m.UtilityBillOptimizerScreen}))
);

export const OrderPacingOptimizerScreen = lazy(() =>
  import('@/screens/reports/order.pacing.optimizer.report.tsx').then(m => ({default: m.OrderPacingOptimizerScreen}))
);

export const SentimentHeatmapScreen = lazy(() =>
  import('@/screens/reports/sentiment.heatmap.report.tsx').then(m => ({default: m.SentimentHeatmapScreen}))
);

export const DeliveryZoneOptimizerScreen = lazy(() =>
  import('@/screens/reports/delivery.zone.optimizer.report.tsx').then(m => ({default: m.DeliveryZoneOptimizerScreen}))
);

export const PriceABTestingScreen = lazy(() =>
  import('@/screens/reports/price.ab.testing.report.tsx').then(m => ({default: m.PriceABTestingScreen}))
);

export const MenuEngineeringMatrixScreen = lazy(() =>
  import('@/screens/reports/menu.engineering.matrix.report.tsx').then(m => ({default: m.MenuEngineeringMatrixScreen}))
);

export const PromoHaloEffectScreen = lazy(() =>
  import('@/screens/reports/promo.halo.effect.report.tsx').then(m => ({default: m.PromoHaloEffectScreen}))
);

export const KitchenDemandSurgeScreen = lazy(() =>
  import('@/screens/reports/kitchen.demand.surge.report.tsx').then(m => ({default: m.KitchenDemandSurgeScreen}))
);

export const OrderModificationPatternScreen = lazy(() =>
  import('@/screens/reports/order.modification.pattern.report.tsx').then(m => ({default: m.OrderModificationPatternScreen}))
);

export const CustomerLTVMultiplierScreen = lazy(() =>
  import('@/screens/reports/customer.ltv.multiplier.report.tsx').then(m => ({default: m.CustomerLTVMultiplierScreen}))
);

export const TicketComplexityScreen = lazy(() =>
  import('@/screens/reports/ticket.complexity.report.tsx').then(m => ({default: m.TicketComplexityScreen}))
);

export const KitchenStationEfficiencyScreen = lazy(() =>
  import('@/screens/reports/kitchen.station.efficiency.report.tsx').then(m => ({default: m.KitchenStationEfficiencyScreen}))
);

export const PairingAffinityAnalyzerScreen = lazy(() =>
  import('@/screens/reports/pairing.affinity.analyzer.report.tsx').then(m => ({default: m.PairingAffinityAnalyzerScreen}))
);

export const WaitExperiencePersonalizerScreen = lazy(() =>
  import('@/screens/reports/wait.experience.personalizer.report.tsx').then(m => ({default: m.WaitExperiencePersonalizerScreen}))
);

export const ServerTableAssignmentScreen = lazy(() =>
  import('@/screens/reports/server.table.assignment.report.tsx').then(m => ({default: m.ServerTableAssignmentScreen}))
);

export const SeasonalDemandShiftScreen = lazy(() =>
  import('@/screens/reports/seasonal.demand.shift.report.tsx').then(m => ({default: m.SeasonalDemandShiftScreen}))
);

export const TableTurnoverVelocityScreen = lazy(() =>
  import('@/screens/reports/table.turnover.velocity.report.tsx').then(m => ({default: m.TableTurnoverVelocityScreen}))
);

export const ProfitabilityDecayScreen = lazy(() =>
  import('@/screens/reports/profitability.decay.report.tsx').then(m => ({default: m.ProfitabilityDecayScreen}))
);

export const OrderFrequencyPredictorScreen = lazy(() =>
  import('@/screens/reports/order.frequency.predictor.report.tsx').then(m => ({default: m.OrderFrequencyPredictorScreen}))
);

export const OrderPatternAnomalyScreen = lazy(() =>
  import('@/screens/reports/order.pattern.anomaly.report.tsx').then(m => ({default: m.OrderPatternAnomalyScreen}))
);

export const KitchenSkillGapScreen = lazy(() =>
  import('@/screens/reports/kitchen.skill.gap.report.tsx').then(m => ({default: m.KitchenSkillGapScreen}))
);

export const MenuCannibalizationScreen = lazy(() =>
  import('@/screens/reports/menu.cannibalization.report.tsx').then(m => ({default: m.MenuCannibalizationScreen}))
);

export const JourneyFrictionScreen = lazy(() =>
  import('@/screens/reports/journey.friction.report.tsx').then(m => ({default: m.JourneyFrictionScreen}))
);
