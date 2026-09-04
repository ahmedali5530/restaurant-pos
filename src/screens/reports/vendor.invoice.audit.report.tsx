/**
 * AI Vendor Invoice Audit Automator — audits invoices against POs/contracts,
 * detects overcharges, discrepancies, unauthorized items.
 *
 * 101st POSR-exclusive differentiator — restaurants lose $200-1,000/mo from
 * vendor invoice errors.
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
  faFileInvoice, faRotate, faLightbulb, faCheckCircle,
  faTriangleExclamation, faDollarSign, faBoxesStacked, faBan,
  faRepeat, faPercent, faClock, faCopy, faFileContract,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  runInvoiceEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readInvoiceConfig, DEFAULT_INVOICE_CONFIG,
  type InvoiceAlert,
} from "@/lib/vendor-invoice-audit.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  price_discrepancy:   { bg: 'bg-rose-50',    text: 'text-rose-700',    icon: faDollarSign,      label: 'PRICE DISCREPANCY' },
  quantity_mismatch:   { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faBoxesStacked,    label: 'QTY MISMATCH' },
  unauthorized_item:   { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faBan,             label: 'UNAUTHORIZED' },
  overcharge_pattern:  { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faRepeat,          label: 'OVERCHARGE PATTERN' },
  missing_discount:    { bg: 'bg-amber-50',   text: 'text-amber-700',   icon: faPercent,         label: 'MISSING DISCOUNT' },
  late_invoice:        { bg: 'bg-sky-50',     text: 'text-sky-700',     icon: faClock,           label: 'LATE INVOICE' },
  duplicate_charge:    { bg: 'bg-rose-100',   text: 'text-rose-800',    icon: faCopy,            label: 'DUPLICATE CHARGE' },
  contract_expiry:     { bg: 'bg-orange-50',  text: 'text-orange-700',  icon: faFileContract,    label: 'CONTRACT EXPIRED' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function VendorInvoiceAuditScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<InvoiceAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalDiscrepancy: 0, totalMonthlyLoss: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_INVOICE_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readInvoiceConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[invoice-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runInvoiceEngine(db, config);
      toast.success(`Generated ${result.generated} invoice audit alerts — ${fmt$(summary.totalMonthlyLoss)}/mo at risk`);
      await reload();
    } catch (err) {
      console.error('[invoice-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalMonthlyLoss]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[invoice-report] status failed', err);
      toast.error('Update failed');
    }
  }, [db, reload]);

  const sortedAlerts = useMemo(() =>
    [...alerts].sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const s = sevOrder[a.severity as keyof typeof sevOrder] - sevOrder[b.severity as keyof typeof sevOrder];
      if (s !== 0) return s;
      return (b.est_monthly_loss ?? 0) - (a.est_monthly_loss ?? 0);
    }),
  [alerts]);

  return (
    <Layout>
      <DocumentTitle parts={["AI Invoice Audit", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faFileInvoice} className="text-amber-600" />
              AI Vendor Invoice Audit Automator
            </h1>
            <p className="text-sm text-neutral-500">
              Audits invoices against POs/contracts — detects overcharges, discrepancies, unauthorized items
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faLightbulb} spin={analyzing} />
              {analyzing ? 'Auditing…' : 'Audit invoices'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTriangleExclamation} label="Critical/high alerts" value={String(summary.criticalCount)} color="text-rose-600" />
          <SummaryCard icon={faFileInvoice} label="Open alerts" value={String(summary.totalAlerts)} color="text-amber-600" />
          <SummaryCard icon={faDollarSign} label="Discrepancy found" value={fmt$(summary.totalDiscrepancy)} color="text-rose-600" />
          <SummaryCard icon={faTriangleExclamation} label="Monthly loss" value={fmt$(summary.totalMonthlyLoss)} color="text-rose-600" />
        </div>

        {/* Alerts list */}
        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faFileInvoice} spin className="text-4xl mb-3" />
            <p>Loading invoice audit alerts…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No invoice audit alerts</p>
            <p className="text-sm mt-1">Run audit to check vendor invoices.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faFileInvoice, label: alert.rule_id.toUpperCase() };
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
                          <span className="font-semibold text-neutral-800">{alert.vendor_name}</span>
                          {alert.invoice_number && <span className="text-xs text-neutral-400">{alert.invoice_number}</span>}
                          {alert.item_name && <span className="text-sm text-neutral-600">{alert.item_name}</span>}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.contracted_price != null && alert.invoiced_price != null && (
                            <span>Price: <span className="font-medium text-neutral-700">{fmt$(alert.contracted_price)}</span> → <span className="font-medium text-rose-600">{fmt$(alert.invoiced_price)}</span></span>
                          )}
                          {alert.ordered_qty != null && alert.invoiced_qty != null && (
                            <span>Qty: ordered {alert.ordered_qty} / invoiced {alert.invoiced_qty}</span>
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
                      <div className="text-lg font-bold text-rose-600">{fmt$(alert.discrepancy_amount)}</div>
                      <div className="text-xs text-neutral-400">discrepancy</div>
                      {alert.est_monthly_loss > 0 && (
                        <>
                          <div className="text-sm font-bold text-rose-600 mt-1">{fmt$(alert.est_monthly_loss)}</div>
                          <div className="text-xs text-neutral-400">loss/mo</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <Button size="sm" variant="primary" className="gap-1.5" onClick={() => alert.id && handleStatus(alert.id, 'resolved')}>
                      <FontAwesomeIcon icon={faCheckCircle} /> Disputed
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
          <span>Price tolerance: ±{config.priceTolerancePct}%</span>
          <span>Qty tolerance: ±{config.qtyTolerancePct}%</span>
          <span>Late threshold: {config.lateThresholdDays}d</span>
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

export default VendorInvoiceAuditScreen;
