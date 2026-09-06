/**
 * AI Seating Comfort & Furniture Quality Optimizer — predicts how seating
 * (chair comfort, booth vs table, upholstery, back support, height) impacts
 * customer dwell, spend, and satisfaction.
 *
 * 158th POSR-exclusive differentiator.
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
  faChair, faRotate, faCompressArrowsAlt, faLayerGroup, faPerson,
  faArrowsUpDown, faClock, faSparkles, faUsers, faAccessibleIcon,
  faCheckCircle, faTriangleExclamation, faLightbulb,
} from "@fortawesome/free-solid-svg-icons";
import {
  runSeatingEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readSeatingConfig, DEFAULT_SEATING_CONFIG,
  type SeatingAlert,
} from "@/lib/seating-comfort-furniture.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  chair_cushion_worn:              { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCompressArrowsAlt, label: 'CUSHION WORN' },
  booth_vs_table_mismatch:         { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faLayerGroup,        label: 'TYPE MISMATCH' },
  back_support_inadequate:         { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faPerson,            label: 'BACK SUPPORT' },
  seat_height_wrong:               { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faArrowsUpDown,      label: 'HEIGHT' },
  furniture_age_excessive:         { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faClock,             label: 'AGE' },
  upholstery_stain_wear:           { bg: 'bg-red-50',     text: 'text-red-700',     icon: faSparkles,          label: 'UPHOLSTERY' },
  seating_capacity_mismatch:       { bg: 'bg-yellow-50',  text: 'text-yellow-700',  icon: faUsers,             label: 'CAPACITY' },
  accessibility_seating_missing:   { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', icon: faAccessibleIcon,    label: 'ADA' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function SeatingComfortFurnitureScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<SeatingAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, avgUpholsteryScore: 0, adaGaps: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_SEATING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readSeatingConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[seating-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runSeatingEngine(db, config);
      toast.success(`Analyzed ${result.generated} seating signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[seating-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[seating-report] status failed', err);
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
      <DocumentTitle parts={["AI Seating Comfort", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faChair} className="text-violet-500" />
              AI Seating Comfort & Furniture Quality Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how seating impacts dwell + spend — 42% cite uncomfortable seating (NRA), 10min extended dwell = 8-12% spend
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faChair} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze seating'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faLayerGroup} label="Zones at risk" value={String(summary.zonesAtRisk)} color="text-rose-600" />
          <SummaryCard icon={faSparkles} label="Avg upholstery" value={`${summary.avgUpholsteryScore.toFixed(0)}/100`} color={summary.avgUpholsteryScore < 75 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faAccessibleIcon} label="ADA gaps" value={String(summary.adaGaps)} color={summary.adaGaps > 0 ? 'text-fuchsia-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLightbulb} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faChair} spin className="text-4xl mb-3" />
            <p>Analyzing seating comfort & furniture quality…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No seating alerts</p>
            <p className="text-sm mt-1">Seating comfortable, furniture well-maintained, ADA compliant.</p>
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
                          {alert.zone && <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.zone}</span>}
                          {alert.seating_type && <span className="text-xs text-violet-600 uppercase">{alert.seating_type}</span>}
                          {alert.cushion_density_kg_m3 != null && (
                            <span className={`text-xs ${alert.cushion_density_kg_m3 < 30 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.cushion_density_kg_m3} kg/m3 cushion</span>
                          )}
                          {alert.back_support_height_cm != null && (
                            <span className={`text-xs ${alert.back_support_height_cm < 30 ? 'text-rose-600 font-medium' : 'text-neutral-500'}`}>{alert.back_support_height_cm}cm back</span>
                          )}
                          {alert.furniture_age_years != null && (
                            <span className={`text-xs ${alert.furniture_age_years > 5 ? 'text-orange-600 font-medium' : 'text-neutral-500'}`}>{alert.furniture_age_years}yr old</span>
                          )}
                          {alert.upholstery_condition_score != null && (
                            <span className={`text-xs ${alert.upholstery_condition_score < 75 ? 'text-red-600 font-medium' : 'text-neutral-500'}`}>{alert.upholstery_condition_score}/100 upholstery</span>
                          )}
                          {alert.stain_count != null && alert.stain_count > 0 && (
                            <span className="text-xs text-red-600">{alert.stain_count} stains</span>
                          )}
                          {alert.tear_count != null && alert.tear_count > 0 && (
                            <span className="text-xs text-red-600 font-bold">{alert.tear_count} tears</span>
                          )}
                          {alert.has_ada_seating === false && (
                            <span className="text-xs text-fuchsia-600 font-bold">NO ADA</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_dwell_change_min != null && alert.predicted_dwell_change_min > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_dwell_change_min}min dwell</span>
                          )}
                          {alert.predicted_spend_change_pct != null && alert.predicted_spend_change_pct > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_spend_change_pct}% spend</span>
                          )}
                          {alert.seat_height_cm != null && alert.table_height_cm != null && (
                            <span>seat {alert.seat_height_cm}cm / table {alert.table_height_cm}cm</span>
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
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-rose-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo at risk</div>
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
          <span>Min cushion: {config.minCushionDensity} kg/m3</span>
          <span>Max age: {config.maxFurnitureAgeYears}yr</span>
          <span>Min upholstery: {config.minUpholsteryScore}/100</span>
          <span>Min height diff: {config.minHeightDiffCm}cm</span>
          <span className="text-neutral-400">158th POSR-exclusive differentiator</span>
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

export default SeatingComfortFurnitureScreen;
