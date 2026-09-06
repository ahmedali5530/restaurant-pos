/**
 * AI Command Center — executive dashboard consolidating all 12 AI features.
 *
 * Research finding: Toast Insights Dashboard (higher tier), Square Executive
 * Dashboard — both bundle all analytics into one screen for managers. POSR
 * offers it free — single dashboard surfacing every AI insight at a glance
 * + AI-generated executive summary synthesizing cross-feature patterns.
 *
 * Layout:
 *   1. AI Executive Summary (top) — OpenAI synthesizes all 12 metrics into
 *      a 3-sentence "what to act on today" brief + top 3 priorities
 *   2. 12 metric cards in a responsive grid — each links to its full report:
 *      - Demand Forecast (7-day predicted orders + revenue)
 *      - Inventory Reorder (pending suggestions + potential savings)
 *      - Menu Optimization (stars/dogs counts + pricing issues)
 *      - Customer Sentiment (NPS + avg rating + positive %)
 *      - Waste Tracking (total waste + projected annual savings)
 *      - Staff Scheduling (projected cost + coverage gaps)
 *      - Cash Flow Forecast (projected 30d balance + health)
 *      - Vendor Performance (avg score + potential savings/yr)
 *      - Table Turnover (avg turnover + potential impact/mo)
 *      - Dynamic Pricing (active rules + projected impact)
 *      - Forecast Accuracy (MAPE + trend direction)
 *      - Upsell Effectiveness (conversion rate + revenue lift)
 *   3. "Action needed" panel — surfaces items needing attention across features
 *
 * Each card shows: icon + title + key metric + secondary metric + link to
 * full report + color-coded health indicator.
 *
 * Placement: new route /reports/ai-command-center
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { Layout } from "@/screens/partials/layout.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBrain, faChartLine, faBoxOpen, faUtensils, faHeart, faTrash,
  faCalendarWeek, faWallet, faTruck, faChair, faTags, faBullseye,
  faArrowTrendUp, faRobot, faRotate, faLightbulb, faTriangleExclamation,
  faUsers, faUserMinus, faPercentage, faStore, faChartBar,
  faDollarSign, faClock, faHandHoldingDollar, faGaugeHigh,
faCalendarAlt, faCalendarXmark, faUserSecret, faShieldVirus, faBolt, faUserClock, faFlask, faFireBurner, faHeartCrack, faCreditCard, faTag, faLink, faHourglassHalf, faBullhorn, faClockRotateLeft, faCalendarCheck, faExchangeAlt, faGraduationCap, faFaceSmile, faCartShopping, faFileShield, faGiftCard, faRotateLeft, faRoute, faUserGear, faCalculator, faCashRegister, faCommentDots, faCloudSun, faCrown, faUserPlus, faTruckFast, faArrowsRotate, faUserGraduate, faHandshake, faCalendarPlus, faWater, faMusic, faPlugCircleXmark, faShareNodes, faWrench, faCakeCandles, faTableColumns, faShieldHalved, faBox, faBoxesStacked, faClipboardCheck, faWineGlass, faLeaf, faSliders, faStopwatch, faClipboardList, faFileInvoiceDollar, faPhone, faWandMagicSparkles, faBuilding, faRecycle, faEarListen, faFileInvoice, faMugHot, faFire, faMapLocationDot, faFlaskVial, faScaleBalanced, faTrophy, faBroom, faMagnifyingGlassLocation, faCalendarStar, faHeartCircleCheck, faHandshakeSimple, faComments, faCartPlus, faListCheck, faChartSimple, faPenToSquare, faRocket, faLayerGroup, faWaveSquare, faMagnifyingGlassChart, faScissors, faShuffle, faRightLeft, faFilePen, faChartPie, faBatteryThreeQuarters, faCamera, faCalendarDay, faTrashCan, faWifi, faCarSide, faVolumeHigh, faSprayCanSparkles, faDoorOpen,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  REPORTS_FORECAST, REPORTS_MENU_OPTIMIZATION, REPORTS_SENTIMENT,
  REPORTS_WASTE_INTELLIGENCE, REPORTS_SCHEDULING_OPTIMIZATION,
  REPORTS_CASH_FLOW, REPORTS_VENDOR_PERFORMANCE, REPORTS_TABLE_TURNOVER,
  REPORTS_DYNAMIC_PRICING, REPORTS_FORECAST_ACCURACY, REPORTS_UPSELL_EFFECTIVENESS,
  REPORTS_CUSTOMER_CLV, REPORTS_CHURN_PREDICTION, REPORTS_PROMO_EFFECTIVENESS,
  REPORTS_SERVER_PERFORMANCE, REPORTS_COMPETITOR_MONITORING,
  REPORTS_FOOD_COST_TRENDS, REPORTS_RECIPE_OPTIMIZATION,
  REPORTS_SEGMENTATION, REPORTS_LABOR_OPTIMIZATION,
  REPORTS_DELIVERY_ANALYTICS, REPORTS_PEAK_HOUR,
  REPORTS_TIP_ANALYTICS, REPORTS_REVPASH,
  REPORTS_CUSTOMER_JOURNEY, REPORTS_SEASONAL_TRENDS,
  REPORTS_GUEST_PREFERENCES,
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
  REPORTS_VENDOR_INVOICE_AUDIT,
  REPORTS_BREAK_COMPLIANCE,
  REPORTS_UTILITY_BILL_OPTIMIZER,
  REPORTS_ORDER_PACING,
  REPORTS_SENTIMENT_HEATMAP,
  REPORTS_DELIVERY_ZONE_OPTIMIZER,
  REPORTS_PRICE_AB_TESTING,
  REPORTS_MENU_ENGINEERING_MATRIX,
  REPORTS_PROMO_HALO_EFFECT,
  REPORTS_KITCHEN_DEMAND_SURGE,
  REPORTS_ORDER_MODIFICATION_PATTERN,
  REPORTS_CUSTOMER_LTV_MULTIPLIER,
REPORTS_RECIPE_SCALING,
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
  REPORTS_MENU_CANNIBALIZATION,
  REPORTS_JOURNEY_FRICTION,
  REPORTS_SUBSTITUTION_IMPACT,
  REPORTS_PREFERENCE_DRIFT,
  REPORTS_SHIFT_HANDOVER,
  REPORTS_MENU_DESCRIPTION,
  REPORTS_CROSS_CHANNEL_ATTRIBUTION,
  REPORTS_STAFF_ENERGY,
  REPORTS_MENU_PHOTOGRAPHY,
  REPORTS_TABLE_PREFERENCE,
  REPORTS_ELASTICITY_DRIFT,
  REPORTS_OCCASION_PREDICTION,
  REPORTS_MENU_ITEM_RETIREMENT,
  REPORTS_STAFF_PERFORMANCE_PREDICTION,
  REPORTS_ATMOSPHERE_REVENUE,
  REPORTS_PRE_SHIFT_BRIEFING,
  REPORTS_RECIPE_COST_VOLATILITY,
  REPORTS_PLATE_WASTE_PREDICTOR,
  REPORTS_LOYALTY_TIER_MIGRATION,
  REPORTS_FIRST_VISIT_CONVERSION,
  REPORTS_DELIVERY_QUALITY_DECAY,
  REPORTS_BAR_POUR_VARIANCE,
  REPORTS_RESTROOM_CLEANLINESS,
  REPORTS_WIFI_EXPERIENCE,
  REPORTS_PARKING_LOT_OPTIMIZER,
  REPORTS_NOISE_ACOUSTIC_COMFORT,
  REPORTS_LIGHTING_MOOD_OPTIMIZER,
  REPORTS_TEMPERATURE_HVAC_COMFORT,
  REPORTS_SCENT_MARKETING_OPTIMIZER,
  REPORTS_ENTRANCE_ARRIVAL_OPTIMIZER,
  REPORTS_MENU_LAYOUT_PLACEMENT,
} from "@/routes/posr.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MetricCard {
  title: string;
  icon: any;
  color: string;
  primary: string;
  secondary?: string;
  health: 'good' | 'watch' | 'warning' | 'critical' | 'neutral';
  link: string;
  linkLabel: string;
}

interface ExecutiveSummary {
  brief: string;
  priorities: string[];
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function AiCommandCenterScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [execSummary, setExecSummary] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const loadAllMetrics = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel fetch of all 26 AI feature summaries
      const [
        forecastData, menuData, sentimentData, wasteData,
        scheduleData, cashData, vendorData, turnoverData,
        pricingData, accuracyData, upsellData, reorderData,
        clvData, churnData, promoData,
        serverData, competitorData, foodCostData,
        recipeData, segmentationData, laborData,
        deliveryData, tipData, revpashData,
seasonalData, guestPrefData, noShowData, fraudData, foodSafetyData, energyData, staffTurnoverData, yieldData, kitchenData, winBackData, chargebackData, elasticityData, promoAbuseData, pairingData, waitPredData, promoForecastData, clvTrajectoryData, spoilageData, cadenceData, substitutionData, trainingData, seatingData, satisfactionData, abandonedData, branchCompData, complianceData, giftCardFraudData, refundAbuseData, buffetDemandData, deliveryRouteData, serverBalancerData, dishProfitData, cashDrawerData, cashWarningData, complaintPatternData, weatherData, peakPricingData, tableUtilData, overtimeData, loyaltyRoiData, procurementData, menuRotationData, serverCoachData, allergenRiskData, overbookingData, cascadeData, vibeData, vampireData, reviewResponseData, socialContentData, cateringData, equipMaintData, milestoneData, schedPrefData, floorPlanData, onlineFraudData, packagingData, reorderPointData, prepSheetData, payFeeData, healthData, schedConflictData, breakEvenData, alcoholData, recipeScaleData, wineData, gamificationData, kitchenPrepData, transferData, sentimentTrendData, cleaningData, driverCoachData, expiryData, adTargetingData, localSeoData, pricePsychData, stressTestData, eventMenuData, retentionData, negotiationData, maintBudgetData, feedbackLoopData, crossSellData, dishPopData, waitlistData, nutritionData, customizationData, tableTurnoverData, procedureData, carbonData, adRoiData, compData, taxData, phoneData, predictData, intelData, benchData, wasteValueData, socialData, hiringData, invoiceData, breakData, utilityData, pacingData, heatmapData, zoneData, priceTestData, menuEngData, promoHaloData, kitchenSurgeData, modPatternData, ltvMultData, ticketCompData, stationEffData, pairAffData, waitExpData, serverTableData, seasonalShiftData, turnoverVelData, profDecayData, orderFreqData, patternAnomData, skillGapData, cannibData, journeyFrictionData, subImpactData, prefDriftData, shiftHandData, menuDescData, attributionData, staffEnergyData, photoImpactData, tablePrefData, elasDriftData, occasionData, retireData, perfPredData, atmosData, briefingData, costVolData, plateWasteData, tierMigData, firstConvData, delivDecayData, barPourData, restroomData, wifiData, parkingData, noiseData, lightingData, tempHvacData, scentData, entranceData, menuLayoutData,
      ] = await Promise.all([
        fetchForecastSummary(db),
        fetchMenuSummary(db),
        fetchSentimentSummary(db),
        fetchWasteSummary(db),
        fetchScheduleSummary(db),
        fetchCashFlowSummary(db),
        fetchVendorSummary(db),
        fetchTurnoverSummary(db),
        fetchPricingSummary(db),
        fetchAccuracySummary(db),
        fetchUpsellSummary(db),
        fetchReorderSummary(db),
        fetchCLVSummary(db),
        fetchChurnSummary(db),
        fetchPromoSummary(db),
        fetchServerSummary(db),
        fetchCompetitorSummary(db),
        fetchFoodCostSummary(db),
        fetchRecipeSummary(db),
        fetchSegmentationSummary(db),
        fetchLaborSummary(db),
        fetchDeliverySummary(db),
        fetchTipSummary(db),
        fetchRevPASHSummary(db),
        fetchSeasonalSummary(db),
        fetchGuestPrefSummary(db),
        fetchNoShowSummary(db),
        fetchFraudSummary(db),
        fetchFoodSafetySummary(db),
        fetchEnergySummary(db),
        fetchStaffTurnoverSummary(db),
        fetchYieldSummary(db),
        fetchKitchenSummary(db),
        fetchWinBackSummary(db),
        fetchChargebackSummary(db),
        fetchElasticitySummary(db),
        fetchPromoAbuseSummary(db),
        fetchPairingSummary(db),
        fetchWaitPredSummary(db),
        fetchPromoForecastSummary(db),
        fetchCLVTrajectorySummary(db),
        fetchSpoilageSummary(db),
        fetchCadenceSummary(db),
        fetchSubstitutionSummary(db),
        fetchTrainingSummary(db),
        fetchSeatingSummary(db),
        fetchSatisfactionSummary(db),
        fetchAbandonedSummary(db),
        fetchBranchCompSummary(db),
        fetchComplianceSummary(db),
        fetchGiftCardFraudSummary(db),
        fetchRefundAbuseSummary(db),
        fetchBuffetDemandSummary(db),
        fetchDeliveryRouteSummary(db),
        fetchServerBalancerSummary(db),
        fetchDishProfitSummary(db),
        fetchCashDrawerSummary(db),
        fetchCashWarningSummary(db),
        fetchComplaintPatternSummary(db),
        fetchWeatherSummary(db),
        fetchPeakPricingSummary(db),
        fetchTableUtilSummary(db),
        fetchOvertimeSummary(db),
        fetchLoyaltyRoiSummary(db),
        fetchProcurementSummary(db),
        fetchMenuRotationSummary(db),
        fetchServerCoachSummary(db),
        fetchAllergenRiskSummary(db),
        fetchOverbookingSummary(db),
        fetchCascadeSummary(db),
        fetchVibeSummary(db),
        fetchVampireSummary(db),
        fetchReviewResponseSummary(db),
        fetchSocialContentSummary(db),
        fetchCateringSummary(db),
        fetchEquipMaintSummary(db),
        fetchMilestoneSummary(db),
        fetchSchedPrefSummary(db),
        fetchFloorPlanSummary(db),
        fetchOnlineFraudSummary(db),
fetchPackagingSummary(db),
        fetchReorderPointSummary(db),
        fetchPrepSheetSummary(db),
        fetchPayFeeSummary(db),
        fetchHealthSummary(db),
        fetchSchedConflictSummary(db),
        fetchBreakEvenSummary(db),
        fetchAlcoholSummary(db),
fetchRecipeScaleSummary(db),
        fetchWineSummary(db),
        fetchGamificationSummary(db),
        fetchKitchenPrepSummary(db),
        fetchTransferSummary(db),
        fetchSentimentTrendSummary(db),
        fetchCleaningSummary(db),
        fetchDriverCoachSummary(db),
        fetchExpirySummary(db),
        fetchAdTargetingSummary(db),
        fetchLocalSeoSummary(db),
        fetchPricePsychSummary(db),
        fetchStressTestSummary(db),
        fetchEventMenuSummary(db),
        fetchRetentionSummary(db),
        fetchNegotiationSummary(db),
        fetchMaintBudgetSummary(db),
        fetchFeedbackLoopSummary(db),
        fetchCrossSellSummary(db),
        fetchDishPopSummary(db),
        fetchWaitlistSummary(db),
        fetchNutritionSummary(db),
        fetchCustomizationSummary(db),
        fetchTableTurnoverSummary(db),
        fetchProcedureSummary(db),
        fetchCarbonSummary(db),
        fetchAdRoiSummary(db),
        fetchCompSummary(db),
        fetchTaxSummary(db),
        fetchPhoneSummary(db),
        fetchPredictSummary(db),
        fetchIntelSummary(db),
        fetchBenchSummary(db),
        fetchWasteValueSummary(db),
        fetchSocialSummary(db),
        fetchHiringSummary(db),
        fetchInvoiceSummary(db),
        fetchBreakSummary(db),
        fetchUtilitySummary(db),
        fetchPacingSummary(db),
        fetchHeatmapSummary(db),
        fetchZoneSummary(db),
        fetchPriceTestSummary(db),
        fetchMenuEngineeringSummary(db),
        fetchPromoHaloSummary(db),
        fetchKitchenSurgeSummary(db),
        fetchModificationPatternSummary(db),
        fetchLTVMultiplierSummary(db),
        fetchTicketComplexitySummary(db),
        fetchStationEfficiencySummary(db),
        fetchPairingAffinitySummary(db),
        fetchWaitExperienceSummary(db),
        fetchServerTableSummary(db),
        fetchSeasonalShiftSummary(db),
        fetchTurnoverVelocitySummary(db),
        fetchProfitabilityDecaySummary(db),
        fetchOrderFrequencySummary(db),
        fetchPatternAnomalySummary(db),
        fetchSkillGapSummary(db),
        fetchCannibalizationSummary(db),
        fetchJourneyFrictionSummary(db),
        fetchSubstitutionImpactSummary(db),
        fetchPreferenceDriftSummary(db),
        fetchShiftHandoverSummary(db),
        fetchDescriptionImpactSummary(db),
        fetchAttributionSummary(db),
        fetchEnergyMonitorSummary(db),
        fetchPhotoImpactSummary(db),
        fetchTablePreferenceSummary(db),
        fetchElasticityDriftSummary(db),
        fetchOccasionSummary(db),
        fetchRetirementSummary(db),
        fetchPerfPredictionSummary(db),
        fetchAtmosphereSummary(db),
        fetchBriefingSummary(db),
        fetchCostVolatilitySummary(db),
        fetchPlateWasteSummary(db),
        fetchTierMigrationSummary(db),
        fetchFirstVisitSummary(db),
        fetchDeliveryDecaySummary(db),
        fetchBarPourVarianceSummary(db),
        fetchRestroomCleanlinessSummary(db),
        fetchWifiExperienceSummary(db),
        fetchParkingLotSummary(db),
        fetchNoiseAcousticSummary(db),
        fetchLightingMoodSummary(db),
        fetchTemperatureHvacSummary(db),
        fetchScentMarketingSummary(db),
        fetchEntranceArrivalSummary(db),
        fetchMenuLayoutSummary(db),
      ]);

      setMetrics([
        forecastData, reorderData, menuData, sentimentData,
        wasteData, scheduleData, cashData, vendorData,
        turnoverData, pricingData, accuracyData, upsellData,
        clvData, churnData, promoData,
        serverData, competitorData, foodCostData,
        recipeData, segmentationData, laborData,
        deliveryData, tipData, revpashData,
seasonalData, guestPrefData, noShowData, fraudData, foodSafetyData, energyData, staffTurnoverData, yieldData, kitchenData, winBackData, chargebackData, elasticityData, promoAbuseData, pairingData, waitPredData, promoForecastData, clvTrajectoryData, spoilageData, cadenceData, substitutionData, trainingData, seatingData, satisfactionData, abandonedData, branchCompData, complianceData, giftCardFraudData, refundAbuseData, buffetDemandData, deliveryRouteData, serverBalancerData, dishProfitData, cashDrawerData, cashWarningData, complaintPatternData, weatherData, peakPricingData, tableUtilData, overtimeData, loyaltyRoiData, procurementData, menuRotationData, serverCoachData, allergenRiskData, overbookingData, cascadeData, vibeData, vampireData, reviewResponseData, socialContentData, cateringData, equipMaintData, milestoneData, schedPrefData, floorPlanData, onlineFraudData, packagingData, reorderPointData, prepSheetData, payFeeData, healthData, schedConflictData, breakEvenData, alcoholData, recipeScaleData, wineData, gamificationData, kitchenPrepData, transferData, sentimentTrendData, cleaningData, driverCoachData, expiryData, adTargetingData, localSeoData, pricePsychData, stressTestData, eventMenuData, retentionData, negotiationData, maintBudgetData, feedbackLoopData, crossSellData, dishPopData, waitlistData, nutritionData, customizationData, tableTurnoverData, procedureData, carbonData, adRoiData, compData, taxData, phoneData, predictData, intelData, benchData, wasteValueData, socialData, hiringData, invoiceData, breakData, utilityData, pacingData, heatmapData, zoneData, priceTestData, menuEngData, promoHaloData, kitchenSurgeData, modPatternData, ltvMultData, ticketCompData, stationEffData, pairAffData, waitExpData, serverTableData, seasonalShiftData, turnoverVelData, profDecayData, orderFreqData, patternAnomData, skillGapData, cannibData, journeyFrictionData, subImpactData, prefDriftData, shiftHandData, menuDescData, attributionData, staffEnergyData, photoImpactData, tablePrefData, elasDriftData, occasionData, retireData, perfPredData, atmosData, briefingData, costVolData, plateWasteData, tierMigData, firstConvData, delivDecayData, barPourData, restroomData,
      ]);
    } catch (err) {
      console.error('[ai-command] loadAllMetrics failed', err);
      toast.error('Failed to load some metrics');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadAllMetrics();
  }, [loadAllMetrics]);

  const handleGenerateSummary = useCallback(async () => {
    if (metrics.length === 0) return;
    setGeneratingSummary(true);
    try {
      const summary = await generateExecutiveSummary(db, metrics);
      setExecSummary(summary);
    } catch (err) {
      console.error('[ai-command] generate summary failed', err);
      toast.error('Failed to generate executive summary');
    } finally {
      setGeneratingSummary(false);
    }
  }, [db, metrics]);

  // Action needed items (critical/warning health)
  const actionNeeded = useMemo(() => {
    return metrics.filter(m => m.health === 'warning' || m.health === 'critical');
  }, [metrics]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Command Center", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBrain} className="text-violet-600" />
              AI Command Center
            </h1>
            <p className="text-sm text-neutral-500">
              Executive view of all 12 AI features — one screen, every insight, AI-synthesized priorities
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={loadAllMetrics} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleGenerateSummary} disabled={generatingSummary || metrics.length === 0} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faRobot} spin={generatingSummary} />
              {generatingSummary ? 'Synthesizing…' : execSummary ? 'Re-generate summary' : 'Generate AI summary'}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading all AI metrics…</p>
          </div>
        ) : (
          <>
            {/* AI Executive Summary */}
            {execSummary && (
              <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Executive Summary
                </h3>
                <p className="text-sm text-violet-900 mb-3">{execSummary.brief}</p>
                {execSummary.priorities.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-violet-700 uppercase mb-1">Top priorities</div>
                    <ol className="space-y-1">
                      {execSummary.priorities.map((p, idx) => (
                        <li key={idx} className="text-sm text-violet-900 flex items-start gap-2">
                          <span className="font-bold text-violet-600">{idx + 1}.</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}

            {/* Action needed banner */}
            {actionNeeded.length > 0 && (
              <div className="bg-rose-50 border border-rose-300 rounded-lg p-3">
                <div className="flex items-center gap-2 text-rose-800 font-medium text-sm">
                  <FontAwesomeIcon icon={faTriangleExclamation} />
                  {actionNeeded.length} area{actionNeeded.length !== 1 ? 's' : ''} need attention:
                </div>
                <div className="mt-1 text-xs text-rose-700">
                  {actionNeeded.map(m => m.title).join(' · ')}
                </div>
              </div>
            )}

            {/* 12 metric cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {metrics.map((metric, idx) => (
                <MetricCardView key={idx} metric={metric} />
              ))}
            </div>

            {/* Footer */}
            <div className="text-xs text-neutral-500 text-center pt-4">
              POSR AI Command Center · 26 AI-powered features · Click any card for full report
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Metric card component
// ---------------------------------------------------------------------------

const HEALTH_DOT: Record<string, string> = {
  good: 'bg-emerald-500',
  watch: 'bg-blue-400',
  warning: 'bg-amber-400',
  critical: 'bg-rose-500',
  neutral: 'bg-neutral-300',
};

function MetricCardView({ metric }: { metric: MetricCard }) {
  return (
    <Link
      to={metric.link}
      className="bg-white rounded-lg border border-neutral-200 p-4 hover:shadow-md transition-shadow block"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={metric.icon} className={`text-xl ${metric.color}`} />
          <span className="text-sm font-medium text-neutral-700">{metric.title}</span>
        </div>
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${HEALTH_DOT[metric.health]}`} title={metric.health} />
      </div>
      <div className="text-2xl font-bold tabular-nums text-neutral-900">{metric.primary}</div>
      {metric.secondary && (
        <div className="text-xs text-neutral-500 mt-1">{metric.secondary}</div>
      )}
      <div className="text-xs text-blue-600 mt-2 hover:underline">View full report →</div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Per-feature summary fetchers (lightweight queries for card display)
// ---------------------------------------------------------------------------

async function fetchForecastSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT totalOrders, totalRevenue FROM demand_forecast
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    return {
      title: 'Demand Forecast',
      icon: faChartLine,
      color: 'text-blue-600',
      primary: f ? `${f.totalOrders ?? 0} orders` : 'No forecast',
      secondary: f ? `${withCurrency(f.totalRevenue ?? 0)} / 7 days` : 'Generate forecast first',
      health: f ? 'good' : 'neutral',
      link: REPORTS_FORECAST,
      linkLabel: 'View forecast',
    };
  } catch {
    return neutralCard('Demand Forecast', faChartLine, 'text-blue-600', REPORTS_FORECAST);
  }
}

async function fetchReorderSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count, math::sum(total_cost) AS total FROM reorder_suggestion
       WHERE status = 'pending' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    const count = r?.count ?? 0;
    const total = r?.total ?? 0;
    return {
      title: 'Inventory Reorder',
      icon: faBoxOpen,
      color: 'text-amber-600',
      primary: `${count} pending`,
      secondary: total > 0 ? `${withCurrency(total)} total value` : 'No suggestions',
      health: count > 5 ? 'warning' : count > 0 ? 'watch' : 'good',
      link: '/admin',
      linkLabel: 'View reorder dashboard',
    };
  } catch {
    return neutralCard('Inventory Reorder', faBoxOpen, 'text-amber-600', '/admin');
  }
}

async function fetchMenuSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count(IF classification = 'star' THEN 1 END) AS stars,
         count(IF classification = 'dog' THEN 1 END) AS dogs,
         count(IF pricing_recommendation = 'underpriced' THEN 1 END) AS underpriced
       FROM menu_insight WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const m = list[0];
    return {
      title: 'Menu Optimization',
      icon: faUtensils,
      color: 'text-violet-600',
      primary: `${m?.stars ?? 0} stars / ${m?.dogs ?? 0} dogs`,
      secondary: (m?.underpriced ?? 0) > 0 ? `${m.underpriced} underpriced items` : 'No pricing issues',
      health: (m?.dogs ?? 0) > 5 ? 'warning' : 'good',
      link: REPORTS_MENU_OPTIMIZATION,
      linkLabel: 'View menu analysis',
    };
  } catch {
    return neutralCard('Menu Optimization', faUtensils, 'text-violet-600', REPORTS_MENU_OPTIMIZATION);
  }
}

async function fetchSentimentSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         avg_rating,
         nps_score,
         total_reviews
       FROM sentiment_summary
       WHERE period_type = 'weekly'
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s) return neutralCard('Customer Sentiment', faHeart, 'text-rose-500', REPORTS_SENTIMENT);
    const nps = s.nps_score ?? 0;
    return {
      title: 'Customer Sentiment',
      icon: faHeart,
      color: 'text-rose-500',
      primary: `${(s.avg_rating ?? 0).toFixed(1)} / 5`,
      secondary: `NPS ${nps > 0 ? '+' : ''}${nps} · ${s.total_reviews ?? 0} reviews`,
      health: nps >= 50 ? 'good' : nps >= 20 ? 'watch' : nps >= 0 ? 'warning' : 'critical',
      link: REPORTS_SENTIMENT,
      linkLabel: 'View sentiment',
    };
  } catch {
    return neutralCard('Customer Sentiment', faHeart, 'text-rose-500', REPORTS_SENTIMENT);
  }
}

async function fetchWasteSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT total_cost, projected_annual_savings, health_level FROM waste_summary
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const w = list[0];
    if (!w) return neutralCard('Waste Tracking', faTrash, 'text-rose-600', REPORTS_WASTE_INTELLIGENCE);
    const health = (w.health_level ?? 'healthy') as MetricCard['health'];
    return {
      title: 'Waste Tracking',
      icon: faTrash,
      color: 'text-rose-600',
      primary: withCurrency(w.total_cost ?? 0),
      secondary: `Projected savings: ${withCurrency(w.projected_annual_savings ?? 0)}/yr`,
      health,
      link: REPORTS_WASTE_INTELLIGENCE,
      linkLabel: 'View waste analysis',
    };
  } catch {
    return neutralCard('Waste Tracking', faTrash, 'text-rose-600', REPORTS_WASTE_INTELLIGENCE);
  }
}

async function fetchScheduleSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT total_cost, total_shifts, coverage_gaps, projected_savings
       FROM schedule_optimization ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s) return neutralCard('Staff Scheduling', faCalendarWeek, 'text-blue-600', REPORTS_SCHEDULING_OPTIMIZATION);
    return {
      title: 'Staff Scheduling',
      icon: faCalendarWeek,
      color: 'text-blue-600',
      primary: `${s.total_shifts ?? 0} shifts`,
      secondary: `${withCurrency(s.total_cost ?? 0)} · ${s.coverage_gaps ?? 0} gaps`,
      health: (s.coverage_gaps ?? 0) > 5 ? 'warning' : 'good',
      link: REPORTS_SCHEDULING_OPTIMIZATION,
      linkLabel: 'View schedule',
    };
  } catch {
    return neutralCard('Staff Scheduling', faCalendarWeek, 'text-blue-600', REPORTS_SCHEDULING_OPTIMIZATION);
  }
}

async function fetchCashFlowSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT projected_closing_balance, health_status, runway_days, min_projected_balance
       FROM cash_flow_forecast WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c) return neutralCard('Cash Flow Forecast', faWallet, 'text-emerald-600', REPORTS_CASH_FLOW);
    const health = (c.health_status ?? 'healthy') as MetricCard['health'];
    return {
      title: 'Cash Flow Forecast',
      icon: faWallet,
      color: 'text-emerald-600',
      primary: withCurrency(c.projected_closing_balance ?? 0),
      secondary: c.runway_days !== undefined ? `Runway: ${c.runway_days} days` : `Min: ${withCurrency(c.min_projected_balance ?? 0)}`,
      health,
      link: REPORTS_CASH_FLOW,
      linkLabel: 'View cash flow',
    };
  } catch {
    return neutralCard('Cash Flow Forecast', faWallet, 'text-emerald-600', REPORTS_CASH_FLOW);
  }
}

async function fetchVendorSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         avg(overall_score) AS avg_score,
         count() AS total,
         sum(IF grade = 'F' THEN 1 END) AS failing
       FROM vendor_performance WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const v = list[0];
    if (!v || v.total === 0) return neutralCard('Vendor Performance', faTruck, 'text-blue-600', REPORTS_VENDOR_PERFORMANCE);
    return {
      title: 'Vendor Performance',
      icon: faTruck,
      color: 'text-blue-600',
      primary: `${(v.avg_score ?? 0).toFixed(0)}/100`,
      secondary: `${v.total} suppliers · ${v.failing ?? 0} failing`,
      health: (v.failing ?? 0) > 0 ? 'warning' : 'good',
      link: REPORTS_VENDOR_PERFORMANCE,
      linkLabel: 'View vendors',
    };
  } catch {
    return neutralCard('Vendor Performance', faTruck, 'text-blue-600', REPORTS_VENDOR_PERFORMANCE);
  }
}

async function fetchTurnoverSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         avg(turnover_rate) AS avg_turnover,
         avg(overall_score) AS avg_score,
         sum(IF grade = 'F' THEN 1 END) AS failing
       FROM table_turnover_analysis WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const t = list[0];
    if (!t) return neutralCard('Table Turnover', faChair, 'text-amber-600', REPORTS_TABLE_TURNOVER);
    return {
      title: 'Table Turnover',
      icon: faChair,
      color: 'text-amber-600',
      primary: `${(t.avg_turnover ?? 0).toFixed(1)} turns/day`,
      secondary: `Avg score ${(t.avg_score ?? 0).toFixed(0)} · ${t.failing ?? 0} underperforming`,
      health: (t.failing ?? 0) > 3 ? 'warning' : 'good',
      link: REPORTS_TABLE_TURNOVER,
      linkLabel: 'View turnover',
    };
  } catch {
    return neutralCard('Table Turnover', faChair, 'text-amber-600', REPORTS_TABLE_TURNOVER);
  }
}

async function fetchPricingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count(IF status = 'active' THEN 1 END) AS active,
         count(IF status = 'draft' THEN 1 END) AS draft,
         sum(expected_impact) AS impact
       FROM dynamic_pricing_rule`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    return {
      title: 'Dynamic Pricing',
      icon: faTags,
      color: 'text-orange-600',
      primary: `${p?.active ?? 0} active rules`,
      secondary: (p?.draft ?? 0) > 0 ? `${p.draft} pending review` : 'No drafts pending',
      health: 'neutral',
      link: REPORTS_DYNAMIC_PRICING,
      linkLabel: 'View pricing rules',
    };
  } catch {
    return neutralCard('Dynamic Pricing', faTags, 'text-orange-600', REPORTS_DYNAMIC_PRICING);
  }
}

async function fetchAccuracySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT mape, accuracy_pct, bias, evaluated_count
       FROM forecast_accuracy ORDER BY evaluated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const a = list[0];
    if (!a) return neutralCard('Forecast Accuracy', faBullseye, 'text-violet-600', REPORTS_FORECAST_ACCURACY);
    const mape = a.mape ?? 0;
    return {
      title: 'Forecast Accuracy',
      icon: faBullseye,
      color: 'text-violet-600',
      primary: `${mape.toFixed(1)}% MAPE`,
      secondary: `${(a.accuracy_pct ?? 0).toFixed(0)}% accuracy · ${a.evaluated_count ?? 0} evaluated`,
      health: mape < 15 ? 'good' : mape < 25 ? 'watch' : mape < 40 ? 'warning' : 'critical',
      link: REPORTS_FORECAST_ACCURACY,
      linkLabel: 'View accuracy',
    };
  } catch {
    return neutralCard('Forecast Accuracy', faBullseye, 'text-violet-600', REPORTS_FORECAST_ACCURACY);
  }
}

async function fetchUpsellSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT conversion_rate, revenue_lift, times_shown
       FROM upsell_effectiveness WHERE is_overall = true
       AND expires_at > time::now() ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const u = list[0];
    if (!u) return neutralCard('Upsell Effectiveness', faArrowTrendUp, 'text-emerald-600', REPORTS_UPSELL_EFFECTIVENESS);
    const conv = u.conversion_rate ?? 0;
    return {
      title: 'Upsell Effectiveness',
      icon: faArrowTrendUp,
      color: 'text-emerald-600',
      primary: `${conv.toFixed(1)}% conversion`,
      secondary: `${withCurrency(u.revenue_lift ?? 0)} lift · ${u.times_shown ?? 0} shows`,
      health: conv >= 20 ? 'good' : conv >= 10 ? 'watch' : 'warning',
      link: REPORTS_UPSELL_EFFECTIVENESS,
      linkLabel: 'View upsell analytics',
    };
  } catch {
    return neutralCard('Upsell Effectiveness', faArrowTrendUp, 'text-emerald-600', REPORTS_UPSELL_EFFECTIVENESS);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchCLVSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT avg(total_clv) AS avg_clv, count() AS count,
         sum(IF segment = 'at_risk' THEN 1 END) + sum(IF segment = 'cant_lose' THEN 1 END) AS at_risk
       FROM customer_clv WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Customer CLV', faUsers, 'text-violet-600', REPORTS_CUSTOMER_CLV);
    return {
      title: 'Customer CLV',
      icon: faUsers,
      color: 'text-violet-600',
      primary: `$${Math.round(c.avg_clv ?? 0)}`,
      secondary: `${c.count} customers · ${c.at_risk ?? 0} at risk`,
      health: (c.at_risk ?? 0) > 5 ? 'warning' : 'good',
      link: REPORTS_CUSTOMER_CLV,
      linkLabel: 'View CLV',
    };
  } catch {
    return neutralCard('Customer CLV', faUsers, 'text-violet-600', REPORTS_CUSTOMER_CLV);
  }
}

async function fetchChurnSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT at_risk_count, critical_count, churn_rate, revenue_at_risk
       FROM churn_snapshot ORDER BY snapshot_date DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c) return neutralCard('Churn Prediction', faUserMinus, 'text-rose-600', REPORTS_CHURN_PREDICTION);
    const rate = c.churn_rate ?? 0;
    return {
      title: 'Churn Prediction',
      icon: faUserMinus,
      color: 'text-rose-600',
      primary: `${c.at_risk_count ?? 0} at risk`,
      secondary: `${rate.toFixed(0)}% churn rate · ${withCurrency(c.revenue_at_risk ?? 0)} at risk`,
      health: rate > 30 ? 'critical' : rate > 15 ? 'warning' : 'good',
      link: REPORTS_CHURN_PREDICTION,
      linkLabel: 'View churn',
    };
  } catch {
    return neutralCard('Churn Prediction', faUserMinus, 'text-rose-600', REPORTS_CHURN_PREDICTION);
  }
}

async function fetchPromoSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT times_redeemed, total_discount_given, revenue_generated, roi
       FROM promo_effectiveness WHERE is_overall = true AND expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p) return neutralCard('Promo Effectiveness', faPercentage, 'text-orange-600', REPORTS_PROMO_EFFECTIVENESS);
    const roi = p.roi ?? 0;
    return {
      title: 'Promo Effectiveness',
      icon: faPercentage,
      color: 'text-orange-600',
      primary: `${roi > 0 ? '+' : ''}${roi}% ROI`,
      secondary: `${p.times_redeemed ?? 0} redemptions · ${withCurrency(p.revenue_generated ?? 0)} revenue`,
      health: roi > 100 ? 'good' : roi > 0 ? 'watch' : 'warning',
      link: REPORTS_PROMO_EFFECTIVENESS,
      linkLabel: 'View promos',
    };
  } catch {
    return neutralCard('Promo Effectiveness', faPercentage, 'text-orange-600', REPORTS_PROMO_EFFECTIVENESS);
  }
}

async function fetchServerSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT avg(overall_score) AS avg_score, count() AS count,
         sum(IF grade = 'F' THEN 1 END) AS failing
       FROM server_performance WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Server Performance', faUsers, 'text-blue-600', REPORTS_SERVER_PERFORMANCE);
    return {
      title: 'Server Performance',
      icon: faUsers, color: 'text-blue-600',
      primary: `${Math.round(s.avg_score ?? 0)}/100`,
      secondary: `${s.count} servers · ${s.failing ?? 0} underperforming`,
      health: (s.failing ?? 0) > 2 ? 'warning' : 'good',
      link: REPORTS_SERVER_PERFORMANCE, linkLabel: 'View servers',
    };
  } catch { return neutralCard('Server Performance', faUsers, 'text-blue-600', REPORTS_SERVER_PERFORMANCE); }
}

async function fetchCompetitorSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, avg(price_diff_pct) AS avg_diff
       FROM competitor_price`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.total === 0) return neutralCard('Competitor Monitoring', faStore, 'text-orange-600', REPORTS_COMPETITOR_MONITORING);
    return {
      title: 'Competitor Monitoring',
      icon: faStore, color: 'text-orange-600',
      primary: `${c.total} compared`,
      secondary: `Avg ${Math.round(c.avg_diff ?? 0)}% vs competitors`,
      health: 'neutral',
      link: REPORTS_COMPETITOR_MONITORING, linkLabel: 'View competitors',
    };
  } catch { return neutralCard('Competitor Monitoring', faStore, 'text-orange-600', REPORTS_COMPETITOR_MONITORING); }
}

async function fetchFoodCostSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT sum(IF trend_direction = 'rising' THEN 1 END) AS rising,
         sum(annual_cost_impact) AS impact
       FROM food_cost_trend WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f) return neutralCard('Food Cost Trends', faChartBar, 'text-emerald-600', REPORTS_FOOD_COST_TRENDS);
    return {
      title: 'Food Cost Trends',
      icon: faChartBar, color: 'text-emerald-600',
      primary: `${f.rising ?? 0} rising items`,
      secondary: `Annual impact: ${withCurrency(f.impact ?? 0)}`,
      health: (f.rising ?? 0) > 5 ? 'warning' : 'neutral',
      link: REPORTS_FOOD_COST_TRENDS, linkLabel: 'View food costs',
    };
  } catch { return neutralCard('Food Cost Trends', faChartBar, 'text-emerald-600', REPORTS_FOOD_COST_TRENDS); }
}

async function fetchRecipeSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT avg(food_cost_pct) AS avg_fc,
         sum(IF grade IN ['D','F'] THEN 1 END) AS critical
       FROM recipe_cost_analysis WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    if (!r) return neutralCard('Recipe Optimization', faUtensils, 'text-violet-600', REPORTS_RECIPE_OPTIMIZATION);
    return {
      title: 'Recipe Optimization',
      icon: faUtensils, color: 'text-violet-600',
      primary: `${Math.round(r.avg_fc ?? 0)}% avg food cost`,
      secondary: `${r.critical ?? 0} dishes need attention`,
      health: (r.critical ?? 0) > 3 ? 'warning' : 'neutral',
      link: REPORTS_RECIPE_OPTIMIZATION, linkLabel: 'View recipes',
    };
  } catch { return neutralCard('Recipe Optimization', faUtensils, 'text-violet-600', REPORTS_RECIPE_OPTIMIZATION); }
}

async function fetchSegmentationSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT sum(customer_count) AS customers, sum(projected_revenue_impact) AS impact
       FROM segment_strategy WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.customers === 0) return neutralCard('Customer Segmentation', faUsers, 'text-violet-600', REPORTS_SEGMENTATION);
    return {
      title: 'Customer Segmentation',
      icon: faUsers, color: 'text-violet-600',
      primary: `${s.customers} customers`,
      secondary: `Projected impact: ${withCurrency(s.impact ?? 0)}/mo`,
      health: 'neutral',
      link: REPORTS_SEGMENTATION, linkLabel: 'View segments',
    };
  } catch { return neutralCard('Customer Segmentation', faUsers, 'text-violet-600', REPORTS_SEGMENTATION); }
}

async function fetchLaborSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT labor_cost_pct, health_status, total_hours
       FROM labor_cost_analysis WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const l = list[0];
    if (!l) return neutralCard('Labor Cost Optimization', faClock, 'text-blue-600', REPORTS_LABOR_OPTIMIZATION);
    const health = (l.health_status ?? 'healthy') as MetricCard['health'];
    return {
      title: 'Labor Cost',
      icon: faClock, color: 'text-blue-600',
      primary: `${l.labor_cost_pct}% of revenue`,
      secondary: `${l.total_hours} hours`,
      health,
      link: REPORTS_LABOR_OPTIMIZATION, linkLabel: 'View labor',
    };
  } catch { return neutralCard('Labor Cost Optimization', faClock, 'text-blue-600', REPORTS_LABOR_OPTIMIZATION); }
}

async function fetchDeliverySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT sum(total_revenue) AS revenue, sum(total_orders) AS orders,
         sum(commission_paid) AS commission, sum(net_revenue) AS net
       FROM delivery_performance WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const d = list[0];
    if (!d || d.orders === 0) return neutralCard('Delivery Analytics', faTruck, 'text-orange-600', REPORTS_DELIVERY_ANALYTICS);
    return {
      title: 'Delivery Analytics',
      icon: faTruck, color: 'text-orange-600',
      primary: `${d.orders} orders`,
      secondary: `${withCurrency(d.revenue)} revenue · ${withCurrency(d.commission)} commission`,
      health: 'neutral',
      link: REPORTS_DELIVERY_ANALYTICS, linkLabel: 'View delivery',
    };
  } catch { return neutralCard('Delivery Analytics', faTruck, 'text-orange-600', REPORTS_DELIVERY_ANALYTICS); }
}

async function fetchTipSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT total_tips, tip_frequency, equity_score
       FROM tip_distribution_analysis WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const t = list[0];
    if (!t) return neutralCard('Tip Analytics', faHandHoldingDollar, 'text-emerald-600', REPORTS_TIP_ANALYTICS);
    return {
      title: 'Tip Analytics',
      icon: faHandHoldingDollar, color: 'text-emerald-600',
      primary: withCurrency(t.total_tips ?? 0),
      secondary: `${t.tip_frequency ?? 0}% tipped · equity ${t.equity_score ?? 0}/100`,
      health: (t.equity_score ?? 100) >= 80 ? 'good' : (t.equity_score ?? 100) >= 60 ? 'watch' : 'warning',
      link: REPORTS_TIP_ANALYTICS, linkLabel: 'View tips',
    };
  } catch { return neutralCard('Tip Analytics', faHandHoldingDollar, 'text-emerald-600', REPORTS_TIP_ANALYTICS); }
}

async function fetchRevPASHSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT revpash, benchmark_grade, total_seats
       FROM revpash_analysis WHERE expires_at > time::now()
       ORDER BY generated_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    if (!r) return neutralCard('RevPASH', faGaugeHigh, 'text-violet-600', REPORTS_REVPASH);
    return {
      title: 'RevPASH',
      icon: faGaugeHigh, color: 'text-violet-600',
      primary: `$${r.revpash ?? 0}/hr`,
      secondary: `Grade ${r.benchmark_grade ?? 'C'} · ${r.total_seats ?? 0} seats`,
      health: (r.revpash ?? 0) > 10 ? 'good' : (r.revpash ?? 0) > 5 ? 'watch' : 'warning',
      link: REPORTS_REVPASH, linkLabel: 'View RevPASH',
    };
  } catch { return neutralCard('RevPASH', faGaugeHigh, 'text-violet-600', REPORTS_REVPASH); }
}

async function fetchSeasonalSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count, sum(IF is_peak_season THEN 1 END) AS peak_months
       FROM seasonal_trend WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Seasonal Trends', faCalendarAlt, 'text-blue-600', REPORTS_SEASONAL_TRENDS);
    return {
      title: 'Seasonal Trends',
      icon: faCalendarAlt, color: 'text-blue-600',
      primary: `${s.peak_months ?? 0} peak months`,
      secondary: `${s.count} months analyzed`,
      health: 'neutral',
      link: REPORTS_SEASONAL_TRENDS, linkLabel: 'View seasons',
    };
  } catch { return neutralCard('Seasonal Trends', faCalendarAlt, 'text-blue-600', REPORTS_SEASONAL_TRENDS); }
}

async function fetchGuestPrefSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count, avg(total_visits) AS avg_visits
       FROM guest_preference WHERE expires_at > time::now()`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const g = list[0];
    if (!g || g.count === 0) return neutralCard('Guest Preferences', faUsers, 'text-violet-600', REPORTS_GUEST_PREFERENCES);
    return {
      title: 'Guest Preferences',
      icon: faUsers, color: 'text-violet-600',
      primary: `${g.count} guests profiled`,
      secondary: `Avg ${Math.round(g.avg_visits ?? 0)} visits/guest`,
      health: 'good',
      link: REPORTS_GUEST_PREFERENCES, linkLabel: 'View guests',
    };
  } catch { return neutralCard('Guest Preferences', faUsers, 'text-violet-600', REPORTS_GUEST_PREFERENCES); }
}

async function fetchNoShowSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count,
         math::count(risk_level IN ['critical', 'high']) AS at_risk,
         math::sum(est_revenue_at_risk) AS revenue
       FROM noshow_prediction
       WHERE reservation_date > time::now() AND action_taken = 'none'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const n = list[0];
    if (!n || n.count === 0) return neutralCard('No-Show Prediction', faCalendarXmark, 'text-rose-600', REPORTS_NOSHOW_PREDICTION);
    return {
      title: 'No-Show Prediction',
      icon: faCalendarXmark, color: 'text-rose-600',
      primary: `${n.at_risk} at-risk`,
      secondary: `${n.count} upcoming · ${withCurrency(n.revenue)} at risk`,
      health: n.at_risk > 0 ? 'warning' : 'good',
      link: REPORTS_NOSHOW_PREDICTION, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('No-Show Prediction', faCalendarXmark, 'text-rose-600', REPORTS_NOSHOW_PREDICTION); }
}

async function fetchFraudSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS count,
         math::count(severity = 'critical') AS critical,
         math::sum(estimated_loss) AS total_loss
       FROM order_fraud_alert WHERE status = 'open'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Order Fraud', faUserSecret, 'text-rose-700', REPORTS_ORDER_FRAUD);
    return {
      title: 'Order Fraud',
      icon: faUserSecret, color: 'text-rose-700',
      primary: `${f.critical} critical`,
      secondary: `${f.count} alerts · ${withCurrency(f.total_loss)} est. loss`,
      health: f.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_ORDER_FRAUD, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Order Fraud', faUserSecret, 'text-rose-700', REPORTS_ORDER_FRAUD); }
}

async function fetchFoodSafetySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical
       FROM foodsafety_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Food Safety', faShieldVirus, 'text-emerald-600', REPORTS_FOOD_SAFETY);
    return {
      title: 'Food Safety',
      icon: faShieldVirus, color: 'text-emerald-600',
      primary: `${f.critical} critical`,
      secondary: `${f.count} alerts · HACCP`,
      health: f.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_FOOD_SAFETY, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Food Safety', faShieldVirus, 'text-emerald-600', REPORTS_FOOD_SAFETY); }
}

async function fetchEnergySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(estimated_waste) AS total_waste
       FROM energy_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const e = list[0];
    if (!e || e.count === 0) return neutralCard('Energy Optimization', faBolt, 'text-amber-500', REPORTS_ENERGY_OPTIMIZATION);
    return {
      title: 'Energy Optimization',
      icon: faBolt, color: 'text-amber-500',
      primary: `${e.critical} critical`,
      secondary: `${e.count} alerts · ${withCurrency(e.total_waste)}/yr waste`,
      health: e.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_ENERGY_OPTIMIZATION, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Energy Optimization', faBolt, 'text-amber-500', REPORTS_ENERGY_OPTIMIZATION); }
}

async function fetchStaffTurnoverSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level IN ['critical', 'high']) AS at_risk,
         math::sum(est_replacement_cost) AS total_cost
       FROM turnover_prediction
       WHERE risk_score >= 35 AND action_taken = 'none'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const t = list[0];
    if (!t || t.count === 0) return neutralCard('Staff Turnover', faUserClock, 'text-orange-600', REPORTS_STAFF_TURNOVER);
    return {
      title: 'Staff Turnover',
      icon: faUserClock, color: 'text-orange-600',
      primary: `${t.at_risk} at-risk`,
      secondary: `${t.count} scored · ${withCurrency(t.total_cost)} exposure`,
      health: t.at_risk > 0 ? 'warning' : 'good',
      link: REPORTS_STAFF_TURNOVER, linkLabel: 'View at-risk',
    };
  } catch { return neutralCard('Staff Turnover', faUserClock, 'text-orange-600', REPORTS_STAFF_TURNOVER); }
}

async function fetchYieldSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(estimated_loss) AS total_loss
       FROM yield_variance_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const y = list[0];
    if (!y || y.count === 0) return neutralCard('Yield Variance', faFlask, 'text-violet-600', REPORTS_YIELD_VARIANCE);
    return {
      title: 'Yield Variance',
      icon: faFlask, color: 'text-violet-600',
      primary: `${y.critical} critical`,
      secondary: `${y.count} alerts · ${withCurrency(y.total_loss)} loss`,
      health: y.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_YIELD_VARIANCE, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Yield Variance', faFlask, 'text-violet-600', REPORTS_YIELD_VARIANCE); }
}

async function fetchKitchenSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::mean(metric_value) AS avg_wait
       FROM kitchen_bottleneck_alert
       WHERE status = 'open' AND detected_at > time::now() - 4h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const k = list[0];
    if (!k || k.count === 0) return neutralCard('Kitchen Bottleneck', faFireBurner, 'text-rose-600', REPORTS_KITCHEN_BOTTLENECK);
    return {
      title: 'Kitchen Bottleneck',
      icon: faFireBurner, color: 'text-rose-600',
      primary: `${k.critical} critical`,
      secondary: `${k.count} alerts · avg wait ${Math.round(k.avg_wait ?? 0)} min`,
      health: k.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_KITCHEN_BOTTLENECK, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Kitchen Bottleneck', faFireBurner, 'text-rose-600', REPORTS_KITCHEN_BOTTLENECK); }
}

async function fetchWinBackSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(winback_level IN ['critical', 'high']) AS winnable,
         math::sum(est_clv_recovered) AS recoverable
       FROM winback_prediction
       WHERE winback_score >= 35 AND action_taken = 'none'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const w = list[0];
    if (!w || w.count === 0) return neutralCard('Customer Win-Back', faHeartCrack, 'text-rose-600', REPORTS_WIN_BACK);
    return {
      title: 'Customer Win-Back',
      icon: faHeartCrack, color: 'text-rose-600',
      primary: `${w.winnable} winnable`,
      secondary: `${w.count} churned · ${withCurrency(w.recoverable)} CLV`,
      health: w.winnable > 0 ? 'warning' : 'good',
      link: REPORTS_WIN_BACK, linkLabel: 'View candidates',
    };
  } catch { return neutralCard('Customer Win-Back', faHeartCrack, 'text-rose-600', REPORTS_WIN_BACK); }
}

async function fetchChargebackSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level = 'critical') AS critical,
         math::sum(est_chargeback_cost) AS exposure
       FROM chargeback_risk_alert
       WHERE risk_score >= 35 AND action_taken = 'none'
         AND detected_at > time::now() - 24h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Chargeback Risk', faCreditCard, 'text-rose-600', REPORTS_CHARGEBACK_RISK);
    return {
      title: 'Chargeback Risk',
      icon: faCreditCard, color: 'text-rose-600',
      primary: `${c.critical} critical`,
      secondary: `${c.count} at-risk · ${withCurrency(c.exposure)} exposure`,
      health: c.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_CHARGEBACK_RISK, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Chargeback Risk', faCreditCard, 'text-rose-600', REPORTS_CHARGEBACK_RISK); }
}

async function fetchElasticitySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(recommended_action != 'keep_price') AS actionable,
         math::sum(est_weekly_revenue_change) AS weekly_impact
       FROM price_elasticity_result
       WHERE action_taken = 'none'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const e = list[0];
    if (!e || e.count === 0) return neutralCard('Price Elasticity', faChartLine, 'text-emerald-600', REPORTS_PRICE_ELASTICITY);
    return {
      title: 'Price Elasticity',
      icon: faChartLine, color: 'text-emerald-600',
      primary: `${e.actionable} actionable`,
      secondary: `${e.count} items · ${withCurrency(e.weekly_impact)}/wk`,
      health: e.actionable > 0 ? 'warning' : 'good',
      link: REPORTS_PRICE_ELASTICITY, linkLabel: 'View analysis',
    };
  } catch { return neutralCard('Price Elasticity', faChartLine, 'text-emerald-600', REPORTS_PRICE_ELASTICITY); }
}

async function fetchPromoAbuseSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(estimated_loss) AS total_loss
       FROM promo_abuse_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p || p.count === 0) return neutralCard('Promo Abuse', faTag, 'text-rose-600', REPORTS_PROMO_ABUSE);
    return {
      title: 'Promo Abuse',
      icon: faTag, color: 'text-rose-600',
      primary: `${p.critical} critical`,
      secondary: `${p.count} alerts · ${withCurrency(p.total_loss)} loss`,
      health: p.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_PROMO_ABUSE, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Promo Abuse', faTag, 'text-rose-600', REPORTS_PROMO_ABUSE); }
}

async function fetchPairingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(tier = 'opportunity') AS opportunities,
         math::sum(est_revenue_lift) AS total_lift
       FROM menu_pairing GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p || p.count === 0) return neutralCard('Menu Pairing', faLink, 'text-violet-600', REPORTS_MENU_PAIRING);
    return {
      title: 'Menu Pairing',
      icon: faLink, color: 'text-violet-600',
      primary: `${p.opportunities} opportunities`,
      secondary: `${p.count} pairs · ${withCurrency(p.total_lift)}/mo lift`,
      health: p.opportunities > 0 ? 'warning' : 'good',
      link: REPORTS_MENU_PAIRING, linkLabel: 'View pairings',
    };
  } catch { return neutralCard('Menu Pairing', faLink, 'text-violet-600', REPORTS_MENU_PAIRING); }
}

async function fetchWaitPredSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::mean(predicted_wait_min) AS avg_wait,
         math::count(est_walkaway_risk > 0.5) AS high_risk
       FROM wait_prediction
       WHERE actual_wait_min IS NONE
         AND predicted_at > time::now() - 2h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const w = list[0];
    if (!w || w.count === 0) return neutralCard('Wait Prediction', faHourglassHalf, 'text-amber-600', REPORTS_WAIT_PREDICTION);
    return {
      title: 'Wait Prediction',
      icon: faHourglassHalf, color: 'text-amber-600',
      primary: `${w.count} waiting`,
      secondary: `avg ${Math.round(w.avg_wait ?? 0)} min · ${w.high_risk} at-risk`,
      health: w.high_risk > 0 ? 'warning' : 'good',
      link: REPORTS_WAIT_PREDICTION, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Wait Prediction', faHourglassHalf, 'text-amber-600', REPORTS_WAIT_PREDICTION); }
}

async function fetchPromoForecastSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(ai_recommendation = 'launch') AS launch,
         math::mean(est_roi) AS avg_roi
       FROM promo_forecast
       WHERE forecasted_at > time::now() - 24h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p || p.count === 0) return neutralCard('Promo Forecast', faBullhorn, 'text-amber-600', REPORTS_PROMO_FORECAST);
    return {
      title: 'Promo Forecast',
      icon: faBullhorn, color: 'text-amber-600',
      primary: `${p.launch} launch`,
      secondary: `${p.count} campaigns · avg ${Math.round(p.avg_roi * 100) / 100}× ROI`,
      health: p.launch > 0 ? 'good' : 'warning',
      link: REPORTS_PROMO_FORECAST, linkLabel: 'View forecasts',
    };
  } catch { return neutralCard('Promo Forecast', faBullhorn, 'text-amber-600', REPORTS_PROMO_FORECAST); }
}

async function fetchCLVTrajectorySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(trajectory = 'churning') AS churning,
         math::count(trajectory = 'declining') AS declining,
         math::count(trajectory = 'accelerating') AS accelerating
       FROM clv_trajectory
       WHERE action_taken = 'none'
         AND trajectory != 'stable'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('CLV Trajectory', faChartLine, 'text-blue-600', REPORTS_CLV_TRAJECTORY);
    return {
      title: 'CLV Trajectory',
      icon: faChartLine, color: 'text-blue-600',
      primary: `${c.churning + c.declining} slipping`,
      secondary: `${c.accelerating} growing · ${c.total} actionable`,
      health: c.churning > 0 ? 'critical' : (c.declining > 0 ? 'warning' : 'good'),
      link: REPORTS_CLV_TRAJECTORY, linkLabel: 'View trajectories',
    };
  } catch { return neutralCard('CLV Trajectory', faChartLine, 'text-blue-600', REPORTS_CLV_TRAJECTORY); }
}

async function fetchSpoilageSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(risk_level = 'critical') AS critical,
         math::sum(est_spoilage_cost) AS total_cost
       FROM spoilage_prediction
       WHERE will_spoil = true
         AND action_taken = 'none'
         AND predicted_at > time::now() - 24h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Spoilage Prediction', faClockRotateLeft, 'text-amber-600', REPORTS_SPOILAGE_PREDICTION);
    return {
      title: 'Spoilage Prediction',
      icon: faClockRotateLeft, color: 'text-amber-600',
      primary: `${s.critical} critical`,
      secondary: `${s.count} at-risk · ${withCurrency(s.total_cost)} cost`,
      health: s.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_SPOILAGE_PREDICTION, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Spoilage Prediction', faClockRotateLeft, 'text-amber-600', REPORTS_SPOILAGE_PREDICTION); }
}

async function fetchCadenceSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(overdue_status IN ['overdue', 'significantly_overdue']) AS overdue,
         math::sum(est_next_visit_value) AS total_value
       FROM visit_cadence
       WHERE action_taken = 'none'
         AND overdue_status != 'on_track'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Visit Cadence', faCalendarCheck, 'text-blue-600', REPORTS_VISIT_CADENCE);
    return {
      title: 'Visit Cadence',
      icon: faCalendarCheck, color: 'text-blue-600',
      primary: `${c.overdue} overdue`,
      secondary: `${c.count} actionable · ${withCurrency(c.total_value)} value`,
      health: c.overdue > 0 ? 'warning' : 'good',
      link: REPORTS_VISIT_CADENCE, linkLabel: 'View cadences',
    };
  } catch { return neutralCard('Visit Cadence', faCalendarCheck, 'text-blue-600', REPORTS_VISIT_CADENCE); }
}

async function fetchSubstitutionSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(trigger_reason = 'stockout') AS stockout,
         math::sum(est_monthly_savings) AS savings
       FROM substitution_suggestion
       WHERE action_taken = 'none'
         AND overall_score >= 0.5
         AND suggested_at > time::now() - 24h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Recipe Substitution', faExchangeAlt, 'text-violet-600', REPORTS_RECIPE_SUBSTITUTION);
    return {
      title: 'Recipe Substitution',
      icon: faExchangeAlt, color: 'text-violet-600',
      primary: `${s.stockout} stockout`,
      secondary: `${s.count} suggestions · ${withCurrency(s.savings)}/mo`,
      health: s.stockout > 0 ? 'warning' : 'good',
      link: REPORTS_RECIPE_SUBSTITUTION, linkLabel: 'View suggestions',
    };
  } catch { return neutralCard('Recipe Substitution', faExchangeAlt, 'text-violet-600', REPORTS_RECIPE_SUBSTITUTION); }
}

async function fetchTrainingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(need_level = 'critical') AS critical,
         math::sum(est_cost_of_inaction) AS total_cost
       FROM training_need_prediction
       WHERE need_score >= 35 AND action_taken = 'none'
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const t = list[0];
    if (!t || t.count === 0) return neutralCard('Training Need', faGraduationCap, 'text-blue-600', REPORTS_TRAINING_NEED);
    return {
      title: 'Training Need',
      icon: faGraduationCap, color: 'text-blue-600',
      primary: `${t.critical} critical`,
      secondary: `${t.count} needs · ${withCurrency(t.total_cost)} cost`,
      health: t.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_TRAINING_NEED, linkLabel: 'View needs',
    };
  } catch { return neutralCard('Training Need', faGraduationCap, 'text-blue-600', REPORTS_TRAINING_NEED); }
}

async function fetchSeatingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::mean(overall_score) AS avg_score
       FROM seating_suggestion
       WHERE action_taken = 'none'
         AND suggested_at > time::now() - 30m
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Seating Optimization', faChair, 'text-amber-600', REPORTS_SEATING_OPTIMIZATION);
    return {
      title: 'Seating Optimization',
      icon: faChair, color: 'text-amber-600',
      primary: `${s.count} suggestions`,
      secondary: `avg score ${Math.round(s.avg_score * 100)}/100`,
      health: s.avg_score > 0.7 ? 'good' : 'warning',
      link: REPORTS_SEATING_OPTIMIZATION, linkLabel: 'View suggestions',
    };
  } catch { return neutralCard('Seating Optimization', faChair, 'text-amber-600', REPORTS_SEATING_OPTIMIZATION); }
}

async function fetchSatisfactionSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(satisfaction_level = 'critical') AS critical,
         math::count(satisfaction_level = 'delighted') AS delighted,
         math::mean(satisfaction_score) AS avg_score
       FROM satisfaction_prediction
       WHERE action_taken = 'none'
         AND predicted_at > time::now() - 4h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Satisfaction', faFaceSmile, 'text-violet-600', REPORTS_SATISFACTION_PREDICTION);
    return {
      title: 'Satisfaction',
      icon: faFaceSmile, color: 'text-violet-600',
      primary: `${s.critical} critical`,
      secondary: `${s.delighted} delighted · avg ${Math.round(s.avg_score)}/100`,
      health: s.critical > 0 ? 'critical' : 'good',
      link: REPORTS_SATISFACTION_PREDICTION, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Satisfaction', faFaceSmile, 'text-violet-600', REPORTS_SATISFACTION_PREDICTION); }
}

async function fetchAbandonedSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(recovery_level = 'high') AS high,
         math::sum(est_recovered_revenue) AS total_revenue
       FROM abandoned_cart_alert
       WHERE action_taken = 'none'
         AND detected_at > time::now() - 4h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const a = list[0];
    if (!a || a.count === 0) return neutralCard('Abandoned Cart', faCartShopping, 'text-amber-600', REPORTS_ABANDONED_CART);
    return {
      title: 'Abandoned Cart',
      icon: faCartShopping, color: 'text-amber-600',
      primary: `${a.high} recoverable`,
      secondary: `${a.count} carts · ${withCurrency(a.total_revenue)} at risk`,
      health: a.high > 0 ? 'warning' : 'critical',
      link: REPORTS_ABANDONED_CART, linkLabel: 'View carts',
    };
  } catch { return neutralCard('Abandoned Cart', faCartShopping, 'text-amber-600', REPORTS_ABANDONED_CART); }
}

async function fetchBranchCompSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::max(overall_score) AS top_score,
         math::min(overall_score) AS low_score
       FROM branch_comparison
       WHERE analyzed_at > time::now() - 24h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const b = list[0];
    if (!b || b.count === 0) return neutralCard('Branch Comparison', faStore, 'text-blue-600', REPORTS_BRANCH_COMPARISON);
    return {
      title: 'Branch Comparison',
      icon: faStore, color: 'text-blue-600',
      primary: `${b.total} branches`,
      secondary: `top ${b.top_score} · low ${b.low_score}`,
      health: b.low_score < 40 ? 'warning' : 'good',
      link: REPORTS_BRANCH_COMPARISON, linkLabel: 'View comparison',
    };
  } catch { return neutralCard('Branch Comparison', faStore, 'text-blue-600', REPORTS_BRANCH_COMPARISON); }
}

async function fetchComplianceSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(status = 'expired') AS expired,
         math::sum(est_fine_risk) AS total_fine
       FROM compliance_alert
       WHERE action_taken = 'none'
         AND detected_at > time::now() - 24h
       GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Compliance', faFileShield, 'text-emerald-600', REPORTS_COMPLIANCE_TRACKING);
    return {
      title: 'Compliance',
      icon: faFileShield, color: 'text-emerald-600',
      primary: `${c.expired} expired`,
      secondary: `${c.count} alerts · ${withCurrency(c.total_fine)} risk`,
      health: c.expired > 0 ? 'critical' : 'warning',
      link: REPORTS_COMPLIANCE_TRACKING, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Compliance', faFileShield, 'text-emerald-600', REPORTS_COMPLIANCE_TRACKING); }
}

async function fetchGiftCardFraudSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(estimated_loss) AS total_loss
       FROM giftcard_fraud_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const g = list[0];
    if (!g || g.count === 0) return neutralCard('Gift Card Fraud', faGiftCard, 'text-rose-600', REPORTS_GIFTCARD_FRAUD);
    return {
      title: 'Gift Card Fraud',
      icon: faGiftCard, color: 'text-rose-600',
      primary: `${g.critical} critical`,
      secondary: `${g.count} alerts · ${withCurrency(g.total_loss)} loss`,
      health: g.critical > 0 ? 'critical' : 'warning',
      link: REPORTS_GIFTCARD_FRAUD, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Gift Card Fraud', faGiftCard, 'text-rose-600', REPORTS_GIFTCARD_FRAUD); }
}

async function fetchRefundAbuseSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::sum(estimated_loss) AS total_loss
       FROM refund_abuse_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    if (!r || r.count === 0) return neutralCard('Refund Abuse', faRotateLeft, 'text-rose-600', REPORTS_REFUND_ABUSE);
    return {
      title: 'Refund Abuse', icon: faRotateLeft, color: 'text-rose-600',
      primary: `${r.critical} critical`, secondary: `${r.count} alerts · ${withCurrency(r.total_loss)} loss`,
      health: r.critical > 0 ? 'critical' : 'warning', link: REPORTS_REFUND_ABUSE, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Refund Abuse', faRotateLeft, 'text-rose-600', REPORTS_REFUND_ABUSE); }
}

async function fetchBuffetDemandSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::mean(predicted_guests) AS avg_guests, math::sum(est_waste_prevention) AS waste_prev
       FROM buffet_demand_prediction WHERE predicted_at > time::now() - 24h AND business_date > time::now() GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const b = list[0];
    if (!b || b.count === 0) return neutralCard('Buffet Demand', faUtensils, 'text-amber-600', REPORTS_BUFFET_DEMAND);
    return {
      title: 'Buffet Demand', icon: faUtensils, color: 'text-amber-600',
      primary: `${b.total} sessions`, secondary: `avg ${Math.round(b.avg_guests)} guests · ${withCurrency(b.waste_prev)} saved`,
      health: 'good', link: REPORTS_BUFFET_DEMAND, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Buffet Demand', faUtensils, 'text-amber-600', REPORTS_BUFFET_DEMAND); }
}

async function fetchDeliveryRouteSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::sum(order_count) AS orders,
         math::sum(savings_km) AS km, math::sum(est_fuel_savings) AS fuel
       FROM delivery_route_suggestion WHERE status = 'pending' AND created_at > time::now() - 4h GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const d = list[0];
    if (!d || d.count === 0) return neutralCard('Delivery Routes', faRoute, 'text-blue-600', REPORTS_DELIVERY_ROUTE);
    return {
      title: 'Delivery Routes', icon: faRoute, color: 'text-blue-600',
      primary: `${d.total} routes`, secondary: `${d.orders} orders · ${withCurrency(d.fuel)} saved`,
      health: 'good', link: REPORTS_DELIVERY_ROUTE, linkLabel: 'View routes',
    };
  } catch { return neutralCard('Delivery Routes', faRoute, 'text-blue-600', REPORTS_DELIVERY_ROUTE); }
}

async function fetchServerBalancerSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::mean(load_score) AS avg_load, math::count(load_score >= 80) AS overloaded
       FROM server_assignment WHERE status = 'pending' AND assigned_at > time::now() - 30m GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Server Balancer', faUserGear, 'text-blue-600', REPORTS_SERVER_LOAD_BALANCER);
    return {
      title: 'Server Balancer', icon: faUserGear, color: 'text-blue-600',
      primary: `${s.total} pending`, secondary: `avg load ${Math.round(s.avg_load)} · ${s.overloaded} overloaded`,
      health: s.overloaded > 0 ? 'warning' : 'good', link: REPORTS_SERVER_LOAD_BALANCER, linkLabel: 'View assignments',
    };
  } catch { return neutralCard('Server Balancer', faUserGear, 'text-blue-600', REPORTS_SERVER_LOAD_BALANCER); }
}

async function fetchDishProfitSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(profitability_grade = 'F') AS failing,
         math::sum(hidden_loss) AS hidden
       FROM dish_profitability WHERE analyzed_at > time::now() - 24h GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const d = list[0];
    if (!d || d.count === 0) return neutralCard('Dish Profit', faCalculator, 'text-emerald-600', REPORTS_DISH_PROFITABILITY);
    return {
      title: 'Dish Profit', icon: faCalculator, color: 'text-emerald-600',
      primary: `${d.failing} failing`, secondary: `${d.total} dishes · ${withCurrency(d.hidden)} hidden loss`,
      health: d.failing > 0 ? 'warning' : 'good', link: REPORTS_DISH_PROFITABILITY, linkLabel: 'View analysis',
    };
  } catch { return neutralCard('Dish Profit', faCalculator, 'text-emerald-600', REPORTS_DISH_PROFITABILITY); }
}

async function fetchCashDrawerSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::sum(estimated_loss) AS total_loss
       FROM cash_drawer_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Cash Drawer', faCashRegister, 'text-rose-600', REPORTS_CASH_DRAWER_ANOMALY);
    return {
      title: 'Cash Drawer', icon: faCashRegister, color: 'text-rose-600',
      primary: `${c.critical} critical`, secondary: `${c.count} alerts · ${withCurrency(c.total_loss)} loss`,
      health: c.critical > 0 ? 'critical' : 'warning', link: REPORTS_CASH_DRAWER_ANOMALY, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Cash Drawer', faCashRegister, 'text-rose-600', REPORTS_CASH_DRAWER_ANOMALY); }
}

async function fetchCashWarningSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT warning_level, min_projected_balance, est_days_until_negative
       FROM cash_early_warning ORDER BY predicted_at DESC LIMIT 1`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const w = list[0];
    if (!w) return neutralCard('Cash Warning', faTriangleExclamation, 'text-rose-600', REPORTS_CASH_EARLY_WARNING);
    const level = w.warning_level ?? 'safe';
    return {
      title: 'Cash Warning', icon: faTriangleExclamation,
      color: level === 'emergency' || level === 'critical' ? 'text-rose-600' : level === 'caution' ? 'text-amber-600' : 'text-emerald-600',
      primary: level, secondary: `min ${withCurrency(w.min_projected_balance)} in 7d`,
      health: level === 'emergency' || level === 'critical' ? 'critical' : level === 'caution' ? 'warning' : 'good',
      link: REPORTS_CASH_EARLY_WARNING, linkLabel: 'View projection',
    };
  } catch { return neutralCard('Cash Warning', faTriangleExclamation, 'text-rose-600', REPORTS_CASH_EARLY_WARNING); }
}

async function fetchComplaintPatternSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical
       FROM complaint_pattern_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Complaint Patterns', faCommentDots, 'text-amber-600', REPORTS_COMPLAINT_PATTERN);
    return {
      title: 'Complaint Patterns', icon: faCommentDots, color: 'text-amber-600',
      primary: `${c.critical} critical`, secondary: `${c.total} patterns detected`,
      health: c.critical > 0 ? 'critical' : 'warning', link: REPORTS_COMPLAINT_PATTERN, linkLabel: 'View patterns',
    };
  } catch { return neutralCard('Complaint Patterns', faCommentDots, 'text-amber-600', REPORTS_COMPLAINT_PATTERN); }
}

async function fetchWeatherSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT condition, avg_temp, expected_revenue, rain_impact_pct
       FROM weather_impact ORDER BY analyzed_at DESC LIMIT 1`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const w = rows[0];
    if (!w) return neutralCard('Weather Impact', faCloudSun, 'text-blue-500', REPORTS_WEATHER_IMPACT);
    return {
      title: 'Weather Impact', icon: faCloudSun, color: 'text-blue-500',
      primary: w.condition ?? '—', secondary: `${w.avg_temp ?? '—'}°C · rain impact ${w.rain_impact_pct ?? '—'}%`,
      health: (w.rain_impact_pct ?? 0) < -0.1 ? 'warning' : 'good',
      link: REPORTS_WEATHER_IMPACT, linkLabel: 'View analysis',
    };
  } catch { return neutralCard('Weather Impact', faCloudSun, 'text-blue-500', REPORTS_WEATHER_IMPACT); }
}

async function fetchPeakPricingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(pricing_tier = 'surge') AS surge, math::sum(est_revenue_lift) AS lift
       FROM peak_pricing_rule WHERE status IN ('pending', 'active') GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p || p.count === 0) return neutralCard('Peak Pricing', faTags, 'text-rose-600', REPORTS_PEAK_PRICING);
    return {
      title: 'Peak Pricing', icon: faTags, color: 'text-rose-600',
      primary: `${p.surge} surge`, secondary: `${p.total} rules · ${withCurrency(p.lift)} lift`,
      health: 'good', link: REPORTS_PEAK_PRICING, linkLabel: 'View rules',
    };
  } catch { return neutralCard('Peak Pricing', faTags, 'text-rose-600', REPORTS_PEAK_PRICING); }
}

async function fetchTableUtilSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::sum(est_revenue_loss) AS loss
       FROM table_utilization_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const t = list[0];
    if (!t || t.count === 0) return neutralCard('Table Utilization', faChair, 'text-amber-600', REPORTS_TABLE_UTILIZATION);
    return {
      title: 'Table Utilization', icon: faChair, color: 'text-amber-600',
      primary: `${t.critical} critical`, secondary: `${t.total} issues · ${withCurrency(t.loss)} loss`,
      health: t.critical > 0 ? 'critical' : 'warning', link: REPORTS_TABLE_UTILIZATION, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Table Utilization', faChair, 'text-amber-600', REPORTS_TABLE_UTILIZATION); }
}

async function fetchOvertimeSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(risk_level = 'critical') AS critical, math::sum(overtime_cost) AS cost
       FROM overtime_prediction WHERE risk_level != 'low' AND action_taken = 'none' AND predicted_at > time::now() - 4h GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const o = list[0];
    if (!o || o.count === 0) return neutralCard('Overtime Risk', faClock, 'text-orange-600', REPORTS_OVERTIME_PREDICTION);
    return {
      title: 'Overtime Risk', icon: faClock, color: 'text-orange-600',
      primary: `${o.critical} critical`, secondary: `${o.total} at-risk · ${withCurrency(o.cost)} OT`,
      health: o.critical > 0 ? 'critical' : 'warning', link: REPORTS_OVERTIME_PREDICTION, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Overtime Risk', faClock, 'text-orange-600', REPORTS_OVERTIME_PREDICTION); }
}

async function fetchLoyaltyRoiSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'high_propensity_prospect') AS prospects,
         math::sum(est_revenue_gain) AS gain
       FROM loyalty_roi_prediction WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const l = list[0];
    if (!l || l.count === 0) return neutralCard('Loyalty ROI', faCrown, 'text-amber-600', REPORTS_LOYALTY_ROI);
    return {
      title: 'Loyalty ROI', icon: faCrown, color: 'text-amber-600',
      primary: `${l.prospects} prospects`, secondary: `${l.total} preds · ${withCurrency(l.gain)} 90d gain`,
      health: l.prospects > 5 ? 'good' : 'warning', link: REPORTS_LOYALTY_ROI, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Loyalty ROI', faCrown, 'text-amber-600', REPORTS_LOYALTY_ROI); }
}

async function fetchProcurementSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'buy_now') AS buy_now,
         math::sum(est_savings) AS savings
       FROM procurement_recommendation WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p || p.count === 0) return neutralCard('Procurement', faTruckFast, 'text-rose-600', REPORTS_PROCUREMENT);
    return {
      title: 'Procurement', icon: faTruckFast, color: 'text-rose-600',
      primary: `${p.buy_now} buy-now`, secondary: `${p.total} recs · ${withCurrency(p.savings)} savings`,
      health: p.buy_now > 0 ? 'critical' : 'warning', link: REPORTS_PROCUREMENT, linkLabel: 'View recs',
    };
  } catch { return neutralCard('Procurement', faTruckFast, 'text-rose-600', REPORTS_PROCUREMENT); }
}

async function fetchMenuRotationSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'fatigue_detected') AS fatigue,
         math::sum(est_revenue_impact) AS impact
       FROM menu_rotation_suggestion WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const m = list[0];
    if (!m || m.count === 0) return neutralCard('Menu Rotation', faArrowsRotate, 'text-amber-600', REPORTS_MENU_ROTATION);
    return {
      title: 'Menu Rotation', icon: faArrowsRotate, color: 'text-amber-600',
      primary: `${m.fatigue} fatigued`, secondary: `${m.total} items · ${withCurrency(m.impact)} impact`,
      health: m.fatigue > 0 ? 'critical' : 'warning', link: REPORTS_MENU_ROTATION, linkLabel: 'View suggestions',
    };
  } catch { return neutralCard('Menu Rotation', faArrowsRotate, 'text-amber-600', REPORTS_MENU_ROTATION); }
}

async function fetchServerCoachSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'skill_gap') AS gaps,
         math::count(rule_id = 'trajectory_warning' AND severity = 'critical') AS declining
       FROM server_coaching_plan WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Server Coach', faUserGraduate, 'text-violet-600', REPORTS_SERVER_COACH);
    return {
      title: 'Server Coach', icon: faUserGraduate, color: 'text-violet-600',
      primary: `${s.gaps} skill gaps`, secondary: `${s.total} plans · ${s.declining} declining`,
      health: s.declining > 0 ? 'critical' : s.gaps > 0 ? 'warning' : 'good', link: REPORTS_SERVER_COACH, linkLabel: 'View plans',
    };
  } catch { return neutralCard('Server Coach', faUserGraduate, 'text-violet-600', REPORTS_SERVER_COACH); }
}

async function fetchAllergenRiskSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(rule_id = 'repeat_offender') AS repeat_offender
       FROM allergen_risk_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const a = list[0];
    if (!a || a.count === 0) return neutralCard('Allergen Risk', faTriangleExclamation, 'text-rose-600', REPORTS_ALLERGEN_RISK);
    return {
      title: 'Allergen Risk', icon: faTriangleExclamation, color: 'text-rose-600',
      primary: `${a.critical} critical`, secondary: `${a.total} alerts · ${a.repeat_offender} repeat offenders`,
      health: a.critical > 0 ? 'critical' : a.total > 0 ? 'warning' : 'good', link: REPORTS_ALLERGEN_RISK, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Allergen Risk', faTriangleExclamation, 'text-rose-600', REPORTS_ALLERGEN_RISK); }
}

async function fetchOverbookingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'slot_overbook') AS overbook,
         math::sum(est_revenue_gain) AS gain
       FROM overbooking_plan WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const o = list[0];
    if (!o || o.count === 0) return neutralCard('Overbooking', faCalendarPlus, 'text-violet-600', REPORTS_OVERBOOKING);
    return {
      title: 'Overbooking', icon: faCalendarPlus, color: 'text-violet-600',
      primary: `${o.overbook} slots`, secondary: `${o.total} plans · ${withCurrency(o.gain)} gain`,
      health: o.overbook > 0 ? 'good' : 'neutral', link: REPORTS_OVERBOOKING, linkLabel: 'View slots',
    };
  } catch { return neutralCard('Overbooking', faCalendarPlus, 'text-violet-600', REPORTS_OVERBOOKING); }
}

async function fetchCascadeSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(affected_reservations) AS affected,
         math::sum(est_revenue_loss) AS loss
       FROM reservation_cascade_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Reservation Cascade', faWater, 'text-violet-600', REPORTS_RESERVATION_CASCADE);
    return {
      title: 'Reservation Cascade', icon: faWater, color: 'text-violet-600',
      primary: `${c.critical} critical`, secondary: `${c.affected} affected · ${withCurrency(c.loss)} loss`,
      health: c.critical > 0 ? 'critical' : 'warning', link: REPORTS_RESERVATION_CASCADE, linkLabel: 'View cascades',
    };
  } catch { return neutralCard('Reservation Cascade', faWater, 'text-violet-600', REPORTS_RESERVATION_CASCADE); }
}

async function fetchVibeSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'peak_turnover_boost') AS peak,
         math::sum(est_revenue_impact) AS impact
       FROM vibe_recommendation WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const v = list[0];
    if (!v || v.count === 0) return neutralCard('Vibe Optimizer', faMusic, 'text-violet-600', REPORTS_VIBE_OPTIMIZER);
    return {
      title: 'Vibe Optimizer', icon: faMusic, color: 'text-violet-600',
      primary: `${v.peak} peak slots`, secondary: `${v.total} recs · ${withCurrency(v.impact)} impact`,
      health: 'good', link: REPORTS_VIBE_OPTIMIZER, linkLabel: 'View playlist',
    };
  } catch { return neutralCard('Vibe Optimizer', faMusic, 'text-violet-600', REPORTS_VIBE_OPTIMIZER); }
}

async function fetchVampireSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(annual_cost) AS cost,
         math::sum(annual_kwh) AS kwh
       FROM energy_vampire_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const v = list[0];
    if (!v || v.count === 0) return neutralCard('Energy Vampire', faPlugCircleXmark, 'text-rose-600', REPORTS_ENERGY_VAMPIRE);
    return {
      title: 'Energy Vampire', icon: faPlugCircleXmark, color: 'text-rose-600',
      primary: `${v.total} devices`, secondary: `${withCurrency(v.cost)}/yr · ${v.kwh.toFixed(0)} kWh`,
      health: 'critical', link: REPORTS_ENERGY_VAMPIRE, linkLabel: 'View vampires',
    };
  } catch { return neutralCard('Energy Vampire', faPlugCircleXmark, 'text-rose-600', REPORTS_ENERGY_VAMPIRE); }
}

async function fetchReviewResponseSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical
       FROM review_response WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    if (!r || r.count === 0) return neutralCard('Review Responses', faCommentDots, 'text-violet-600', REPORTS_REVIEW_RESPONSE);
    return {
      title: 'Review Responses', icon: faCommentDots, color: 'text-violet-600',
      primary: `${r.total} pending`, secondary: `${r.critical} critical · needs response`,
      health: r.critical > 0 ? 'critical' : 'warning', link: REPORTS_REVIEW_RESPONSE, linkLabel: 'View queue',
    };
  } catch { return neutralCard('Review Responses', faCommentDots, 'text-violet-600', REPORTS_REVIEW_RESPONSE); }
}

async function fetchSocialContentSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(est_reach) AS reach
       FROM social_post WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Social Content', faShareNodes, 'text-violet-600', REPORTS_SOCIAL_CONTENT);
    return {
      title: 'Social Content', icon: faShareNodes, color: 'text-violet-600',
      primary: `${s.total} posts`, secondary: `${s.reach.toLocaleString()} est reach`,
      health: 'good', link: REPORTS_SOCIAL_CONTENT, linkLabel: 'View posts',
    };
  } catch { return neutralCard('Social Content', faShareNodes, 'text-violet-600', REPORTS_SOCIAL_CONTENT); }
}

async function fetchCateringSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::sum(guest_count) AS guests,
         math::sum(suggested_price) AS revenue
       FROM catering_optimization WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Catering', faUtensils, 'text-violet-600', REPORTS_CATERING_OPTIMIZER);
    return {
      title: 'Catering', icon: faUtensils, color: 'text-violet-600',
      primary: `${c.total} events`, secondary: `${c.guests} guests · ${withCurrency(c.revenue)} est`,
      health: 'good', link: REPORTS_CATERING_OPTIMIZER, linkLabel: 'View events',
    };
  } catch { return neutralCard('Catering', faUtensils, 'text-violet-600', REPORTS_CATERING_OPTIMIZER); }
}

async function fetchEquipMaintSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_repair_cost) AS repair
       FROM equipment_maintenance_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const e = list[0];
    if (!e || e.count === 0) return neutralCard('Equipment Maintenance', faWrench, 'text-amber-600', REPORTS_EQUIPMENT_MAINTENANCE);
    return {
      title: 'Equipment Maintenance', icon: faWrench, color: 'text-amber-600',
      primary: `${e.critical} critical`, secondary: `${e.total} alerts · ${withCurrency(e.repair)} repair risk`,
      health: e.critical > 0 ? 'critical' : 'warning', link: REPORTS_EQUIPMENT_MAINTENANCE, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Equipment Maintenance', faWrench, 'text-amber-600', REPORTS_EQUIPMENT_MAINTENANCE); }
}

async function fetchMilestoneSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(rule_id = 'birthday') AS birthdays,
         math::sum(est_revenue_lift) AS revenue
       FROM milestone_campaign WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const m = list[0];
    if (!m || m.count === 0) return neutralCard('Milestones', faCakeCandles, 'text-pink-600', REPORTS_MILESTONE_CAMPAIGN);
    return {
      title: 'Milestones', icon: faCakeCandles, color: 'text-pink-600',
      primary: `${m.birthdays} birthdays`, secondary: `${m.total} campaigns · ${withCurrency(m.revenue)} lift`,
      health: 'good', link: REPORTS_MILESTONE_CAMPAIGN, linkLabel: 'View campaigns',
    };
  } catch { return neutralCard('Milestones', faCakeCandles, 'text-pink-600', REPORTS_MILESTONE_CAMPAIGN); }
}

async function fetchSchedPrefSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         count(DISTINCT staff_id) AS staff,
         math::count(severity = 'critical') AS critical,
         math::mean(satisfaction_score) AS satisfaction
       FROM schedule_preference WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Schedule Preferences', faCalendarCheck, 'text-violet-600', REPORTS_SCHEDULE_PREFERENCE);
    return {
      title: 'Schedule Preferences', icon: faCalendarCheck, color: 'text-violet-600',
      primary: `${s.staff} staff`, secondary: `${s.total} prefs · ${s.critical} critical · ${s.satisfaction.toFixed(0)}/100 sat`,
      health: s.critical > 0 ? 'critical' : 'good', link: REPORTS_SCHEDULE_PREFERENCE, linkLabel: 'View preferences',
    };
  } catch { return neutralCard('Schedule Preferences', faCalendarCheck, 'text-violet-600', REPORTS_SCHEDULE_PREFERENCE); }
}

async function fetchFloorPlanSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_revenue_impact) AS impact
       FROM floor_plan_optimization WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Floor Plan', faTableColumns, 'text-violet-600', REPORTS_FLOOR_PLAN_OPTIMIZER);
    return {
      title: 'Floor Plan', icon: faTableColumns, color: 'text-violet-600',
      primary: `${f.total} recs`, secondary: `${f.critical} critical · ${withCurrency(f.impact)} impact`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_FLOOR_PLAN_OPTIMIZER, linkLabel: 'View layout',
    };
  } catch { return neutralCard('Floor Plan', faTableColumns, 'text-violet-600', REPORTS_FLOOR_PLAN_OPTIMIZER); }
}

async function fetchOnlineFraudSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(order_value) AS value
       FROM online_fraud_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Online Fraud', faShieldHalved, 'text-rose-600', REPORTS_ONLINE_FRAUD_DETECTOR);
    return {
      title: 'Online Fraud', icon: faShieldHalved, color: 'text-rose-600',
      primary: `${f.critical} critical`, secondary: `${f.total} alerts · ${withCurrency(f.value)} at risk`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_ONLINE_FRAUD_DETECTOR, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Online Fraud', faShieldHalved, 'text-rose-600', REPORTS_ONLINE_FRAUD_DETECTOR); }
}

async function fetchPackagingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_savings_monthly) AS savings
       FROM packaging_recommendation WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Packaging', faBox, 'text-amber-600', REPORTS_PACKAGING_OPTIMIZER);
    return {
      title: 'Packaging', icon: faBox, color: 'text-amber-600',
      primary: `${withCurrency(f.savings)}/mo`,
      secondary: `${f.total} recs · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_PACKAGING_OPTIMIZER, linkLabel: 'View recs',
    };
  } catch { return neutralCard('Packaging', faBox, 'text-amber-600', REPORTS_PACKAGING_OPTIMIZER); }
}

async function fetchReorderPointSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(rule_id = 'emergency_reorder') AS emergency,
         math::sum(est_savings_monthly) AS savings
       FROM reorder_recommendation WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Reorder Pts', faBoxesStacked, 'text-sky-600', REPORTS_REORDER_POINT_OPTIMIZER);
    return {
      title: 'Reorder Pts', icon: faBoxesStacked, color: 'text-sky-600',
      primary: `${withCurrency(f.savings)}/mo`,
      secondary: `${f.total} recs · ${f.emergency} emergency`,
      health: f.emergency > 0 ? 'critical' : (f.critical > 0 ? 'warning' : 'good'), link: REPORTS_REORDER_POINT_OPTIMIZER, linkLabel: 'View recs',
    };
  } catch { return neutralCard('Reorder Pts', faBoxesStacked, 'text-sky-600', REPORTS_REORDER_POINT_OPTIMIZER); }
}

async function fetchPrepSheetSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_savings_daily) AS savings
       FROM prep_sheet_recommendation WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Prep Sheet', faUtensils, 'text-orange-600', REPORTS_PREP_SHEET_OPTIMIZER);
    return {
      title: 'Prep Sheet', icon: faUtensils, color: 'text-orange-600',
      primary: `${withCurrency(f.savings)}/day`,
      secondary: `${f.total} recs · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_PREP_SHEET_OPTIMIZER, linkLabel: 'View prep',
    };
  } catch { return neutralCard('Prep Sheet', faUtensils, 'text-orange-600', REPORTS_PREP_SHEET_OPTIMIZER); }
}

async function fetchPayFeeSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(rule_id = 'duplicate_detection') AS duplicates,
         math::sum(est_savings_monthly) AS savings
       FROM payment_fee_recommendation WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Pay Fees', faCreditCard, 'text-violet-600', REPORTS_PAYMENT_FEE_OPTIMIZER);
    return {
      title: 'Pay Fees', icon: faCreditCard, color: 'text-violet-600',
      primary: `${withCurrency(f.savings)}/mo`,
      secondary: `${f.total} recs · ${f.duplicates} duplicates`,
      health: f.duplicates > 0 ? 'critical' : (f.critical > 0 ? 'warning' : 'good'), link: REPORTS_PAYMENT_FEE_OPTIMIZER, linkLabel: 'View recs',
    };
  } catch { return neutralCard('Pay Fees', faCreditCard, 'text-violet-600', REPORTS_PAYMENT_FEE_OPTIMIZER); }
}

async function fetchHealthSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_revenue_risk) AS risk
       FROM health_readiness_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Health', faClipboardCheck, 'text-emerald-600', REPORTS_HEALTH_INSPECTION_READINESS);
    return {
      title: 'Health', icon: faClipboardCheck, color: 'text-emerald-600',
      primary: `${f.critical} critical`,
      secondary: `${f.total} violations · ${withCurrency(f.risk)} at risk`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_HEALTH_INSPECTION_READINESS, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Health', faClipboardCheck, 'text-emerald-600', REPORTS_HEALTH_INSPECTION_READINESS); }
}

async function fetchSchedConflictSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::count(compliance_risk IN ['major', 'critical']) AS compliance,
         math::sum(est_fine) AS fines
       FROM schedule_conflict_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Sched Conflicts', faCalendarXmark, 'text-rose-600', REPORTS_SCHEDULE_CONFLICT_RESOLVER);
    return {
      title: 'Sched Conflicts', icon: faCalendarXmark, color: 'text-rose-600',
      primary: `${f.compliance} legal risks`,
      secondary: `${f.total} conflicts · ${withCurrency(f.fines)} fines`,
      health: f.compliance > 0 ? 'critical' : (f.critical > 0 ? 'warning' : 'good'), link: REPORTS_SCHEDULE_CONFLICT_RESOLVER, linkLabel: 'Resolve',
    };
  } catch { return neutralCard('Sched Conflicts', faCalendarXmark, 'text-rose-600', REPORTS_SCHEDULE_CONFLICT_RESOLVER); }
}

async function fetchBreakEvenSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_loss_today) AS loss,
         math::sum(est_surplus_today) AS surplus
       FROM break_even_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Break-Even', faChartLine, 'text-emerald-600', REPORTS_BREAK_EVEN_TRACKER);
    const netImpact = safeNumber(f.surplus, 0) - safeNumber(f.loss, 0);
    return {
      title: 'Break-Even', icon: faChartLine, color: netImpact >= 0 ? 'text-emerald-600' : 'text-rose-600',
      primary: netImpact >= 0 ? `+${withCurrency(f.surplus)}` : `-${withCurrency(f.loss)}`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_BREAK_EVEN_TRACKER, linkLabel: 'View pace',
    };
  } catch { return neutralCard('Break-Even', faChartLine, 'text-emerald-600', REPORTS_BREAK_EVEN_TRACKER); }
}

async function fetchAlcoholSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_fine) AS fines,
         math::sum(est_liability) AS liability
       FROM alcohol_compliance_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Alcohol', faWineGlass, 'text-violet-600', REPORTS_ALCOHOL_COMPLIANCE_MONITOR);
    return {
      title: 'Alcohol', icon: faWineGlass, color: 'text-violet-600',
      primary: `${f.critical} critical`,
      secondary: `${f.total} violations · ${withCurrency(f.fines + f.liability)} risk`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_ALCOHOL_COMPLIANCE_MONITOR, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Alcohol', faWineGlass, 'text-violet-600', REPORTS_ALCOHOL_COMPLIANCE_MONITOR); }
}

async function fetchRecipeScaleSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::sum(target_servings) AS servings, math::sum(est_savings) AS savings
       FROM recipe_scaling WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    if (!r || r.count === 0) return neutralCard('Recipe Scaling', faScaleBalanced, 'text-violet-600', REPORTS_RECIPE_SCALING);
    return {
      title: 'Recipe Scaling', icon: faScaleBalanced, color: 'text-violet-600',
      primary: `${r.total} recipes`, secondary: `${r.servings} servings · ${withCurrency(r.savings)} savings`,
      health: 'good', link: REPORTS_RECIPE_SCALING, linkLabel: 'View scalings',
    };
  } catch { return neutralCard('Recipe Scaling', faScaleBalanced, 'text-violet-600', REPORTS_RECIPE_SCALING); }
}

async function fetchWineSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(rule_id = 'classic_match') AS classic, math::sum(est_revenue_lift) AS lift
       FROM wine_pairing WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const w = list[0];
    if (!w || w.count === 0) return neutralCard('Sommelier', faWineGlass, 'text-rose-600', REPORTS_WINE_PAIRING);
    return {
      title: 'Sommelier', icon: faWineGlass, color: 'text-rose-600',
      primary: `${w.classic} classic`, secondary: `${w.total} pairings · ${withCurrency(w.lift)} lift`,
      health: 'good', link: REPORTS_WINE_PAIRING, linkLabel: 'View pairings',
    };
  } catch { return neutralCard('Sommelier', faWineGlass, 'text-rose-600', REPORTS_WINE_PAIRING); }
}

async function fetchGamificationSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(rule_id = 'achievement_badge') AS badges, math::mean(est_engagement_boost) AS boost
       FROM staff_gamification WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const g = list[0];
    if (!g || g.count === 0) return neutralCard('Gamification', faTrophy, 'text-amber-600', REPORTS_STAFF_GAMIFICATION);
    return {
      title: 'Gamification', icon: faTrophy, color: 'text-amber-600',
      primary: `${g.badges} badges`, secondary: `${g.total} entries · +${(g.boost * 100).toFixed(0)}% engagement`,
      health: 'good', link: REPORTS_STAFF_GAMIFICATION, linkLabel: 'View game',
    };
  } catch { return neutralCard('Gamification', faTrophy, 'text-amber-600', REPORTS_STAFF_GAMIFICATION); }
}

async function fetchKitchenPrepSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(rule_id = 'prep_now') AS prep_now, math::count(rule_id = 'capacity_warning') AS capacity
       FROM kitchen_prep_schedule WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const k = list[0];
    if (!k || k.count === 0) return neutralCard('Kitchen Prep', faFireBurner, 'text-rose-600', REPORTS_KITCHEN_PREP_SCHEDULER);
    return {
      title: 'Kitchen Prep', icon: faFireBurner, color: 'text-rose-600',
      primary: `${k.prep_now} prep now`, secondary: `${k.total} dishes · ${k.capacity} capacity warnings`,
      health: k.capacity > 0 ? 'critical' : k.prep_now > 0 ? 'warning' : 'good', link: REPORTS_KITCHEN_PREP_SCHEDULER, linkLabel: 'View schedule',
    };
  } catch { return neutralCard('Kitchen Prep', faFireBurner, 'text-rose-600', REPORTS_KITCHEN_PREP_SCHEDULER); }
}

async function fetchTransferSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::sum(net_savings) AS savings
       FROM inventory_transfer WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const t = list[0];
    if (!t || t.count === 0) return neutralCard('Inventory Transfer', faExchangeAlt, 'text-violet-600', REPORTS_INVENTORY_TRANSFER);
    return {
      title: 'Inventory Transfer', icon: faExchangeAlt, color: 'text-violet-600',
      primary: `${t.total} transfers`, secondary: `${t.critical} critical · ${withCurrency(t.savings)} savings`,
      health: t.critical > 0 ? 'critical' : 'good', link: REPORTS_INVENTORY_TRANSFER, linkLabel: 'View transfers',
    };
  } catch { return neutralCard('Inventory Transfer', faExchangeAlt, 'text-violet-600', REPORTS_INVENTORY_TRANSFER); }
}

async function fetchSentimentTrendSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::mean(current_score) AS current, math::mean(predicted_score) AS predicted
       FROM sentiment_trend WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Sentiment Trend', faChartLine, 'text-violet-600', REPORTS_SENTIMENT_TREND);
    const direction = s.predicted > s.current ? 'improving' : 'declining';
    return {
      title: 'Sentiment Trend', icon: faChartLine, color: 'text-violet-600',
      primary: `${s.critical} critical`, secondary: `${s.total} alerts · ${direction} (pred ${s.predicted.toFixed(2)})`,
      health: s.critical > 0 ? 'critical' : 'good', link: REPORTS_SENTIMENT_TREND, linkLabel: 'View trends',
    };
  } catch { return neutralCard('Sentiment Trend', faChartLine, 'text-violet-600', REPORTS_SENTIMENT_TREND); }
}

async function fetchCleaningSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(rule_id = 'compliance_overdue') AS overdue, math::count(severity = 'critical') AS critical
       FROM cleaning_schedule WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Cleaning', faBroom, 'text-amber-600', REPORTS_CLEANING_SCHEDULER);
    return {
      title: 'Cleaning', icon: faBroom, color: 'text-amber-600',
      primary: `${c.overdue} overdue`, secondary: `${c.total} tasks · ${c.critical} critical`,
      health: c.overdue > 0 ? 'critical' : c.critical > 0 ? 'warning' : 'good', link: REPORTS_CLEANING_SCHEDULER, linkLabel: 'View tasks',
    };
  } catch { return neutralCard('Cleaning', faBroom, 'text-amber-600', REPORTS_CLEANING_SCHEDULER); }
}

async function fetchDriverCoachSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::mean(overall_score) AS score
       FROM driver_coach WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const d = list[0];
    if (!d || d.count === 0) return neutralCard('Driver Coach', faTruckFast, 'text-violet-600', REPORTS_DRIVER_COACH);
    return {
      title: 'Driver Coach', icon: faTruckFast, color: 'text-violet-600',
      primary: `${d.total} drivers`, secondary: `${d.critical} critical · avg ${d.score.toFixed(0)}/100`,
      health: d.critical > 0 ? 'critical' : 'good', link: REPORTS_DRIVER_COACH, linkLabel: 'View drivers',
    };
  } catch { return neutralCard('Driver Coach', faTruckFast, 'text-violet-600', REPORTS_DRIVER_COACH); }
}

async function fetchExpirySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::sum(cost_at_risk) AS risk
       FROM expiry_tracker WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const e = list[0];
    if (!e || e.count === 0) return neutralCard('Expiry Tracker', faClock, 'text-rose-600', REPORTS_EXPIRY_TRACKER);
    return {
      title: 'Expiry Tracker', icon: faClock, color: 'text-rose-600',
      primary: `${e.critical} critical`, secondary: `${e.total} items · ${withCurrency(e.risk)} at risk`,
      health: e.critical > 0 ? 'critical' : 'warning', link: REPORTS_EXPIRY_TRACKER, linkLabel: 'View items',
    };
  } catch { return neutralCard('Expiry Tracker', faClock, 'text-rose-600', REPORTS_EXPIRY_TRACKER); }
}

async function fetchAdTargetingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::sum(suggested_budget) AS budget, math::sum(est_revenue) AS revenue, math::mean(est_roas) AS roas
       FROM ad_targeting WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const a = list[0];
    if (!a || a.count === 0) return neutralCard('Ad Targeting', faBullhorn, 'text-blue-600', REPORTS_AD_TARGETING);
    return {
      title: 'Ad Targeting', icon: faBullhorn, color: 'text-blue-600',
      primary: `${a.total} campaigns`, secondary: `${withCurrency(a.budget)}/day · ${a.roas.toFixed(1)}x ROAS`,
      health: a.roas >= 4 ? 'good' : a.roas >= 2 ? 'warning' : 'critical', link: REPORTS_AD_TARGETING, linkLabel: 'View ads',
    };
  } catch { return neutralCard('Ad Targeting', faBullhorn, 'text-blue-600', REPORTS_AD_TARGETING); }
}

async function fetchLocalSeoSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::mean(seo_score) AS score
       FROM local_seo WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Local SEO', faMagnifyingGlassLocation, 'text-blue-600', REPORTS_LOCAL_SEO);
    return {
      title: 'Local SEO', icon: faMagnifyingGlassLocation, color: 'text-blue-600',
      primary: `${s.total} alerts`, secondary: `${s.critical} critical · score ${s.score.toFixed(0)}/100`,
      health: s.critical > 0 ? 'critical' : 'warning', link: REPORTS_LOCAL_SEO, linkLabel: 'View SEO',
    };
  } catch { return neutralCard('Local SEO', faMagnifyingGlassLocation, 'text-blue-600', REPORTS_LOCAL_SEO); }
}

async function fetchPricePsychSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::sum(est_revenue_lift) AS lift
       FROM price_psychology WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const p = list[0];
    if (!p || p.count === 0) return neutralCard('Price Psychology', faBrain, 'text-violet-600', REPORTS_PRICE_PSYCHOLOGY);
    return {
      title: 'Price Psychology', icon: faBrain, color: 'text-violet-600',
      primary: `${p.total} recs`, secondary: `${withCurrency(p.lift)} est revenue lift`,
      health: 'good', link: REPORTS_PRICE_PSYCHOLOGY, linkLabel: 'View recs',
    };
  } catch { return neutralCard('Price Psychology', faBrain, 'text-violet-600', REPORTS_PRICE_PSYCHOLOGY); }
}

async function fetchStressTestSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::count(survival_outcome != 'survives') AS insolvency
       FROM cash_stress_test WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const s = list[0];
    if (!s || s.count === 0) return neutralCard('Stress Test', faShieldHalved, 'text-rose-600', REPORTS_CASH_STRESS_TEST);
    return {
      title: 'Stress Test', icon: faShieldHalved, color: 'text-rose-600',
      primary: `${s.critical} critical`, secondary: `${s.total} scenarios · ${s.insolvency} insolvency risks`,
      health: s.critical > 0 ? 'critical' : 'good', link: REPORTS_CASH_STRESS_TEST, linkLabel: 'View tests',
    };
  } catch { return neutralCard('Stress Test', faShieldHalved, 'text-rose-600', REPORTS_CASH_STRESS_TEST); }
}

async function fetchEventMenuSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::sum(net_profit) AS profit
       FROM event_menu_optimization WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const e = list[0];
    if (!e || e.count === 0) return neutralCard('Event Menu', faCalendarStar, 'text-rose-600', REPORTS_EVENT_MENU);
    return {
      title: 'Event Menu', icon: faCalendarStar, color: 'text-rose-600',
      primary: `${e.total} events`, secondary: `${e.critical} critical · ${withCurrency(e.profit)} est profit`,
      health: e.critical > 0 ? 'critical' : 'good', link: REPORTS_EVENT_MENU, linkLabel: 'View events',
    };
  } catch { return neutralCard('Event Menu', faCalendarStar, 'text-rose-600', REPORTS_EVENT_MENU); }
}

async function fetchRetentionSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::sum(est_replacement_cost - est_cost) AS savings
       FROM retention_program WHERE status IN ('open', 'in_progress') GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const r = list[0];
    if (!r || r.count === 0) return neutralCard('Retention', faHeartCircleCheck, 'text-rose-600', REPORTS_RETENTION_PROGRAM);
    return {
      title: 'Retention', icon: faHeartCircleCheck, color: 'text-rose-600',
      primary: `${r.total} programs`, secondary: `${r.critical} critical · ${withCurrency(r.savings)} savings`,
      health: r.critical > 0 ? 'critical' : 'warning', link: REPORTS_RETENTION_PROGRAM, linkLabel: 'View programs',
    };
  } catch { return neutralCard('Retention', faHeartCircleCheck, 'text-rose-600', REPORTS_RETENTION_PROGRAM); }
}

async function fetchNegotiationSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::sum(est_savings_annual) AS savings, math::count(severity = 'high') AS high
       FROM supplier_negotiation WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const n = list[0];
    if (!n || n.count === 0) return neutralCard('Negotiation', faHandshakeSimple, 'text-violet-600', REPORTS_SUPPLIER_NEGOTIATION);
    return {
      title: 'Negotiation', icon: faHandshakeSimple, color: 'text-violet-600',
      primary: `${n.total} opportunities`, secondary: `${withCurrency(n.savings)}/yr savings`,
      health: 'good', link: REPORTS_SUPPLIER_NEGOTIATION, linkLabel: 'View opportunities',
    };
  } catch { return neutralCard('Negotiation', faHandshakeSimple, 'text-violet-600', REPORTS_SUPPLIER_NEGOTIATION); }
}

async function fetchMaintBudgetSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::sum(est_cost) AS cost, math::sum(est_savings) AS savings
       FROM maintenance_budget WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const m = list[0];
    if (!m || m.count === 0) return neutralCard('Maint. Budget', faWrench, 'text-amber-600', REPORTS_MAINTENANCE_BUDGET);
    return {
      title: 'Maint. Budget', icon: faWrench, color: 'text-amber-600',
      primary: `${m.total} items`, secondary: `${withCurrency(m.cost)} planned · ${withCurrency(m.savings)} saved`,
      health: 'good', link: REPORTS_MAINTENANCE_BUDGET, linkLabel: 'View budget',
    };
  } catch { return neutralCard('Maint. Budget', faWrench, 'text-amber-600', REPORTS_MAINTENANCE_BUDGET); }
}

async function fetchFeedbackLoopSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::count(days_open > 7) AS overdue
       FROM feedback_loop WHERE status != 'closed' AND status != 'expired' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Feedback Loop', faComments, 'text-blue-600', REPORTS_FEEDBACK_LOOP);
    return {
      title: 'Feedback Loop', icon: faComments, color: 'text-blue-600',
      primary: `${f.total} open`, secondary: `${f.critical} critical · ${f.overdue} overdue`,
      health: f.critical > 0 ? 'critical' : f.overdue > 0 ? 'warning' : 'good', link: REPORTS_FEEDBACK_LOOP, linkLabel: 'View feedback',
    };
  } catch { return neutralCard('Feedback Loop', faComments, 'text-blue-600', REPORTS_FEEDBACK_LOOP); }
}

async function fetchCrossSellSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::sum(est_annual_revenue) AS revenue, math::count(status = 'active') AS active
       FROM cross_sell_suggestion WHERE status IN ('open', 'active') GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const c = list[0];
    if (!c || c.count === 0) return neutralCard('Cross-Sell', faCartPlus, 'text-emerald-600', REPORTS_CROSS_SELL);
    return {
      title: 'Cross-Sell', icon: faCartPlus, color: 'text-emerald-600',
      primary: `${c.total} suggestions`, secondary: `${withCurrency(c.revenue)}/yr potential · ${c.active} active`,
      health: 'good', link: REPORTS_CROSS_SELL, linkLabel: 'View suggestions',
    };
  } catch { return neutralCard('Cross-Sell', faCartPlus, 'text-emerald-600', REPORTS_CROSS_SELL); }
}

async function fetchDishPopSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(confidence >= 0.60) AS high, math::sum(predicted_revenue_week) AS revenue
       FROM dish_popularity_prediction WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const d = list[0];
    if (!d || d.count === 0) return neutralCard('Dish Popularity', faLightbulb, 'text-amber-600', REPORTS_DISH_POPULARITY);
    return {
      title: 'Dish Popularity', icon: faLightbulb, color: 'text-amber-600',
      primary: `${d.total} dishes`, secondary: `${d.high} high-conf · ${withCurrency(d.revenue)}/wk potential`,
      health: 'good', link: REPORTS_DISH_POPULARITY, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Dish Popularity', faLightbulb, 'text-amber-600', REPORTS_DISH_POPULARITY); }
}

async function fetchWaitlistSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical, math::sum(est_walk_away_cost) AS cost
       FROM waitlist_optimization WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const w = list[0];
    if (!w || w.count === 0) return neutralCard('Waitlist', faListCheck, 'text-violet-600', REPORTS_WAITLIST_OPTIMIZER);
    return {
      title: 'Waitlist', icon: faListCheck, color: 'text-violet-600',
      primary: `${w.total} alerts`, secondary: `${w.critical} critical · ${withCurrency(w.cost)} at risk`,
      health: w.critical > 0 ? 'critical' : 'warning', link: REPORTS_WAITLIST_OPTIMIZER, linkLabel: 'View waitlist',
    };
  } catch { return neutralCard('Waitlist', faListCheck, 'text-violet-600', REPORTS_WAITLIST_OPTIMIZER); }
}

async function fetchNutritionSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_reformulation_savings) AS savings,
         math::sum(est_compliance_risk) AS risk
       FROM recipe_nutrition_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Nutrition', faLeaf, 'text-emerald-600', REPORTS_RECIPE_NUTRITION_GENERATOR);
    return {
      title: 'Nutrition', icon: faLeaf, color: 'text-emerald-600',
      primary: `${f.critical} critical`,
      secondary: `${f.total} alerts · ${withCurrency(f.savings)} savings`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_RECIPE_NUTRITION_GENERATOR, linkLabel: 'View recs',
    };
  } catch { return neutralCard('Nutrition', faLeaf, 'text-emerald-600', REPORTS_RECIPE_NUTRITION_GENERATOR); }
}

async function fetchCustomizationSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity IN ['critical', 'high']) AS high_impact,
         math::sum(est_revenue_lost_monthly) AS revenue_lost,
         math::sum(est_savings_monthly) AS savings
       FROM customization_pattern_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Customization', faSliders, 'text-violet-600', REPORTS_ORDER_CUSTOMIZATION_ANALYZER);
    return {
      title: 'Customization', icon: faSliders, color: 'text-violet-600',
      primary: `${withCurrency(f.savings)}/mo`,
      secondary: `${f.total} patterns · ${withCurrency(f.revenue_lost)} lost`,
      health: f.high_impact > 0 ? 'warning' : 'good', link: REPORTS_ORDER_CUSTOMIZATION_ANALYZER, linkLabel: 'View patterns',
    };
  } catch { return neutralCard('Customization', faSliders, 'text-violet-600', REPORTS_ORDER_CUSTOMIZATION_ANALYZER); }
}

async function fetchTableTurnoverSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_revenue_at_risk) AS risk,
         math::sum(est_revenue_opportunity) AS opportunity
       FROM table_turnover_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Turnover', faStopwatch, 'text-amber-600', REPORTS_TABLE_TURNOVER_PREDICTOR);
    return {
      title: 'Turnover', icon: faStopwatch, color: 'text-amber-600',
      primary: `${f.critical} urgent`,
      secondary: `${f.total} tables · ${withCurrency(f.risk + f.opportunity)} impact`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_TABLE_TURNOVER_PREDICTOR, linkLabel: 'View tables',
    };
  } catch { return neutralCard('Turnover', faStopwatch, 'text-amber-600', REPORTS_TABLE_TURNOVER_PREDICTOR); }
}

async function fetchProcedureSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_revenue_impact) AS revenue,
         math::sum(est_risk_cost) AS risk
       FROM procedure_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Procedures', faClipboardList, 'text-sky-600', REPORTS_OPENING_CLOSING_AUTOMATOR);
    return {
      title: 'Procedures', icon: faClipboardList, color: 'text-sky-600',
      primary: `${f.critical} critical`,
      secondary: `${f.total} tasks · ${withCurrency(f.revenue + f.risk)} impact`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_OPENING_CLOSING_AUTOMATOR, linkLabel: 'View tasks',
    };
  } catch { return neutralCard('Procedures', faClipboardList, 'text-sky-600', REPORTS_OPENING_CLOSING_AUTOMATOR); }
}

async function fetchCarbonSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(reduction_potential_kg) AS reduction,
         math::sum(offset_cost) AS offset
       FROM carbon_footprint_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Carbon', faLeaf, 'text-emerald-600', REPORTS_CARBON_FOOTPRINT_TRACKER);
    return {
      title: 'Carbon', icon: faLeaf, color: 'text-emerald-600',
      primary: `${(f.reduction / 1000).toFixed(1)}t reduce`,
      secondary: `${f.total} sources · ${withCurrency(f.offset)} offset`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_CARBON_FOOTPRINT_TRACKER, linkLabel: 'View CO2',
    };
  } catch { return neutralCard('Carbon', faLeaf, 'text-emerald-600', REPORTS_CARBON_FOOTPRINT_TRACKER); }
}

async function fetchAdRoiSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity IN ['critical', 'high']) AS high_impact,
         math::sum(est_wasted_spend) AS wasted,
         math::sum(est_revenue_opportunity) AS opportunity
       FROM ad_roi_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Ad ROI', faChartLine, 'text-violet-600', REPORTS_AD_ROI_TRACKER);
    return {
      title: 'Ad ROI', icon: faChartLine, color: 'text-violet-600',
      primary: `${withCurrency(f.wasted)} wasted`,
      secondary: `${f.total} alerts · ${withCurrency(f.opportunity)} upside`,
      health: f.high_impact > 0 ? 'critical' : 'warning', link: REPORTS_AD_ROI_TRACKER, linkLabel: 'View ads',
    };
  } catch { return neutralCard('Ad ROI', faChartLine, 'text-violet-600', REPORTS_AD_ROI_TRACKER); }
}

async function fetchCompSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_turnover_cost) AS turnover_risk,
         math::sum(est_payroll_savings) AS savings
       FROM compensation_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Compensation', faHandHoldingDollar, 'text-emerald-600', REPORTS_COMPENSATION_OPTIMIZER);
    return {
      title: 'Compensation', icon: faHandHoldingDollar, color: 'text-emerald-600',
      primary: `${withCurrency(f.turnover_risk)} at risk`,
      secondary: `${f.total} alerts · ${withCurrency(f.savings)} savings`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_COMPENSATION_OPTIMIZER, linkLabel: 'View staff',
    };
  } catch { return neutralCard('Compensation', faHandHoldingDollar, 'text-emerald-600', REPORTS_COMPENSATION_OPTIMIZER); }
}

async function fetchTaxSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity IN ['critical', 'high']) AS critical,
         math::sum(eligible_amount) AS eligible,
         math::sum(tax_savings) AS savings
       FROM tax_deduction_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Tax Deductions', faFileInvoiceDollar, 'text-emerald-600', REPORTS_TAX_DEDUCTION_FINDER);
    return {
      title: 'Tax Deductions', icon: faFileInvoiceDollar, color: 'text-emerald-600',
      primary: `${withCurrency(f.savings)} savings`,
      secondary: `${f.total} deductions · ${withCurrency(f.eligible)} eligible`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_TAX_DEDUCTION_FINDER, linkLabel: 'View deductions',
    };
  } catch { return neutralCard('Tax Deductions', faFileInvoiceDollar, 'text-emerald-600', REPORTS_TAX_DEDUCTION_FINDER); }
}

async function fetchPhoneSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity IN ['critical', 'high']) AS critical,
         math::sum(est_revenue_lost_monthly) AS revenue_lost,
         math::sum(est_revenue_opportunity) AS opportunity
       FROM phone_order_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Phone Orders', faPhone, 'text-sky-600', REPORTS_PHONE_ORDER_OPTIMIZER);
    return {
      title: 'Phone Orders', icon: faPhone, color: 'text-sky-600',
      primary: `${withCurrency(f.revenue_lost)} lost`,
      secondary: `${f.total} alerts · ${withCurrency(f.opportunity)} upside`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_PHONE_ORDER_OPTIMIZER, linkLabel: 'View calls',
    };
  } catch { return neutralCard('Phone Orders', faPhone, 'text-sky-600', REPORTS_PHONE_ORDER_OPTIMIZER); }
}

async function fetchPredictSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(confidence_score >= 70) AS high_confidence,
         math::sum(est_revenue_uplift) AS uplift
       FROM predictive_order_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Predictive', faWandMagicSparkles, 'text-violet-600', REPORTS_PREDICTIVE_ORDERING);
    return {
      title: 'Predictive', icon: faWandMagicSparkles, color: 'text-violet-600',
      primary: `${f.high_confidence} predicted`,
      secondary: `${f.total} regulars · ${withCurrency(f.uplift)} uplift`,
      health: f.high_confidence > 0 ? 'good' : 'neutral', link: REPORTS_PREDICTIVE_ORDERING, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Predictive', faWandMagicSparkles, 'text-violet-600', REPORTS_PREDICTIVE_ORDERING); }
}

async function fetchIntelSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT
         count() AS total,
         math::count(severity = 'critical') AS critical,
         math::sum(est_revenue_impact WHERE impact_type = 'risk') AS risk,
         math::sum(est_revenue_impact WHERE impact_type = 'opportunity') AS opportunity
       FROM competitor_intel_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Competitor Intel', faStore, 'text-violet-600', REPORTS_COMPETITOR_INTELLIGENCE);
    return {
      title: 'Competitor Intel', icon: faStore, color: 'text-violet-600',
      primary: `${withCurrency(f.risk)} at risk`,
      secondary: `${f.total} alerts · ${withCurrency(f.opportunity)} opportunity`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_COMPETITOR_INTELLIGENCE, linkLabel: 'View intel',
    };
  } catch { return neutralCard('Competitor Intel', faStore, 'text-violet-600', REPORTS_COMPETITOR_INTELLIGENCE); }
}

async function fetchBenchSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_revenue_uplift) AS uplift, math::sum(est_cost_savings) AS savings
       FROM location_benchmark_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Benchmark', faBuilding, 'text-sky-600', REPORTS_MULTI_LOCATION_BENCHMARK);
    return {
      title: 'Benchmark', icon: faBuilding, color: 'text-sky-600',
      primary: `${withCurrency(f.uplift + f.savings)} potential`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_MULTI_LOCATION_BENCHMARK, linkLabel: 'View benchmark',
    };
  } catch { return neutralCard('Benchmark', faBuilding, 'text-sky-600', REPORTS_MULTI_LOCATION_BENCHMARK); }
}

async function fetchWasteValueSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::sum(est_value_recovery) AS value, math::sum(eco_impact_kg_co2) AS co2
       FROM waste_value_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Waste Value', faRecycle, 'text-emerald-600', REPORTS_WASTE_TO_VALUE);
    return {
      title: 'Waste Value', icon: faRecycle, color: 'text-emerald-600',
      primary: `${withCurrency(f.value)}/mo`,
      secondary: `${f.total} items · ${f.co2}kg CO2 saved`,
      health: 'good', link: REPORTS_WASTE_TO_VALUE, linkLabel: 'Convert waste',
    };
  } catch { return neutralCard('Waste Value', faRecycle, 'text-emerald-600', REPORTS_WASTE_TO_VALUE); }
}

async function fetchSocialSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_revenue_impact WHERE impact_type = 'risk') AS risk,
              math::sum(est_revenue_impact WHERE impact_type = 'opportunity') AS opportunity
       FROM social_listening_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Social', faEarListen, 'text-violet-600', REPORTS_SOCIAL_LISTENING);
    return {
      title: 'Social', icon: faEarListen, color: 'text-violet-600',
      primary: `${f.critical} critical`,
      secondary: `${f.total} alerts · ${withCurrency(f.risk + f.opportunity)} impact`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_SOCIAL_LISTENING, linkLabel: 'View mentions',
    };
  } catch { return neutralCard('Social', faEarListen, 'text-violet-600', REPORTS_SOCIAL_LISTENING); }
}

async function fetchHiringSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity IN ['critical', 'high']) AS critical,
              math::sum(est_turnover_cost) AS turnover_risk
       FROM hiring_prediction_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Hiring', faUserPlus, 'text-emerald-600', REPORTS_HIRING_PREDICTOR);
    return {
      title: 'Hiring', icon: faUserPlus, color: 'text-emerald-600',
      primary: `${f.critical} at risk`,
      secondary: `${f.total} candidates · ${withCurrency(f.turnover_risk)} risk`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_HIRING_PREDICTOR, linkLabel: 'View candidates',
    };
  } catch { return neutralCard('Hiring', faUserPlus, 'text-emerald-600', REPORTS_HIRING_PREDICTOR); }
}

async function fetchInvoiceSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity IN ['critical', 'high']) AS critical,
              math::sum(est_monthly_loss) AS loss
       FROM invoice_audit_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Invoice Audit', faFileInvoice, 'text-amber-600', REPORTS_VENDOR_INVOICE_AUDIT);
    return {
      title: 'Invoice Audit', icon: faFileInvoice, color: 'text-amber-600',
      primary: `${withCurrency(f.loss)}/mo`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_VENDOR_INVOICE_AUDIT, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Invoice Audit', faFileInvoice, 'text-amber-600', REPORTS_VENDOR_INVOICE_AUDIT); }
}

async function fetchBreakSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(penalty_amount) AS penalty, math::sum(est_monthly_liability) AS liability
       FROM break_compliance_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Break Compliance', faMugHot, 'text-amber-600', REPORTS_BREAK_COMPLIANCE);
    return {
      title: 'Break Compliance', icon: faMugHot, color: 'text-amber-600',
      primary: `${fmt$(f.penalty)} penalties`,
      secondary: `${f.total} violations · ${fmt$(f.liability)}/mo liability`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_BREAK_COMPLIANCE, linkLabel: 'View violations',
    };
  } catch { return neutralCard('Break Compliance', faMugHot, 'text-amber-600', REPORTS_BREAK_COMPLIANCE); }
}

async function fetchUtilitySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity IN ['critical', 'high']) AS critical,
              math::sum(overcharge_amount) AS overcharge, math::sum(est_annual_savings) AS savings
       FROM utility_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Utility', faBolt, 'text-amber-600', REPORTS_UTILITY_BILL_OPTIMIZER);
    return {
      title: 'Utility', icon: faBolt, color: 'text-amber-600',
      primary: `${withCurrency(f.overcharge)}/mo`,
      secondary: `${f.total} alerts · ${withCurrency(f.savings)}/yr savings`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_UTILITY_BILL_OPTIMIZER, linkLabel: 'View alerts',
    };
  } catch { return neutralCard('Utility', faBolt, 'text-amber-600', REPORTS_UTILITY_BILL_OPTIMIZER); }
}

async function fetchPacingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_revenue_at_risk) AS risk
       FROM order_pacing_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Pacing', faGaugeHigh, 'text-orange-600', REPORTS_ORDER_PACING);
    return {
      title: 'Pacing', icon: faGaugeHigh, color: 'text-orange-600',
      primary: `${f.critical} critical`,
      secondary: `${f.total} alerts · ${withCurrency(f.risk)} at risk`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_ORDER_PACING, linkLabel: 'View pacing',
    };
  } catch { return neutralCard('Pacing', faGaugeHigh, 'text-orange-600', REPORTS_ORDER_PACING); }
}

async function fetchHeatmapSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_revenue_impact) AS impact
       FROM sentiment_heatmap_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Heatmap', faFire, 'text-rose-600', REPORTS_SENTIMENT_HEATMAP);
    return {
      title: 'Heatmap', icon: faFire, color: 'text-rose-600',
      primary: `${f.critical} critical`,
      secondary: `${f.total} alerts · ${withCurrency(f.impact)} impact`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_SENTIMENT_HEATMAP, linkLabel: 'View heatmap',
    };
  } catch { return neutralCard('Heatmap', faFire, 'text-rose-600', REPORTS_SENTIMENT_HEATMAP); }
}

async function fetchZoneSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity IN ['critical', 'high']) AS critical,
              math::sum(est_monthly_loss) AS loss, math::sum(est_monthly_opportunity) AS opportunity
       FROM delivery_zone_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Dlvy Zones', faMapLocationDot, 'text-sky-600', REPORTS_DELIVERY_ZONE_OPTIMIZER);
    return {
      title: 'Dlvy Zones', icon: faMapLocationDot, color: 'text-sky-600',
      primary: `${withCurrency(f.loss)} loss`,
      secondary: `${f.total} alerts · ${withCurrency(f.opportunity)} opportunity`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_DELIVERY_ZONE_OPTIMIZER, linkLabel: 'View zones',
    };
  } catch { return neutralCard('Dlvy Zones', faMapLocationDot, 'text-sky-600', REPORTS_DELIVERY_ZONE_OPTIMIZER); }
}

async function fetchPriceTestSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_uplift WHERE est_monthly_uplift > 0) AS uplift
       FROM price_test_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Price Tests', faFlaskVial, 'text-violet-600', REPORTS_PRICE_AB_TESTING);
    return {
      title: 'Price Tests', icon: faFlaskVial, color: 'text-violet-600',
      primary: `${withCurrency(f.uplift)}/mo`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : 'warning', link: REPORTS_PRICE_AB_TESTING, linkLabel: 'View tests',
    };
  } catch { return neutralCard('Price Tests', faFlaskVial, 'text-violet-600', REPORTS_PRICE_AB_TESTING); }
}

async function fetchMenuEngineeringSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(quadrant = 'dog') AS dogs
       FROM menu_engineering_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Menu Matrix', faChartSimple, 'text-violet-600', REPORTS_MENU_ENGINEERING_MATRIX);
    return {
      title: 'Menu Matrix', icon: faChartSimple, color: 'text-violet-600',
      primary: `${withCurrency(f.opportunity)}/mo`,
      secondary: `${f.total} items · ${f.dogs} dogs`,
      health: f.critical > 0 ? 'critical' : (f.dogs > 0 ? 'warning' : 'good'), link: REPORTS_MENU_ENGINEERING_MATRIX, linkLabel: 'View matrix',
    };
  } catch { return neutralCard('Menu Matrix', faChartSimple, 'text-violet-600', REPORTS_MENU_ENGINEERING_MATRIX); }
}

async function fetchPromoHaloSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::sum(halo_revenue) AS halo,
              math::sum(cannibalization_revenue) AS cannibal
       FROM promo_halo_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Promo Halo', faWandMagicSparkles, 'text-amber-600', REPORTS_PROMO_HALO_EFFECT);
    const netHalo = (f.halo ?? 0) - (f.cannibal ?? 0);
    return {
      title: 'Promo Halo', icon: faWandMagicSparkles, color: 'text-amber-600',
      primary: `${withCurrency(netHalo)} net`,
      secondary: `${f.total} effects · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_PROMO_HALO_EFFECT, linkLabel: 'View halo',
    };
  } catch { return neutralCard('Promo Halo', faWandMagicSparkles, 'text-amber-600', REPORTS_PROMO_HALO_EFFECT); }
}

async function fetchKitchenSurgeSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'surge_imminent') AS surges
       FROM kitchen_surge_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Kitchen Surge', faBolt, 'text-rose-600', REPORTS_KITCHEN_DEMAND_SURGE);
    return {
      title: 'Kitchen Surge', icon: faBolt, color: 'text-rose-600',
      primary: `${f.surges} surges`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.surges > 0 ? 'warning' : 'good'), link: REPORTS_KITCHEN_DEMAND_SURGE, linkLabel: 'View surges',
    };
  } catch { return neutralCard('Kitchen Surge', faBolt, 'text-rose-600', REPORTS_KITCHEN_DEMAND_SURGE); }
}

async function fetchModificationPatternSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::sum(revenue_leak_per_order * modified_orders) AS leak
       FROM order_modification_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Mod Patterns', faPenToSquare, 'text-violet-600', REPORTS_ORDER_MODIFICATION_PATTERN);
    return {
      title: 'Mod Patterns', icon: faPenToSquare, color: 'text-violet-600',
      primary: `${withCurrency(f.leak)} leak`,
      secondary: `${f.total} patterns · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_ORDER_MODIFICATION_PATTERN, linkLabel: 'View patterns',
    };
  } catch { return neutralCard('Mod Patterns', faPenToSquare, 'text-violet-600', REPORTS_ORDER_MODIFICATION_PATTERN); }
}

async function fetchLTVMultiplierSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(multiplier WHERE multiplier != NONE) AS avgmult
       FROM customer_ltv_multiplier_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('LTV Multiplier', faRocket, 'text-emerald-600', REPORTS_CUSTOMER_LTV_MULTIPLIER);
    return {
      title: 'LTV Multiplier', icon: faRocket, color: 'text-emerald-600',
      primary: `${(f.avgmult ?? 0).toFixed(1)}x avg`,
      secondary: `${f.total} candidates · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_CUSTOMER_LTV_MULTIPLIER, linkLabel: 'View candidates',
    };
  } catch { return neutralCard('LTV Multiplier', faRocket, 'text-emerald-600', REPORTS_CUSTOMER_LTV_MULTIPLIER); }
}

async function fetchTicketComplexitySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(complexity_score WHERE complexity_score != NONE) AS avgcomp
       FROM ticket_complexity_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Ticket Complexity', faLayerGroup, 'text-amber-600', REPORTS_TICKET_COMPLEXITY);
    return {
      title: 'Ticket Complexity', icon: faLayerGroup, color: 'text-amber-600',
      primary: `${Math.round(f.avgcomp ?? 0)}/100`,
      secondary: `${f.total} tickets · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_TICKET_COMPLEXITY, linkLabel: 'View tickets',
    };
  } catch { return neutralCard('Ticket Complexity', faLayerGroup, 'text-amber-600', REPORTS_TICKET_COMPLEXITY); }
}

async function fetchStationEfficiencySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(efficiency_score WHERE efficiency_score != NONE) AS avgeff
       FROM station_efficiency_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Station Efficiency', faGaugeHigh, 'text-amber-600', REPORTS_KITCHEN_STATION_EFFICIENCY);
    return {
      title: 'Station Efficiency', icon: faGaugeHigh, color: 'text-amber-600',
      primary: `${Math.round(f.avgeff ?? 0)}/100`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_KITCHEN_STATION_EFFICIENCY, linkLabel: 'View stations',
    };
  } catch { return neutralCard('Station Efficiency', faGaugeHigh, 'text-amber-600', REPORTS_KITCHEN_STATION_EFFICIENCY); }
}

async function fetchPairingAffinitySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'invisible_pairing') AS invisible
       FROM pairing_affinity_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Pairing Affinity', faLink, 'text-violet-600', REPORTS_PAIRING_AFFINITY);
    return {
      title: 'Pairing Affinity', icon: faLink, color: 'text-violet-600',
      primary: `${f.invisible} invisible`,
      secondary: `${f.total} pairings · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.invisible > 0 ? 'warning' : 'good'), link: REPORTS_PAIRING_AFFINITY, linkLabel: 'View pairings',
    };
  } catch { return neutralCard('Pairing Affinity', faLink, 'text-violet-600', REPORTS_PAIRING_AFFINITY); }
}

async function fetchWaitExperienceSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(satisfaction_score WHERE satisfaction_score != NONE) AS avgsat,
              math::count(complaint_risk_score >= 60) AS highrisk
       FROM wait_experience_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Wait Experience', faClock, 'text-sky-600', REPORTS_WAIT_EXPERIENCE);
    return {
      title: 'Wait Experience', icon: faClock, color: 'text-sky-600',
      primary: `${Math.round(f.avgsat ?? 0)}/100`,
      secondary: `${f.total} alerts · ${f.highrisk} high-risk`,
      health: f.critical > 0 ? 'critical' : (f.highrisk > 0 ? 'warning' : 'good'), link: REPORTS_WAIT_EXPERIENCE, linkLabel: 'View waits',
    };
  } catch { return neutralCard('Wait Experience', faClock, 'text-sky-600', REPORTS_WAIT_EXPERIENCE); }
}

async function fetchServerTableSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(match_score WHERE match_score != NONE) AS avgmatch
       FROM server_table_assignment_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Server Match', faUserGear, 'text-sky-600', REPORTS_SERVER_TABLE_ASSIGNMENT);
    return {
      title: 'Server Match', icon: faUserGear, color: 'text-sky-600',
      primary: `${Math.round(f.avgmatch ?? 0)}/100`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_SERVER_TABLE_ASSIGNMENT, linkLabel: 'View matches',
    };
  } catch { return neutralCard('Server Match', faUserGear, 'text-sky-600', REPORTS_SERVER_TABLE_ASSIGNMENT); }
}

async function fetchSeasonalShiftSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'entering_peak_season') AS entering,
              math::count(rule_id = 'exiting_peak_season') AS exiting
       FROM seasonal_demand_shift_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Seasonal Shift', faLeaf, 'text-emerald-600', REPORTS_SEASONAL_DEMAND_SHIFT);
    return {
      title: 'Seasonal Shift', icon: faLeaf, color: 'text-emerald-600',
      primary: `${f.entering}↑ / ${f.exiting}↓`,
      secondary: `${f.total} items · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_SEASONAL_DEMAND_SHIFT, linkLabel: 'View shifts',
    };
  } catch { return neutralCard('Seasonal Shift', faLeaf, 'text-emerald-600', REPORTS_SEASONAL_DEMAND_SHIFT); }
}

async function fetchTurnoverVelocitySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(phase_overhead_minutes WHERE phase_overhead_minutes != NONE) AS avgoverhead
       FROM table_turnover_velocity_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Turnover Velocity', faGaugeHigh, 'text-amber-600', REPORTS_TABLE_TURNOVER_VELOCITY);
    return {
      title: 'Turnover Velocity', icon: faGaugeHigh, color: 'text-amber-600',
      primary: `${Math.round(f.avgoverhead ?? 0)} min overhead`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_TABLE_TURNOVER_VELOCITY, linkLabel: 'View phases',
    };
  } catch { return neutralCard('Turnover Velocity', faGaugeHigh, 'text-amber-600', REPORTS_TABLE_TURNOVER_VELOCITY); }
}

async function fetchProfitabilityDecaySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(margin_decay_pct WHERE margin_decay_pct != NONE) AS avgdecay,
              math::count(current_grade IN ['D', 'F']) AS atrisk
       FROM profitability_decay_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Profit Decay', faChartLine, 'text-rose-600', REPORTS_PROFITABILITY_DECAY);
    return {
      title: 'Profit Decay', icon: faChartLine, color: 'text-rose-600',
      primary: `${Math.round(f.avgdecay ?? 0)}pp avg`,
      secondary: `${f.total} items · ${f.atrisk} at risk`,
      health: f.critical > 0 ? 'critical' : (f.atrisk > 0 ? 'warning' : 'good'), link: REPORTS_PROFITABILITY_DECAY, linkLabel: 'View decay',
    };
  } catch { return neutralCard('Profit Decay', faChartLine, 'text-rose-600', REPORTS_PROFITABILITY_DECAY); }
}

async function fetchOrderFrequencySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'frequency_declining') AS declining,
              math::count(rule_id = 'dormant_customer') AS dormant
       FROM order_frequency_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Order Frequency', faWaveSquare, 'text-sky-600', REPORTS_ORDER_FREQUENCY);
    return {
      title: 'Order Frequency', icon: faWaveSquare, color: 'text-sky-600',
      primary: `${f.declining}↓ / ${f.dormant}😴`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.declining > 0 ? 'warning' : 'good'), link: REPORTS_ORDER_FREQUENCY, linkLabel: 'View frequency',
    };
  } catch { return neutralCard('Order Frequency', faWaveSquare, 'text-sky-600', REPORTS_ORDER_FREQUENCY); }
}

async function fetchPatternAnomalySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(customer_id != NONE) AS customers
       FROM order_pattern_anomaly_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Pattern Anomaly', faMagnifyingGlassChart, 'text-violet-600', REPORTS_ORDER_PATTERN_ANOMALY);
    return {
      title: 'Pattern Anomaly', icon: faMagnifyingGlassChart, color: 'text-violet-600',
      primary: `${f.customers} customers`,
      secondary: `${f.total} anomalies · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_ORDER_PATTERN_ANOMALY, linkLabel: 'View anomalies',
    };
  } catch { return neutralCard('Pattern Anomaly', faMagnifyingGlassChart, 'text-violet-600', REPORTS_ORDER_PATTERN_ANOMALY); }
}

async function fetchSkillGapSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'technique_gap') AS gaps,
              math::count(rule_id = 'top_performer') AS top
       FROM kitchen_skill_gap_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Skill Gaps', faGraduationCap, 'text-violet-600', REPORTS_KITCHEN_SKILL_GAP);
    return {
      title: 'Skill Gaps', icon: faGraduationCap, color: 'text-violet-600',
      primary: `${f.gaps} gaps`,
      secondary: `${f.top} top performers · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.gaps > 0 ? 'warning' : 'good'), link: REPORTS_KITCHEN_SKILL_GAP, linkLabel: 'View skills',
    };
  } catch { return neutralCard('Skill Gaps', faGraduationCap, 'text-violet-600', REPORTS_KITCHEN_SKILL_GAP); }
}

async function fetchCannibalizationSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'substitute_cannibalization') AS pairs
       FROM menu_cannibalization_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Cannibalization', faScissors, 'text-rose-600', REPORTS_MENU_CANNIBALIZATION);
    return {
      title: 'Cannibalization', icon: faScissors, color: 'text-rose-600',
      primary: `${f.pairs} pairs`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.pairs > 0 ? 'warning' : 'good'), link: REPORTS_MENU_CANNIBALIZATION, linkLabel: 'View pairs',
    };
  } catch { return neutralCard('Cannibalization', faScissors, 'text-rose-600', REPORTS_MENU_CANNIBALIZATION); }
}

async function fetchJourneyFrictionSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::sum(customers_affected) AS customers
       FROM journey_friction_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Journey Friction', faRoute, 'text-amber-600', REPORTS_JOURNEY_FRICTION);
    return {
      title: 'Journey Friction', icon: faRoute, color: 'text-amber-600',
      primary: `${f.customers} affected`,
      secondary: `${f.total} friction points · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_JOURNEY_FRICTION, linkLabel: 'View friction',
    };
  } catch { return neutralCard('Journey Friction', faRoute, 'text-amber-600', REPORTS_JOURNEY_FRICTION); }
}

async function fetchSubstitutionImpactSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'false_economy') AS falseconomy,
              math::count(rule_id IN ['cost_saving_positive', 'quality_neutral_saving']) AS approved
       FROM substitution_impact_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Substitution', faExchangeAlt, 'text-amber-600', REPORTS_SUBSTITUTION_IMPACT);
    return {
      title: 'Substitution', icon: faExchangeAlt, color: 'text-amber-600',
      primary: `${f.falseconomy} bad`,
      secondary: `${f.approved} approved · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.falseconomy > 0 ? 'warning' : 'good'), link: REPORTS_SUBSTITUTION_IMPACT, linkLabel: 'View impacts',
    };
  } catch { return neutralCard('Substitution', faExchangeAlt, 'text-amber-600', REPORTS_SUBSTITUTION_IMPACT); }
}

async function fetchPreferenceDriftSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id != 'stable_customer') AS drifting,
              math::mean(recommendation_accuracy_pct WHERE recommendation_accuracy_pct != NONE) AS avgacc
       FROM preference_drift_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Pref Drift', faShuffle, 'text-violet-600', REPORTS_PREFERENCE_DRIFT);
    return {
      title: 'Pref Drift', icon: faShuffle, color: 'text-violet-600',
      primary: `${Math.round(f.avgacc ?? 0)}% acc`,
      secondary: `${f.drifting} drifting · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.drifting > 0 ? 'warning' : 'good'), link: REPORTS_PREFERENCE_DRIFT, linkLabel: 'View drift',
    };
  } catch { return neutralCard('Pref Drift', faShuffle, 'text-violet-600', REPORTS_PREFERENCE_DRIFT); }
}

async function fetchShiftHandoverSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(completeness_pct WHERE completeness_pct != NONE) AS avgcomp
       FROM shift_handover_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Shift Handover', faRightLeft, 'text-sky-600', REPORTS_SHIFT_HANDOVER);
    return {
      title: 'Shift Handover', icon: faRightLeft, color: 'text-sky-600',
      primary: `${Math.round(f.avgcomp ?? 0)}% complete`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_SHIFT_HANDOVER, linkLabel: 'View handovers',
    };
  } catch { return neutralCard('Shift Handover', faRightLeft, 'text-sky-600', REPORTS_SHIFT_HANDOVER); }
}

async function fetchDescriptionImpactSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'underperforming_description') AS underperforming
       FROM menu_description_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Description', faFilePen, 'text-violet-600', REPORTS_MENU_DESCRIPTION);
    return {
      title: 'Description', icon: faFilePen, color: 'text-violet-600',
      primary: `${f.underperforming} underperform`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.underperforming > 0 ? 'warning' : 'good'), link: REPORTS_MENU_DESCRIPTION, linkLabel: 'View descriptions',
    };
  } catch { return neutralCard('Description', faFilePen, 'text-violet-600', REPORTS_MENU_DESCRIPTION); }
}

async function fetchAttributionSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'budget_misallocation') AS misaligned
       FROM cross_channel_attribution_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Attribution', faChartPie, 'text-violet-600', REPORTS_CROSS_CHANNEL_ATTRIBUTION);
    return {
      title: 'Attribution', icon: faChartPie, color: 'text-violet-600',
      primary: `${f.misaligned} misaligned`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.misaligned > 0 ? 'warning' : 'good'), link: REPORTS_CROSS_CHANNEL_ATTRIBUTION, linkLabel: 'View attribution',
    };
  } catch { return neutralCard('Attribution', faChartPie, 'text-violet-600', REPORTS_CROSS_CHANNEL_ATTRIBUTION); }
}

async function fetchEnergyMonitorSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(current_energy_score WHERE current_energy_score != NONE) AS avgenergy,
              math::count(current_energy_score < 50) AS fatigued
       FROM staff_energy_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Staff Energy', faBatteryThreeQuarters, 'text-amber-600', REPORTS_STAFF_ENERGY);
    return {
      title: 'Staff Energy', icon: faBatteryThreeQuarters, color: 'text-amber-600',
      primary: `${Math.round(f.avgenergy ?? 0)}/100`,
      secondary: `${f.fatigued} fatigued · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.fatigued > 0 ? 'warning' : 'good'), link: REPORTS_STAFF_ENERGY, linkLabel: 'View energy',
    };
  } catch { return neutralCard('Staff Energy', faBatteryThreeQuarters, 'text-amber-600', REPORTS_STAFF_ENERGY); }
}

async function fetchPhotoImpactSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(photo_status = 'none') AS nophoto
       FROM menu_photography_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Photo Impact', faCamera, 'text-violet-600', REPORTS_MENU_PHOTOGRAPHY);
    return {
      title: 'Photo Impact', icon: faCamera, color: 'text-violet-600',
      primary: `${f.nophoto} no photo`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.nophoto > 0 ? 'warning' : 'good'), link: REPORTS_MENU_PHOTOGRAPHY, linkLabel: 'View photos',
    };
  } catch { return neutralCard('Photo Impact', faCamera, 'text-violet-600', REPORTS_MENU_PHOTOGRAPHY); }
}

async function fetchTablePreferenceSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'strong_preference_detected') AS strong,
              math::count(rule_id = 'preference_unmet') AS unmet
       FROM table_preference_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Table Pref', faChair, 'text-sky-600', REPORTS_TABLE_PREFERENCE);
    return {
      title: 'Table Pref', icon: faChair, color: 'text-sky-600',
      primary: `${f.strong} strong`,
      secondary: `${f.unmet} unmet · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.unmet > 0 ? 'warning' : 'good'), link: REPORTS_TABLE_PREFERENCE, linkLabel: 'View preferences',
    };
  } catch { return neutralCard('Table Pref', faChair, 'text-sky-600', REPORTS_TABLE_PREFERENCE); }
}

async function fetchElasticityDriftSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(elasticity_trend = 'more_elastic') AS moreelastic,
              math::count(elasticity_trend = 'less_elastic') AS lesselastic
       FROM price_elasticity_drift_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Elasticity Drift', faWaveSquare, 'text-amber-600', REPORTS_ELASTICITY_DRIFT);
    return {
      title: 'Elasticity Drift', icon: faWaveSquare, color: 'text-amber-600',
      primary: `${f.moreelastic}↑ / ${f.lesselastic}↓`,
      secondary: `${f.total} items · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.moreelastic > 0 ? 'warning' : 'good'), link: REPORTS_ELASTICITY_DRIFT, linkLabel: 'View drift',
    };
  } catch { return neutralCard('Elasticity Drift', faWaveSquare, 'text-amber-600', REPORTS_ELASTICITY_DRIFT); }
}

async function fetchOccasionSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(confidence_pct >= 70) AS highconf
       FROM occasion_prediction_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Occasion', faCalendarDay, 'text-sky-600', REPORTS_OCCASION_PREDICTION);
    return {
      title: 'Occasion', icon: faCalendarDay, color: 'text-sky-600',
      primary: `${f.highconf} predicted`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.total > 0 ? 'warning' : 'good'), link: REPORTS_OCCASION_PREDICTION, linkLabel: 'View occasions',
    };
  } catch { return neutralCard('Occasion', faCalendarDay, 'text-sky-600', REPORTS_OCCASION_PREDICTION); }
}

async function fetchRetirementSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'zombie_item') AS zombies
       FROM menu_item_retirement_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Retirement', faTrashCan, 'text-rose-600', REPORTS_MENU_ITEM_RETIREMENT);
    return {
      title: 'Retirement', icon: faTrashCan, color: 'text-rose-600',
      primary: `${f.zombies} zombies`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.zombies > 0 ? 'warning' : 'good'), link: REPORTS_MENU_ITEM_RETIREMENT, linkLabel: 'View retirement',
    };
  } catch { return neutralCard('Retirement', faTrashCan, 'text-rose-600', REPORTS_MENU_ITEM_RETIREMENT); }
}

async function fetchPerfPredictionSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(performance_trend = 'declining') AS declining,
              math::count(performance_trend = 'improving') AS improving
       FROM staff_performance_prediction_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Perf Prediction', faChartLine, 'text-amber-600', REPORTS_STAFF_PERFORMANCE_PREDICTION);
    return {
      title: 'Perf Prediction', icon: faChartLine, color: 'text-amber-600',
      primary: `${f.declining}↓ / ${f.improving}↑`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.declining > 0 ? 'warning' : 'good'), link: REPORTS_STAFF_PERFORMANCE_PREDICTION, linkLabel: 'View predictions',
    };
  } catch { return neutralCard('Perf Prediction', faChartLine, 'text-amber-600', REPORTS_STAFF_PERFORMANCE_PREDICTION); }
}

async function fetchAtmosphereSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id LIKE '%mismatch%') AS mismatch
       FROM atmosphere_revenue_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Atmosphere', faLightbulb, 'text-amber-600', REPORTS_ATMOSPHERE_REVENUE);
    return {
      title: 'Atmosphere', icon: faLightbulb, color: 'text-amber-600',
      primary: `${f.mismatch} mismatches`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.mismatch > 0 ? 'warning' : 'good'), link: REPORTS_ATMOSPHERE_REVENUE, linkLabel: 'View atmosphere',
    };
  } catch { return neutralCard('Atmosphere', faLightbulb, 'text-amber-600', REPORTS_ATMOSPHERE_REVENUE); }
}

async function fetchBriefingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'vip_reservation_today') AS vip,
              math::count(rule_id = 'predicted_peak_hour') AS peak
       FROM shift_briefing_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Pre-Shift Briefing', faClipboardList, 'text-amber-600', REPORTS_PRE_SHIFT_BRIEFING);
    return {
      title: 'Pre-Shift Briefing', icon: faClipboardList, color: 'text-amber-600',
      primary: `${f.vip} VIP · ${f.peak} peaks`,
      secondary: `${f.total} briefing items · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.peak > 0 ? 'warning' : 'good'), link: REPORTS_PRE_SHIFT_BRIEFING, linkLabel: 'View briefing',
    };
  } catch { return neutralCard('Pre-Shift Briefing', faClipboardList, 'text-amber-600', REPORTS_PRE_SHIFT_BRIEFING); }
}

async function fetchCostVolatilitySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'margin_threshold_breach_forecast') AS breach,
              math::mean(confidence_score WHERE confidence_score != NONE) AS avgconf
       FROM recipe_cost_volatility_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Cost Volatility', faChartLine, 'text-violet-600', REPORTS_RECIPE_COST_VOLATILITY);
    return {
      title: 'Cost Volatility', icon: faChartLine, color: 'text-violet-600',
      primary: `${f.breach} margin breaches`,
      secondary: `${f.total} forecasts · ${f.critical} critical · ${Math.round(f.avgconf || 0)}% conf`,
      health: f.critical > 0 ? 'critical' : (f.breach > 0 ? 'warning' : 'good'), link: REPORTS_RECIPE_COST_VOLATILITY, linkLabel: 'View forecasts',
    };
  } catch { return neutralCard('Cost Volatility', faChartLine, 'text-violet-600', REPORTS_RECIPE_COST_VOLATILITY); }
}

async function fetchPlateWasteSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(dish_name != NONE) AS dishes,
              math::mean(waste_pct WHERE waste_pct != NONE) AS avgwaste
       FROM plate_waste_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Plate Waste', faUtensils, 'text-orange-600', REPORTS_PLATE_WASTE_PREDICTOR);
    return {
      title: 'Plate Waste', icon: faUtensils, color: 'text-orange-600',
      primary: `${f.dishes} dishes · ${Math.round(f.avgwaste || 0)}% avg waste`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : (f.avgwaste >= 30 ? 'warning' : 'good'), link: REPORTS_PLATE_WASTE_PREDICTOR, linkLabel: 'View waste',
    };
  } catch { return neutralCard('Plate Waste', faUtensils, 'text-orange-600', REPORTS_PLATE_WASTE_PREDICTOR); }
}

async function fetchTierMigrationSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id LIKE '%upgrade%' OR rule_id = 'high_value_tier_upgrade' OR rule_id = 'peer_tier_mismatch') AS upgrades,
              math::count(rule_id = 'downgrade_imminent') AS downgrades
       FROM loyalty_tier_migration_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Tier Migration', faCrown, 'text-violet-600', REPORTS_LOYALTY_TIER_MIGRATION);
    return {
      title: 'Tier Migration', icon: faCrown, color: 'text-violet-600',
      primary: `${f.upgrades} upgrades · ${f.downgrades} downgrades`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.downgrades > 0 ? 'critical' : (f.upgrades > 0 ? 'good' : 'neutral'), link: REPORTS_LOYALTY_TIER_MIGRATION, linkLabel: 'View migrations',
    };
  } catch { return neutralCard('Tier Migration', faCrown, 'text-violet-600', REPORTS_LOYALTY_TIER_MIGRATION); }
}

async function fetchFirstVisitSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'high_conversion_probability') AS highconv,
              math::count(rule_id = 'at_risk_first_visit') AS atrisk,
              math::mean(conversion_probability_pct WHERE conversion_probability_pct != NONE) AS avgconv
       FROM first_visit_conversion_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('First-Visit Conv', faUserPlus, 'text-emerald-600', REPORTS_FIRST_VISIT_CONVERSION);
    return {
      title: 'First-Visit Conv', icon: faUserPlus, color: 'text-emerald-600',
      primary: `${f.highconv} high · ${f.atrisk} at-risk`,
      secondary: `${f.total} visits · avg ${Math.round(f.avgconv || 0)}% conv`,
      health: f.atrisk > 0 ? 'critical' : (f.highconv > 0 ? 'good' : 'neutral'), link: REPORTS_FIRST_VISIT_CONVERSION, linkLabel: 'View visits',
    };
  } catch { return neutralCard('First-Visit Conv', faUserPlus, 'text-emerald-600', REPORTS_FIRST_VISIT_CONVERSION); }
}

async function fetchDeliveryDecaySummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(dish_name != NONE) AS dishes,
              math::mean(quality_score_predicted WHERE quality_score_predicted != NONE) AS avgquality
       FROM delivery_quality_decay_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Delivery Quality', faTruckFast, 'text-rose-600', REPORTS_DELIVERY_QUALITY_DECAY);
    return {
      title: 'Delivery Quality', icon: faTruckFast, color: 'text-rose-600',
      primary: `${f.dishes} dishes at risk`,
      secondary: `${f.total} alerts · ${Math.round(f.avgquality || 0)}/100 avg quality`,
      health: f.critical > 0 ? 'critical' : ((f.avgquality || 100) < 60 ? 'warning' : 'good'), link: REPORTS_DELIVERY_QUALITY_DECAY, linkLabel: 'View decay',
    };
  } catch { return neutralCard('Delivery Quality', faTruckFast, 'text-rose-600', REPORTS_DELIVERY_QUALITY_DECAY); }
}

async function fetchBarPourVarianceSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'high_variance_bottle') AS bottles,
              math::mean(variance_pct WHERE variance_pct != NONE) AS avgvar
       FROM bar_pour_variance_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Bar Pour Variance', faWineGlass, 'text-fuchsia-600', REPORTS_BAR_POUR_VARIANCE);
    return {
      title: 'Bar Pour Variance', icon: faWineGlass, color: 'text-fuchsia-600',
      primary: `${f.bottles} bottles · ${Math.round(f.avgvar || 0)}% avg variance`,
      secondary: `${f.total} alerts · ${f.critical} critical`,
      health: f.critical > 0 ? 'critical' : ((f.avgvar || 0) >= 15 ? 'warning' : 'good'), link: REPORTS_BAR_POUR_VARIANCE, linkLabel: 'View variance',
    };
  } catch { return neutralCard('Bar Pour Variance', faWineGlass, 'text-fuchsia-600', REPORTS_BAR_POUR_VARIANCE); }
}

async function fetchRestroomCleanlinessSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(restroom_zone != NONE) AS zones,
              math::mean(avg_check_interval_minutes WHERE avg_check_interval_minutes != NONE) AS avginterval,
              math::sum(complaints_last_7d WHERE complaints_last_7d != NONE) AS complaints7d
       FROM restroom_cleanliness_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Restroom', faBroom, 'text-sky-600', REPORTS_RESTROOM_CLEANLINESS);
    return {
      title: 'Restroom', icon: faBroom, color: 'text-sky-600',
      primary: `${f.zones} zones · ${Math.round(f.avginterval || 0)}min avg`,
      secondary: `${f.total} alerts · ${f.complaints7d} complaints/7d`,
      health: f.complaints7d >= 5 ? 'critical' : ((f.avginterval || 0) >= 150 ? 'warning' : 'good'), link: REPORTS_RESTROOM_CLEANLINESS, linkLabel: 'View restroom',
    };
  } catch { return neutralCard('Restroom', faBroom, 'text-sky-600', REPORTS_RESTROOM_CLEANLINESS); }
}

async function fetchWifiExperienceSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone != NONE) AS zones,
              math::mean(avg_download_mbps WHERE avg_download_mbps != NONE) AS avgdown,
              math::sum(negative_review_mentions WHERE negative_review_mentions != NONE) AS reviews
       FROM wifi_experience_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('WiFi Experience', faWifi, 'text-sky-600', REPORTS_WIFI_EXPERIENCE);
    return {
      title: 'WiFi Experience', icon: faWifi, color: 'text-sky-600',
      primary: `${f.zones} zones · ${Math.round(f.avgdown || 0)} Mbps avg`,
      secondary: `${f.total} alerts · ${f.reviews} WiFi reviews`,
      health: f.critical > 0 ? 'critical' : ((f.avgdown || 100) < 10 ? 'warning' : 'good'), link: REPORTS_WIFI_EXPERIENCE, linkLabel: 'View WiFi',
    };
  } catch { return neutralCard('WiFi Experience', faWifi, 'text-sky-600', REPORTS_WIFI_EXPERIENCE); }
}

async function fetchParkingLotSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(lot_zone != NONE) AS lots,
              math::mean(occupancy_pct WHERE occupancy_pct != NONE) AS avgocc,
              math::sum(predicted_walk_aways WHERE predicted_walk_aways != NONE) AS walkaways
       FROM parking_lot_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Parking Lot', faCarSide, 'text-amber-600', REPORTS_PARKING_LOT_OPTIMIZER);
    return {
      title: 'Parking Lot', icon: faCarSide, color: 'text-amber-600',
      primary: `${f.lots} lots · ${Math.round(f.avgocc || 0)}% avg`,
      secondary: `${f.total} alerts · ${f.walkaways} walk-aways`,
      health: f.critical > 0 ? 'critical' : ((f.avgocc || 0) >= 90 ? 'warning' : 'good'), link: REPORTS_PARKING_LOT_OPTIMIZER, linkLabel: 'View parking',
    };
  } catch { return neutralCard('Parking Lot', faCarSide, 'text-amber-600', REPORTS_PARKING_LOT_OPTIMIZER); }
}

async function fetchNoiseAcousticSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone != NONE) AS zones,
              math::mean(avg_noise_db WHERE avg_noise_db != NONE) AS avgnoise,
              math::sum(hearing_impaired_visits_monthly WHERE hearing_impaired_visits_monthly != NONE) AS hearingvisits
       FROM noise_acoustic_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Noise Acoustic', faVolumeHigh, 'text-rose-600', REPORTS_NOISE_ACOUSTIC_COMFORT);
    return {
      title: 'Noise Acoustic', icon: faVolumeHigh, color: 'text-rose-600',
      primary: `${f.zones} zones · ${Math.round(f.avgnoise || 0)} dB avg`,
      secondary: `${f.total} alerts · ${f.hearingvisits} hearing-impaired visits`,
      health: f.critical > 0 ? 'critical' : ((f.avgnoise || 0) >= 75 ? 'warning' : 'good'), link: REPORTS_NOISE_ACOUSTIC_COMFORT, linkLabel: 'View noise',
    };
  } catch { return neutralCard('Noise Acoustic', faVolumeHigh, 'text-rose-600', REPORTS_NOISE_ACOUSTIC_COMFORT); }
}

async function fetchLightingMoodSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone != NONE) AS zones,
              math::mean(current_lux WHERE current_lux != NONE) AS avglux,
              math::sum(led_annual_savings WHERE led_annual_savings != NONE) AS ledsavings
       FROM lighting_mood_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Lighting Mood', faLightbulb, 'text-amber-600', REPORTS_LIGHTING_MOOD_OPTIMIZER);
    return {
      title: 'Lighting Mood', icon: faLightbulb, color: 'text-amber-600',
      primary: `${f.zones} zones · ${Math.round(f.avglux || 0)} lux avg`,
      secondary: `${f.total} alerts · ${fmt$(f.ledsavings || 0)}/yr LED savings`,
      health: f.critical > 0 ? 'critical' : ((f.total || 0) > 3 ? 'warning' : 'good'), link: REPORTS_LIGHTING_MOOD_OPTIMIZER, linkLabel: 'View lighting',
    };
  } catch { return neutralCard('Lighting Mood', faLightbulb, 'text-amber-600', REPORTS_LIGHTING_MOOD_OPTIMIZER); }
}

async function fetchTemperatureHvacSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone != NONE) AS zones,
              math::mean(temp_deviation_c WHERE temp_deviation_c != NONE) AS avgdev,
              math::mean(current_humidity_pct WHERE current_humidity_pct != NONE) AS avghum
       FROM temperature_hvac_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Temperature', faTemperatureHalf, 'text-orange-600', REPORTS_TEMPERATURE_HVAC_COMFORT);
    return {
      title: 'Temperature', icon: faTemperatureHalf, color: 'text-orange-600',
      primary: `${f.zones} zones · ${Math.round(f.avgdev || 0)}°C avg dev`,
      secondary: `${f.total} alerts · ${Math.round(f.avghum || 0)}% humidity`,
      health: f.critical > 0 ? 'critical' : ((f.avgdev || 0) >= 3 ? 'warning' : 'good'), link: REPORTS_TEMPERATURE_HVAC_COMFORT, linkLabel: 'View temperature',
    };
  } catch { return neutralCard('Temperature', faTemperatureHalf, 'text-orange-600', REPORTS_TEMPERATURE_HVAC_COMFORT); }
}

async function fetchScentMarketingSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(zone != NONE) AS zones,
              math::mean(customer_notice_rate_pct WHERE customer_notice_rate_pct != NONE) AS avgnotice,
              math::mean(negative_reaction_rate_pct WHERE negative_reaction_rate_pct != NONE) AS avgneg
       FROM scent_marketing_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Scent Marketing', faSprayCanSparkles, 'text-fuchsia-600', REPORTS_SCENT_MARKETING_OPTIMIZER);
    return {
      title: 'Scent Marketing', icon: faSprayCanSparkles, color: 'text-fuchsia-600',
      primary: `${f.zones} zones · ${Math.round(f.avgnotice || 0)}% notice`,
      secondary: `${f.total} alerts · ${Math.round(f.avgneg || 0)}% negative`,
      health: (f.avgneg || 0) >= 5 ? 'warning' : 'good', link: REPORTS_SCENT_MARKETING_OPTIMIZER, linkLabel: 'View scent',
    };
  } catch { return neutralCard('Scent Marketing', faSprayCanSparkles, 'text-fuchsia-600', REPORTS_SCENT_MARKETING_OPTIMIZER); }
}

async function fetchEntranceArrivalSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::mean(avg_greeting_time_sec WHERE avg_greeting_time_sec != NONE) AS avggreet,
              math::sum(walk_away_count_30d WHERE walk_away_count_30d != NONE) AS walkaways,
              math::mean(vip_recognition_rate_pct WHERE vip_recognition_rate_pct != NONE) AS avgvip
       FROM entrance_arrival_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Entrance', faDoorOpen, 'text-sky-600', REPORTS_ENTRANCE_ARRIVAL_OPTIMIZER);
    return {
      title: 'Entrance', icon: faDoorOpen, color: 'text-sky-600',
      primary: `${Math.round(f.avggreet || 0)}s greeting · ${f.walkaways} walk-aways`,
      secondary: `${f.total} alerts · ${Math.round(f.avgvip || 0)}% VIP recog`,
      health: f.critical > 0 ? 'critical' : ((f.avggreet || 0) >= 30 ? 'warning' : 'good'), link: REPORTS_ENTRANCE_ARRIVAL_OPTIMIZER, linkLabel: 'View entrance',
    };
  } catch { return neutralCard('Entrance', faDoorOpen, 'text-sky-600', REPORTS_ENTRANCE_ARRIVAL_OPTIMIZER); }
}

async function fetchMenuLayoutSummary(db: any): Promise<MetricCard> {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'star_item_not_in_sweet_spot' OR rule_id = 'high_margin_item_buried') AS tomove,
              math::count(rule_id = 'menu_too_long') AS toolong,
              math::mean(items_in_category WHERE items_in_category != NONE) AS avgitems
       FROM menu_layout_alert WHERE status = 'open' GROUP ALL`
    );
    const list = Array.isArray(result) ? result.flat() : [];
    const f = list[0];
    if (!f || f.count === 0) return neutralCard('Menu Layout', faListOl, 'text-violet-600', REPORTS_MENU_LAYOUT_PLACEMENT);
    return {
      title: 'Menu Layout', icon: faListOl, color: 'text-violet-600',
      primary: `${f.tomove} items to move · ${f.toolong} too long`,
      secondary: `${f.total} alerts · ${Math.round(f.avgitems || 0)} items/category`,
      health: f.critical > 0 ? 'critical' : ((f.toolong || 0) > 0 ? 'warning' : 'good'), link: REPORTS_MENU_LAYOUT_PLACEMENT, linkLabel: 'View layout',
    };
  } catch { return neutralCard('Menu Layout', faListOl, 'text-violet-600', REPORTS_MENU_LAYOUT_PLACEMENT); }
}

function neutralCard(title: string, icon: any, color: string, link: string): MetricCard {
  return {
    title, icon, color,
    primary: '—',
    secondary: 'No data yet',
    health: 'neutral',
    link,
    linkLabel: 'Open',
  };
}

// ---------------------------------------------------------------------------
// AI Executive Summary — synthesizes all 12 metrics
// ---------------------------------------------------------------------------

async function generateExecutiveSummary(_db: any, metrics: MetricCard[]): Promise<ExecutiveSummary> {
  const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
  if (!callOpenAIChat) {
    // Fallback: rule-based summary
    return ruleBasedSummary(metrics);
  }

  const prompt = `You are a restaurant operations executive advisor.
Synthesize these 12 AI feature metrics into a brief + top 3 priorities.

Metrics (JSON):
${JSON.stringify(metrics.map(m => ({
  feature: m.title,
  primary: m.primary,
  secondary: m.secondary,
  health: m.health,
})), null, 2)}

Respond with JSON:
{
  "brief": "<max 500 chars — 3-sentence overview of overall health + what's working + what needs action>",
  "priorities": ["<max 150 chars each — top 3 actionable priorities ranked by impact>]
}

Focus on cross-feature patterns + revenue-impacting actions.`;

  try {
    const response = await callOpenAIChat([
      { role: 'system', content: 'You are a restaurant operations executive advisor AI. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { temperature: 0.3, maxTokens: 800 });

    const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return ruleBasedSummary(metrics);
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      brief: parsed.brief ?? 'Unable to generate summary.',
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities.slice(0, 3) : [],
    };
  } catch (err) {
    console.warn('[ai-command] AI summary failed — using rule-based', err);
    return ruleBasedSummary(metrics);
  }
}

function ruleBasedSummary(metrics: MetricCard[]): ExecutiveSummary {
  const critical = metrics.filter(m => m.health === 'critical');
  const warning = metrics.filter(m => m.health === 'warning');
  const good = metrics.filter(m => m.health === 'good');

  let brief = `${good.length} of ${metrics.length} areas are healthy`;
  if (critical.length > 0) {
    brief += `, ${critical.length} critical (${critical.map(c => c.title).join(', ')}). Immediate action needed.`;
  } else if (warning.length > 0) {
    brief += `, ${warning.length} need attention (${warning.map(w => w.title).join(', ')}).`;
  } else {
    brief += `. All systems operating within normal parameters.`;
  }

  const priorities: string[] = [];
  // Critical first
  for (const c of critical.slice(0, 2)) {
    priorities.push(`Address ${c.title}: ${c.primary} — ${c.secondary ?? 'action needed'}`);
  }
  // Then warnings
  for (const w of warning.slice(0, 3 - priorities.length)) {
    priorities.push(`Review ${w.title}: ${w.primary} — ${w.secondary ?? 'monitor closely'}`);
  }
  // Fill remaining with highest-value items
  while (priorities.length < 3) {
    const remaining = metrics.filter(m => !critical.includes(m) && !warning.includes(m));
    if (remaining.length === 0) break;
    const r = remaining[0];
    priorities.push(`Continue monitoring ${r.title}: ${r.primary}`);
  }

  return { brief, priorities: priorities.slice(0, 3) };
}

export default AiCommandCenterScreen;
