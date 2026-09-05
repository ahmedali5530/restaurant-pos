/**
 * AI Menu Item Photography Impact Analyzer — analyzes how food photography
 * quality affects ordering rates for digital menus.
 *
 * 132nd POSR-exclusive differentiator — restaurants lose $300-1,200/mo per
 * location from poor/no food photography.
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
  faCamera, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faImage, faCameraRetro, faClock,
  faArrowTrendUp, faRocket, faChartColumn, faLayerGroup, faMobileScreen,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runMenuPhotoEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readMenuPhotoConfig, DEFAULT_MENUPHOTO_CONFIG,
  type MenuPhotoAlert,
} from "@/lib/menu-photography-impact.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  no_photo_high_margin:      { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faImage,             label: 'NO PHOTO' },
  amateur_photo_upgrade:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faCameraRetro,       label: 'AMATEUR' },
  stale_photo:               { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,             label: 'STALE' },
  photo_uplift_confirmed:    { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faArrowTrendUp,      label: 'UPLIFT CONFIRMED' },
  new_item_no_photo:         { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faRocket,            label: 'NEW ITEM NO PHOTO' },
  photo_quality_gap:         { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faChartColumn,       label: 'QUALITY GAP' },
  delivery_thumbnail_issue:  { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faMobileScreen,      label: 'THUMBNAIL ISSUE' },
  photo_inconsistency:       { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faLayerGroup,        label: 'INCONSISTENCY' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const PHOTO_STATUS_COLOR: Record<string, string> = {
  professional: 'text-emerald-600',
  amateur: 'text-amber-600',
  none: 'text-rose-600',
  mixed: 'text-violet-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function MenuPhotographyImpactScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<MenuPhotoAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noPhotoCount: 0, avgUpliftPotential: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MENUPHOTO_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMenuPhotoConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[menuphoto-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMenuPhotoEngine(db, config);
      toast.success(`Analyzed ${result.generated} photo impacts — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[menuphoto-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[menuphoto-report] status failed', err);
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
      <DocumentTitle parts={["AI Photography Impact", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCamera} className="text-violet-600" />
              AI Menu Item Photography Impact Analyzer
            </h1>
            <p className="text-sm text-neutral-500">
              Analyzes how photo quality affects ordering rates — recommends photography investments
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze photos'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faImage} label="No photo items" value={String(summary.noPhotoCount)} color="text-rose-600" />
          <SummaryCard icon={faArrowTrendUp} label="Avg uplift potential" value={`${summary.avgUpliftPotential.toFixed(0)}%`} color="text-emerald-600" />
          <SummaryCard icon={faTriangleExclamation} label="Critical" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faCamera} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-violet-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCamera} spin className="text-4xl mb-3" />
            <p>Analyzing photography impacts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No photography alerts</p>
            <p className="text-sm mt-1">All menu items have professional photos with good order rates.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faCamera, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.menu_item}</span>
                          {alert.photo_status && (
                            <span className={`text-xs font-medium uppercase ${PHOTO_STATUS_COLOR[alert.photo_status] ?? 'text-neutral-500'}`}>
                              {alert.photo_status}
                            </span>
                          )}
                          {alert.photo_age_months != null && alert.photo_age_months > 0 && (
                            <span className="text-xs text-neutral-500">{alert.photo_age_months}mo old</span>
                          )}
                          {alert.order_rate_pct != null && alert.peer_avg_order_rate != null && (
                            <span className="text-xs">
                              <span className={alert.order_rate_pct < alert.peer_avg_order_rate ? 'text-rose-600 font-medium' : 'text-emerald-600'}>{alert.order_rate_pct}%</span>
                              <span className="text-neutral-400"> vs {alert.peer_avg_order_rate}% peers</span>
                            </span>
                          )}
                          {alert.predicted_uplift_pct != null && alert.predicted_uplift_pct > 0 && (
                            <span className="text-xs font-bold text-emerald-600">+{alert.predicted_uplift_pct}% predicted</span>
                          )}
                          {alert.roi_months != null && alert.roi_months < 12 && (
                            <span className="text-xs text-emerald-600">ROI: {alert.roi_months}mo</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.margin_per_unit != null && <span>margin: {fmt$(alert.margin_per_unit)}</span>}
                          {alert.monthly_volume != null && <span>{alert.monthly_volume} orders/mo</span>}
                          {alert.est_photo_cost != null && <span>photo cost: ~{fmt$(alert.est_photo_cost)}</span>}
                          {alert.est_monthly_uplift != null && alert.est_monthly_uplift > 0 && (
                            <span className="text-emerald-600 font-medium">uplift: +{fmt$(alert.est_monthly_uplift)}/mo</span>
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
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">opportunity/mo</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Photographed
                    </Button>
                    <Button size="sm" variant="custom" className="gap-1.5 border border-neutral-300" onClick={() => alert.id && handleStatus(alert.id, 'in_progress')}>
                      <FontAwesomeIcon icon={faRotate} /> Scheduling
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
          <span>Gap threshold: {config.gapThreshold}%</span>
          <span>Stale threshold: {config.staleMonths} months</span>
          <span>Pro photo cost: ~${config.proCost}/item</span>
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

export default MenuPhotographyImpactScreen;
