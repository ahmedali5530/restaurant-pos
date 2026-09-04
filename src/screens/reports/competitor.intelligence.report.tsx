/**
 * AI Restaurant Competitor Intelligence Dashboard — comprehensive competitor
 * tracking (promos, new items, hours, reviews, events, price, ratings, closing).
 *
 * 96th POSR-exclusive differentiator — restaurants lose $500-2,000/mo from
 * not tracking competitor activity.
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
  faStore, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faTag, faUtensils, faClock,
  faStar, faDollarSign, faCalendarDay, faArrowTrendDown, faDoorClosed,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runIntelEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readIntelConfig, DEFAULT_INTEL_CONFIG,
  type IntelAlert,
} from "@/lib/competitor-intelligence.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  promo_detected:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faTag,            label: 'PROMO' },
  new_menu_item:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faUtensils,       label: 'NEW ITEM' },
  hours_change:         { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faClock,          label: 'HOURS CHANGE' },
  review_shift:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faStar,           label: 'REVIEW SHIFT' },
  price_undercut:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faDollarSign,     label: 'PRICE UNDERCUT' },
  event_announcement:   { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faCalendarDay,   label: 'EVENT' },
  rating_decline:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faArrowTrendDown, label: 'RATING DECLINE' },
  closing_risk:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faDoorClosed,     label: 'CLOSING RISK' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function CompetitorIntelligenceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<IntelAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalRisk: 0, totalOpportunity: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_INTEL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readIntelConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[intel-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runIntelEngine(db, config);
      toast.success(`Generated ${result.generated} competitor intelligence alerts`);
      await reload();
    } catch (err) {
      console.error('[intel-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[intel-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_revenue_impact ?? 0) - (a.est_revenue_impact ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Competitor Intelligence", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faStore} className="text-violet-600" />
              AI Competitor Intelligence Dashboard
            </h1>
            <p className="text-sm text-neutral-500">
              Tracks competitor promos, menu changes, hours, reviews, events, closing risk
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Scanning…' : 'Run intel scan'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical alerts"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faStore}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-violet-600"
          />
          <SummaryCard
            icon={faTriangleExclamation}
            label="Revenue at risk"
            value={fmt$(summary.totalRisk)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faLightbulb}
            label="Opportunity"
            value={fmt$(summary.totalOpportunity)}
            color="text-emerald-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faStore} spin className="text-4xl mb-3" />
            <p>Loading competitor intelligence…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No competitor intelligence alerts</p>
            <p className="text-sm mt-1">Run intel scan to check competitors.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faStore, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.competitor_name}</span>
                          {alert.competitor_distance_km != null && (
                            <span className="text-xs text-neutral-400">{alert.competitor_distance_km}km away</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          {alert.impact_type && (
                            <span className={`text-xs font-medium ${alert.impact_type === 'opportunity' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {alert.impact_type === 'opportunity' ? '↑ opportunity' : '↓ risk'}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.previous_value && alert.current_value && (
                            <span>{alert.previous_value} → <span className="font-medium text-neutral-700">{alert.current_value}</span></span>
                          )}
                          {alert.competitor_rating != null && alert.our_rating != null && (
                            <span>Their: <span className="font-medium text-neutral-700">{alert.competitor_rating}★</span> | Our: <span className={`font-medium ${alert.our_rating >= alert.competitor_rating ? 'text-emerald-600' : 'text-rose-600'}`}>{alert.our_rating}★</span></span>
                          )}
                        </div>
                        {alert.recommended_action && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span><strong>Action:</strong> {alert.recommended_action}</span>
                          </div>
                        )}
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-bold ${alert.impact_type === 'opportunity' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {fmt$(alert.est_revenue_impact)}
                      </div>
                      <div className="text-xs text-neutral-400">{alert.impact_type === 'opportunity' ? 'opportunity' : 'at risk'}</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Resolved
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

        {/* Config footer */}
        <div className="border-t border-neutral-200 pt-3 text-xs text-neutral-500 flex flex-wrap gap-x-6 gap-y-1">
          <span>AI: <span className={config.aiEnabled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.aiEnabled ? 'enabled' : 'disabled'}</span></span>
          <span>Radius: {config.radiusKm}km</span>
          <span>Scan frequency: every {config.scanFrequency}d</span>
          <span>Max competitors: {config.maxCompetitors}</span>
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

export default CompetitorIntelligenceScreen;
