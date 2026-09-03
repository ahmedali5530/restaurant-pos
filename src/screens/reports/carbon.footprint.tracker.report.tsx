/**
 * AI Restaurant Carbon Footprint Tracker — CO2 emissions from 5 sources,
 * net-zero goal tracking, ESG compliance reports.
 *
 * 90th POSR-exclusive differentiator — restaurants emit 3-5 tons CO2/month.
 * EU CSRD (2024) + California SB-253 (2026) require carbon reporting.
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
  faLeaf, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faBolt, faUtensils, faTruck,
  faTrashCan, faDroplet, faHandshake, faClock, faBullseye, faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runCarbonEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readCarbonConfig, DEFAULT_CARBON_CONFIG,
  type CarbonAlert,
} from "@/lib/carbon-footprint-tracker.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  high_energy_emissions:     { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBolt,            label: 'ENERGY CO2' },
  high_food_emissions:        { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faUtensils,        label: 'FOOD CO2' },
  delivery_carbon_spike:      { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faTruck,           label: 'DELIVERY CO2' },
  waste_emissions_high:       { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faTrashCan,        label: 'WASTE CO2' },
  water_usage_alert:          { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faDroplet,         label: 'WATER CO2' },
  supplier_carbon_heavy:      { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faHandshake,       label: 'SUPPLIER CO2' },
  peak_shift_opportunity:     { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faClock,           label: 'PEAK SHIFT' },
  net_zero_gap:               { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faBullseye,        label: 'NET-ZERO GAP' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const SOURCE_COLOR: Record<string, string> = {
  energy: 'text-amber-600',
  food: 'text-rose-600',
  delivery: 'text-orange-600',
  waste: 'text-violet-600',
  water: 'text-sky-600',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function CarbonFootprintTrackerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<CarbonAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalReductionPotential: 0, totalOffsetCost: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CARBON_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCarbonConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[carbon-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runCarbonEngine(db, config);
      toast.success(`Generated ${result.generated} carbon alerts — total ${result.totalCo2Kg} kg CO2/month`);
      await reload();
    } catch (err) {
      console.error('[carbon-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[carbon-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.current_co2_kg ?? 0) - (a.current_co2_kg ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Carbon Footprint Tracker", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faLeaf} className="text-emerald-600" />
              AI Restaurant Carbon Footprint Tracker
            </h1>
            <p className="text-sm text-neutral-500">
              CO2 emissions from 5 sources — net-zero goal tracking + ESG compliance
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Calculating…' : 'Run carbon scan'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon={faTriangleExclamation}
            label="Critical emissions"
            value={String(summary.criticalCount)}
            color="text-rose-600"
          />
          <SummaryCard
            icon={faLeaf}
            label="Open alerts"
            value={String(summary.totalAlerts)}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faLeaf}
            label="Reduction potential"
            value={`${(summary.totalReductionPotential / 1000).toFixed(1)} tons CO2`}
            color="text-emerald-600"
          />
          <SummaryCard
            icon={faDollarSign}
            label="Offset cost"
            value={fmt$(summary.totalOffsetCost)}
            color="text-amber-600"
          />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faLeaf} spin className="text-4xl mb-3" />
            <p>Loading carbon alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No carbon alerts</p>
            <p className="text-sm mt-1">Run carbon scan to calculate emissions.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faLeaf, label: alert.rule_id.toUpperCase() };
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
                          <span className={`text-xs font-medium ${SOURCE_COLOR[alert.emission_source] ?? 'text-neutral-500'}`}>
                            {alert.emission_source}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          <span>Current: <span className="font-medium text-neutral-700">{(alert.current_co2_kg / 1000).toFixed(2)} tons</span> ({alert.current_co2_kg} kg)</span>
                          {alert.benchmark_co2_kg != null && <span>Benchmark: {(alert.benchmark_co2_kg / 1000).toFixed(2)} tons</span>}
                          {alert.reduction_potential_kg != null && alert.reduction_potential_kg > 0 && (
                            <span className="text-emerald-600 font-medium">
                              Reduce: {alert.reduction_potential_kg} kg CO2
                            </span>
                          )}
                          {alert.offset_cost != null && alert.offset_cost > 0 && (
                            <span className="text-amber-600">Offset: {fmt$(alert.offset_cost)}</span>
                          )}
                          {alert.est_savings_monthly > 0 && (
                            <span className="text-emerald-600 font-medium">Saves: {fmt$(alert.est_savings_monthly)}/mo</span>
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
          <span>Offset rate: ${config.offsetRate}/ton CO2</span>
          <span>Net-zero target: {config.netZeroYear}</span>
          <span>Monthly goal: {(config.monthlyGoalKg / 1000).toFixed(1)} tons CO2</span>
          <span>Grid rate: {config.energyKwhRate} kg CO2/kWh</span>
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

export default CarbonFootprintTrackerScreen;
