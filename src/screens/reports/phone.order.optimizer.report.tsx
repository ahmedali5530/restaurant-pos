/**
 * AI Restaurant Phone Order Optimizer — tracks call patterns, identifies
 * abandoned calls, order errors, missed upsells, staff phone skills.
 *
 * 94th POSR-exclusive differentiator — phone orders still represent 15-20%
 * of restaurant revenue. Restaurants lose $200-800/mo from poor phone
 * order management.
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
  faPhone, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faClock, faPhoneSlash, faChartBar,
  faClipboardCheck, faArrowTrendUp, faGaugeHigh, faHeadset, faBook,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runPhoneEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readPhoneConfig, DEFAULT_PHONE_CONFIG,
  type PhoneAlert,
} from "@/lib/phone-order-optimizer.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  call_wait_time:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,           label: 'WAIT TIME' },
  abandoned_call:        { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faPhoneSlash,      label: 'ABANDONED' },
  peak_call_volume:      { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faChartBar,        label: 'PEAK VOLUME' },
  order_error_rate:      { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faClipboardCheck,  label: 'ORDER ERRORS' },
  missed_upsell:         { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,    label: 'MISSED UPSELL' },
  long_call_duration:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGaugeHigh,       label: 'LONG CALLS' },
  staff_phone_skills:    { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faHeadset,           label: 'STAFF SKILLS' },
  menu_knowledge_gap:    { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faBook,            label: 'MENU KNOWLEDGE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function PhoneOrderOptimizerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<PhoneAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalRevenueLost: 0, totalRevenueOpportunity: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_PHONE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readPhoneConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[phone-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runPhoneEngine(db, config);
      toast.success(`Generated ${result.generated} phone order alerts`);
      await reload();
    } catch (err) {
      console.error('[phone-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[phone-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_revenue_lost_monthly + b.est_revenue_opportunity) - (a.est_revenue_lost_monthly + a.est_revenue_opportunity);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Phone Order Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faPhone} className="text-sky-600" />
              AI Phone Order Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Tracks call patterns — abandoned calls, order errors, missed upsells, staff phone skills
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Scanning…' : 'Run phone scan'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="High-impact alerts"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faPhone}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-sky-600"
          />
          <SummaryCard
            icon={faTriangleExclamation}
            label="Revenue lost /mo"
            value={fmt$(summary.totalRevenueLost)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faArrowTrendUp}
            label="Revenue opportunity"
            value={fmt$(summary.totalRevenueOpportunity)}
            color="text-emerald-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faPhone} spin className="text-4xl mb-3" />
            <p>Loading phone order alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No phone order alerts</p>
            <p className="text-sm mt-1">Run phone scan to analyze call patterns.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faPhone, label: alert.rule_id.toUpperCase() };
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
                          {alert.staff_member && (
                            <span className="font-semibold text-neutral-800">{alert.staff_member}</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.call_count_30d != null && <span>Calls: {alert.call_count_30d}/mo</span>}
                          {alert.avg_wait_sec != null && (
                            <span className={alert.avg_wait_sec > 30 ? 'text-rose-600 font-medium' : ''}>
                              Wait: {alert.avg_wait_sec}s
                            </span>
                          )}
                          {alert.abandoned_pct != null && (
                            <span className={alert.abandoned_pct > 10 ? 'text-rose-600 font-medium' : ''}>
                              Abandoned: {alert.abandoned_pct}%
                            </span>
                          )}
                          {alert.error_rate_pct != null && (
                            <span className={alert.error_rate_pct > 5 ? 'text-rose-600 font-medium' : ''}>
                              Errors: {alert.error_rate_pct}%
                            </span>
                          )}
                          {alert.avg_call_duration_min != null && (
                            <span className={alert.avg_call_duration_min > 5 ? 'text-amber-600 font-medium' : ''}>
                              Duration: {alert.avg_call_duration_min}min
                            </span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-violet-50 border border-violet-200 rounded px-3 py-2 text-xs text-violet-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {alert.est_revenue_lost_monthly > 0 && (
                        <>
                          <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_revenue_lost_monthly)}</div>
                          <div className="text-xs text-neutral-400">lost/mo</div>
                        </>
                      )}
                      {alert.est_revenue_opportunity > 0 && (
                        <>
                          <div className="text-sm font-bold text-emerald-600 mt-1">{fmt$(alert.est_revenue_opportunity)}</div>
                          <div className="text-xs text-neutral-400">opportunity</div>
                        </>
                      )}
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
          <span>Max wait: {config.maxWaitSec}s</span>
          <span>Abandoned threshold: {config.abandonedThreshold}%</span>
          <span>Error threshold: {config.errorThreshold}%</span>
          <span>Max duration: {config.maxDurationMin}min</span>
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

export default PhoneOrderOptimizerScreen;
