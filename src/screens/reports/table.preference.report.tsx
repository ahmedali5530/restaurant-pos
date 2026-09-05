/**
 * AI Customer Table Preference Learner — learns which table types each
 * customer prefers and recommends optimal table assignments.
 *
 * 133rd POSR-exclusive differentiator — restaurants lose $200-800/mo per
 * location from ignoring customer table preferences.
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
  faChair, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faHeart, faArrowRightArrowLeft, faChartLine,
  faCrown, faCalendarDay, faClipboardQuestion, faArrowTrendUp,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runTablePrefEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readTablePrefConfig, DEFAULT_TABLEPREF_CONFIG,
  type TablePrefAlert,
} from "@/lib/table-preference.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  strong_preference_detected:  { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faHeart,              label: 'STRONG PREFERENCE' },
  preference_unmet:            { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTriangleExclamation, label: 'UNMET' },
  preference_shift:            { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowRightArrowLeft, label: 'SHIFT' },
  preference_satisfaction_gap: { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faChartLine,          label: 'SATISFACTION GAP' },
  high_value_table_match:      { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCrown,              label: 'GOLD MATCH' },
  occasion_table_preference:   { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faCalendarDay,        label: 'OCCASION' },
  preference_not_captured:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClipboardQuestion,  label: 'NOT CAPTURED' },
  preference_based_uplift:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,       label: 'UPLIFT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const TABLE_TYPE_COLOR: Record<string, string> = {
  booth: 'text-amber-600',
  window: 'text-sky-600',
  bar: 'text-violet-600',
  quiet_corner: 'text-emerald-600',
  large_table: 'text-rose-600',
  outdoor: 'text-emerald-600',
  high_traffic: 'text-neutral-500',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function TablePreferenceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<TablePrefAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, strongPreferences: 0, unmetPreferences: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_TABLEPREF_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readTablePrefConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[tablepref-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runTablePrefEngine(db, config);
      toast.success(`Learned ${result.generated} table preferences — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[tablepref-report] analyze failed', err);
      toast.error('Learning failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[tablepref-report] status failed', err);
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
      <DocumentTitle parts={["AI Table Preference", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChair} className="text-sky-600" />
              AI Customer Table Preference Learner
            </h1>
            <p className="text-sm text-neutral-500">
              Learns which table types each customer prefers — recommends optimal seating assignments
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Learning…' : 'Learn preferences'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faHeart} label="Strong preferences" value={String(summary.strongPreferences)} color="text-sky-600" />
          <SummaryCard icon={faTriangleExclamation} label="Unmet this visit" value={String(summary.unmetPreferences)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faChair} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-sky-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChair} spin className="text-4xl mb-3" />
            <p>Learning customer table preferences…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No table preference alerts</p>
            <p className="text-sm mt-1">All customers seated at preferred tables — no unmet preferences.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faChair, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.customer_name}</span>
                          {alert.preferred_table_type && (
                            <span className={`text-xs font-medium uppercase ${TABLE_TYPE_COLOR[alert.preferred_table_type] ?? 'text-neutral-500'}`}>
                              prefers: {alert.preferred_table_type.replace('_', ' ')}
                            </span>
                          )}
                          {alert.current_visit_table_type && alert.current_visit_table_type !== alert.preferred_table_type && (
                            <span className="text-xs">
                              <span className="text-neutral-400">got: {alert.current_visit_table_type.replace('_', ' ')}</span>
                            </span>
                          )}
                          {alert.preference_strength != null && alert.preference_strength > 0 && (
                            <span className="text-xs font-bold text-sky-600">{alert.preference_strength}% strength</span>
                          )}
                          {alert.occasion && alert.occasion !== 'regular_dinner' && (
                            <span className="text-xs text-violet-600 font-medium">{alert.occasion.replace('_', ' ')}</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.visit_count != null && <span>{alert.visit_count} visits</span>}
                          {alert.satisfaction_at_preferred != null && alert.satisfaction_at_other != null && (
                            <span>sat: {alert.satisfaction_at_preferred}/100 vs other: {alert.satisfaction_at_other}/100</span>
                          )}
                          {alert.spend_at_preferred != null && alert.spend_at_other != null && (
                            <span>spend: {fmt$(alert.spend_at_preferred)} vs {fmt$(alert.spend_at_other)}</span>
                          )}
                          {alert.is_reserved && <span className="text-amber-600 font-medium">reserved</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">opportunity/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Assigned
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Capturing
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
          <span>Strength threshold: {config.strengthThreshold}%</span>
          <span>Min visits: {config.minVisits}</span>
          <span>Satisfaction gap: {config.satisfactionGap}pts</span>
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

export default TablePreferenceScreen;
