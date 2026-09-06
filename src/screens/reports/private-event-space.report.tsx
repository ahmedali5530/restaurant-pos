/**
 * AI Private Event Space & Booking Optimizer — predicts how private event
 * space (private room availability, booking utilization, pricing strategy,
 * minimum spend, capacity optimization, event type matching, seasonal
 * demand, catering integration, AV equipment) impacts restaurant revenue,
 * profit margin, and capacity utilization.
 *
 * 177th POSR-exclusive differentiator.
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
  faCalendarCheck, faRotate, faUsers, faBriefcase, faCakeCandles,
  faBuilding, faDoorClosed, faChartLine, faDisplay, faRing,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runPrivateEventEngine, getActivePrivateEventAlerts, getPrivateEventSummary,
  updatePrivateEventAlertStatus, readPrivateEventConfig, DEFAULT_PRIVATE_EVENT_CONFIG,
  type PrivateEventAlert,
} from "@/lib/private-event-space.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  private_space_underutilized:      { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faCalendarCheck,  label: 'UNDERUTILIZED' },
  minimum_spend_underpriced:        { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faRing,           label: 'UNDERPRICED' },
  event_type_mismatch_capacity:     { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faBriefcase,      label: 'CAPACITY MISMATCH' },
  seasonal_demand_not_anticipated:  { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faChartLine,      label: 'NO SEASONAL PRICING' },
  av_equipment_missing:             { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faDisplay,        label: 'AV MISSING' },
  catering_package_not_optimized:   { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faCakeCandles,    label: 'NO TIERED CATERING' },
  online_booking_absent:            { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faBuilding,       label: 'NO ONLINE BOOKING' },
  private_space_design_poor:        { bg: 'bg-red-50',      text: 'text-red-700',      icon: faDoorClosed,     label: 'POOR DESIGN' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function PrivateEventSpaceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<PrivateEventAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, underutilizedCount: 0, underpricedCount: 0, missingAvCount: 0, noOnlineBookingCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PRIVATE_EVENT_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPrivateEventConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActivePrivateEventAlerts(db), getPrivateEventSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[private-event-space-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPrivateEventEngine(db, config);
      toast.success(`Analyzed ${result.generated} private event space + booking signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[private-event-space-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updatePrivateEventAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[private-event-space-report] status failed', err);
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
      <DocumentTitle parts={["AI Private Event Space & Booking Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarCheck} className="text-sky-600" />
              AI Private Event Space &amp; Booking Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how private event space (room availability, booking utilization, pricing strategy, minimum spend, capacity optimization, event type matching, seasonal demand, catering integration, AV equipment) impacts restaurant revenue + capacity utilization — private events generate 25-40% additional revenue (Cvent); avg $2,500-8,000/event; underutilized rooms lose $5,000-15,000/mo; 30% underprice minimum spend; Dec+Jun = 40% annual event revenue; online booking = 35% more inquiries (OpenTable Private Dining); $50B+ private events market
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faCalendarCheck} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze event space'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faCalendarCheck} label="Underutilized rooms" value={String(summary.underutilizedCount)} color={summary.underutilizedCount > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faRing} label="Min spend underpriced" value={String(summary.underpricedCount)} color={summary.underpricedCount > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faDisplay} label="Missing AV equipment" value={String(summary.missingAvCount)} color={summary.missingAvCount > 0 ? 'text-sky-600' : 'text-emerald-600'} />
          <SummaryCard icon={faBuilding} label="No online booking" value={String(summary.noOnlineBookingCount)} color={summary.noOnlineBookingCount > 0 ? 'text-fuchsia-600' : 'text-emerald-600'} />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCalendarCheck} spin className="text-4xl mb-3" />
            <p>Analyzing private event space + booking opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No private event space / booking alerts</p>
            <p className="text-sm mt-1">Private room utilized 60%+ of nights, minimum spend at market rate, room capacity matches top event type, seasonal pricing active for Dec/Jun peaks, AV equipment installed for corporate events, tiered catering packages offered, online booking tool deployed, room design quality high (acoustics + lighting + privacy).</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faCalendarCheck, label: alert.rule_id.toUpperCase() };
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
                          {alert.private_room_count != null && alert.private_room_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.private_room_count} room(s)</span>
                          )}
                          {alert.private_room_capacity_max != null && alert.private_room_capacity_max > 0 && (
                            <span className={`text-xs ${alert.private_room_capacity_max < 20 ? 'text-amber-600 font-medium' : alert.private_room_capacity_max >= 50 ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>cap {alert.private_room_capacity_max}</span>
                          )}
                          {alert.private_room_sqft != null && alert.private_room_sqft > 0 && (
                            <span className="text-xs text-neutral-500">{alert.private_room_sqft} sqft</span>
                          )}
                          {alert.booking_utilization_pct != null && (
                            <span className={`text-xs ${alert.booking_utilization_pct < 25 ? 'text-rose-600 font-medium' : alert.booking_utilization_pct < 40 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.booking_utilization_pct}% utilized</span>
                          )}
                          {alert.nights_booked_per_month != null && alert.nights_available_per_month != null && (
                            <span className="text-xs text-neutral-500">{alert.nights_booked_per_month}/{alert.nights_available_per_month} nights</span>
                          )}
                          {alert.minimum_spend_per_event != null && alert.minimum_spend_per_event > 0 && (
                            <span className={`text-xs ${alert.market_rate_minimum_spend != null && alert.market_rate_minimum_spend > alert.minimum_spend_per_event * 1.15 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>min ${alert.minimum_spend_per_event}</span>
                          )}
                          {alert.market_rate_minimum_spend != null && alert.market_rate_minimum_spend > 0 && (
                            <span className="text-xs text-neutral-500">market ${alert.market_rate_minimum_spend}</span>
                          )}
                          {alert.avg_event_revenue != null && alert.avg_event_revenue > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.avg_event_revenue}/event</span>
                          )}
                          {alert.top_event_type && (
                            <span className={`text-xs ${alert.top_event_type === 'corporate' ? 'text-sky-600 font-medium' : alert.top_event_type === 'wedding' ? 'text-fuchsia-600 font-medium' : 'text-neutral-500'}`}>{alert.top_event_type}</span>
                          )}
                          {alert.corporate_event_pct != null && alert.corporate_event_pct > 0 && (
                            <span className="text-xs text-neutral-500">{alert.corporate_event_pct}% corp</span>
                          )}
                          {alert.seasonal_pricing_active != null && (
                            <span className={`text-xs ${alert.seasonal_pricing_active ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.seasonal_pricing_active ? 'seasonal on' : 'NO seasonal'}</span>
                          )}
                          {alert.peak_month_premium_pct != null && alert.peak_month_premium_pct > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.peak_month_premium_pct}% peak</span>
                          )}
                          {alert.has_projector != null && (
                            <span className={`text-xs ${alert.has_projector ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_projector ? 'projector' : 'no projector'}</span>
                          )}
                          {alert.has_screen != null && (
                            <span className={`text-xs ${alert.has_screen ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_screen ? 'screen' : 'no screen'}</span>
                          )}
                          {alert.has_microphone != null && (
                            <span className={`text-xs ${alert.has_microphone ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_microphone ? 'mic' : 'no mic'}</span>
                          )}
                          {alert.has_video_conferencing != null && (
                            <span className={`text-xs ${alert.has_video_conferencing ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_video_conferencing ? 'video conf' : 'no video conf'}</span>
                          )}
                          {alert.av_equipment_score != null && alert.av_equipment_score > 0 && (
                            <span className={`text-xs ${alert.av_equipment_score < 40 ? 'text-rose-600 font-medium' : alert.av_equipment_score < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.av_equipment_score}/100 AV</span>
                          )}
                          {alert.has_tiered_catering_packages != null && (
                            <span className={`text-xs ${alert.has_tiered_catering_packages ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_tiered_catering_packages ? `${alert.catering_package_tiers ?? 0} tiers` : 'no tiers'}</span>
                          )}
                          {alert.has_online_booking_tool != null && (
                            <span className={`text-xs ${alert.has_online_booking_tool ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_online_booking_tool ? 'online booking' : 'NO online booking'}</span>
                          )}
                          {alert.room_design_score != null && alert.room_design_score > 0 && (
                            <span className={`text-xs ${alert.room_design_score < 50 ? 'text-rose-600 font-medium' : alert.room_design_score < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.room_design_score}/100 design</span>
                          )}
                          {alert.room_acoustics_score != null && alert.room_acoustics_score > 0 && (
                            <span className={`text-xs ${alert.room_acoustics_score < 50 ? 'text-rose-600 font-medium' : alert.room_acoustics_score < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.room_acoustics_score}/100 acoustics</span>
                          )}
                          {alert.room_lighting_score != null && alert.room_lighting_score > 0 && (
                            <span className={`text-xs ${alert.room_lighting_score < 50 ? 'text-rose-600 font-medium' : alert.room_lighting_score < 70 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.room_lighting_score}/100 lighting</span>
                          )}
                          {alert.private_event_revenue_monthly != null && alert.private_event_revenue_monthly > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.private_event_revenue_monthly}/mo events</span>
                          )}
                          {alert.private_event_revenue_pct != null && alert.private_event_revenue_pct > 0 && (
                            <span className="text-xs text-neutral-500">{alert.private_event_revenue_pct}% of total</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.utilization_change != null && alert.utilization_change > 0 && (
                            <span className="text-emerald-600">+{alert.utilization_change}% utilization (target)</span>
                          )}
                          {alert.minimum_spend_change != null && alert.minimum_spend_change > 0 && (
                            <span className="text-emerald-600">+${alert.minimum_spend_change}/event min spend</span>
                          )}
                          {alert.revenue_change != null && alert.revenue_change > 0 && (
                            <span className="text-emerald-600">+${alert.revenue_change}/mo revenue</span>
                          )}
                          {alert.corporate_market_capture_change != null && alert.corporate_market_capture_change > 0 && (
                            <span className="text-emerald-600">+{alert.corporate_market_capture_change} corporate events/mo</span>
                          )}
                          {alert.satisfaction_change != null && alert.satisfaction_change > 0 && (
                            <span className="text-emerald-600">+{alert.satisfaction_change}% satisfaction</span>
                          )}
                          {alert.review_score_change != null && alert.review_score_change > 0 && (
                            <span className="text-emerald-600">+{alert.review_score_change}% review score</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faCalendarCheck} className="mt-0.5 shrink-0" />
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
          <span>Private event space: <span className={config.requirePrivateEventSpace ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePrivateEventSpace ? 'required' : 'optional'}</span></span>
          <span>Min utilization: {config.minBookingUtilizationPct}%</span>
          <span>Max underpriced: {config.maxUnderpricedMinimumSpendPct}%</span>
          <span>Seasonal pricing: <span className={config.requireSeasonalPricing ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireSeasonalPricing ? 'required' : 'optional'}</span></span>
          <span>Min peak premium: {config.minPeakMonthPremiumPct}%</span>
          <span>AV equipment: <span className={config.requireAvEquipment ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireAvEquipment ? 'required' : 'optional'}</span></span>
          <span>Tiered catering: <span className={config.requireTieredCateringPackages ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireTieredCateringPackages ? 'required' : 'optional'}</span></span>
          <span>Online booking: <span className={config.requireOnlineBookingTool ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireOnlineBookingTool ? 'required' : 'optional'}</span></span>
          <span>Min design score: {config.minRoomDesignScore}/100</span>
          <span>Min acoustics: {config.minRoomAcousticsScore}/100</span>
          <span>Min lighting: {config.minRoomLightingScore}/100</span>
          <span className="text-neutral-400">177th POSR-exclusive differentiator</span>
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

export default PrivateEventSpaceScreen;
