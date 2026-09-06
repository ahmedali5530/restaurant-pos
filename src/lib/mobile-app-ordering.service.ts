/**
 * AI Mobile App & Ordering Experience Optimizer — predicts how mobile app and
 * mobile ordering experience (app availability, order-ahead, mobile payment,
 * loyalty integration, push notifications, personalization, order customization,
 * pickup vs delivery, app store ratings, feature adoption) impacts customer
 * acquisition, retention, average ticket, and operational efficiency.
 *
 * Mobile ordering increases average ticket 20-25% (customers browse longer,
 * add more items, no social pressure). Order-ahead reduces perceived wait time
 * by 50-60% (customer arrives, order ready). 72% of customers aged 18-44 prefer
 * mobile ordering over in-person (NRA). Mobile payment reduces transaction time
 * from 90s to 15s — 83% faster checkout. Push notifications drive 15-20% of
 * dormant customers back within 30 days. Apps with loyalty integration see 35%
 * higher retention than apps without. Personalized recommendations (based on
 * order history) increase upsell 25-30%. 40% of mobile orders come from top
 * 10% of app users — power users drive revenue.
 *
 * 182nd POSR-exclusive differentiator. Restaurants without a mobile app or
 * mobile ordering lose 20-25% ticket increase (mobile_app_absent = missed
 * 20-25% ticket increase; order_ahead_missing = missed 50-60% wait reduction;
 * mobile_payment_absent = 83% slower checkout; loyalty_integration_missing =
 * 35% lower retention; push_notifications_absent = missed 15-20% dormant
 * reactivation; personalization_missing = missed 25-30% upsell; app_rating_low
 * = poor perception + lower downloads; pickup_experience_poor = abandoned
 * future orders).
 *
 * Distinct from:
 *   - digital-menu-qr — QR code menu on personal phones (read-only menu, no ordering)
 *   - online-ordering — web-based ordering (browser, not native app)
 *   - self-service-kiosk-terminal — in-venue kiosk hardware (not customer mobile)
 *   - loyalty-program — loyalty mechanics (not app-side experience)
 *
 * 8 AI rules:
 *   1. mobile_app_absent -> no mobile app or web ordering -> missed 20-25% ticket increase
 *   2. order_ahead_missing -> no order-ahead/pickup -> missed 50-60% wait reduction
 *   3. mobile_payment_absent -> no mobile pay integration -> 83% slower checkout
 *   4. loyalty_integration_missing -> app not connected to loyalty -> 35% lower retention
 *   5. push_notifications_absent -> no push notifications -> missed 15-20% dormant reactivation
 *   6. personalization_missing -> no order-history recommendations -> missed 25-30% upsell
 *   7. app_rating_low -> app store rating below 4.0 -> poor perception + lower downloads
 *   8. pickup_experience_poor -> pickup process confusing (no designated area, unclear status) -> abandoned future orders
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type MobileAppOrderingRuleId =
  | 'mobile_app_absent'
  | 'order_ahead_missing'
  | 'mobile_payment_absent'
  | 'loyalty_integration_missing'
  | 'push_notifications_absent'
  | 'personalization_missing'
  | 'app_rating_low'
  | 'pickup_experience_poor';

export type MobileAppOrderingAiRec =
  | 'launch_mobile_app'
  | 'enable_order_ahead'
  | 'integrate_mobile_payment'
  | 'connect_loyalty_to_app'
  | 'enable_push_notifications'
  | 'add_personalization_engine'
  | 'improve_app_rating'
  | 'redesign_pickup_experience'
  | 'monitor'
  | 'skip';

export interface MobileAppOrderingAlert {
  id?: string;
  rule_id: MobileAppOrderingRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                                    // 'overall' | 'counter' | 'drivethru' | 'curbside'
  restaurant_tier?: string;                                // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  market_setting?: string;                                 // 'urban' | 'suburban' | 'rural'
  // App availability
  has_mobile_app?: boolean;                                // restaurant has a native mobile app (iOS + Android)
  has_web_ordering?: boolean;                              // restaurant has mobile-optimized web ordering
  app_platforms?: string[];                                // ['ios','android','web']
  app_platforms_count?: number;                            // number of platforms supported
  app_vendor?: string;                                     // app builder vendor (e.g. 'Olo', 'Toast', 'ChowNow', 'BentoBox', 'custom')
  app_age_months?: number;                                 // months since app launch
  app_last_update_months?: number;                         // months since last app update
  // App store rating + reviews
  app_store_rating?: number;                               // app store rating 0-5 stars (target 4.5+)
  app_store_reviews_count?: number;                        // total app store reviews
  app_store_rating_trend?: string;                         // 'up' | 'flat' | 'down'
  // Order-ahead + pickup
  has_order_ahead?: boolean;                               // app supports order-ahead / pickup scheduling
  order_ahead_avg_lead_time_min?: number;                  // avg minutes customers order ahead before pickup
  has_pickup_window?: boolean;                             // customers select a pickup time window
  has_curbside_pickup?: boolean;                           // app supports curbside pickup (car delivery)
  has_delivery_via_app?: boolean;                          // app supports delivery (own fleet or 3P)
  pickup_method_count?: number;                            // number of pickup methods (counter, curbside, delivery, drive-thru)
  // Mobile payment
  has_mobile_payment?: boolean;                            // in-app payment (no cash handover)
  mobile_payment_methods_count?: number;                   // number of payment methods in-app
  accepts_apple_pay?: boolean;                            // in-app Apple Pay
  accepts_google_pay?: boolean;                           // in-app Google Pay
  accepts_stored_credit?: boolean;                        // stored credit card token
  accepts_gift_card_balance?: boolean;                    // app-stored gift card balance
  accepts_loyalty_redemption?: boolean;                   // redeem loyalty points in-app
  // Loyalty integration
  has_loyalty_integration?: boolean;                       // app connected to loyalty program
  loyalty_members_in_app?: number;                         // # of loyalty members who use the app
  loyalty_share_of_app_users_pct?: number;                // % of app users who are loyalty members
  // Push notifications
  has_push_notifications?: boolean;                        // app supports push notifications
  push_notifications_active_count?: number;                // # of distinct push notification campaigns active
  push_opt_in_rate_pct?: number;                          // % of app users who opted into push (50-70% benchmark)
  push_ctr_pct?: number;                                   // push click-through rate % (5-15% benchmark)
  dormant_reactivation_pct?: number;                       // % of dormant customers reactivated by push within 30 days (15-20% benchmark)
  // Personalization
  has_personalization?: boolean;                           // app uses order history to recommend items
  personalization_signals_count?: number;                  // # of personalization signals used (history, time-of-day, weather, location)
  recommendation_upsell_acceptance_pct?: number;           // % of personalized recommendations accepted (25-30% benchmark)
  personalization_avg_ticket_lift_pct?: number;            // % ticket lift from personalization (20-30% benchmark)
  // Order customization
  has_order_customization?: boolean;                       // app supports item customization (no onions, extra sauce)
  customization_options_count?: number;                    // # of distinct customization fields
  has_dietary_filters?: boolean;                           // app filters menu by diet (vegan, gluten-free, allergy)
  has_saved_favorites?: boolean;                           // customers save favorite orders for 1-tap reorder
  // Pickup experience
  has_pickup_status_notifications?: boolean;               // app notifies customer of order status (received, preparing, ready)
  has_designated_pickup_area?: boolean;                   // restaurant has a designated mobile-order pickup area
  pickup_status_clarity_score?: number;                    // 0-100 clarity score (90+ clear, <60 confusing)
  pickup_avg_wait_min?: number;                            // avg minutes customer waits at pickup after arrival (target <3 min)
  pickup_abandonment_pct?: number;                         // % of pickup orders abandoned (no-show or cancel) (target <5%)
  has_qr_pickup_checkin?: boolean;                         // app QR code check-in at pickup (scan to confirm arrival)
  // Power users (top 10%)
  app_users_count?: number;                                // total app users
  power_user_top10pct?: number;                            // top 10% of app users by order count
  power_user_revenue_share_pct?: number;                   // % of app revenue from top 10% (40% benchmark)
  power_user_orders_monthly?: number;                     // orders/month from power users
  app_dormant_30d?: number;                                // app users who have not ordered in 30 days
  // Performance metrics
  monthly_mobile_revenue?: number;                         // monthly revenue processed through app
  mobile_revenue_pct?: number;                             // % of total revenue via mobile app
  avg_mobile_ticket?: number;                              // avg mobile order ticket size
  avg_cashier_ticket?: number;                             // avg cashier ticket size (comparison baseline)
  mobile_ticket_lift_pct?: number;                         // % mobile ticket lift vs cashier (20-25% benchmark)
  mobile_checkout_time_sec?: number;                       // avg checkout time in-app (15s benchmark w/ mobile pay)
  cashier_checkout_time_sec?: number;                      // avg cashier checkout time (90s baseline)
  checkout_speedup_pct?: number;                           // % checkout speedup mobile vs cashier (83% benchmark)
  perceived_wait_reduction_pct?: number;                   // % perceived wait reduction from order-ahead (50-60% benchmark)
  // Customer demographics
  pct_18_44_customers?: number;                            // % of customers aged 18-44 (72% prefer mobile ordering per NRA)
  customer_satisfaction_mobile?: number;                   // satisfaction score for mobile (1-100)
  customer_satisfaction_cashier?: number;                  // satisfaction score for cashier (1-100)
  // Economics
  monthly_revenue?: number;                                // total restaurant monthly revenue
  app_dev_cost?: number;                                   // one-time app development cost ($25k-150k custom; $5k-25k platform)
  app_monthly_cost?: number;                               // monthly app platform + hosting cost
  app_payment_processing_pct?: number;                     // payment processing fee % on mobile orders
  push_platform_monthly?: number;                          // monthly push notification platform cost (OneSignal, Braze, etc.)
  // Impact projections
  ticket_lift_projected_pct?: number;                      // projected ticket lift % from fix
  retention_lift_projected_pct?: number;                   // projected retention lift %
  dormant_reactivation_projected?: number;                 // projected # of dormant customers reactivated
  checkout_speedup_projected_pct?: number;                 // projected checkout speedup %
  predicted_revenue_change_pct?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: MobileAppOrderingAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface MobileAppOrderingConfig {
  aiEnabled: boolean;
  requireMobileApp: boolean;                               // require restaurant to have a mobile app
  requireOrderAhead: boolean;                              // require order-ahead / pickup scheduling
  requireMobilePayment: boolean;                           // require in-app mobile payment
  requireLoyaltyIntegration: boolean;                      // require loyalty program connected to app
  requirePushNotifications: boolean;                       // require push notifications
  requirePersonalization: boolean;                          // require order-history personalization
  requireAppRating: boolean;                               // require app store rating 4.0+
  requirePickupExperience: boolean;                         // require clear pickup experience
  minAppStoreRating: number;                               // minimum app store rating (4.0)
  minMobilePaymentMethods: number;                         // minimum in-app payment methods (3)
  minPushOptInPct: number;                                 // minimum push opt-in % (50)
  minPersonalizationAcceptancePct: number;                 // minimum personalization acceptance % (25)
  minPickupStatusClarity: number;                           // minimum pickup status clarity score (90)
  minMobileTicketLiftPct: number;                           // minimum mobile ticket lift % (20)
  minCheckoutSpeedupPct: number;                            // minimum checkout speedup % (50)
  minPerceivedWaitReductionPct: number;                    // minimum perceived wait reduction % (50)
}

export const DEFAULT_MOBILE_APP_ORDERING_CONFIG: MobileAppOrderingConfig = {
  aiEnabled: true,
  requireMobileApp: true,
  requireOrderAhead: true,
  requireMobilePayment: true,
  requireLoyaltyIntegration: true,
  requirePushNotifications: true,
  requirePersonalization: true,
  requireAppRating: true,
  requirePickupExperience: true,
  minAppStoreRating: 4.0,
  minMobilePaymentMethods: 3,
  minPushOptInPct: 50,
  minPersonalizationAcceptancePct: 25,
  minPickupStatusClarity: 90,
  minMobileTicketLiftPct: 20,
  minCheckoutSpeedupPct: 50,
  minPerceivedWaitReductionPct: 50,
};

export const readMobileAppOrderingConfig = (settings: any): MobileAppOrderingConfig => ({
  aiEnabled: settings?.mobile_app_ai_enabled ?? true,
  requireMobileApp: settings?.mobile_app_require_app ?? true,
  requireOrderAhead: settings?.mobile_app_require_order_ahead ?? true,
  requireMobilePayment: settings?.mobile_app_require_payment ?? true,
  requireLoyaltyIntegration: settings?.mobile_app_require_loyalty ?? true,
  requirePushNotifications: settings?.mobile_app_require_push ?? true,
  requirePersonalization: settings?.mobile_app_require_personalization ?? true,
  requireAppRating: settings?.mobile_app_require_rating ?? true,
  requirePickupExperience: settings?.mobile_app_require_pickup ?? true,
  minAppStoreRating: safeNumber(settings?.mobile_app_min_rating, 4.0),
  minMobilePaymentMethods: safeNumber(settings?.mobile_app_min_payment_methods, 3),
  minPushOptInPct: safeNumber(settings?.mobile_app_min_push_optin, 50),
  minPersonalizationAcceptancePct: safeNumber(settings?.mobile_app_min_personalization, 25),
  minPickupStatusClarity: safeNumber(settings?.mobile_app_min_pickup_clarity, 90),
  minMobileTicketLiftPct: safeNumber(settings?.mobile_app_min_ticket_lift, 20),
  minCheckoutSpeedupPct: safeNumber(settings?.mobile_app_min_checkout_speedup, 50),
  minPerceivedWaitReductionPct: safeNumber(settings?.mobile_app_min_wait_reduction, 50),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface MobileAppOrderingData {
  location_id: string;
  restaurant_tier: string;
  market_setting: string;
  has_mobile_app: boolean;
  has_web_ordering: boolean;
  app_platforms: string[];
  app_platforms_count: number;
  app_vendor: string;
  app_age_months: number;
  app_last_update_months: number;
  app_store_rating: number;
  app_store_reviews_count: number;
  app_store_rating_trend: string;
  has_order_ahead: boolean;
  order_ahead_avg_lead_time_min: number;
  has_pickup_window: boolean;
  has_curbside_pickup: boolean;
  has_delivery_via_app: boolean;
  pickup_method_count: number;
  has_mobile_payment: boolean;
  mobile_payment_methods_count: number;
  accepts_apple_pay: boolean;
  accepts_google_pay: boolean;
  accepts_stored_credit: boolean;
  accepts_gift_card_balance: boolean;
  accepts_loyalty_redemption: boolean;
  has_loyalty_integration: boolean;
  loyalty_members_in_app: number;
  loyalty_share_of_app_users_pct: number;
  has_push_notifications: boolean;
  push_notifications_active_count: number;
  push_opt_in_rate_pct: number;
  push_ctr_pct: number;
  dormant_reactivation_pct: number;
  has_personalization: boolean;
  personalization_signals_count: number;
  recommendation_upsell_acceptance_pct: number;
  personalization_avg_ticket_lift_pct: number;
  has_order_customization: boolean;
  customization_options_count: number;
  has_dietary_filters: boolean;
  has_saved_favorites: boolean;
  has_pickup_status_notifications: boolean;
  has_designated_pickup_area: boolean;
  pickup_status_clarity_score: number;
  pickup_avg_wait_min: number;
  pickup_abandonment_pct: number;
  has_qr_pickup_checkin: boolean;
  app_users_count: number;
  power_user_top10pct: number;
  power_user_revenue_share_pct: number;
  power_user_orders_monthly: number;
  app_dormant_30d: number;
  monthly_mobile_revenue: number;
  mobile_revenue_pct: number;
  avg_mobile_ticket: number;
  avg_cashier_ticket: number;
  mobile_ticket_lift_pct: number;
  mobile_checkout_time_sec: number;
  cashier_checkout_time_sec: number;
  checkout_speedup_pct: number;
  perceived_wait_reduction_pct: number;
  pct_18_44_customers: number;
  customer_satisfaction_mobile: number;
  customer_satisfaction_cashier: number;
  monthly_revenue: number;
  app_dev_cost: number;
  app_monthly_cost: number;
  app_payment_processing_pct: number;
  push_platform_monthly: number;
}

const MOCK_DATA: MobileAppOrderingData[] = [
  {
    location_id: 'overall', restaurant_tier: 'fast_casual', market_setting: 'suburban',
    has_mobile_app: false, has_web_ordering: false,
    app_platforms: [], app_platforms_count: 0, app_vendor: '', app_age_months: 0, app_last_update_months: 0,
    app_store_rating: 0, app_store_reviews_count: 0, app_store_rating_trend: '',
    has_order_ahead: false, order_ahead_avg_lead_time_min: 0, has_pickup_window: false,
    has_curbside_pickup: false, has_delivery_via_app: false, pickup_method_count: 0,
    has_mobile_payment: false, mobile_payment_methods_count: 0,
    accepts_apple_pay: false, accepts_google_pay: false, accepts_stored_credit: false,
    accepts_gift_card_balance: false, accepts_loyalty_redemption: false,
    has_loyalty_integration: false, loyalty_members_in_app: 0, loyalty_share_of_app_users_pct: 0,
    has_push_notifications: false, push_notifications_active_count: 0, push_opt_in_rate_pct: 0, push_ctr_pct: 0, dormant_reactivation_pct: 0,
    has_personalization: false, personalization_signals_count: 0, recommendation_upsell_acceptance_pct: 0, personalization_avg_ticket_lift_pct: 0,
    has_order_customization: false, customization_options_count: 0, has_dietary_filters: false, has_saved_favorites: false,
    has_pickup_status_notifications: false, has_designated_pickup_area: false, pickup_status_clarity_score: 0,
    pickup_avg_wait_min: 0, pickup_abandonment_pct: 0, has_qr_pickup_checkin: false,
    app_users_count: 0, power_user_top10pct: 0, power_user_revenue_share_pct: 0, power_user_orders_monthly: 0, app_dormant_30d: 0,
    monthly_mobile_revenue: 0, mobile_revenue_pct: 0,
    avg_mobile_ticket: 0, avg_cashier_ticket: 14.50, mobile_ticket_lift_pct: 0,
    mobile_checkout_time_sec: 0, cashier_checkout_time_sec: 90, checkout_speedup_pct: 0, perceived_wait_reduction_pct: 0,
    pct_18_44_customers: 62, customer_satisfaction_mobile: 0, customer_satisfaction_cashier: 72,
    monthly_revenue: 82000, app_dev_cost: 35000, app_monthly_cost: 250, app_payment_processing_pct: 2.6, push_platform_monthly: 75,
  },
  {
    location_id: 'counter', restaurant_tier: 'quick_service', market_setting: 'urban',
    has_mobile_app: true, has_web_ordering: true,
    app_platforms: ['ios','android','web'], app_platforms_count: 3, app_vendor: 'Toast', app_age_months: 18, app_last_update_months: 3,
    app_store_rating: 3.4, app_store_reviews_count: 1240, app_store_rating_trend: 'down',
    has_order_ahead: true, order_ahead_avg_lead_time_min: 22, has_pickup_window: true,
    has_curbside_pickup: false, has_delivery_via_app: true, pickup_method_count: 2,
    has_mobile_payment: true, mobile_payment_methods_count: 2,
    accepts_apple_pay: true, accepts_google_pay: true, accepts_stored_credit: false,
    accepts_gift_card_balance: false, accepts_loyalty_redemption: false,
    has_loyalty_integration: false, loyalty_members_in_app: 0, loyalty_share_of_app_users_pct: 0,
    has_push_notifications: true, push_notifications_active_count: 2, push_opt_in_rate_pct: 38, push_ctr_pct: 4, dormant_reactivation_pct: 7,
    has_personalization: false, personalization_signals_count: 0, recommendation_upsell_acceptance_pct: 0, personalization_avg_ticket_lift_pct: 0,
    has_order_customization: true, customization_options_count: 8, has_dietary_filters: false, has_saved_favorites: true,
    has_pickup_status_notifications: true, has_designated_pickup_area: false, pickup_status_clarity_score: 62,
    pickup_avg_wait_min: 7.5, pickup_abandonment_pct: 9, has_qr_pickup_checkin: false,
    app_users_count: 4800, power_user_top10pct: 480, power_user_revenue_share_pct: 38, power_user_orders_monthly: 1850, app_dormant_30d: 1620,
    monthly_mobile_revenue: 31000, mobile_revenue_pct: 38,
    avg_mobile_ticket: 16.80, avg_cashier_ticket: 14.20, mobile_ticket_lift_pct: 18.3,
    mobile_checkout_time_sec: 45, cashier_checkout_time_sec: 90, checkout_speedup_pct: 50, perceived_wait_reduction_pct: 22,
    pct_18_44_customers: 74, customer_satisfaction_mobile: 68, customer_satisfaction_cashier: 76,
    monthly_revenue: 82000, app_dev_cost: 28000, app_monthly_cost: 220, app_payment_processing_pct: 2.6, push_platform_monthly: 65,
  },
  {
    location_id: 'drivethru', restaurant_tier: 'quick_service', market_setting: 'suburban',
    has_mobile_app: true, has_web_ordering: true,
    app_platforms: ['ios','android','web'], app_platforms_count: 3, app_vendor: 'Olo', app_age_months: 36, app_last_update_months: 1,
    app_store_rating: 4.6, app_store_reviews_count: 8200, app_store_rating_trend: 'up',
    has_order_ahead: true, order_ahead_avg_lead_time_min: 35, has_pickup_window: true,
    has_curbside_pickup: true, has_delivery_via_app: true, pickup_method_count: 4,
    has_mobile_payment: true, mobile_payment_methods_count: 5,
    accepts_apple_pay: true, accepts_google_pay: true, accepts_stored_credit: true,
    accepts_gift_card_balance: true, accepts_loyalty_redemption: true,
    has_loyalty_integration: true, loyalty_members_in_app: 12400, loyalty_share_of_app_users_pct: 62,
    has_push_notifications: true, push_notifications_active_count: 7, push_opt_in_rate_pct: 68, push_ctr_pct: 12, dormant_reactivation_pct: 18,
    has_personalization: true, personalization_signals_count: 4, recommendation_upsell_acceptance_pct: 28, personalization_avg_ticket_lift_pct: 26,
    has_order_customization: true, customization_options_count: 18, has_dietary_filters: true, has_saved_favorites: true,
    has_pickup_status_notifications: true, has_designated_pickup_area: true, pickup_status_clarity_score: 94,
    pickup_avg_wait_min: 2.0, pickup_abandonment_pct: 3, has_qr_pickup_checkin: true,
    app_users_count: 22000, power_user_top10pct: 2200, power_user_revenue_share_pct: 41, power_user_orders_monthly: 9800, app_dormant_30d: 5400,
    monthly_mobile_revenue: 138000, mobile_revenue_pct: 64,
    avg_mobile_ticket: 18.20, avg_cashier_ticket: 14.60, mobile_ticket_lift_pct: 24.7,
    mobile_checkout_time_sec: 15, cashier_checkout_time_sec: 90, checkout_speedup_pct: 83, perceived_wait_reduction_pct: 58,
    pct_18_44_customers: 76, customer_satisfaction_mobile: 92, customer_satisfaction_cashier: 78,
    monthly_revenue: 215000, app_dev_cost: 60000, app_monthly_cost: 380, app_payment_processing_pct: 2.5, push_platform_monthly: 120,
  },
  {
    location_id: 'curbside', restaurant_tier: 'fast_casual', market_setting: 'suburban',
    has_mobile_app: true, has_web_ordering: false,
    app_platforms: ['ios','android'], app_platforms_count: 2, app_vendor: 'ChowNow', app_age_months: 12, app_last_update_months: 6,
    app_store_rating: 4.1, app_store_reviews_count: 380, app_store_rating_trend: 'flat',
    has_order_ahead: false, order_ahead_avg_lead_time_min: 0, has_pickup_window: false,
    has_curbside_pickup: false, has_delivery_via_app: false, pickup_method_count: 1,
    has_mobile_payment: true, mobile_payment_methods_count: 2,
    accepts_apple_pay: false, accepts_google_pay: false, accepts_stored_credit: true,
    accepts_gift_card_balance: false, accepts_loyalty_redemption: false,
    has_loyalty_integration: false, loyalty_members_in_app: 0, loyalty_share_of_app_users_pct: 0,
    has_push_notifications: false, push_notifications_active_count: 0, push_opt_in_rate_pct: 0, push_ctr_pct: 0, dormant_reactivation_pct: 0,
    has_personalization: false, personalization_signals_count: 0, recommendation_upsell_acceptance_pct: 0, personalization_avg_ticket_lift_pct: 0,
    has_order_customization: false, customization_options_count: 0, has_dietary_filters: false, has_saved_favorites: false,
    has_pickup_status_notifications: false, has_designated_pickup_area: false, pickup_status_clarity_score: 45,
    pickup_avg_wait_min: 11.0, pickup_abandonment_pct: 14, has_qr_pickup_checkin: false,
    app_users_count: 920, power_user_top10pct: 92, power_user_revenue_share_pct: 33, power_user_orders_monthly: 240, app_dormant_30d: 410,
    monthly_mobile_revenue: 4200, mobile_revenue_pct: 8,
    avg_mobile_ticket: 17.50, avg_cashier_ticket: 14.80, mobile_ticket_lift_pct: 18.2,
    mobile_checkout_time_sec: 70, cashier_checkout_time_sec: 90, checkout_speedup_pct: 22, perceived_wait_reduction_pct: 0,
    pct_18_44_customers: 58, customer_satisfaction_mobile: 64, customer_satisfaction_cashier: 75,
    monthly_revenue: 53000, app_dev_cost: 18000, app_monthly_cost: 180, app_payment_processing_pct: 2.7, push_platform_monthly: 50,
  },
];

export const runMobileAppOrderingEngine = async (
  db: ReturnType<typeof useDB>,
  config: MobileAppOrderingConfig,
): Promise<{ alerts: MobileAppOrderingAlert[]; generated: number }> => {
  const alerts: MobileAppOrderingAlert[] = [];
  const now = new Date();

  let data: MobileAppOrderingData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, restaurant_tier, market_setting,
              has_mobile_app, has_web_ordering, app_platforms, app_platforms_count, app_vendor,
              app_age_months, app_last_update_months,
              app_store_rating, app_store_reviews_count, app_store_rating_trend,
              has_order_ahead, order_ahead_avg_lead_time_min, has_pickup_window,
              has_curbside_pickup, has_delivery_via_app, pickup_method_count,
              has_mobile_payment, mobile_payment_methods_count,
              accepts_apple_pay, accepts_google_pay, accepts_stored_credit,
              accepts_gift_card_balance, accepts_loyalty_redemption,
              has_loyalty_integration, loyalty_members_in_app, loyalty_share_of_app_users_pct,
              has_push_notifications, push_notifications_active_count, push_opt_in_rate_pct, push_ctr_pct, dormant_reactivation_pct,
              has_personalization, personalization_signals_count, recommendation_upsell_acceptance_pct, personalization_avg_ticket_lift_pct,
              has_order_customization, customization_options_count, has_dietary_filters, has_saved_favorites,
              has_pickup_status_notifications, has_designated_pickup_area, pickup_status_clarity_score,
              pickup_avg_wait_min, pickup_abandonment_pct, has_qr_pickup_checkin,
              app_users_count, power_user_top10pct, power_user_revenue_share_pct, power_user_orders_monthly, app_dormant_30d,
              monthly_mobile_revenue, mobile_revenue_pct,
              avg_mobile_ticket, avg_cashier_ticket, mobile_ticket_lift_pct,
              mobile_checkout_time_sec, cashier_checkout_time_sec, checkout_speedup_pct, perceived_wait_reduction_pct,
              pct_18_44_customers, customer_satisfaction_mobile, customer_satisfaction_cashier,
              monthly_revenue, app_dev_cost, app_monthly_cost, app_payment_processing_pct, push_platform_monthly
       FROM mobile_app_log`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any): MobileAppOrderingData => ({
      location_id: String(r.location_id ?? 'overall'),
      restaurant_tier: String(r.restaurant_tier ?? 'fast_casual'),
      market_setting: String(r.market_setting ?? 'suburban'),
      has_mobile_app: Boolean(r.has_mobile_app ?? false),
      has_web_ordering: Boolean(r.has_web_ordering ?? false),
      app_platforms: Array.isArray(r.app_platforms) ? r.app_platforms : [],
      app_platforms_count: safeNumber(r.app_platforms_count, 0),
      app_vendor: String(r.app_vendor ?? ''),
      app_age_months: safeNumber(r.app_age_months, 0),
      app_last_update_months: safeNumber(r.app_last_update_months, 0),
      app_store_rating: safeNumber(r.app_store_rating, 0),
      app_store_reviews_count: safeNumber(r.app_store_reviews_count, 0),
      app_store_rating_trend: String(r.app_store_rating_trend ?? ''),
      has_order_ahead: Boolean(r.has_order_ahead ?? false),
      order_ahead_avg_lead_time_min: safeNumber(r.order_ahead_avg_lead_time_min, 0),
      has_pickup_window: Boolean(r.has_pickup_window ?? false),
      has_curbside_pickup: Boolean(r.has_curbside_pickup ?? false),
      has_delivery_via_app: Boolean(r.has_delivery_via_app ?? false),
      pickup_method_count: safeNumber(r.pickup_method_count, 0),
      has_mobile_payment: Boolean(r.has_mobile_payment ?? false),
      mobile_payment_methods_count: safeNumber(r.mobile_payment_methods_count, 0),
      accepts_apple_pay: Boolean(r.accepts_apple_pay ?? false),
      accepts_google_pay: Boolean(r.accepts_google_pay ?? false),
      accepts_stored_credit: Boolean(r.accepts_stored_credit ?? false),
      accepts_gift_card_balance: Boolean(r.accepts_gift_card_balance ?? false),
      accepts_loyalty_redemption: Boolean(r.accepts_loyalty_redemption ?? false),
      has_loyalty_integration: Boolean(r.has_loyalty_integration ?? false),
      loyalty_members_in_app: safeNumber(r.loyalty_members_in_app, 0),
      loyalty_share_of_app_users_pct: safeNumber(r.loyalty_share_of_app_users_pct, 0),
      has_push_notifications: Boolean(r.has_push_notifications ?? false),
      push_notifications_active_count: safeNumber(r.push_notifications_active_count, 0),
      push_opt_in_rate_pct: safeNumber(r.push_opt_in_rate_pct, 0),
      push_ctr_pct: safeNumber(r.push_ctr_pct, 0),
      dormant_reactivation_pct: safeNumber(r.dormant_reactivation_pct, 0),
      has_personalization: Boolean(r.has_personalization ?? false),
      personalization_signals_count: safeNumber(r.personalization_signals_count, 0),
      recommendation_upsell_acceptance_pct: safeNumber(r.recommendation_upsell_acceptance_pct, 0),
      personalization_avg_ticket_lift_pct: safeNumber(r.personalization_avg_ticket_lift_pct, 0),
      has_order_customization: Boolean(r.has_order_customization ?? false),
      customization_options_count: safeNumber(r.customization_options_count, 0),
      has_dietary_filters: Boolean(r.has_dietary_filters ?? false),
      has_saved_favorites: Boolean(r.has_saved_favorites ?? false),
      has_pickup_status_notifications: Boolean(r.has_pickup_status_notifications ?? false),
      has_designated_pickup_area: Boolean(r.has_designated_pickup_area ?? false),
      pickup_status_clarity_score: safeNumber(r.pickup_status_clarity_score, 0),
      pickup_avg_wait_min: safeNumber(r.pickup_avg_wait_min, 0),
      pickup_abandonment_pct: safeNumber(r.pickup_abandonment_pct, 0),
      has_qr_pickup_checkin: Boolean(r.has_qr_pickup_checkin ?? false),
      app_users_count: safeNumber(r.app_users_count, 0),
      power_user_top10pct: safeNumber(r.power_user_top10pct, 0),
      power_user_revenue_share_pct: safeNumber(r.power_user_revenue_share_pct, 0),
      power_user_orders_monthly: safeNumber(r.power_user_orders_monthly, 0),
      app_dormant_30d: safeNumber(r.app_dormant_30d, 0),
      monthly_mobile_revenue: safeNumber(r.monthly_mobile_revenue, 0),
      mobile_revenue_pct: safeNumber(r.mobile_revenue_pct, 0),
      avg_mobile_ticket: safeNumber(r.avg_mobile_ticket, 0),
      avg_cashier_ticket: safeNumber(r.avg_cashier_ticket, 0),
      mobile_ticket_lift_pct: safeNumber(r.mobile_ticket_lift_pct, 0),
      mobile_checkout_time_sec: safeNumber(r.mobile_checkout_time_sec, 0),
      cashier_checkout_time_sec: safeNumber(r.cashier_checkout_time_sec, 0),
      checkout_speedup_pct: safeNumber(r.checkout_speedup_pct, 0),
      perceived_wait_reduction_pct: safeNumber(r.perceived_wait_reduction_pct, 0),
      pct_18_44_customers: safeNumber(r.pct_18_44_customers, 0),
      customer_satisfaction_mobile: safeNumber(r.customer_satisfaction_mobile, 0),
      customer_satisfaction_cashier: safeNumber(r.customer_satisfaction_cashier, 0),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      app_dev_cost: safeNumber(r.app_dev_cost, 35000),
      app_monthly_cost: safeNumber(r.app_monthly_cost, 250),
      app_payment_processing_pct: safeNumber(r.app_payment_processing_pct, 2.6),
      push_platform_monthly: safeNumber(r.push_platform_monthly, 75),
    }));
  } catch { data = []; }
  if (data.length === 0) data = MOCK_DATA;

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;
    const baselineTicket = d.avg_cashier_ticket || 14.50;
    const isUrbanMarket = d.market_setting === 'urban';
    const isQuickService = d.restaurant_tier === 'quick_service' || d.restaurant_tier === 'fast_casual';
    const targetTicketLiftPct = isQuickService ? 23 : 20; // mobile ordering increases ticket 20-25%
    const targetWaitReductionPct = 55; // 50-60% perceived wait reduction from order-ahead
    const targetCheckoutSpeedupPct = 83; // mobile payment 83% faster checkout (90s -> 15s)
    const targetDormantReactivationPct = 18; // 15-20% dormant reactivation via push
    const targetLoyaltyRetentionLiftPct = 35; // loyalty-integrated apps see 35% higher retention
    const targetPersonalizationUpsellPct = 28; // 25-30% upsell from personalization
    const targetPowerUserSharePct = 40; // top 10% drive 40% of mobile revenue

    // Rule 1: MOBILE_APP_ABSENT
    if (config.requireMobileApp && !d.has_mobile_app && !d.has_web_ordering) {
      // No mobile app or web ordering -> missed 20-25% ticket increase
      const expectedTicketLift = baselineTicket * (targetTicketLiftPct / 100);
      const expectedNewTicket = baselineTicket + expectedTicketLift;
      const monthlyOrders = Math.round(baselineRevenue / baselineTicket);
      const ticketLiftOpportunity = Math.round(expectedTicketLift * monthlyOrders);
      const customerAcquisitionLoss = Math.round(monthlyOrders * (d.pct_18_44_customers / 100) * 0.20);
      const acquisitionRevenue = Math.round(customerAcquisitionLoss * baselineTicket * 3); // 3-mo LTV impact
      const totalOpportunity = Math.max(ticketLiftOpportunity + acquisitionRevenue, 4000);
      const criticalNote = isQuickService
        ? 'CRITICAL: NO MOBILE APP OR WEB ORDERING at this ' + d.restaurant_tier + ' location. Mobile ordering increases average ticket 20-25% (customers browse longer, add more items, no social pressure). 72% of customers aged 18-44 prefer mobile ordering over in-person (NRA). With ' + d.pct_18_44_customers + '% of customers in the 18-44 demographic and ' + monthlyOrders + ' monthly orders, NOT offering mobile ordering is actively driving younger customers to competitors who do. '
        : 'CRITICAL: NO MOBILE APP OR WEB ORDERING. Mobile is the primary ordering channel for the 18-44 demographic. At cashier ticket of ' + fmt$(baselineTicket) + ', a ' + targetTicketLiftPct + '% mobile lift = ' + fmt$(ticketLiftOpportunity) + '/mo missed ticket-uplift revenue alone. ';
      alerts.push({
        rule_id: 'mobile_app_absent',
        severity: 'critical',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_mobile_app: d.has_mobile_app,
        has_web_ordering: d.has_web_ordering,
        app_platforms: d.app_platforms,
        app_platforms_count: d.app_platforms_count,
        avg_mobile_ticket: d.avg_mobile_ticket,
        avg_cashier_ticket: d.avg_cashier_ticket,
        mobile_ticket_lift_pct: d.mobile_ticket_lift_pct,
        pct_18_44_customers: d.pct_18_44_customers,
        customer_satisfaction_mobile: d.customer_satisfaction_mobile,
        customer_satisfaction_cashier: d.customer_satisfaction_cashier,
        monthly_revenue: d.monthly_revenue,
        monthly_mobile_revenue: d.monthly_mobile_revenue,
        mobile_revenue_pct: d.mobile_revenue_pct,
        app_dev_cost: d.app_dev_cost,
        app_monthly_cost: d.app_monthly_cost,
        ticket_lift_projected_pct: targetTicketLiftPct,
        checkout_speedup_projected_pct: targetCheckoutSpeedupPct,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `MOBILE APP ABSENT: ${d.location_id} — restaurant has NO mobile app and NO mobile-optimized web ordering. ${criticalNote}A mobile app (or at minimum a mobile web ordering experience) is the single most important digital channel for restaurants serving customers aged 18-44. Industry data: 72% of customers aged 18-44 prefer mobile ordering over in-person (NRA); mobile ordering increases average ticket 20-25% (customers browse longer, add more items, no social pressure); 40% of mobile orders come from top 10% of app users (power users drive revenue); mobile payment reduces transaction time from 90s to 15s (83% faster checkout); mobile orders have 20-25% higher satisfaction than in-person (no order miscommunication). McDonalds app drove $20B+ in digital sales in 2023. Starbucks app is 31% of all US transactions. Chipotle app is 40%+ of revenue. Solutions ranked by ROI: (1) DEPLOY mobile-optimized web ordering — fastest path; vendors Olo, Toast, ChowNow, BentoBox; cost $5k-25k setup + $200-500/mo; live in 4-6 weeks; (2) LAUNCH native iOS + Android app — better UX, push notifications, loyalty integration; cost $25k-150k custom or $5k-25k platform; 12-24 week build; (3) ENABLE mobile payment — Apple Pay, Google Pay, stored credit card token; 83% faster checkout; (4) ENABLE order-ahead + scheduled pickup — reduces perceived wait 50-60%; (5) ENABLE push notifications — reactivates 15-20% of dormant customers in 30 days; (6) INTEGRATE loyalty — 35% higher retention for loyalty-integrated apps; (7) ADD personalization engine — order-history recommendations lift upsell 25-30%; (8) ADD order customization + saved favorites — drives repeat orders; (9) ADD pickup status notifications — eliminates "is my order ready" calls; (10) DEPLOY designated pickup area + QR check-in — frictionless pickup. Industry data: 20-25% mobile ticket lift (NRA); 72% of 18-44 prefer mobile (NRA); 90s cashier vs 15s mobile checkout; 40% of mobile revenue from top 10% users; 35% retention lift from loyalty integration; $5k-150k app dev cost; 4-24 week build; payback 3-12 months on ticket lift + acquisition. Expected impact: +${targetTicketLiftPct}% ticket lift, +${fmt$(ticketLiftOpportunity)}/mo ticket-uplift revenue, +${customerAcquisitionLoss} new customers acquired/mo, +${fmt$(acquisitionRevenue)}/mo acquisition revenue, +${targetCheckoutSpeedupPct}% checkout speedup, payback 3-12 months.`,
        ai_recommendation: 'launch_mobile_app',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: ORDER_AHEAD_MISSING
    if (config.requireOrderAhead && (d.has_mobile_app || d.has_web_ordering) && !d.has_order_ahead) {
      // No order-ahead/pickup -> missed 50-60% wait reduction
      const monthlyMobileOrders = d.app_users_count > 0
        ? Math.round(d.monthly_mobile_revenue / Math.max(d.avg_mobile_ticket || baselineTicket, 1))
        : Math.round(d.monthly_revenue * 0.30 / baselineTicket);
      const perceivedWaitMin = 12; // typical walk-in wait
      const expectedWaitReductionMin = Math.round(perceivedWaitMin * (targetWaitReductionPct / 100));
      const abandonedOrdersDueToWait = Math.round(monthlyMobileOrders * 0.10); // 10% abandon if no order-ahead
      const recoveredRevenue = Math.round(abandonedOrdersDueToWait * (d.avg_mobile_ticket || baselineTicket));
      const ticketLiftOpportunity = Math.round(monthlyMobileOrders * baselineTicket * (targetTicketLiftPct / 100) * 0.5);
      const totalOpportunity = Math.max(recoveredRevenue + ticketLiftOpportunity, 600);
      const criticalNote = (d.pickup_method_count <= 1)
        ? 'HIGH: ORDER-AHEAD MISSING — restaurant has ' + (d.has_mobile_app ? 'a mobile app' : 'web ordering') + ' but NO order-ahead / scheduled pickup. Customers must wait in line even after ordering on the app. Order-ahead reduces perceived wait time by 50-60% (customer arrives, order ready). Currently only ' + d.pickup_method_count + ' pickup method configured. '
        : 'MEDIUM: order-ahead not enabled — ' + d.pickup_method_count + ' pickup methods configured but no scheduling. ';
      alerts.push({
        rule_id: 'order_ahead_missing',
        severity: d.pickup_method_count <= 1 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_mobile_app: d.has_mobile_app,
        has_web_ordering: d.has_web_ordering,
        has_order_ahead: d.has_order_ahead,
        has_pickup_window: d.has_pickup_window,
        has_curbside_pickup: d.has_curbside_pickup,
        has_delivery_via_app: d.has_delivery_via_app,
        pickup_method_count: d.pickup_method_count,
        order_ahead_avg_lead_time_min: d.order_ahead_avg_lead_time_min,
        avg_mobile_ticket: d.avg_mobile_ticket,
        monthly_mobile_revenue: d.monthly_mobile_revenue,
        mobile_revenue_pct: d.mobile_revenue_pct,
        perceived_wait_reduction_pct: d.perceived_wait_reduction_pct,
        app_users_count: d.app_users_count,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `ORDER-AHEAD MISSING: ${d.location_id} — restaurant has ${d.has_mobile_app ? 'a mobile app' : 'web ordering'} but does NOT support order-ahead / scheduled pickup (pickup methods: ${d.pickup_method_count}, curbside: ${d.has_curbside_pickup}, delivery: ${d.has_delivery_via_app}). ${criticalNote}Order-ahead is the single highest-value feature of a mobile ordering app because it directly reduces perceived wait time. Industry data: order-ahead reduces perceived wait time by 50-60% (customer arrives, order ready); Starbucks Mobile Order & Pay drove 31% of US transactions; Chipotle digital orders (mostly order-ahead) are 40%+ of revenue; 75% of quick-service customers say order-ahead is the #1 feature they want in an app; customers who use order-ahead visit 2.5x more frequently than non-users; 80% of order-ahead customers add an item they would not have ordered in person (no time pressure). Solutions ranked by impact: (1) ENABLE scheduled pickup — customer picks a 15-min pickup window; cost $0 if app supports; (2) ADD curbside pickup — customer parks in designated spot, taps "I am here" in app, staff delivers to car; cost $0-200 for signage; (3) ADD delivery via app — own fleet or 3P (DoorDash Drive, Uber Direct); (4) ADD drive-thru integration — order-ahead orders go to a priority drive-thru lane; (5) SET lead time defaults — 15 min for quick-service, 30 min for fast-casual, 60 min for casual-dining; (6) SHOW real-time pickup status — "preparing", "ready for pickup", "handed off"; (7) ADD pickup instructions — parking spot #, entrance #, named greeter; (8) ENABLE group ordering — multiple people contribute to one order-ahead; (9) ENABLE recurring orders — customer schedules weekly taco Tuesday; (10) DEPLOY order-ahead priority lane at counter — separate pickup window. Industry data: 50-60% perceived wait reduction; 31% of Starbucks US transactions via Mobile Order & Pay; 40%+ of Chipotle revenue digital; 2.5x visit frequency from order-ahead users; 80% add an item they would not have ordered; 75% of QSR customers want order-ahead #1 feature. Expected impact: -${expectedWaitReductionMin} min perceived wait, +${abandonedOrdersDueToWait} recovered orders/mo, +${fmt$(recoveredRevenue)}/mo recovered revenue, +${targetWaitReductionPct}% perceived wait reduction, payback 1-3 months.`,
        ai_recommendation: 'enable_order_ahead',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: MOBILE_PAYMENT_ABSENT
    if (config.requireMobilePayment && (d.has_mobile_app || d.has_web_ordering) && (!d.has_mobile_payment || d.mobile_payment_methods_count < config.minMobilePaymentMethods)) {
      // No mobile pay integration -> 83% slower checkout
      const missingMethods: string[] = [];
      if (!d.accepts_apple_pay) missingMethods.push('Apple Pay');
      if (!d.accepts_google_pay) missingMethods.push('Google Pay');
      if (!d.accepts_stored_credit) missingMethods.push('stored credit card');
      if (!d.accepts_gift_card_balance) missingMethods.push('gift card balance');
      if (!d.accepts_loyalty_redemption) missingMethods.push('loyalty redemption');
      const monthlyMobileOrders = d.app_users_count > 0
        ? Math.round(d.monthly_mobile_revenue / Math.max(d.avg_mobile_ticket || baselineTicket, 1))
        : Math.round(d.monthly_revenue * 0.30 / baselineTicket);
      const abandonmentPct = (!d.has_mobile_payment) ? 30 : missingMethods.length >= 3 ? 18 : 8;
      const abandonedOrders = Math.round(monthlyMobileOrders * (abandonmentPct / 100));
      const recoveredRevenue = abandonedOrders * (d.avg_mobile_ticket || baselineTicket);
      const laborTimeSavedMonthly = Math.round(abandonedOrders * 1.25); // 75s saved per mobile-paid order vs cashier
      const laborCostSavedMonthly = Math.round(laborTimeSavedMonthly / 60 * (isUrbanMarket ? 18 : 15));
      const totalOpportunity = Math.max(recoveredRevenue + laborCostSavedMonthly, 400);
      const criticalNote = (!d.has_mobile_payment)
        ? 'CRITICAL: NO MOBILE PAYMENT INTEGRATION — app does not support any in-app payment. Customers must pay at counter, defeating the entire purpose of a mobile app. Mobile payment reduces transaction time from 90s to 15s (83% faster checkout). '
        : 'HIGH: MOBILE PAYMENT INCOMPLETE — missing ' + missingMethods.length + ' payment methods: ' + missingMethods.join(', ') + '. ';
      alerts.push({
        rule_id: 'mobile_payment_absent',
        severity: !d.has_mobile_payment ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_mobile_app: d.has_mobile_app,
        has_mobile_payment: d.has_mobile_payment,
        mobile_payment_methods_count: d.mobile_payment_methods_count,
        accepts_apple_pay: d.accepts_apple_pay,
        accepts_google_pay: d.accepts_google_pay,
        accepts_stored_credit: d.accepts_stored_credit,
        accepts_gift_card_balance: d.accepts_gift_card_balance,
        accepts_loyalty_redemption: d.accepts_loyalty_redemption,
        mobile_checkout_time_sec: d.mobile_checkout_time_sec,
        cashier_checkout_time_sec: d.cashier_checkout_time_sec,
        checkout_speedup_pct: d.checkout_speedup_pct,
        avg_mobile_ticket: d.avg_mobile_ticket,
        monthly_mobile_revenue: d.monthly_mobile_revenue,
        mobile_revenue_pct: d.mobile_revenue_pct,
        app_payment_processing_pct: d.app_payment_processing_pct,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `MOBILE PAYMENT ABSENT: ${d.location_id} — app ${!d.has_mobile_payment ? 'does NOT support in-app mobile payment' : 'accepts only ' + d.mobile_payment_methods_count + ' payment methods (missing: ' + missingMethods.join(', ') + ')'}. ${criticalNote}Mobile payment is the single most important app feature for checkout speed. Industry data: mobile payment reduces transaction time from 90s (cashier) to 15s (mobile pay) — 83% faster checkout; Apple Pay / Google Pay adoption is 70%+ among 18-44 customers (Fed Reserve 2023); stored credit card tokenization enables 1-tap reorder; 25-30% of customers abandon app orders if their preferred payment is not available (Toast Mobile benchmark); Starbucks Mobile Order & Pay drove 31% of US transactions because of seamless stored-value payment; payment abandonment is silent — customers leave the app and never come back. Solutions ranked by impact: (1) ENABLE Apple Pay — iOS in-app payment via PassKit; cost $0; 1-2 day integration; (2) ENABLE Google Pay — Android equivalent; cost $0; 1-2 day integration; (3) ENABLE stored credit card — Stripe, Square, Adyen tokenization; cost $0 + 2.5-2.9% processing; enables 1-tap reorder; (4) ENABLE gift card balance — links to existing gift card ledger; cost $0; 4-6 hour integration; (5) ENABLE loyalty redemption — redeem points for free items; cost $0; 6-8 hour integration; (6) DISPLAY all accepted payment icons prominently — set expectations before checkout; (7) DEFAULT to last-used payment method — frictionless repeat orders; (8) ADD scan-to-pay fallback — for users without stored payment; (9) ADD EBT / SNAP for eligible items — government-reimbursed; (10) ENABLE split payment — multiple payment methods per order; (11) TEST payment flow weekly — verify settlement; (12) MONITOR payment abandonment rate — above 5% triggers audit. Industry data: 90s cashier vs 15s mobile checkout (83% faster); 70%+ Apple Pay / Google Pay adoption among 18-44; 25-30% mobile payment abandonment if preferred method missing; 31% of Starbucks US transactions via Mobile Order & Pay; payback 1-3 months. Expected impact: +${missingMethods.length} payment methods added, -${abandonmentPct}% payment abandonment, +${abandonedOrders} recovered orders/mo, +${fmt$(recoveredRevenue)}/mo recovered revenue, +${fmt$(laborCostSavedMonthly)}/mo labor saved, +${targetCheckoutSpeedupPct}% checkout speedup, payback 1-3 months.`,
        ai_recommendation: 'integrate_mobile_payment',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: LOYALTY_INTEGRATION_MISSING
    if (config.requireLoyaltyIntegration && (d.has_mobile_app || d.has_web_ordering) && !d.has_loyalty_integration) {
      // App not connected to loyalty -> 35% lower retention
      const activeAppUsers = d.app_users_count > 0 ? d.app_users_count : 500;
      const targetLoyaltyShare = 60; // 60% of app users should be loyalty members
      const expectedLoyaltyMembers = Math.round(activeAppUsers * (targetLoyaltyShare / 100));
      const retentionLiftPct = targetLoyaltyRetentionLiftPct; // 35% higher retention
      const avgVisitsPerMonth = isQuickService ? 4 : 2;
      const recoveredVisits = Math.round(expectedLoyaltyMembers * (retentionLiftPct / 100) * avgVisitsPerMonth * 0.5);
      const recoveredRevenue = recoveredVisits * (d.avg_mobile_ticket || baselineTicket);
      const totalOpportunity = Math.max(recoveredRevenue, 800);
      const criticalNote = (d.app_users_count > 1000)
        ? 'HIGH: LOYALTY INTEGRATION MISSING — app has ' + d.app_users_count + ' users but is NOT connected to the loyalty program. Apps with loyalty integration see 35% higher retention than apps without. Currently 0% of app users are loyalty members (target 60%+). '
        : 'MEDIUM: loyalty integration missing — app is not connected to loyalty program. ';
      alerts.push({
        rule_id: 'loyalty_integration_missing',
        severity: d.app_users_count > 1000 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_mobile_app: d.has_mobile_app,
        has_loyalty_integration: d.has_loyalty_integration,
        loyalty_members_in_app: d.loyalty_members_in_app,
        loyalty_share_of_app_users_pct: d.loyalty_share_of_app_users_pct,
        accepts_loyalty_redemption: d.accepts_loyalty_redemption,
        app_users_count: d.app_users_count,
        avg_mobile_ticket: d.avg_mobile_ticket,
        monthly_mobile_revenue: d.monthly_mobile_revenue,
        mobile_revenue_pct: d.mobile_revenue_pct,
        retention_lift_projected_pct: targetLoyaltyRetentionLiftPct,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `LOYALTY INTEGRATION MISSING: ${d.location_id} — app has ${d.app_users_count} users but is NOT connected to the loyalty program (loyalty members in app: ${d.loyalty_members_in_app}; share: ${d.loyalty_share_of_app_users_pct}%). ${criticalNote}Loyalty integration in the mobile app is the single most powerful retention lever. Industry data: apps with loyalty integration see 35% higher retention than apps without (Paytronix); loyalty members visit 2.5x more frequently than non-members; loyalty members spend 35-50% more per visit; Starbucks Rewards members are 35% of US transactions and 53% of revenue; Chipotle Rewards drove 30M+ members in 2 years; Panera MyPanera drove 50%+ of digital orders; push notifications tied to loyalty points ("you are 50 points from a free reward") drive 25-30% reactivation rate; loyalty members are 5x more likely to enable push notifications. Solutions ranked by impact: (1) INTEGRATE loyalty program with app — single sign-on (SSO); points visible on home screen; cost $5k-25k integration; (2) ENABLE points earning on every mobile order — automatic, no scan required; (3) ENABLE points redemption in-app — free items, upgrades, discounts; cost $0; (4) ADD loyalty progress bar — visual "X points to next reward"; (5) ADD surprise-and-delight rewards — random free item on visit; (6) ADD tiered loyalty — Silver / Gold / Platinum tiers with escalating perks; (7) ADD birthday reward — free item during birthday month; (8) ADD referral reward — both referrer and referee get bonus points; (9) ENABLE push notifications for loyalty events — "you earned 100 points", "you unlocked a reward", "your points expire soon"; (10) ADD loyalty dashboard — show lifetime points, visits, favorite items. Industry data: 35% higher retention from loyalty-integrated apps (Paytronix); 2.5x visit frequency; 35-50% higher spend per visit; 53% of Starbucks revenue from Rewards members; 30M Chipotle Rewards members in 2 years; payback 2-6 months. Expected impact: +${expectedLoyaltyMembers} loyalty members enrolled, +${retentionLiftPct}% retention lift, +${recoveredVisits} recovered visits/mo, +${fmt$(recoveredRevenue)}/mo recovered revenue, payback 2-6 months.`,
        ai_recommendation: 'connect_loyalty_to_app',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: PUSH_NOTIFICATIONS_ABSENT
    if (config.requirePushNotifications && (d.has_mobile_app || d.has_web_ordering) && (!d.has_push_notifications || d.push_opt_in_rate_pct < config.minPushOptInPct)) {
      // No push notifications -> missed 15-20% dormant reactivation
      const dormantUsers = d.app_dormant_30d > 0 ? d.app_dormant_30d : Math.round(d.app_users_count * 0.40);
      const targetReactivationPct = targetDormantReactivationPct; // 15-20% benchmark
      const expectedReactivated = Math.round(dormantUsers * (targetReactivationPct / 100));
      const recoveredRevenue = expectedReactivated * (d.avg_mobile_ticket || baselineTicket) * 1.5; // 1.5 orders over 30 days
      const totalOpportunity = Math.max(recoveredRevenue, 300);
      const criticalNote = (!d.has_push_notifications)
        ? 'HIGH: PUSH NOTIFICATIONS ABSENT — app does NOT support push notifications. Push notifications drive 15-20% of dormant customers back within 30 days. With ' + dormantUsers + ' dormant app users (30+ days), this is ' + expectedReactivated + ' recoverable customers/mo. '
        : 'MEDIUM: PUSH OPT-IN LOW — push opt-in rate is ' + d.push_opt_in_rate_pct + '% (target 50%+). Currently ' + d.push_notifications_active_count + ' active push campaigns. ';
      alerts.push({
        rule_id: 'push_notifications_absent',
        severity: !d.has_push_notifications ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_mobile_app: d.has_mobile_app,
        has_push_notifications: d.has_push_notifications,
        push_notifications_active_count: d.push_notifications_active_count,
        push_opt_in_rate_pct: d.push_opt_in_rate_pct,
        push_ctr_pct: d.push_ctr_pct,
        dormant_reactivation_pct: d.dormant_reactivation_pct,
        app_users_count: d.app_users_count,
        app_dormant_30d: d.app_dormant_30d,
        avg_mobile_ticket: d.avg_mobile_ticket,
        monthly_mobile_revenue: d.monthly_mobile_revenue,
        mobile_revenue_pct: d.mobile_revenue_pct,
        push_platform_monthly: d.push_platform_monthly,
        dormant_reactivation_projected: expectedReactivated,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `PUSH NOTIFICATIONS ABSENT: ${d.location_id} — app ${!d.has_push_notifications ? 'does NOT support push notifications' : 'has push but opt-in rate is ' + d.push_opt_in_rate_pct + '% (target 50%+) and ' + d.push_notifications_active_count + ' active campaigns'}. ${criticalNote}Push notifications are the cheapest, highest-ROI reactivation channel available. Industry data: push notifications drive 15-20% of dormant customers back within 30 days (Airship); push opt-in rate benchmarks: 50-70% iOS, 70-90% Android (after iOS 14 opt-in prompt); push CTR benchmarks: 5-15% (vs 1-3% for email); loyalty-tied push ("you are 50 points from a free reward") drives 25-30% reactivation; time-of-day push (lunch reminder at 11:30am) drives 8-12% lift; geo-fenced push (within 1 mile of restaurant) drives 20-25% lift; dormant user reactivation cost via push: $0.05 per user (vs $5-10 via paid ads); customers reactivated via push have 2-3x higher 90-day LTV than reactivated via paid ads. Solutions ranked by impact: (1) ENABLE push notifications — OneSignal (free up to 10k users), Braze ($1-3k/mo), Airship ($2-5k/mo); (2) IMPLEMENT iOS opt-in prompt — show value proposition ("Get exclusive offers") before system prompt; (3) SEGMENT push audiences — active / dormant / lapsed; (4) SEND dormant reactivation campaign — "We miss you, here is 20% off your next order"; (5) SEND loyalty-tied push — "You are X points from a free reward"; (6) SEND time-of-day push — lunch reminder 11:30am, dinner reminder 5:00pm; (7) SEND geo-fenced push — within 1 mile of restaurant; (8) SEND order-ready push — "Your order is ready for pickup"; (9) SEND birthday push — free item during birthday month; (10) ADD push preferences screen — let users opt into specific push types; (11) A/B test push copy — short vs long, emoji vs no emoji; (12) MONITOR push frequency — do not exceed 3-5 per week per user (uninstall risk). Industry data: 15-20% dormant reactivation via push (Airship); 50-70% iOS opt-in; 5-15% push CTR; 25-30% reactivation from loyalty-tied push; 20-25% lift from geo-fenced push; $0.05 reactivation cost per user via push vs $5-10 via paid; 2-3x higher 90-day LTV from push-reactivated users. Expected impact: +${expectedReactivated} dormant users reactivated/mo, +${fmt$(recoveredRevenue)}/mo recovered revenue, +${targetReactivationPct}% dormant reactivation rate, payback 1-3 months.`,
        ai_recommendation: 'enable_push_notifications',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: PERSONALIZATION_MISSING
    if (config.requirePersonalization && (d.has_mobile_app || d.has_web_ordering) && (!d.has_personalization || d.recommendation_upsell_acceptance_pct < config.minPersonalizationAcceptancePct)) {
      // No order-history recommendations -> missed 25-30% upsell
      const monthlyMobileOrders = d.app_users_count > 0
        ? Math.round(d.monthly_mobile_revenue / Math.max(d.avg_mobile_ticket || baselineTicket, 1))
        : Math.round(d.monthly_revenue * 0.30 / baselineTicket);
      const targetUpsellAcceptance = targetPersonalizationUpsellPct; // 25-30%
      const upsellAcceptanceGap = Math.max(0, targetUpsellAcceptance - d.recommendation_upsell_acceptance_pct);
      const additionalUpsellOrders = Math.round(monthlyMobileOrders * (targetUpsellAcceptance / 100));
      const upsellRevenuePerOrder = 2.50; // avg upsell item value
      const recoveredRevenue = Math.round(additionalUpsellOrders * upsellRevenuePerOrder);
      const totalOpportunity = Math.max(recoveredRevenue, 200);
      const criticalNote = (!d.has_personalization)
        ? 'MEDIUM: PERSONALIZATION MISSING — app does NOT use order history to recommend items. Personalized recommendations increase upsell 25-30%. With ' + monthlyMobileOrders + ' monthly mobile orders, this is ' + additionalUpsellOrders + ' missed upsell opportunities/mo. '
        : 'LOW: personalization acceptance low — ' + d.recommendation_upsell_acceptance_pct + '% acceptance (target 25%+), ' + d.personalization_signals_count + ' signals used. ';
      alerts.push({
        rule_id: 'personalization_missing',
        severity: !d.has_personalization ? 'medium' : 'low',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_mobile_app: d.has_mobile_app,
        has_personalization: d.has_personalization,
        personalization_signals_count: d.personalization_signals_count,
        recommendation_upsell_acceptance_pct: d.recommendation_upsell_acceptance_pct,
        personalization_avg_ticket_lift_pct: d.personalization_avg_ticket_lift_pct,
        has_saved_favorites: d.has_saved_favorites,
        has_order_customization: d.has_order_customization,
        has_dietary_filters: d.has_dietary_filters,
        app_users_count: d.app_users_count,
        avg_mobile_ticket: d.avg_mobile_ticket,
        monthly_mobile_revenue: d.monthly_mobile_revenue,
        mobile_revenue_pct: d.mobile_revenue_pct,
        ticket_lift_projected_pct: targetPersonalizationUpsellPct,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `PERSONALIZATION MISSING: ${d.location_id} — app ${!d.has_personalization ? 'does NOT use order history to recommend items' : 'has personalization but acceptance is ' + d.recommendation_upsell_acceptance_pct + '% (target 25%+), only ' + d.personalization_signals_count + ' signals'}. ${criticalNote}Personalization is the highest-margin upsell lever because it uses data you already have. Industry data: personalized recommendations increase upsell 25-30% (McKinsey); 80% of customers are more likely to order from a brand that personalizes their experience (Epsilon); Amazon attributes 35% of revenue to personalized recommendations; Netflix attributes 75% of viewing to personalized recommendations; effective personalization signals: order history (most predictive), time-of-day (lunch vs dinner items), day-of-week (weekday vs weekend), weather (cold drinks on hot days), location (closest store), loyalty tier (premium items for high-tier); personalization engines cost $0-2k/mo depending on sophistication (rules-based $0, ML-based $1-2k/mo); payback 1-3 months on upsell lift alone. Solutions ranked by impact: (1) ADD "Order it again" section — show last 5 orders on home screen for 1-tap reorder; cost $0; (2) ADD "Recommended for you" carousel — ML model trained on order history; (3) ADD time-of-day personalization — breakfast items in morning, dinner items in evening; (4) ADD weather-based personalization — hot coffee on cold days, iced drinks on hot days; (5) ADD loyalty-tier personalization — premium items for high-tier members; (6) ADD "Customers also ordered" — collaborative filtering on item page; (7) ADD saved favorites — 1-tap reorder of saved orders; (8) ADD dietary filters — vegan / gluten-free / allergy-aware recommendations; (9) ADD smart upsell prompts — "add a drink for $2.50" based on order; (10) ADD personalized push — "your usual lunch order is ready to reorder"; (11) A/B test recommendation placement — home screen vs checkout; (12) MONITOR acceptance rate weekly — below 20% triggers algorithm audit. Industry data: 25-30% upsell lift from personalization (McKinsey); 80% more likely to order from personalized brand (Epsilon); 35% of Amazon revenue from personalization; 75% of Netflix viewing from personalization; $0-2k/mo personalization engine cost; payback 1-3 months. Expected impact: +${targetUpsellAcceptance}% upsell acceptance, +${additionalUpsellOrders} upsell orders/mo, +${fmt$(recoveredRevenue)}/mo recovered revenue, +${targetPersonalizationUpsellPct}% ticket lift, payback 1-3 months.`,
        ai_recommendation: 'add_personalization_engine',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: APP_RATING_LOW
    if (config.requireAppRating && (d.has_mobile_app || d.has_web_ordering) && d.app_store_rating > 0 && d.app_store_rating < config.minAppStoreRating) {
      // App store rating below 4.0 -> poor perception + lower downloads
      const ratingGap = Math.max(0, config.minAppStoreRating - d.app_store_rating);
      const downloadDeclinePct = ratingGap >= 1.0 ? 40 : ratingGap >= 0.5 ? 25 : 12;
      const churnFromBadReviews = d.app_users_count > 0 ? Math.round(d.app_users_count * 0.10) : 50;
      const recoveredDownloads = Math.round(churnFromBadReviews * (downloadDeclinePct / 100));
      const recoveredRevenue = recoveredDownloads * (d.avg_mobile_ticket || baselineTicket) * 2; // 2-mo LTV
      const totalOpportunity = Math.max(recoveredRevenue, 300);
      const criticalNote = (d.app_store_rating < 3.5)
        ? 'HIGH: APP STORE RATING LOW — rating is ' + d.app_store_rating + '/5 (target 4.0+) with ' + d.app_store_reviews_count + ' reviews, trend: ' + d.app_store_rating_trend + '. Apps rated below 3.5 see 50-70% lower downloads. '
        : 'MEDIUM: app store rating below threshold — ' + d.app_store_rating + '/5 (target 4.0+). ';
      alerts.push({
        rule_id: 'app_rating_low',
        severity: d.app_store_rating < 3.5 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_mobile_app: d.has_mobile_app,
        app_store_rating: d.app_store_rating,
        app_store_reviews_count: d.app_store_reviews_count,
        app_store_rating_trend: d.app_store_rating_trend,
        app_age_months: d.app_age_months,
        app_last_update_months: d.app_last_update_months,
        app_users_count: d.app_users_count,
        customer_satisfaction_mobile: d.customer_satisfaction_mobile,
        avg_mobile_ticket: d.avg_mobile_ticket,
        monthly_mobile_revenue: d.monthly_mobile_revenue,
        mobile_revenue_pct: d.mobile_revenue_pct,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `APP RATING LOW: ${d.location_id} — app store rating is ${d.app_store_rating}/5 (target 4.0+) with ${d.app_store_reviews_count} reviews, trend: ${d.app_store_rating_trend}. ${criticalNote}App store rating is the most visible signal of app quality. Industry data: apps rated below 4.0 see 25-40% lower download conversion (AppFigures); apps rated below 3.0 see 60-80% lower download conversion; 70% of users read at least 1 review before downloading (Apptentive); 1-star increase in rating correlates with 5-15% revenue lift (Sensor Tower); most common 1-star complaints: crashes (35%), slow (20%), login broken (15%), payment failed (10%), missing features (10%); last-update recency matters — apps not updated in 6+ months lose 15-20% download conversion; rating trend is more important than absolute rating — a 4.2 with downward trend signals active problems. Solutions ranked by impact: (1) FIX top 3 crash bugs — use Crashlytics / Sentry to identify; 1-star "crashes" reviews disappear within 2 weeks of fix; (2) FIX slow screens — measure with Firebase Performance / New Relic Mobile; target <2s screen load; (3) FIX login flow — most common 1-star cause after crashes; support Apple Sign In + Google Sign In + email + phone OTP; (4) FIX payment failures — test all payment methods weekly; (5) SHIP monthly app update — App Store ranking algorithm favors recently-updated apps; (6) RESPOND to all reviews — Apptentive data shows responding to reviews lifts rating 0.2-0.5 stars within 90 days; (7) PROMPT for review inside app — only show prompt after successful order (happy moment); (8) ADD in-app feedback channel — intercept negative feedback before it reaches App Store; (9) A/B test onboarding flow — bad onboarding = 1-star reviews; (10) LOCALIZE app store listing — translate title, description, screenshots; (11) UPDATE app store screenshots — refresh quarterly; (12) ADD app preview video — 15-30 second video drives 25-35% more downloads. Industry data: 25-40% lower download conversion below 4.0; 60-80% lower below 3.0; 70% read reviews before downloading; 1-star increase = 5-15% revenue lift; last-update recency matters (6+ months = 15-20% download decline); 0.2-0.5 star lift from responding to reviews within 90 days. Expected impact: +${ratingGap.toFixed(1)} star rating improvement, +${downloadDeclinePct}% download conversion recovery, +${recoveredDownloads} recovered users, +${fmt$(recoveredRevenue)}/mo recovered revenue, payback 1-6 months.`,
        ai_recommendation: 'improve_app_rating',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: PICKUP_EXPERIENCE_POOR
    if (config.requirePickupExperience && (d.has_mobile_app || d.has_web_ordering) && (d.has_order_ahead || d.has_mobile_payment) && (!d.has_designated_pickup_area || d.pickup_status_clarity_score < config.minPickupStatusClarity || d.pickup_avg_wait_min > 5 || d.pickup_abandonment_pct > 8)) {
      // Pickup process confusing (no designated area, unclear status) -> abandoned future orders
      const clarityGap = Math.max(0, config.minPickupStatusClarity - d.pickup_status_clarity_score);
      const abandonmentGap = Math.max(0, d.pickup_abandonment_pct - 5);
      const monthlyPickupOrders = d.app_users_count > 0
        ? Math.round(d.monthly_mobile_revenue / Math.max(d.avg_mobile_ticket || baselineTicket, 1))
        : Math.round(d.monthly_revenue * 0.30 / baselineTicket);
      const abandonedOrders = Math.round(monthlyPickupOrders * (abandonmentGap / 100));
      const churnedFutureOrders = Math.round(abandonedOrders * 3); // 3-month future-order impact
      const recoveredRevenue = (abandonedOrders + churnedFutureOrders) * (d.avg_mobile_ticket || baselineTicket);
      const totalOpportunity = Math.max(recoveredRevenue, 200);
      const criticalNote = (!d.has_designated_pickup_area)
        ? 'HIGH: PICKUP EXPERIENCE POOR — no designated mobile-order pickup area. Customers must wait in the same line as walk-ins, defeating the entire purpose of order-ahead. Pickup status clarity is ' + d.pickup_status_clarity_score + '/100 (target 90+). Avg pickup wait is ' + d.pickup_avg_wait_min + ' min (target <3 min). Abandonment rate is ' + d.pickup_abandonment_pct + '% (target <5%). '
        : 'MEDIUM: pickup status clarity low — score ' + d.pickup_status_clarity_score + '/100 (target 90+), wait ' + d.pickup_avg_wait_min + ' min, abandonment ' + d.pickup_abandonment_pct + '%. ';
      alerts.push({
        rule_id: 'pickup_experience_poor',
        severity: !d.has_designated_pickup_area || d.pickup_status_clarity_score < 50 ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_mobile_app: d.has_mobile_app,
        has_order_ahead: d.has_order_ahead,
        has_designated_pickup_area: d.has_designated_pickup_area,
        has_pickup_status_notifications: d.has_pickup_status_notifications,
        has_qr_pickup_checkin: d.has_qr_pickup_checkin,
        pickup_status_clarity_score: d.pickup_status_clarity_score,
        pickup_avg_wait_min: d.pickup_avg_wait_min,
        pickup_abandonment_pct: d.pickup_abandonment_pct,
        has_curbside_pickup: d.has_curbside_pickup,
        pickup_method_count: d.pickup_method_count,
        avg_mobile_ticket: d.avg_mobile_ticket,
        monthly_mobile_revenue: d.monthly_mobile_revenue,
        mobile_revenue_pct: d.mobile_revenue_pct,
        customer_satisfaction_mobile: d.customer_satisfaction_mobile,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `PICKUP EXPERIENCE POOR: ${d.location_id} — pickup process is confusing (designated pickup area: ${d.has_designated_pickup_area ? 'yes' : 'NO'}; status notifications: ${d.has_pickup_status_notifications ? 'yes' : 'NO'}; QR check-in: ${d.has_qr_pickup_checkin ? 'yes' : 'NO'}; clarity score: ${d.pickup_status_clarity_score}/100; avg wait: ${d.pickup_avg_wait_min} min; abandonment: ${d.pickup_abandonment_pct}%). ${criticalNote}Pickup experience is the make-or-break moment for mobile ordering loyalty. A bad pickup experience causes 60-70% of customers to abandon future mobile orders (NRA). Industry data: 60-70% of customers who had a bad pickup experience abandon future mobile orders (NRA); designated pickup area reduces pickup time from 8 min to 2 min (Toast Mobile benchmark); clear status notifications reduce "is my order ready" calls by 90%; QR check-in at pickup reduces avg wait from 7 min to 2 min; curbside pickup drives 30-40% higher mobile order frequency among suburban customers; pickup abandonment above 5% indicates systemic problems; pickup wait above 5 min triggers 25% no-show rate. Solutions ranked by impact: (1) DEPLOY designated pickup area — separate counter or shelf labeled "Mobile Orders"; cost $200-500 signage + shelf; (2) ADD pickup status notifications — push: "Order received", "Preparing", "Ready for pickup", "Handed off"; cost $0; (3) ADD QR check-in — customer scans QR code at restaurant, staff notified "Customer in parking spot 3"; cost $0-200; (4) ADD curbside pickup — designated parking spots, "I am here" button in app, staff delivers to car; cost $200-500 signage; (5) SET pickup time window enforcement — 15-min window; reject orders outside window; (6) ADD named greeter at pickup — staff member assigned to mobile orders during peak; (7) ADD pickup instructions in-app — parking spot #, entrance #, counter #; (8) ADD temperature-controlled holding — heated shelf for hot items, refrigerated for cold; (9) MONITOR pickup wait time weekly — above 5 min triggers staffing audit; (10) SURVEY pickup customers — 1-question "How was pickup today?" via push 30 min after; (11) TRACK pickup abandonment rate — above 5% triggers process audit; (12) ADD pickup countdown in-app — "Your order will be ready in 4 minutes". Industry data: 60-70% abandon future mobile orders after bad pickup (NRA); 8 min to 2 min pickup time with designated area (Toast); 90% reduction in "is order ready" calls with status notifications; 7 min to 2 min with QR check-in; 30-40% higher mobile order frequency from curbside; 25% no-show rate above 5 min wait. Expected impact: +${clarityGap} clarity score improvement, -${abandonmentGap}% pickup abandonment, +${abandonedOrders} recovered orders/mo, +${fmt$(recoveredRevenue)}/mo recovered revenue (incl. future-order retention), payback 1-3 months.`,
        ai_recommendation: 'redesign_pickup_experience',
        status: 'open', detected_at: now,
      });
    }
  }

  // AI insights via OpenAI
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat({
            messages: [
              { role: 'system', content: 'You are a restaurant mobile app and ordering experience optimization expert. Given mobile app data, recommend ONE specific action with expected ticket lift, retention lift, reactivation rate, or checkout speedup (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Tier: ${a.restaurant_tier ?? 'n/a'}. Market: ${a.market_setting ?? 'n/a'}. Has mobile app: ${a.has_mobile_app ?? false}. Has web ordering: ${a.has_web_ordering ?? false}. App platforms: ${(a.app_platforms ?? []).join(',')}. App vendor: ${a.app_vendor ?? 'n/a'}. App age months: ${a.app_age_months ?? 0}. Last update months: ${a.app_last_update_months ?? 0}. App store rating: ${a.app_store_rating ?? 0}/5. Reviews: ${a.app_store_reviews_count ?? 0}. Rating trend: ${a.app_store_rating_trend ?? 'n/a'}. Order-ahead: ${a.has_order_ahead ?? false}. Avg lead time: ${a.order_ahead_avg_lead_time_min ?? 0} min. Pickup window: ${a.has_pickup_window ?? false}. Curbside: ${a.has_curbside_pickup ?? false}. Delivery via app: ${a.has_delivery_via_app ?? false}. Pickup methods: ${a.pickup_method_count ?? 0}. Mobile payment: ${a.has_mobile_payment ?? false}. Payment methods: ${a.mobile_payment_methods_count ?? 0}. Apple Pay: ${a.accepts_apple_pay ?? false}. Google Pay: ${a.accepts_google_pay ?? false}. Stored credit: ${a.accepts_stored_credit ?? false}. Gift card balance: ${a.accepts_gift_card_balance ?? false}. Loyalty redemption: ${a.accepts_loyalty_redemption ?? false}. Loyalty integration: ${a.has_loyalty_integration ?? false}. Loyalty members in app: ${a.loyalty_members_in_app ?? 0}. Loyalty share: ${a.loyalty_share_of_app_users_pct ?? 0}%. Push: ${a.has_push_notifications ?? false}. Push active: ${a.push_notifications_active_count ?? 0}. Push opt-in: ${a.push_opt_in_rate_pct ?? 0}%. Push CTR: ${a.push_ctr_pct ?? 0}%. Dormant reactivation: ${a.dormant_reactivation_pct ?? 0}%. Personalization: ${a.has_personalization ?? false}. Signals: ${a.personalization_signals_count ?? 0}. Recommendation acceptance: ${a.recommendation_upsell_acceptance_pct ?? 0}%. Ticket lift from personalization: ${a.personalization_avg_ticket_lift_pct ?? 0}%. Order customization: ${a.has_order_customization ?? false}. Customization options: ${a.customization_options_count ?? 0}. Dietary filters: ${a.has_dietary_filters ?? false}. Saved favorites: ${a.has_saved_favorites ?? false}. Pickup status notifications: ${a.has_pickup_status_notifications ?? false}. Designated pickup area: ${a.has_designated_pickup_area ?? false}. QR check-in: ${a.has_qr_pickup_checkin ?? false}. Pickup clarity: ${a.pickup_status_clarity_score ?? 0}/100. Pickup wait: ${a.pickup_avg_wait_min ?? 0} min. Pickup abandonment: ${a.pickup_abandonment_pct ?? 0}%. App users: ${a.app_users_count ?? 0}. Power users top 10%: ${a.power_user_top10pct ?? 0}. Power user revenue share: ${a.power_user_revenue_share_pct ?? 0}%. Power user orders/mo: ${a.power_user_orders_monthly ?? 0}. App dormant 30d: ${a.app_dormant_30d ?? 0}. Mobile revenue: ${fmt$(a.monthly_mobile_revenue ?? 0)}/mo (${a.mobile_revenue_pct ?? 0}% of total). Avg mobile ticket: ${fmt$(a.avg_mobile_ticket ?? 0)}. Avg cashier ticket: ${fmt$(a.avg_cashier_ticket ?? 0)}. Mobile ticket lift: ${a.mobile_ticket_lift_pct ?? 0}%. Mobile checkout time: ${a.mobile_checkout_time_sec ?? 0} sec. Cashier checkout: ${a.cashier_checkout_time_sec ?? 0} sec. Checkout speedup: ${a.checkout_speedup_pct ?? 0}%. Perceived wait reduction: ${a.perceived_wait_reduction_pct ?? 0}%. 18-44 customers %: ${a.pct_18_44_customers ?? 0}. CSAT mobile: ${a.customer_satisfaction_mobile ?? 0}. CSAT cashier: ${a.customer_satisfaction_cashier ?? 0}. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. App dev cost: ${fmt$(a.app_dev_cost ?? 0)}. App monthly cost: ${fmt$(a.app_monthly_cost ?? 0)}/mo. Processing %: ${a.app_payment_processing_pct ?? 0}%. Push platform: ${fmt$(a.push_platform_monthly ?? 0)}/mo. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
            ],
            task: 'reporting',
          });
          const text = typeof response === 'string'
            ? response
            : (response as any)?.choices?.[0]?.message?.content ?? '';
          a.ai_insight = String(text).slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  // Persist alerts
  try {
    await db.query(`DELETE FROM mobile_app_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE mobile_app_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveMobileAppOrderingAlerts = async (db: ReturnType<typeof useDB>): Promise<MobileAppOrderingAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM mobile_app_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getMobileAppOrderingSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  noAppCount: number; noPaymentCount: number; noLoyaltyCount: number; noPushCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'mobile_app_absent') AS noapp,
              math::count(rule_id = 'mobile_payment_absent') AS nopayment,
              math::count(rule_id = 'loyalty_integration_missing') AS noloyalty,
              math::count(rule_id = 'push_notifications_absent') AS nopush
       FROM mobile_app_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      noAppCount: safeNumber(r.noapp, 0),
      noPaymentCount: safeNumber(r.nopayment, 0),
      noLoyaltyCount: safeNumber(r.noloyalty, 0),
      noPushCount: safeNumber(r.nopush, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noAppCount: 0, noPaymentCount: 0, noLoyaltyCount: 0, noPushCount: 0 };
  }
};

export const updateMobileAppOrderingAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
