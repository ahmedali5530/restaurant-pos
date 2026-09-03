/**
 * AI Alcohol Service Compliance Monitor — liquor law violation dashboard.
 *
 * 66th POSR-exclusive differentiator — liquor license violations cost
 * restaurants $10k-50k+ per occurrence. Dram shop liability can reach
 * $100k-1M+ if over-served customer causes injury/death.
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
  faWineGlass, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faIdCard, faBeer, faClock,
  faTags, faGraduationCap, faGift, faUserShield, faGavel,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runAlcoholEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readAlcoholConfig, DEFAULT_ALCOHOL_CONFIG,
  type AlcoholAlert,
} from "@/lib/alcohol-compliance-monitor.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  id_verification_missing:     { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faIdCard,          label: 'NO ID CHECK' },
  over_service_risk:           { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faBeer,            label: 'OVER-SERVICE' },
  service_hours_violation:     { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faClock,           label: 'HOURS VIOLATION' },
  happy_hour_violation:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTags,            label: 'HAPPY HOUR' },
  server_certification_expired:{ bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faGraduationCap,   label: 'CERT EXPIRED' },
  free_drink_limit_exceeded:   { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faGift,            label: 'FREE DRINK' },
  minor_decoy_risk:            { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faUserShield,      label: 'MINOR DECOY' },
  dram_shop_exposure:          { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faGavel,           label: 'DRAM SHOP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const COMPLIANCE_COLOR: Record<string, string> = {
  state_liquor_law: 'text-rose-600',
  federal: 'text-rose-700',
  dram_shop: 'text-violet-700',
  license_condition: 'text-amber-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function AlcoholComplianceMonitorScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<AlcoholAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalFines: 0, totalLiability: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ALCOHOL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readAlcoholConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[alcohol-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runAlcoholEngine(db, config);
      toast.success(`Generated ${result.generated} alcohol compliance alerts`);
      await reload();
    } catch (err) {
      console.error('[alcohol-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[alcohol-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_fine + b.est_liability) - (a.est_fine + a.est_liability);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Alcohol Compliance Monitor", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faWineGlass} className="text-violet-600" />
              AI Alcohol Service Compliance Monitor
            </h1>
            <p className="text-sm text-neutral-500">
              Real-time liquor law compliance — ID checks, over-service, dram shop liability exposure
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Scanning…' : 'Run compliance scan'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical violations"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faWineGlass}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-violet-600"
          />
          <SummaryCard
            icon={faGavel}
            label="Est. fines at risk"
            value={fmt$(summary.totalFines)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faGavel}
            label="Dram shop liability"
            value={fmt$(summary.totalLiability)}
            color="text-rose-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faWineGlass} spin className="text-4xl mb-3" />
            <p>Loading compliance alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No alcohol compliance violations</p>
            <p className="text-sm mt-1">Run compliance scan to check all alcohol service.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faWineGlass, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">
                            {alert.customer_name ?? alert.server_name ?? 'Service-wide'}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          <span className={`text-xs font-medium ${COMPLIANCE_COLOR[alert.compliance_type] ?? 'text-neutral-500'}`}>
                            {alert.compliance_type.replace(/_/g, ' ')}
                          </span>
                          {alert.order_id && (
                            <span className="text-xs text-neutral-400">{alert.order_id}</span>
                          )}
                          {alert.server_name && (
                            <span className="text-xs text-neutral-500">Server: {alert.server_name}</span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.drinks_served != null && (
                            <span>Drinks: <span className="font-medium text-neutral-700">{alert.drinks_served}</span></span>
                          )}
                          {alert.drinks_per_hour != null && (
                            <span className={alert.drinks_per_hour > 3 ? 'text-rose-600 font-medium' : ''}>
                              Rate: {alert.drinks_per_hour.toFixed(1)}/hr
                            </span>
                          )}
                          {alert.time_until_cutoff != null && (
                            <span>Cutoff in: {alert.time_until_cutoff.toFixed(1)}h</span>
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
                      {alert.est_fine > 0 && (
                        <>
                          <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_fine)}</div>
                          <div className="text-xs text-neutral-400">est. fine</div>
                        </>
                      )}
                      {alert.est_liability > 0 && (
                        <>
                          <div className="text-sm font-bold text-rose-600 mt-1">{fmt$(alert.est_liability)}</div>
                          <div className="text-xs text-neutral-400">liability</div>
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
          <span>Max drinks/hr: {config.maxDrinksPerHour}</span>
          <span>Max drinks total: {config.maxDrinksTotal}</span>
          <span>Cutoff: {config.serviceCutoffHour}:00</span>
          <span>ID age: {config.requireIdAge}+</span>
          <span>Happy hour: {config.happyHourBanned ? 'BANNED' : 'allowed'}</span>
          <span>Free drink max: {config.freeDrinkMax}/day</span>
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

export default AlcoholComplianceMonitorScreen;
