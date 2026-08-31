/**
 * AI Energy Vampire Detector — phantom/standby load detection dashboard.
 *
 * 50th POSR-exclusive differentiator — restaurants waste 5-10% of electricity
 * on phantom loads (DOE Energy Star).
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
  faPlugCircleXmark, faRotate, faLightbulb, faCheckCircle,
  faBolt, faLeaf, faClock, faCalculator,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runVampireEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readVampireConfig, DEFAULT_VAMPIRE_CONFIG,
  type EnergyVampireAlert,
} from "@/lib/energy-vampire.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  standby_phantom_load: { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faBolt,         label: 'PHANTOM LOAD' },
  always_on_candidate:  { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faPlugCircleXmark, label: 'ALWAYS-ON' },
  inefficient_aging:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faClock,         label: 'AGING' },
  unplug_opportunity:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faPlugCircleXmark, label: 'UNPLUG' },
  smart_plug_roi:       { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: faCalculator,    label: 'SMART PLUG ROI' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

export function EnergyVampireScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<EnergyVampireAlert[]>([]);
  const [summary, setSummary] = useState({ deviceCount: 0, totalAnnualCost: 0, totalAnnualKwh: 0, totalCo2: 0, totalSmartPlugPayback: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_VAMPIRE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readVampireConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[vampire-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runVampireEngine(db, config);
      toast.success(result.alerts.length > 0
        ? `Detected ${result.alerts.length} vampire devices — total waste ${withCurrency(result.alerts.reduce((s, a) => s + a.annual_cost, 0))}/yr`
        : `No vampire devices detected`);
      await reload();
    } catch (err) { console.error('[vampire-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'mitigated' | 'declined') => {
    try { await updateAlertStatus(db, alertId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: smart_plug_roi aggregate first, then by annual_cost desc
  const sortedAlerts = [...alerts].sort((a, b) => {
    if (a.rule_id === 'smart_plug_roi' && b.rule_id !== 'smart_plug_roi') return -1;
    if (b.rule_id === 'smart_plug_roi' && a.rule_id !== 'smart_plug_roi') return 1;
    return b.annual_cost - a.annual_cost;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Energy Vampire", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faPlugCircleXmark} className="text-rose-600" />
              AI Energy Vampire Detector
            </h1>
            <p className="text-sm text-neutral-500">
              Detects phantom/standby power drain — devices drawing power when "off" (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Scanning…' : 'Scan for vampires'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faPlugCircleXmark} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No vampire devices detected!</p>
            <p className="text-sm mt-1">Click "Scan for vampires" to identify phantom power drain.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faPlugCircleXmark} />Vampire devices</div>
                <div className="text-3xl font-bold text-rose-700 tabular-nums">{summary.deviceCount}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-300 p-3 text-center">
                <div className="text-xs text-rose-700 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faBolt} />Annual waste</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalAnnualCost)}</div>
                <div className="text-xs text-rose-500 mt-0.5">{summary.totalAnnualKwh.toFixed(0)} kWh/yr</div>
              </div>
              <div className="bg-emerald-50 rounded-lg border border-emerald-200 p-3 text-center">
                <div className="text-xs text-emerald-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faLeaf} />CO₂ emissions</div>
                <div className="text-2xl font-bold text-emerald-700 tabular-nums">{summary.totalCo2.toFixed(0)} kg</div>
                <div className="text-xs text-emerald-500 mt-0.5">per year</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faClock} />Plug payback</div>
                <div className="text-2xl font-bold text-violet-700 tabular-nums">{summary.totalSmartPlugPayback.toFixed(1)} mo</div>
                <div className="text-xs text-violet-500 mt-0.5">avg ROI</div>
              </div>
            </div>

            {/* Alerts table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faPlugCircleXmark} className="text-rose-600" />
                  Vampire Devices (sorted by annual waste)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Equipment</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Standby W</th>
                      <th className="p-3 text-right">Annual kWh</th>
                      <th className="p-3 text-right">Annual cost</th>
                      <th className="p-3 text-right">CO₂ kg/yr</th>
                      <th className="p-3 text-right">Plug cost</th>
                      <th className="p-3 text-right">Payback</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAlerts.map((a, idx) => {
                      const style = RULE_STYLE[a.rule_id] ?? RULE_STYLE.standby_phantom_load;
                      const isAggregate = a.rule_id === 'smart_plug_roi';
                      return (
                        <tr key={idx} className={`border-b border-neutral-100 hover:bg-neutral-50 ${isAggregate ? 'bg-emerald-50/40' : ''}`}>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[a.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">{a.equipment_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{a.location} — {a.description}</p>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold text-rose-600">{a.standby_watts}W</td>
                          <td className="p-3 text-right tabular-nums">{a.annual_kwh.toFixed(0)}</td>
                          <td className="p-3 text-right tabular-nums font-bold text-rose-600">{withCurrency(a.annual_cost)}</td>
                          <td className="p-3 text-right tabular-nums text-emerald-600">{a.co2_kg_per_year.toFixed(0)}</td>
                          <td className="p-3 text-right tabular-nums">{a.smart_plug_cost ? withCurrency(a.smart_plug_cost) : '—'}</td>
                          <td className="p-3 text-right">
                            {a.payback_months !== undefined ? (
                              <span className={`tabular-nums font-bold ${a.payback_months < 6 ? 'text-emerald-600' : a.payback_months < 12 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {a.payback_months.toFixed(1)}mo
                              </span>
                            ) : <span className="text-neutral-400">—</span>}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => a.id && handleStatus(a.id, 'mitigated')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap">
                                <FontAwesomeIcon icon={faCheckCircle} /> Fixed
                              </button>
                              <button onClick={() => a.id && handleStatus(a.id, 'declined')} className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                                Skip
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI insights */}
            {alerts.filter(a => a.ai_insight).slice(0, 5).map((a, idx) => (
              <div key={idx} className="rounded-lg border p-3 bg-violet-50/70 border-violet-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold text-violet-600">{a.equipment_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RULE_STYLE[a.rule_id].bg} ${RULE_STYLE[a.rule_id].text}`}>{a.rule_id.replace(/_/g, ' ')}</span>
                  {a.ai_recommendation && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 capitalize">{a.ai_recommendation.replace(/_/g, ' ')}</span>
                  )}
                </div>
                <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{a.ai_insight}</p>
              </div>
            ))}

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Electricity rate: <strong>${config.electricityRate.toFixed(3)}/kWh</strong></span>
              <span>Min standby: <strong>{config.minStandbyWatts}W</strong></span>
              <span>Closed at: <strong>{config.closedHoursStart}:00</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default EnergyVampireScreen;
