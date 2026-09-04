/**
 * AI Restaurant Waste-to-Value Converter — identifies reusable waste,
 * suggests conversion to value (stock, compost, donation, biodiesel, etc.).
 *
 * 98th POSR-exclusive differentiator — 95% of waste goes to landfill, but
 * 60-70% can be converted to value ($500-2,000/mo potential).
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
  faRecycle, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faUtensils, faSeedling, faHandHoldingHeart,
  faTractor, faGasPump, faMugHot, faBreadSlice, faBox,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runWasteValueEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readWasteValueConfig, DEFAULT_WASTE_VALUE_CONFIG,
  type WasteValueAlert,
} from "@/lib/waste-to-value-converter.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  food_scrap_reuse:      { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faUtensils,           label: 'SCRAP REUSE' },
  compost_opportunity:   { bg: 'bg-lime-50',    text: 'text-lime-700',    icon: faSeedling,          label: 'COMPOST' },
  donation_eligible:     { bg: 'bg-violet-50',  text: 'text-violet-700',  icon: faHandHoldingHeart,  label: 'DONATION' },
  animal_feed_partner:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faTractor,           label: 'ANIMAL FEED' },
  biogas_biodiesel:      { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faGasPump,           label: 'BIODIESEL' },
  stock_base_creation:   { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faMugHot,              label: 'STOCK BASE' },
  leftover_repurposing:  { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faBreadSlice,         label: 'REPURPOSE' },
  packaging_recycle:     { bg: 'bg-blue-50',    text: 'text-blue-700',    icon: faBox,               label: 'RECYCLE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(0)}`;

export function WasteToValueConverterScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<WasteValueAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalValueRecovery: 0, totalCO2Saved: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_WASTE_VALUE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readWasteValueConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[waste-value-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runWasteValueEngine(db, config);
      toast.success(`Found ${result.generated} waste-to-value opportunities — ${fmt$(result.totalValue)}/mo potential`);
      await reload();
    } catch (err) {
      console.error('[waste-value-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[waste-value-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => (b.est_value_recovery ?? 0) - (a.est_value_recovery ?? 0)),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Waste-to-Value Converter", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faRecycle} className="text-emerald-600" />
              AI Waste-to-Value Converter
            </h1>
            <p className="text-sm text-neutral-500">
              Converts waste to value — stock bases, compost, donations, biodiesel, repurposing
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Converting…' : 'Find waste value'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faRecycle} label="Value recovery /mo" value={fmt$(summary.totalValueRecovery)} color="text-emerald-600" />
          <SummaryCard icon={faSeedling} label="CO2 saved /mo" value={`${summary.totalCO2Saved} kg`} color="text-lime-600" />
          <SummaryCard icon={faTriangleExclamation} label="High-value" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faRecycle} label="Open alerts" value={String(summary.totalAlerts)} color="text-emerald-600" />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRecycle} spin className="text-4xl mb-3" />
            <p>Loading waste-to-value alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No waste-to-value alerts</p>
            <p className="text-sm mt-1">Run scan to find waste conversion opportunities.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faRecycle, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.waste_item}</span>
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                          {alert.current_disposal && (
                            <span className="text-xs text-rose-500">{alert.current_disposal} →</span>
                          )}
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.waste_quantity_kg != null && <span>Qty: <span className="font-medium text-neutral-700">{alert.waste_quantity_kg}kg/mo</span></span>}
                          {alert.eco_impact_kg_co2 != null && <span className="text-lime-600">CO2 saved: {alert.eco_impact_kg_co2}kg/mo</span>}
                          {alert.tax_deduction_value != null && alert.tax_deduction_value > 0 && <span className="text-violet-600">Tax deduction: {fmt$(alert.tax_deduction_value)}/mo</span>}
                        </div>
                        {alert.suggested_use && (
                          <div className="mt-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faLightbulb} className="mt-0.5 shrink-0" />
                            <span><strong>Convert to:</strong> {alert.suggested_use}</span>
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
                      <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_value_recovery)}</div>
                      <div className="text-xs text-neutral-400">value/mo</div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Converted
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
          <span>Landfill rate: ${config.landfillRate}/kg</span>
          <span>Compost rate: ${config.compostRate}/kg</span>
          <span>Tax deduction: {config.taxDeductionPct}%</span>
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

export default WasteToValueConverterScreen;
