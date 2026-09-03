/**
 * Delivery Performance Dashboard — per-platform metrics + AI recommendations.
 *
 * Research finding: Toast Delivery Analytics $30+/mo (higher tier), Square
 * Delivery Reporting in Plus. POSR offers it free.
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
  faTruck, faDollarSign, faCheckCircle, faXmark, faClock, faRobot,
  faRotate, faLightbulb, faPercent, faChartBar,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeDeliveryPerformance,
  getDeliveryPerformance,
  readDeliveryConfig,
  DEFAULT_DELIVERY_CONFIG,
  PLATFORM_LABELS,
  type DeliveryPerformance,
  type DeliveryGrade,
} from "@/lib/delivery-analytics.service.ts";

const GRADE_STYLE: Record<DeliveryGrade, { bg: string; text: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700' },
  C: { bg: 'bg-amber-100', text: 'text-amber-700' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700' },
  F: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

const REC_LABEL: Record<string, string> = {
  promote: 'Promote', maintain: 'Maintain', renegotiate: 'Renegotiate commission',
  pause: 'Pause', expand: 'Expand',
};

export function DeliveryAnalyticsScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [performances, setPerformances] = useState<DeliveryPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_DELIVERY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readDeliveryConfig(settingsRows[0] ?? {}));
      const list = await getDeliveryPerformance(db);
      setPerformances(list);
    } catch (err) {
      console.error('[delivery-report] reload failed', err);
      toast.error('Failed to load delivery data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await analyzeDeliveryPerformance(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setPerformances(result.performances);
      toast.success(
        result.performances.length > 0
          ? `Analyzed ${result.performances.length} delivery platforms — total revenue ${withCurrency(result.totalRevenue)}`
          : 'No delivery orders found in the lookback period.'
      );
    } catch (err) {
      console.error('[delivery-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const stats = useMemo(() => {
    if (performances.length === 0) return { totalRevenue: 0, totalOrders: 0, totalCommission: 0, totalNet: 0 };
    return {
      totalRevenue: performances.reduce((s, p) => s + p.total_revenue, 0),
      totalOrders: performances.reduce((s, p) => s + p.total_orders, 0),
      totalCommission: performances.reduce((s, p) => s + p.commission_paid, 0),
      totalNet: performances.reduce((s, p) => s + p.net_revenue, 0),
    };
  }, [performances]);

  return (
    <Layout>
      <DocumentTitle parts={["Delivery Analytics", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faTruck} className="text-orange-600" />
              Delivery Analytics
            </h1>
            <p className="text-sm text-neutral-500">
              Per-platform delivery performance — DoorDash/UberEats/Grubhub — acceptance + cancellation + fulfillment + commission + AI recs
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze delivery'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading delivery data…</p>
          </div>
        ) : performances.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faTruck} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No delivery data yet</p>
            <p className="text-sm mt-1">Click "Analyze delivery" to compute platform performance.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faDollarSign} label="Total revenue" value={withCurrency(stats.totalRevenue)} color="text-emerald-600" />
              <SummaryCard icon={faTruck} label="Total orders" value={stats.totalOrders} color="text-orange-600" />
              <SummaryCard icon={faPercent} label="Commission paid" value={withCurrency(stats.totalCommission)} color="text-rose-600" />
              <SummaryCard icon={faChartBar} label="Net revenue" value={withCurrency(stats.totalNet)} color="text-blue-600" />
            </div>

            {/* Platform cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {performances.map((p, idx) => {
                const grade = GRADE_STYLE[p.grade as DeliveryGrade] ?? GRADE_STYLE.C;
                const label = PLATFORM_LABELS[p.platform] ?? p.platform;
                return (
                  <div key={idx} className="bg-white rounded-lg border border-neutral-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FontAwesomeIcon icon={faTruck} className="text-xl text-orange-600" />
                        <div>
                          <div className="font-bold">{label}</div>
                          <div className="text-xs text-neutral-500">{p.revenue_share_pct}% of delivery revenue</div>
                        </div>
                      </div>
                      <span className={`inline-block w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${grade.bg} ${grade.text}`}>
                        {p.grade}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                      <div className="bg-neutral-50 rounded p-2 text-center">
                        <div className="text-neutral-500">Orders</div>
                        <div className="font-semibold tabular-nums">{p.total_orders}</div>
                      </div>
                      <div className="bg-neutral-50 rounded p-2 text-center">
                        <div className="text-neutral-500">Avg order</div>
                        <div className="font-semibold tabular-nums">{withCurrency(p.avg_order_value)}</div>
                      </div>
                      <div className="bg-neutral-50 rounded p-2 text-center">
                        <div className="text-neutral-500">Acceptance</div>
                        <div className={`font-semibold ${p.acceptance_rate >= 0.9 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {(p.acceptance_rate * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="bg-neutral-50 rounded p-2 text-center">
                        <div className="text-neutral-500">Cancellation</div>
                        <div className={`font-semibold ${p.cancellation_rate < 0.05 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {(p.cancellation_rate * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="bg-neutral-50 rounded p-2 text-center">
                        <div className="text-neutral-500">Fulfillment</div>
                        <div className="font-semibold tabular-nums">{p.avg_fulfillment_minutes}min</div>
                      </div>
                      <div className="bg-neutral-50 rounded p-2 text-center">
                        <div className="text-neutral-500">Net revenue</div>
                        <div className="font-semibold tabular-nums text-emerald-600">{withCurrency(p.net_revenue)}</div>
                      </div>
                    </div>

                    <div className="flex gap-2 text-xs mb-2">
                      <span className="px-2 py-1 rounded-full bg-rose-50 text-rose-700">
                        Commission: {withCurrency(p.commission_paid)}
                      </span>
                      {p.ai_recommendation && (
                        <span className={`px-2 py-1 rounded-full ${
                          p.ai_recommendation === 'promote' || p.ai_recommendation === 'expand' ? 'bg-emerald-100 text-emerald-700' :
                          p.ai_recommendation === 'pause' ? 'bg-rose-100 text-rose-700' :
                          p.ai_recommendation === 'renegotiate' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {REC_LABEL[p.ai_recommendation] ?? p.ai_recommendation}
                        </span>
                      )}
                    </div>

                    {p.ai_insight && (
                      <p className="text-xs text-violet-600 italic">💡 {p.ai_insight}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Platforms: <strong>{performances.length}</strong></span>
              <span>DoorDash commission: <strong>{config.commissions.doordash}%</strong></span>
              <span>UberEats commission: <strong>{config.commissions.ubereats}%</strong></span>
              <span>Grubhub commission: <strong>{config.commissions.grubhub}%</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon, label, value, color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default DeliveryAnalyticsScreen;
