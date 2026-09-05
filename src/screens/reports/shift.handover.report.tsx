/**
 * AI Staff Shift Handover Optimizer — analyzes shift handover quality between
 * outgoing and incoming staff.
 *
 * 128th POSR-exclusive differentiator — restaurants lose $300-1,000/mo per
 * location from poor shift handover quality.
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
  faRightLeft, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faClipboardList, faBrain, faBolt,
  faCrown, faShieldHalved, faListCheck,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runShiftHandEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readShiftHandConfig, DEFAULT_SHIFTHAND_CONFIG,
  type ShiftHandAlert,
} from "@/lib/shift-handover.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  incomplete_handover:       { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faClipboardList,     label: 'INCOMPLETE' },
  knowledge_gap:             { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBrain,             label: 'KNOWLEDGE GAP' },
  rushed_handover:           { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBolt,              label: 'RUSHED' },
  post_handover_error_spike: { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faTriangleExclamation, label: 'ERROR SPIKE' },
  best_handover_pair:        { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCrown,             label: 'BEST PAIR' },
  high_risk_handover:        { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faShieldHalved,      label: 'HIGH RISK' },
  missing_vip_context:       { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faCrown,             label: 'VIP MISSING' },
  handover_checklist_gap:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faListCheck,         label: 'CHECKLIST GAP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const ROLE_COLOR: Record<string, string> = {
  server: 'text-sky-600',
  kitchen: 'text-rose-600',
  host: 'text-emerald-600',
  bartender: 'text-violet-600',
  manager: 'text-amber-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function ShiftHandoverScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<ShiftHandAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgCompleteness: 0, highRiskHandovers: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SHIFTHAND_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readShiftHandConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[shifthand-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runShiftHandEngine(db, config);
      toast.success(`Analyzed ${result.generated} handovers — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[shifthand-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[shifthand-report] status failed', err);
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
      <DocumentTitle parts={["AI Shift Handover", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faRightLeft} className="text-sky-600" />
              AI Staff Shift Handover Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Analyzes handover quality between outgoing and incoming staff — prevents context loss
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze handovers'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faClipboardList} label="Avg completeness" value={`${summary.avgCompleteness.toFixed(0)}%`} color={summary.avgCompleteness >= 80 ? 'text-emerald-600' : 'text-rose-600'} />
          <SummaryCard icon={faShieldHalved} label="High-risk handovers" value={String(summary.highRiskHandovers)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faRightLeft} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-sky-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRightLeft} spin className="text-4xl mb-3" />
            <p>Analyzing shift handovers…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No handover alerts</p>
            <p className="text-sm mt-1">All shift handovers meeting quality standards.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faRightLeft, label: alert.rule_id.toUpperCase() };
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
                          <span className="text-xs">
                            <span className="text-neutral-500">{alert.outgoing_staff}</span>
                            <span className="mx-1 text-neutral-400">→</span>
                            <span className="font-medium text-sky-600">{alert.incoming_staff}</span>
                          </span>
                          {alert.role && (
                            <span className={`text-xs font-medium uppercase ${ROLE_COLOR[alert.role] ?? 'text-neutral-500'}`}>{alert.role}</span>
                          )}
                          {alert.completeness_pct != null && (
                            <span className={`text-xs font-bold ${alert.completeness_pct >= 80 ? 'text-emerald-600' : alert.completeness_pct >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {alert.completeness_pct}% complete
                            </span>
                          )}
                          {alert.post_handover_errors != null && alert.post_handover_errors > 0 && (
                            <span className="text-xs font-bold text-rose-600">{alert.post_handover_errors} post-errors</span>
                          )}
                          {alert.is_peak_hour && <span className="text-xs font-medium text-rose-600">PEAK</span>}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.handover_duration_minutes != null && <span>{alert.handover_duration_minutes} min</span>}
                          {alert.checklist_items_covered != null && alert.checklist_items_total != null && (
                            <span>{alert.checklist_items_covered}/{alert.checklist_items_total} items</span>
                          )}
                          {alert.missing_items && <span className="text-rose-600">missing: {alert.missing_items}</span>}
                          {alert.has_vip_tables && <span className="text-amber-600 font-medium">has VIP</span>}
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Fixed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Improving
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
          <span>Completeness threshold: {config.completenessThreshold}%</span>
          <span>Min duration: {config.minDuration} min</span>
          <span>Error threshold: {config.errorThreshold} errors/30min</span>
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

export default ShiftHandoverScreen;
