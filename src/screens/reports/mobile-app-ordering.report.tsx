/**
 * AI Mobile App & Ordering Experience Optimizer — predicts how mobile app and
 * mobile ordering experience (app availability, order-ahead, mobile payment,
 * loyalty integration, push notifications, personalization, order customization,
 * pickup vs delivery, app store ratings, feature adoption) impacts customer
 * acquisition, retention, average ticket, and operational efficiency.
 *
 * 182nd POSR-exclusive differentiator.
 */

import { useState, useCallback, useMemo } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import { DocumentTitle } from "@/components/common/document-title.tsx";
import { Layout } from "@/screens/partials/layout.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMobileScreenButton, faRotate, faBagShopping, faCreditCard, faStar,
  faBell, faUser, faStarHalfStroke, faHandPointer,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runMobileAppOrderingEngine, getActiveMobileAppOrderingAlerts, getMobileAppOrderingSummary,
  updateMobileAppOrderingAlertStatus, readMobileAppOrderingConfig, DEFAULT_MOBILE_APP_ORDERING_CONFIG,
  type MobileAppOrderingAlert,
} from "@/lib/mobile-app-ordering.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  mobile_app_absent:              { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faMobileScreenButton, label: 'NO MOBILE APP' },
  order_ahead_missing:            { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faBagShopping,        label: 'NO ORDER-AHEAD' },
  mobile_payment_absent:          { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faCreditCard,         label: 'NO MOBILE PAY' },
  loyalty_integration_missing:    { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faStar,               label: 'NO LOYALTY' },
  push_notifications_absent:      { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faBell,               label: 'NO PUSH' },
  personalization_missing:        { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faUser,               label: 'NO PERSONALIZATION' },
  app_rating_low:                 { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faStarHalfStroke,     label: 'LOW RATING' },
  pickup_experience_poor:         { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faHandPointer,        label: 'POOR PICKUP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function MobileAppOrderingScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<MobileAppOrderingAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noAppCount: 0, noPaymentCount: 0, noLoyaltyCount: 0, noPushCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MOBILE_APP_ORDERING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMobileAppOrderingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveMobileAppOrderingAlerts(db), getMobileAppOrderingSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[mobile-app-ordering-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMobileAppOrderingEngine(db, config);
      toast.success(`Analyzed ${result.generated} mobile app + ordering signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[mobile-app-ordering-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateMobileAppOrderingAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[mobile-app-ordering-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_opportunity ?? 0) - (a.est_monthly_opportunity ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Mobile App & Ordering Experience Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faMobileScreenButton} className="text-violet-600" />
              AI Mobile App &amp; Ordering Experience Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how mobile app + ordering experience (app availability, order-ahead, mobile payment, loyalty integration, push notifications, personalization, order customization, pickup vs delivery, app store ratings, feature adoption) impacts customer acquisition + retention + ticket size + operational efficiency — mobile ordering increases ticket 20-25%; order-ahead reduces perceived wait 50-60%; 72% of 18-44 prefer mobile ordering (NRA); mobile payment 83% faster checkout (90s to 15s); push notifications reactivate 15-20% dormant; loyalty integration 35% higher retention; personalization 25-30% upsell; 40% of mobile orders from top 10% power users
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faMobileScreenButton} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze mobile app'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faMobileScreenButton} label="No mobile app" value={String(summary.noAppCount)} color={summary.noAppCount > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faCreditCard} label="No mobile pay" value={String(summary.noPaymentCount)} color={summary.noPaymentCount > 0 ? 'text-orange-600' : 'text-emerald-600'} />
          <SummaryCard icon={faStar} label="No loyalty" value={String(summary.noLoyaltyCount)} color={summary.noLoyaltyCount > 0 ? 'text-violet-600' : 'text-emerald-600'} />
          <SummaryCard icon={faBell} label="No push" value={String(summary.noPushCount)} color={summary.noPushCount > 0 ? 'text-sky-600' : 'text-emerald-600'} />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faMobileScreenButton} spin className="text-4xl mb-3" />
            <p>Analyzing mobile app + ordering experience opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No mobile app / ordering alerts</p>
            <p className="text-sm mt-1">Native iOS + Android app deployed with 4.0+ store rating, order-ahead with scheduled pickup + curbside + delivery, in-app mobile payment (Apple Pay, Google Pay, stored credit, gift card, loyalty redemption), loyalty program connected with 60%+ app-user loyalty share, push notifications with 50%+ opt-in and 15-20% dormant reactivation, personalization engine with 25-30% recommendation acceptance, order customization + dietary filters + saved favorites, designated pickup area with status notifications and QR check-in.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faMobileScreenButton, label: alert.rule_id.toUpperCase() };
              return (
                <div key={alert.id ?? idx} className="border border-neutral-200 rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${style.bg} ${style.text} shrink-0`}>
                        <FontAwesomeIcon icon={style.icon} />
                        {style.label}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {alert.location_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.location_id}</span>
                          )}
                          {alert.restaurant_tier && (
                            <span className="text-xs text-neutral-500">{alert.restaurant_tier}</span>
                          )}
                          {alert.market_setting && (
                            <span className="text-xs text-neutral-500">{alert.market_setting}</span>
                          )}
                          {alert.has_mobile_app != null && (
                            <span className={`text-xs ${alert.has_mobile_app ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_mobile_app ? 'app yes' : 'NO app'}</span>
                          )}
                          {alert.has_web_ordering != null && (
                            <span className={`text-xs ${alert.has_web_ordering ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.has_web_ordering ? 'web yes' : 'no web'}</span>
                          )}
                          {alert.app_platforms && alert.app_platforms.length > 0 && (
                            <span className="text-xs text-neutral-500">{alert.app_platforms.join(', ')}</span>
                          )}
                          {alert.app_platforms_count != null && alert.app_platforms_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.app_platforms_count} platforms</span>
                          )}
                          {alert.app_vendor && (
                            <span className="text-xs text-neutral-500">{alert.app_vendor}</span>
                          )}
                          {alert.app_age_months != null && alert.app_age_months > 0 && (
                            <span className="text-xs text-neutral-500">{alert.app_age_months}mo old</span>
                          )}
                          {alert.app_last_update_months != null && alert.app_last_update_months > 0 && (
                            <span className={`text-xs ${alert.app_last_update_months > 6 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>updated {alert.app_last_update_months}mo ago</span>
                          )}
                          {alert.app_store_rating != null && alert.app_store_rating > 0 && (
                            <span className={`text-xs ${alert.app_store_rating < 4.0 ? 'text-rose-600 font-medium' : alert.app_store_rating < 4.5 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.app_store_rating}/5 rating</span>
                          )}
                          {alert.app_store_reviews_count != null && alert.app_store_reviews_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.app_store_reviews_count} reviews</span>
                          )}
                          {alert.app_store_rating_trend && (
                            <span className={`text-xs ${alert.app_store_rating_trend === 'down' ? 'text-rose-600 font-medium' : alert.app_store_rating_trend === 'up' ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>trend: {alert.app_store_rating_trend}</span>
                          )}
                          {alert.has_order_ahead != null && (
                            <span className={`text-xs ${alert.has_order_ahead ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_order_ahead ? 'order-ahead yes' : 'NO order-ahead'}</span>
                          )}
                          {alert.order_ahead_avg_lead_time_min != null && alert.order_ahead_avg_lead_time_min > 0 && (
                            <span className="text-xs text-neutral-500">{alert.order_ahead_avg_lead_time_min} min lead</span>
                          )}
                          {alert.has_pickup_window != null && (
                            <span className={`text-xs ${alert.has_pickup_window ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.has_pickup_window ? 'pickup window' : 'no window'}</span>
                          )}
                          {alert.has_curbside_pickup != null && (
                            <span className={`text-xs ${alert.has_curbside_pickup ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.has_curbside_pickup ? 'curbside yes' : 'no curbside'}</span>
                          )}
                          {alert.has_delivery_via_app != null && (
                            <span className={`text-xs ${alert.has_delivery_via_app ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.has_delivery_via_app ? 'delivery yes' : 'no delivery'}</span>
                          )}
                          {alert.pickup_method_count != null && alert.pickup_method_count > 0 && (
                            <span className={`text-xs ${alert.pickup_method_count < 2 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.pickup_method_count} pickup methods</span>
                          )}
                          {alert.has_mobile_payment != null && (
                            <span className={`text-xs ${alert.has_mobile_payment ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_mobile_payment ? 'mobile pay yes' : 'NO mobile pay'}</span>
                          )}
                          {alert.mobile_payment_methods_count != null && alert.mobile_payment_methods_count > 0 && (
                            <span className={`text-xs ${alert.mobile_payment_methods_count < 3 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.mobile_payment_methods_count}/5 pay methods</span>
                          )}
                          {alert.accepts_apple_pay != null && (
                            <span className={`text-xs ${alert.accepts_apple_pay ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.accepts_apple_pay ? 'Apple Pay' : 'NO Apple Pay'}</span>
                          )}
                          {alert.accepts_google_pay != null && (
                            <span className={`text-xs ${alert.accepts_google_pay ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.accepts_google_pay ? 'Google Pay' : 'NO Google Pay'}</span>
                          )}
                          {alert.accepts_stored_credit != null && (
                            <span className={`text-xs ${alert.accepts_stored_credit ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.accepts_stored_credit ? 'stored card' : 'no stored card'}</span>
                          )}
                          {alert.accepts_gift_card_balance != null && (
                            <span className={`text-xs ${alert.accepts_gift_card_balance ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.accepts_gift_card_balance ? 'gift card yes' : 'no GC balance'}</span>
                          )}
                          {alert.accepts_loyalty_redemption != null && (
                            <span className={`text-xs ${alert.accepts_loyalty_redemption ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.accepts_loyalty_redemption ? 'loyalty redemption' : 'no redemption'}</span>
                          )}
                          {alert.has_loyalty_integration != null && (
                            <span className={`text-xs ${alert.has_loyalty_integration ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_loyalty_integration ? 'loyalty yes' : 'NO loyalty'}</span>
                          )}
                          {alert.loyalty_members_in_app != null && alert.loyalty_members_in_app > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.loyalty_members_in_app} loyalty members</span>
                          )}
                          {alert.loyalty_share_of_app_users_pct != null && alert.loyalty_share_of_app_users_pct > 0 && (
                            <span className={`text-xs ${alert.loyalty_share_of_app_users_pct < 60 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.loyalty_share_of_app_users_pct}% loyalty share</span>
                          )}
                          {alert.has_push_notifications != null && (
                            <span className={`text-xs ${alert.has_push_notifications ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_push_notifications ? 'push yes' : 'NO push'}</span>
                          )}
                          {alert.push_notifications_active_count != null && alert.push_notifications_active_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.push_notifications_active_count} push campaigns</span>
                          )}
                          {alert.push_opt_in_rate_pct != null && alert.push_opt_in_rate_pct > 0 && (
                            <span className={`text-xs ${alert.push_opt_in_rate_pct < 50 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.push_opt_in_rate_pct}% opt-in</span>
                          )}
                          {alert.push_ctr_pct != null && alert.push_ctr_pct > 0 && (
                            <span className={`text-xs ${alert.push_ctr_pct < 5 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.push_ctr_pct}% CTR</span>
                          )}
                          {alert.dormant_reactivation_pct != null && alert.dormant_reactivation_pct > 0 && (
                            <span className={`text-xs ${alert.dormant_reactivation_pct < 15 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.dormant_reactivation_pct}% reactivated</span>
                          )}
                          {alert.has_personalization != null && (
                            <span className={`text-xs ${alert.has_personalization ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_personalization ? 'personalization yes' : 'NO personalization'}</span>
                          )}
                          {alert.personalization_signals_count != null && alert.personalization_signals_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.personalization_signals_count} signals</span>
                          )}
                          {alert.recommendation_upsell_acceptance_pct != null && alert.recommendation_upsell_acceptance_pct > 0 && (
                            <span className={`text-xs ${alert.recommendation_upsell_acceptance_pct < 25 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.recommendation_upsell_acceptance_pct}% acceptance</span>
                          )}
                          {alert.personalization_avg_ticket_lift_pct != null && alert.personalization_avg_ticket_lift_pct > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">+{alert.personalization_avg_ticket_lift_pct}% ticket lift</span>
                          )}
                          {alert.has_order_customization != null && (
                            <span className={`text-xs ${alert.has_order_customization ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.has_order_customization ? 'customization yes' : 'no customization'}</span>
                          )}
                          {alert.customization_options_count != null && alert.customization_options_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.customization_options_count} options</span>
                          )}
                          {alert.has_dietary_filters != null && (
                            <span className={`text-xs ${alert.has_dietary_filters ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.has_dietary_filters ? 'diet filters' : 'no diet filters'}</span>
                          )}
                          {alert.has_saved_favorites != null && (
                            <span className={`text-xs ${alert.has_saved_favorites ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.has_saved_favorites ? 'favorites yes' : 'no favorites'}</span>
                          )}
                          {alert.has_pickup_status_notifications != null && (
                            <span className={`text-xs ${alert.has_pickup_status_notifications ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_pickup_status_notifications ? 'status push yes' : 'NO status push'}</span>
                          )}
                          {alert.has_designated_pickup_area != null && (
                            <span className={`text-xs ${alert.has_designated_pickup_area ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_designated_pickup_area ? 'pickup area yes' : 'NO pickup area'}</span>
                          )}
                          {alert.has_qr_pickup_checkin != null && (
                            <span className={`text-xs ${alert.has_qr_pickup_checkin ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.has_qr_pickup_checkin ? 'QR check-in' : 'no QR check-in'}</span>
                          )}
                          {alert.pickup_status_clarity_score != null && alert.pickup_status_clarity_score > 0 && (
                            <span className={`text-xs ${alert.pickup_status_clarity_score < 60 ? 'text-rose-600 font-medium' : alert.pickup_status_clarity_score < 90 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>clarity {alert.pickup_status_clarity_score}/100</span>
                          )}
                          {alert.pickup_avg_wait_min != null && alert.pickup_avg_wait_min > 0 && (
                            <span className={`text-xs ${alert.pickup_avg_wait_min > 5 ? 'text-rose-600 font-medium' : alert.pickup_avg_wait_min > 3 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.pickup_avg_wait_min} min wait</span>
                          )}
                          {alert.pickup_abandonment_pct != null && alert.pickup_abandonment_pct > 0 && (
                            <span className={`text-xs ${alert.pickup_abandonment_pct > 8 ? 'text-rose-600 font-medium' : alert.pickup_abandonment_pct > 5 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.pickup_abandonment_pct}% abandon</span>
                          )}
                          {alert.app_users_count != null && alert.app_users_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.app_users_count} users</span>
                          )}
                          {alert.power_user_top10pct != null && alert.power_user_top10pct > 0 && (
                            <span className="text-xs text-violet-600 font-medium">{alert.power_user_top10pct} power users</span>
                          )}
                          {alert.power_user_revenue_share_pct != null && alert.power_user_revenue_share_pct > 0 && (
                            <span className={`text-xs ${alert.power_user_revenue_share_pct < 40 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.power_user_revenue_share_pct}% power user rev</span>
                          )}
                          {alert.power_user_orders_monthly != null && alert.power_user_orders_monthly > 0 && (
                            <span className="text-xs text-neutral-500">{alert.power_user_orders_monthly} power orders/mo</span>
                          )}
                          {alert.app_dormant_30d != null && alert.app_dormant_30d > 0 && (
                            <span className={`text-xs ${alert.app_dormant_30d > 1000 ? 'text-rose-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.app_dormant_30d} dormant 30d</span>
                          )}
                          {alert.avg_mobile_ticket != null && alert.avg_mobile_ticket > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.avg_mobile_ticket} mobile ticket</span>
                          )}
                          {alert.avg_cashier_ticket != null && alert.avg_cashier_ticket > 0 && (
                            <span className="text-xs text-neutral-500">${alert.avg_cashier_ticket} cashier ticket</span>
                          )}
                          {alert.mobile_ticket_lift_pct != null && alert.mobile_ticket_lift_pct > 0 && (
                            <span className={`text-xs ${alert.mobile_ticket_lift_pct < 20 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>+{alert.mobile_ticket_lift_pct}% mobile lift</span>
                          )}
                          {alert.mobile_checkout_time_sec != null && alert.mobile_checkout_time_sec > 0 && (
                            <span className={`text-xs ${alert.mobile_checkout_time_sec > 30 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.mobile_checkout_time_sec}s mobile checkout</span>
                          )}
                          {alert.cashier_checkout_time_sec != null && alert.cashier_checkout_time_sec > 0 && (
                            <span className="text-xs text-neutral-500">{alert.cashier_checkout_time_sec}s cashier</span>
                          )}
                          {alert.checkout_speedup_pct != null && alert.checkout_speedup_pct > 0 && (
                            <span className={`text-xs ${alert.checkout_speedup_pct < 50 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>-{alert.checkout_speedup_pct}% checkout time</span>
                          )}
                          {alert.perceived_wait_reduction_pct != null && alert.perceived_wait_reduction_pct > 0 && (
                            <span className={`text-xs ${alert.perceived_wait_reduction_pct < 50 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>-{alert.perceived_wait_reduction_pct}% perceived wait</span>
                          )}
                          {alert.pct_18_44_customers != null && alert.pct_18_44_customers > 0 && (
                            <span className={`text-xs ${alert.pct_18_44_customers < 50 ? 'text-neutral-500' : 'text-violet-600 font-medium'}`}>{alert.pct_18_44_customers}% 18-44</span>
                          )}
                          {alert.customer_satisfaction_mobile != null && alert.customer_satisfaction_mobile > 0 && (
                            <span className={`text-xs ${alert.customer_satisfaction_mobile < 75 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.customer_satisfaction_mobile}/100 mobile CSAT</span>
                          )}
                          {alert.customer_satisfaction_cashier != null && alert.customer_satisfaction_cashier > 0 && (
                            <span className="text-xs text-neutral-500">{alert.customer_satisfaction_cashier}/100 cashier CSAT</span>
                          )}
                          {alert.monthly_mobile_revenue != null && alert.monthly_mobile_revenue > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.monthly_mobile_revenue}/mo mobile rev</span>
                          )}
                          {alert.mobile_revenue_pct != null && alert.mobile_revenue_pct > 0 && (
                            <span className={`text-xs ${alert.mobile_revenue_pct < 30 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.mobile_revenue_pct}% via mobile</span>
                          )}
                          {alert.app_dev_cost != null && alert.app_dev_cost > 0 && (
                            <span className="text-xs text-neutral-500">${alert.app_dev_cost} dev cost</span>
                          )}
                          {alert.app_monthly_cost != null && alert.app_monthly_cost > 0 && (
                            <span className="text-xs text-neutral-500">${alert.app_monthly_cost}/mo platform</span>
                          )}
                          {alert.app_payment_processing_pct != null && alert.app_payment_processing_pct > 0 && (
                            <span className="text-xs text-neutral-500">{alert.app_payment_processing_pct}% processing</span>
                          )}
                          {alert.push_platform_monthly != null && alert.push_platform_monthly > 0 && (
                            <span className="text-xs text-neutral-500">${alert.push_platform_monthly}/mo push</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.ticket_lift_projected_pct != null && alert.ticket_lift_projected_pct > 0 && (
                            <span className="text-emerald-600">+{alert.ticket_lift_projected_pct}% ticket lift (target)</span>
                          )}
                          {alert.retention_lift_projected_pct != null && alert.retention_lift_projected_pct > 0 && (
                            <span className="text-emerald-600">+{alert.retention_lift_projected_pct}% retention lift (target)</span>
                          )}
                          {alert.dormant_reactivation_projected != null && alert.dormant_reactivation_projected > 0 && (
                            <span className="text-emerald-600">+{alert.dormant_reactivation_projected} dormant reactivated (target)</span>
                          )}
                          {alert.checkout_speedup_projected_pct != null && alert.checkout_speedup_projected_pct > 0 && (
                            <span className="text-emerald-600">-{alert.checkout_speedup_projected_pct}% checkout time (target)</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct > 0 && (
                            <span className="text-emerald-600">{alert.predicted_revenue_change_pct}% total revenue</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faMobileScreenButton} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo opportunity</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Action taken
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> In progress
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300 text-neutral-500" onClick={() => alert.id && handleStatus(alert.id, 'rejected')}>
                      Skip
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Mobile app: <span className={config.requireMobileApp ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMobileApp ? 'required' : 'optional'}</span></span>
          <span>Order-ahead: <span className={config.requireOrderAhead ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireOrderAhead ? 'required' : 'optional'}</span></span>
          <span>Mobile payment: <span className={config.requireMobilePayment ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMobilePayment ? 'required' : 'optional'}</span></span>
          <span>Loyalty integration: <span className={config.requireLoyaltyIntegration ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireLoyaltyIntegration ? 'required' : 'optional'}</span></span>
          <span>Push notifications: <span className={config.requirePushNotifications ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePushNotifications ? 'required' : 'optional'}</span></span>
          <span>Personalization: <span className={config.requirePersonalization ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePersonalization ? 'required' : 'optional'}</span></span>
          <span>App rating: <span className={config.requireAppRating ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireAppRating ? 'required' : 'optional'}</span></span>
          <span>Pickup experience: <span className={config.requirePickupExperience ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePickupExperience ? 'required' : 'optional'}</span></span>
          <span>Min app rating: {config.minAppStoreRating.toFixed(1)}</span>
          <span>Min payment methods: {config.minMobilePaymentMethods}</span>
          <span>Min push opt-in: {config.minPushOptInPct}%</span>
          <span>Min personalization acceptance: {config.minPersonalizationAcceptancePct}%</span>
          <span>Min pickup clarity: {config.minPickupStatusClarity}/100</span>
          <span>Min mobile ticket lift: {config.minMobileTicketLiftPct}%</span>
          <span>Min checkout speedup: {config.minCheckoutSpeedupPct}%</span>
          <span>Min perceived wait reduction: {config.minPerceivedWaitReductionPct}%</span>
          <span className="text-neutral-400">182nd POSR-exclusive differentiator</span>
        </div>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4 flex items-center gap-3">
      <FontAwesomeIcon icon={icon} className={`text-2xl ${color}`} />
      <div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </div>
  );
}

export default MobileAppOrderingScreen;
