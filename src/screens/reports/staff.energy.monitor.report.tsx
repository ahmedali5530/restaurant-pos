/**
 * AI Staff Energy Level Monitor — tracks staff energy/fatigue throughout
 * their shift and recommends optimal break timing and shift length.
 *
 * 131st POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from staff fatigue-driven errors.
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
  faBatteryThreeQuarters, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faArrowTrendDown, faBatteryQuarter, faMugHot,
  faClock, faRepeat, faLink, faBolt, faBatteryFull,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runStaffEnergyEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readStaffEnergyConfig, DEFAULT_STAFFENERGY_CONFIG,
  type StaffEnergyAlert,
} from "@/lib/staff-energy-monitor.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  energy_decline_detected:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faArrowTrendDown,    label: 'ENERGY DECLINE' },
  critical_fatigue_zone:      { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faBatteryQuarter,    label: 'CRITICAL FATIGUE' },
  optimal_break_window:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faMugHot,            label: 'BREAK WINDOW' },
  shift_too_long:             { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faClock,             label: 'SHIFT TOO LONG' },
  chronic_fatigue_pattern:    { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faRepeat,            label: 'CHRONIC FATIGUE' },
  fatigue_error_correlation:  { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faLink,              label: 'FATIGUE→ERROR' },
  peak_hour_fatigue:          { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faBolt,              label: 'PEAK FATIGUE' },
  energy_recovery_confirmed:  { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faBatteryFull,       label: 'RECOVERY' },
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

export function StaffEnergyMonitorScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<StaffEnergyAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, avgEnergyScore: 0, fatiguedStaff: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_STAFFENERGY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readStaffEnergyConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[staffenergy-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runStaffEnergyEngine(db, config);
      toast.success(`Monitored ${result.generated} energy levels — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[staffenergy-report] analyze failed', err);
      toast.error('Monitoring failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[staffenergy-report] status failed', err);
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
      <DocumentTitle parts={["AI Staff Energy Monitor", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faBatteryThreeQuarters} className="text-amber-600" />
              AI Staff Energy Level Monitor
            </h1>
            <p className="text-sm text-neutral-500">
              Tracks staff energy/fatigue throughout shift — recommends optimal break timing + shift length
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Monitoring…' : 'Monitor energy'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faBatteryThreeQuarters} label="Avg energy" value={`${summary.avgEnergyScore.toFixed(0)}/100`} color={summary.avgEnergyScore >= 70 ? 'text-emerald-600' : 'text-rose-600'} />
          <SummaryCard icon={faBatteryQuarter} label="Fatigued staff" value={String(summary.fatiguedStaff)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faBatteryThreeQuarters} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faBatteryThreeQuarters} spin className="text-4xl mb-3" />
            <p>Monitoring staff energy levels…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No energy alerts</p>
            <p className="text-sm mt-1">All staff at healthy energy levels.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faBatteryThreeQuarters, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.staff_name}</span>
                          {alert.role && (
                            <span className={`text-xs font-medium uppercase ${ROLE_COLOR[alert.role] ?? 'text-neutral-500'}`}>{alert.role}</span>
                          )}
                          {alert.hours_into_shift != null && <span className="text-xs text-neutral-500">{alert.hours_into_shift}h into shift</span>}
                          {alert.current_energy_score != null && (
                            <span className={`text-xs font-bold ${alert.current_energy_score >= 70 ? 'text-emerald-600' : alert.current_energy_score >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>
                              {alert.current_energy_score}/100 energy
                            </span>
                          )}
                          {alert.current_error_rate != null && alert.start_error_rate != null && (
                            <span className={`text-xs ${alert.current_error_rate > alert.start_error_rate * 2 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>
                              {alert.current_error_rate} errors/10 (was {alert.start_error_rate})
                            </span>
                          )}
                          {alert.is_peak_hour && <span className="text-xs font-medium text-rose-600">PEAK</span>}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.shift_start_energy != null && <span>started: {alert.shift_start_energy}/100</span>}
                          {alert.energy_decline_rate != null && <span className="text-rose-600">-{alert.energy_decline_rate} pts/hr</span>}
                          {alert.current_speed_pct != null && <span>speed: {alert.current_speed_pct}%</span>}
                          {alert.recommended_break_time && <span className="text-emerald-600 font-medium">→ break: {alert.recommended_break_time}</span>}
                          {alert.recommended_shift_end != null && <span className="text-rose-600 font-medium">→ end shift at {alert.recommended_shift_end}h</span>}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 flex items-start gap-2">
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
                      <FontAwesomeIcon icon={faCheckCircle} /> Acted
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Managing
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
          <span>Decline threshold: {config.declineThreshold} pts</span>
          <span>Critical threshold: {config.criticalThreshold}/100</span>
          <span>Max shift: {config.maxShiftHours}h</span>
          <span>Break window: hour {config.breakWindow}</span>
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

export default StaffEnergyMonitorScreen;
