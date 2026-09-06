/**
 * AI Digital Menu & QR Code Experience Optimizer — predicts how digital menu
 * / QR code experience (scan speed, page load, mobile optimization, photo
 * integration, multi-language, accessibility, payment integration, QR
 * placement) impacts satisfaction, order accuracy, upsell revenue, and
 * operational efficiency.
 *
 * 161st POSR-exclusive differentiator.
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
  faQrcode, faRotate, faGaugeHigh, faMobileScreen,
  faCamera, faLanguage, faUniversalAccess, faCreditCard,
  faMagnifyingGlass, faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runDigitalMenuQrEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readDigitalMenuQrConfig, DEFAULT_DIGITAL_MENU_QR_CONFIG,
  type DigitalMenuQrAlert,
} from "@/lib/digital-menu-qr.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  qr_scan_failure_rate_high:      { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faQrcode,             label: 'SCAN FAILURES' },
  page_load_too_slow:             { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faGaugeHigh,          label: 'SLOW LOAD' },
  mobile_optimization_poor:       { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faMobileScreen,       label: 'POOR MOBILE UX' },
  menu_photo_missing:             { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faCamera,             label: 'MISSING PHOTOS' },
  multi_language_unavailable:     { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faLanguage,           label: 'NO LANGUAGES' },
  accessibility_gap:              { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faUniversalAccess,   label: 'A11Y GAP' },
  payment_integration_missing:    { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faCreditCard,         label: 'NO MOBILE PAY' },
  qr_placement_suboptimal:        { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faMagnifyingGlass,    label: 'POOR PLACEMENT' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function DigitalMenuQrScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<DigitalMenuQrAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, zonesAtRisk: 0, slowLoadZones: 0, avgMobileScore: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_DIGITAL_MENU_QR_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readDigitalMenuQrConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[digital-menu-qr-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runDigitalMenuQrEngine(db, config);
      toast.success(`Analyzed ${result.generated} digital menu / QR signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[digital-menu-qr-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[digital-menu-qr-report] status failed', err);
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
      <DocumentTitle parts={["AI Digital Menu & QR Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faQrcode} className="text-sky-500" />
              AI Digital Menu &amp; QR Code Experience Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how QR menu experience impacts satisfaction + upsell — 65% prefer QR menus (Toast 2024); digital menus increase avg ticket 12-22%
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faQrcode} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze digital menu'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faGaugeHigh} label="Slow-load zones" value={String(summary.slowLoadZones)} color={summary.slowLoadZones > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faMobileScreen} label="Avg mobile UX" value={`${summary.avgMobileScore.toFixed(0)}/100`} color={summary.avgMobileScore < 70 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Zones at risk" value={String(summary.zonesAtRisk)} color={summary.zonesAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faQrcode} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faQrcode} spin className="text-4xl mb-3" />
            <p>Analyzing digital menu &amp; QR code experience opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No digital menu alerts</p>
            <p className="text-sm mt-1">QR codes scan reliably, menu loads fast, mobile UX optimized, photos + multi-language + accessibility all in place.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faQrcode, label: alert.rule_id.toUpperCase() };
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
                          {alert.zone && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.zone}</span>
                          )}
                          {alert.qr_scan_failure_rate_pct != null && alert.qr_scan_failure_rate_pct > 0 && (
                            <span className={`text-xs ${alert.qr_scan_failure_rate_pct > 10 ? 'text-rose-600 font-medium' : alert.qr_scan_failure_rate_pct > 5 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.qr_scan_failure_rate_pct}% scan fail</span>
                          )}
                          {alert.page_load_seconds != null && alert.page_load_seconds > 0 && (
                            <span className={`text-xs ${alert.page_load_seconds > 5 ? 'text-rose-600 font-medium' : alert.page_load_seconds > 3 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.page_load_seconds}s load</span>
                          )}
                          {alert.target_load_seconds != null && alert.target_load_seconds > 0 && (
                            <span className="text-xs text-neutral-400">target {alert.target_load_seconds}s</span>
                          )}
                          {alert.mobile_optimization_score != null && alert.mobile_optimization_score > 0 && (
                            <span className={`text-xs ${alert.mobile_optimization_score < 50 ? 'text-rose-600 font-medium' : alert.mobile_optimization_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.mobile_optimization_score}/100 mobile</span>
                          )}
                          {alert.photo_coverage_pct != null && alert.photo_coverage_pct > 0 && (
                            <span className={`text-xs ${alert.photo_coverage_pct < 30 ? 'text-rose-600 font-medium' : alert.photo_coverage_pct < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.photo_coverage_pct}% photos</span>
                          )}
                          {alert.language_count != null && alert.language_count > 0 && (
                            <span className={`text-xs ${alert.language_count < 2 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.language_count} lang</span>
                          )}
                          {alert.accessibility_score != null && alert.accessibility_score > 0 && (
                            <span className={`text-xs ${alert.accessibility_score < 50 ? 'text-rose-600 font-medium' : alert.accessibility_score < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.accessibility_score}/100 a11y</span>
                          )}
                          {alert.qr_placement_quality_score != null && alert.qr_placement_quality_score > 0 && (
                            <span className={`text-xs ${alert.qr_placement_quality_score < 50 ? 'text-rose-600 font-medium' : alert.qr_placement_quality_score < 75 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.qr_placement_quality_score}/100 placement</span>
                          )}
                          {alert.qr_code_size_inches != null && alert.qr_code_size_inches > 0 && (
                            <span className={`text-xs ${alert.qr_code_size_inches < 1 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.qr_code_size_inches}" QR</span>
                          )}
                          {alert.has_mobile_pay && (
                            <span className="text-xs text-emerald-600 font-medium">mobile pay</span>
                          )}
                          {alert.has_multilingual && (
                            <span className="text-xs text-emerald-600 font-medium">multilingual</span>
                          )}
                          {alert.has_screen_reader_support && (
                            <span className="text-xs text-emerald-600 font-medium">screen reader</span>
                          )}
                          {alert.mobile_friendly && (
                            <span className="text-xs text-emerald-600 font-medium">mobile-friendly</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.predicted_spend_change_pct != null && alert.predicted_spend_change_pct > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_spend_change_pct}% spend</span>
                          )}
                          {alert.predicted_spend_change_pct != null && alert.predicted_spend_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_spend_change_pct}% spend</span>
                          )}
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_satisfaction_change} satisfaction</span>
                          )}
                          {alert.predicted_satisfaction_change != null && alert.predicted_satisfaction_change > 0 && (
                            <span className="text-emerald-600">+{alert.predicted_satisfaction_change} satisfaction</span>
                          )}
                          {alert.predicted_order_accuracy_change != null && alert.predicted_order_accuracy_change < 0 && (
                            <span className="text-rose-600">{alert.predicted_order_accuracy_change}% order accuracy</span>
                          )}
                          {alert.predicted_abandonment_pct != null && alert.predicted_abandonment_pct > 0 && (
                            <span className="text-rose-600">~{alert.predicted_abandonment_pct}% abandon</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faQrcode} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
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
          <span>Max scan failure: {config.maxQrScanFailurePct}%</span>
          <span>Max load time: {config.maxPageLoadSeconds}s</span>
          <span>Min mobile UX: {config.minMobileOptimizationScore}/100</span>
          <span>Min photo coverage: {config.minPhotoCoveragePct}%</span>
          <span>Min languages: {config.minLanguageCount}</span>
          <span>Min accessibility: {config.minAccessibilityScore}/100</span>
          <span>Min QR placement: {config.minQrPlacementScore}/100</span>
          <span>Min QR size: {config.minQrCodeSizeInches}"</span>
          <span className="text-neutral-400">161st POSR-exclusive differentiator</span>
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

export default DigitalMenuQrScreen;
