/**
 * Cash Flow Early Warning Dashboard — 7-day cash position projection.
 *
 * 36th POSR-exclusive differentiator — 60% of closures are due to cash flow
 * problems that could have been predicted. POSR projects 7-day position.
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
  faTriangleExclamation, faRobot, faRotate, faLightbulb,
  faCheckCircle, faDollarSign, faCalendarDay,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runCashWarning, getLatestWarning,
  readCashWarningConfig, DEFAULT_CASH_WARNING_CONFIG,
  type CashEarlyWarning, type WarningLevel,
} from "@/lib/cash-early-warning.service.ts";

const LEVEL_STYLE: Record<WarningLevel, { bg: string; text: string; border: string; icon: any; label: string }> = {
  safe:       { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-400', icon: faCheckCircle, label: 'Safe' },
  caution:    { bg: 'bg-amber-50',    text: 'text-amber-700',  border: 'border-amber-400',  icon: faDollarSign,  label: 'Caution' },
  critical:   { bg: 'bg-orange-50',   text: 'text-orange-700', border: 'border-orange-400', icon: faTriangleExclamation, label: 'Critical' },
  emergency:  { bg: 'bg-rose-50',     text: 'text-rose-700',  border: 'border-rose-500',  icon: faTriangleExclamation, label: 'Emergency' },
};

const REC_LABEL: Record<string, string> = {
  delay_payments: 'Delay payments', accelerate_collections: 'Accelerate collections',
  arrange_credit: 'Arrange credit', reduce_spending: 'Reduce spending', no_action: 'No action',
};

export function CashEarlyWarningScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [warning, setWarning] = useState<CashEarlyWarning | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_CASH_WARNING_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readCashWarningConfig(settingsRows[0] ?? {}));
      const w = await getLatestWarning(db);
      setWarning(w);
    } catch (err) { console.error('[cash-warning-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true); setProgress({ current: 0, total: 2 });
    try {
      const result = await runCashWarning(db, config, (current, total) => setProgress({ current, total }));
      if (result.warning) {
        toast.success(`Cash projection complete — ${result.warning.warning_level} level, min balance ${withCurrency(result.warning.min_projected_balance)} in 7 days`);
      } else {
        toast.error('Could not compute cash projection');
      }
      await reload();
    } catch (err) { console.error('[cash-warning-report] analyze failed', err); toast.error('Projection failed — see console'); }
    finally { setAnalyzing(false); setProgress({ current: 0, total: 0 }); }
  }, [db, config, reload]);

  const style = warning ? (LEVEL_STYLE[warning.warning_level] ?? LEVEL_STYLE.safe) : LEVEL_STYLE.safe;

  return (
    <Layout>
      <DocumentTitle parts={["Cash Early Warning", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTriangleExclamation} className="text-rose-600" />
              Cash Flow Early Warning
            </h1>
            <p className="text-sm text-neutral-500">
              AI 7-day cash position projection — predict shortfalls before they happen (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Projecting… (${progress.current}/${progress.total})` : 'Project cash'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading…</p>
          </div>
        ) : !warning ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faDollarSign} className="text-5xl mb-4 text-neutral-300" />
            <p className="text-lg font-medium text-neutral-500">No cash projection yet!</p>
            <p className="text-sm mt-1">Click "Project cash" to generate a 7-day forecast.</p>
          </div>
        ) : (
          <>
            {/* Warning banner */}
            <div className={`rounded-lg border-2 p-6 ${style.bg} ${style.border}`}>
              <div className="flex items-center gap-3 mb-3">
                <FontAwesomeIcon icon={style.icon} className={`text-3xl ${style.text}`} />
                <div>
                  <div className="text-xs text-neutral-500">Warning Level</div>
                  <div className={`text-2xl font-bold ${style.text}`}>{style.label}</div>
                </div>
                {warning.est_days_until_negative < 999 && (
                  <div className="ml-auto text-right">
                    <div className="text-xs text-neutral-500">Days until negative</div>
                    <div className="text-2xl font-bold text-rose-600 tabular-nums">{warning.est_days_until_negative}</div>
                  </div>
                )}
              </div>

              {/* Key metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white/70 rounded p-3 text-center">
                  <div className="text-xs text-neutral-500">Current balance</div>
                  <div className="text-xl font-bold tabular-nums text-neutral-700">{withCurrency(warning.current_balance)}</div>
                </div>
                <div className="bg-white/70 rounded p-3 text-center">
                  <div className="text-xs text-neutral-500">Min projected (7d)</div>
                  <div className={`text-xl font-bold tabular-nums ${warning.min_projected_balance < 0 ? 'text-rose-600' : 'text-amber-600'}`}>{withCurrency(warning.min_projected_balance)}</div>
                </div>
                <div className="bg-white/70 rounded p-3 text-center">
                  <div className="text-xs text-neutral-500 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faDollarSign} />Projected inflow (7d)</div>
                  <div className="text-xl font-bold tabular-nums text-emerald-600">{withCurrency(warning.projected_inflow)}</div>
                </div>
                <div className="bg-white/70 rounded p-3 text-center">
                  <div className="text-xs text-neutral-500">Projected outflow (7d)</div>
                  <div className="text-xl font-bold tabular-nums text-rose-600">{withCurrency(warning.projected_outflow)}</div>
                </div>
              </div>
            </div>

            {/* Known obligations */}
            {warning.known_obligations && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <div className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faCalendarDay} /> Known Obligations (next 7 days)
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-neutral-500">Payroll due</div>
                    <div className="font-bold tabular-nums text-rose-600">{withCurrency(warning.known_obligations.payroll ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">PO payments</div>
                    <div className="font-bold tabular-nums text-rose-600">{withCurrency(warning.known_obligations.po_payments ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Rent</div>
                    <div className="font-bold tabular-nums text-rose-600">{withCurrency(warning.known_obligations.rent ?? 0)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500">Other</div>
                    <div className="font-bold tabular-nums text-rose-600">{withCurrency(warning.known_obligations.other ?? 0)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* AI insight */}
            {warning.ai_insight && (
              <div className="bg-violet-50/70 rounded-lg border border-violet-200 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FontAwesomeIcon icon={faLightbulb} className="text-violet-600" />
                  <span className="font-semibold text-violet-700">AI Insight</span>
                  {warning.ai_recommendation && (
                    <span className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-700 font-medium">
                      Rec: {REC_LABEL[warning.ai_recommendation] ?? warning.ai_recommendation}
                    </span>
                  )}
                </div>
                <p className="text-sm text-violet-700">{warning.ai_insight}</p>
              </div>
            )}

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Reserve threshold: <strong>{(config.reservePct * 100).toFixed(0)}% of monthly revenue</strong></span>
              <span>Critical threshold: <strong>{(config.criticalPct * 100).toFixed(0)}% of monthly revenue</strong></span>
              <span>Projection window: <strong>7 days</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default CashEarlyWarningScreen;
