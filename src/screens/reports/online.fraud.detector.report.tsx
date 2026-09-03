/**
 * AI Online Order Fraud Detector — external customer-side fraud dashboard.
 *
 * 58th POSR-exclusive differentiator — online food order fraud costs
 * restaurants $2-5k/year per location (Statista, Radial).
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
  faShieldHalved, faRotate, faLightbulb, faCheckCircle,
  faCreditCard, faLocationDot, faUsers, faGaugeHigh, faNetworkWired,
  faBan, faCircleCheck,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runOnlineFraudEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readOnlineFraudConfig, DEFAULT_ONLINE_FRAUD_CONFIG,
  type OnlineFraudAlert,
} from "@/lib/online-fraud-detector.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  stolen_card_pattern: { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faCreditCard,    label: 'STOLEN CARD' },
  fake_address:        { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faLocationDot,   label: 'FAKE ADDRESS' },
  multi_account_abuse: { bg: 'bg-violet-50',   text: 'text-violet-700',  icon: faUsers,         label: 'MULTI-ACCOUNT' },
  velocity_fraud:      { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faGaugeHigh,     label: 'VELOCITY FRAUD' },
  vpn_proxy_detected:  { bg: 'bg-orange-50',   text: 'text-orange-700',  icon: faNetworkWired,  label: 'VPN/PROXY' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const riskColor = (score: number): string => {
  if (score >= 75) return 'text-rose-600';
  if (score >= 60) return 'text-amber-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-neutral-500';
};

const riskBarColor = (score: number): string => {
  if (score >= 75) return 'bg-rose-500';
  if (score >= 60) return 'bg-amber-500';
  if (score >= 40) return 'bg-yellow-400';
  return 'bg-neutral-300';
};

const parseLinkedAccounts = (json?: string): string[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
};

export function OnlineFraudDetectorScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<OnlineFraudAlert[]>([]);
  const [summary, setSummary] = useState({ criticalCount: 0, totalAlerts: 0, totalOrderValue: 0, avgRiskScore: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_ONLINE_FRAUD_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readOnlineFraudConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[online-fraud-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runOnlineFraudEngine(db, config);
      toast.success(result.alerts.length > 0
        ? `Detected ${result.alerts.length} fraud alerts — ${result.alerts.filter(a => a.severity === 'critical').length} critical, ${withCurrency(result.alerts.reduce((s, a) => s + a.est_loss, 0))} at risk`
        : `No fraud detected — all recent orders appear legitimate`);
      await reload();
    } catch (err) { console.error('[online-fraud-report] analyze failed', err); toast.error('Engine failed — see console'); }
    finally { setAnalyzing(false); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (alertId: string, status: 'blocked' | 'verified' | 'allowed') => {
    try { await updateAlertStatus(db, alertId, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  // Sort: critical first, then by risk_score desc
  const sortedAlerts = [...alerts].sort((a, b) => {
    const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    if (sev[a.severity] !== sev[b.severity]) return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
    return b.risk_score - a.risk_score;
  });

  return (
    <Layout>
      <DocumentTitle parts={["Online Fraud Detector", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faShieldHalved} className="text-rose-600" />
              AI Online Fraud Detector
            </h1>
            <p className="text-sm text-neutral-500">
              Detects external customer fraud — stolen cards, fake addresses, velocity, VPN (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? 'Scanning…' : 'Scan orders'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faShieldHalved} className="text-5xl mb-4 text-emerald-300" />
            <p className="text-lg font-medium text-neutral-500">No fraud detected!</p>
            <p className="text-sm mt-1">Click "Scan orders" to analyze recent online orders for fraud signals.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center ring-2 ring-rose-200">
                <div className="text-xs text-rose-700 font-semibold flex items-center justify-center gap-1"><FontAwesomeIcon icon={faShieldHalved} />Critical</div>
                <div className="text-3xl font-bold text-rose-700 tabular-nums">{summary.criticalCount}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faShieldHalved} />Total alerts</div>
                <div className="text-2xl font-bold text-amber-700 tabular-nums">{summary.totalAlerts}</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-300 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faCreditCard} />Order value at risk</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{withCurrency(summary.totalOrderValue)}</div>
              </div>
              <div className="bg-violet-50 rounded-lg border border-violet-200 p-3 text-center">
                <div className="text-xs text-violet-600">Avg risk score</div>
                <div className={`text-2xl font-bold tabular-nums ${riskColor(summary.avgRiskScore)}`}>{summary.avgRiskScore.toFixed(0)}/100</div>
              </div>
            </div>

            {/* Alerts table */}
            <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
              <div className="px-3 py-2 border-b border-neutral-200 bg-neutral-50">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <FontAwesomeIcon icon={faShieldHalved} className="text-rose-600" />
                  Fraud Alerts (sorted by risk score)
                </h2>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 border-b border-neutral-200 sticky top-0">
                    <tr>
                      <th className="p-3 text-left">Order / Customer</th>
                      <th className="p-3 text-center">Rule</th>
                      <th className="p-3 text-right">Order value</th>
                      <th className="p-3 text-right">Risk score</th>
                      <th className="p-3 text-left">Signals</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAlerts.map((a, idx) => {
                      const style = RULE_STYLE[a.rule_id] ?? RULE_STYLE.stolen_card_pattern;
                      const linkedAccounts = parseLinkedAccounts(a.linked_accounts);
                      return (
                        <tr key={idx} className="border-b border-neutral-100 hover:bg-neutral-50 align-top">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_DOT[a.severity] ?? SEVERITY_DOT.low}`}></span>
                              <span className="font-medium">{a.customer_name}</span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-0.5">{a.description}</p>
                            {a.device_fingerprint && (
                              <p className="text-xs text-violet-500 mt-0.5">Device: {a.device_fingerprint.slice(0, 16)}...</p>
                            )}
                            {a.ip_address && (
                              <p className="text-xs text-blue-500 mt-0.5">IP: {a.ip_address}</p>
                            )}
                            {linkedAccounts.length > 0 && (
                              <p className="text-xs text-rose-500 mt-0.5">Linked: {linkedAccounts.join(', ')}</p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
                              <FontAwesomeIcon icon={style.icon} className="mr-1" />{style.label}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold text-rose-600">{withCurrency(a.order_value)}</td>
                          <td className="p-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-lg font-bold tabular-nums ${riskColor(a.risk_score)}`}>{a.risk_score}</span>
                              <div className="w-16 h-1.5 bg-neutral-100 rounded">
                                <div className={`h-1.5 rounded ${riskBarColor(a.risk_score)}`} style={{ width: `${a.risk_score}%` }}></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {a.address_mismatch && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Addr mismatch</span>}
                              {a.is_vpn_proxy && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">VPN</span>}
                              {a.order_count_24h !== undefined && a.order_count_24h >= 3 && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">{a.order_count_24h} orders/24h</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center flex-col">
                              <button onClick={() => a.id && handleStatus(a.id, 'blocked')} className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 whitespace-nowrap font-medium">
                                <FontAwesomeIcon icon={faBan} className="mr-1" />Block
                              </button>
                              <button onClick={() => a.id && handleStatus(a.id, 'verified')} className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap font-medium">
                                <FontAwesomeIcon icon={faCircleCheck} className="mr-1" />Verify
                              </button>
                              <button onClick={() => a.id && handleStatus(a.id, 'allowed')} className="text-xs px-2 py-1 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200">
                                Allow
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
                  <span className="text-xs font-bold text-violet-600">{a.customer_name}</span>
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
              <span>Velocity threshold: <strong>{config.velocityThreshold} orders/24h</strong></span>
              <span>High-value threshold: <strong>{withCurrency(config.highValueThreshold)}</strong></span>
              <span>Block threshold: <strong>{config.blockThreshold}/100</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default OnlineFraudDetectorScreen;
