/**
 * Server Performance Dashboard — per-server metrics + ranking + AI coaching.
 *
 * Research finding: Toast Server Performance reports in higher tiers (~$35/mo),
 * Square Team Performance in Plus. POSR offers it free.
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
  faUsers, faDollarSign, faCheckCircle, faStar, faRobot, faRotate,
  faLightbulb, faTrophy, faChartLine, faUtensils, faPercent,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  computeServerPerformance,
  getServerPerformance,
  readServerConfig,
  DEFAULT_SERVER_CONFIG,
  type ServerPerformance,
  type ServerGrade,
} from "@/lib/server-performance.service.ts";

const GRADE_STYLE: Record<ServerGrade, { bg: string; text: string }> = {
  A: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  B: { bg: 'bg-blue-100', text: 'text-blue-700' },
  C: { bg: 'bg-amber-100', text: 'text-amber-700' },
  D: { bg: 'bg-orange-100', text: 'text-orange-700' },
  F: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

const COACHING_LABEL: Record<string, string> = {
  recognize: 'Recognize',
  mentor: 'Mentor others',
  coach_accuracy: 'Coach: Accuracy',
  coach_upsell: 'Coach: Upsell',
  coach_speed: 'Coach: Speed',
  monitor: 'Monitor',
};

export function ServerPerformanceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [servers, setServers] = useState<ServerPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_SERVER_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readServerConfig(settingsRows[0] ?? {}));
      const list = await getServerPerformance(db);
      setServers(list);
    } catch (err) {
      console.error('[server-report] reload failed', err);
      toast.error('Failed to load server data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleCompute = useCallback(async () => {
    setComputing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await computeServerPerformance(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setServers(result.servers);
      toast.success(
        result.servers.length > 0
          ? `Analyzed ${result.servers.length} servers — top: ${result.servers[0]?.server_name} (${result.servers[0]?.overall_score}/100)`
          : 'No servers with enough orders to analyze'
      );
    } catch (err) {
      console.error('[server-report] compute failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setComputing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const stats = useMemo(() => {
    if (servers.length === 0) return { avgScore: 0, totalRevenue: 0, avgTicket: 0, topPerformer: null as ServerPerformance | null };
    return {
      avgScore: servers.reduce((s, x) => s + x.overall_score, 0) / servers.length,
      totalRevenue: servers.reduce((s, x) => s + x.total_revenue, 0),
      avgTicket: servers.reduce((s, x) => s + x.avg_ticket_size, 0) / servers.length,
      topPerformer: servers[0] ?? null,
    };
  }, [servers]);

  return (
    <Layout>
      <DocumentTitle parts={["Server Performance", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUsers} className="text-blue-600" />
              Server Performance
            </h1>
            <p className="text-sm text-neutral-500">
              Per-server ranking — revenue, accuracy, tips + AI coaching recommendations
            </p>
          </div>
          <Button onClick={handleCompute} disabled={computing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={computing} />
            {computing ? `Analyzing… (${progress.current}/${progress.total})` : 'Analyze servers'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading server data…</p>
          </div>
        ) : servers.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUsers} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No server performance data yet</p>
            <p className="text-sm mt-1">Click "Analyze servers" to compute performance metrics.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard icon={faUsers} label="Servers" value={servers.length} color="text-blue-600" />
              <SummaryCard icon={faChartLine} label="Avg score" value={`${stats.avgScore.toFixed(0)}/100`} color="text-violet-600" />
              <SummaryCard icon={faDollarSign} label="Total revenue" value={withCurrency(stats.totalRevenue)} color="text-emerald-600" />
              <SummaryCard icon={faTrophy} label="Top performer" value={stats.topPerformer?.server_name ?? '—'} color="text-amber-600" />
            </div>

            {/* Server ranking table */}
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0 z-10">
                    <tr>
                      <th className="text-center p-3">#</th>
                      <th className="text-left p-3">Server</th>
                      <th className="text-center p-3">Grade</th>
                      <th className="text-right p-3">Score</th>
                      <th className="text-right p-3">Orders</th>
                      <th className="text-right p-3">Revenue</th>
                      <th className="text-right p-3">Avg ticket</th>
                      <th className="text-right p-3">Items/order</th>
                      <th className="text-right p-3">Accuracy</th>
                      <th className="text-right p-3">Voids</th>
                      <th className="text-right p-3">Refunds</th>
                      <th className="text-right p-3">Tables</th>
                      <th className="text-right p-3">Tips</th>
                      <th className="text-right p-3">Tip %</th>
                      <th className="text-center p-3">Peak hr</th>
                      <th className="text-left p-3">AI coaching</th>
                      <th className="text-left p-3">AI insight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((server, idx) => {
                      const grade = GRADE_STYLE[server.grade];
                      return (
                        <tr key={idx} className={`border-t hover:bg-neutral-50 ${server.rank === 1 ? 'bg-amber-50' : ''}`}>
                          <td className="p-3 text-center">
                            {server.rank === 1 && <FontAwesomeIcon icon={faTrophy} className="text-amber-500" />}
                            <span className="font-bold tabular-nums ml-1">{server.rank}</span>
                          </td>
                          <td className="p-3 font-medium">{server.server_name}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-block w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center mx-auto ${grade.bg} ${grade.text}`}>
                              {server.grade}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold">{server.overall_score}</td>
                          <td className="p-3 text-right tabular-nums">{server.total_orders}</td>
                          <td className="p-3 text-right tabular-nums font-semibold text-emerald-600">{withCurrency(server.total_revenue)}</td>
                          <td className="p-3 text-right tabular-nums">{withCurrency(server.avg_ticket_size)}</td>
                          <td className="p-3 text-right tabular-nums">{server.avg_items_per_order}</td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={server.accuracy_rate >= 0.95 ? 'text-emerald-600' : server.accuracy_rate >= 0.85 ? 'text-amber-600' : 'text-rose-600'}>
                              {(server.accuracy_rate * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={server.void_count > 5 ? 'text-rose-600' : 'text-neutral-500'}>{server.void_count}</span>
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={server.refund_count > 3 ? 'text-rose-600' : 'text-neutral-500'}>{server.refund_count}</span>
                          </td>
                          <td className="p-3 text-right tabular-nums text-neutral-500">{server.tables_served}</td>
                          <td className="p-3 text-right tabular-nums text-emerald-600">{withCurrency(server.total_tips)}</td>
                          <td className="p-3 text-right tabular-nums">
                            <span className={server.avg_tip_pct >= 15 ? 'text-emerald-600' : server.avg_tip_pct >= 10 ? 'text-amber-600' : 'text-neutral-500'}>
                              {server.avg_tip_pct}%
                            </span>
                          </td>
                          <td className="p-3 text-center text-neutral-500">
                            {server.peak_hour !== undefined ? `${String(server.peak_hour).padStart(2, '0')}:00` : '—'}
                          </td>
                          <td className="p-3">
                            {server.ai_coaching && (
                              <span className={`text-xs px-2 py-1 rounded-full capitalize ${
                                server.ai_coaching === 'recognize' ? 'bg-emerald-100 text-emerald-700' :
                                server.ai_coaching === 'mentor' ? 'bg-blue-100 text-blue-700' :
                                server.ai_coaching.startsWith('coach') ? 'bg-amber-100 text-amber-700' :
                                'bg-neutral-100 text-neutral-600'
                              }`}>
                                {COACHING_LABEL[server.ai_coaching] ?? server.ai_coaching}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs text-violet-600 italic max-w-xs">
                            {server.ai_insight ? `"${server.ai_insight}"` : <span className="text-neutral-400">—</span>}
                            {server.ai_action && <div className="mt-0.5 text-neutral-500">→ {server.ai_action}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Min orders: <strong>{config.minOrders}</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Avg ticket across team: <strong>{withCurrency(stats.avgTicket)}</strong></span>
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

export default ServerPerformanceScreen;
