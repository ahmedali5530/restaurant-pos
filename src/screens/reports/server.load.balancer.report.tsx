/**
 * Server Load Balancer Dashboard — real-time server assignment.
 *
 * 33rd POSR-exclusive differentiator — Toast, Square show server status
 * but DON'T balance assignments. POSR assigns incoming parties to servers.
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
  faUserGear, faRobot, faRotate, faLightbulb,
  faCheckCircle, faXmark, faUsers, faChartBar, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runServerBalancer, getActiveAssignments, getSummary, updateAssignmentStatus,
  readServerBalancerConfig, DEFAULT_SERVER_BALANCER_CONFIG,
  type ServerAssignment,
} from "@/lib/server-load-balancer.service.ts";

export function ServerLoadBalancerScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [assignments, setAssignments] = useState<ServerAssignment[]>([]);
  const [summary, setSummary] = useState({ totalPending: 0, avgLoad: 0, overloadedCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_SERVER_BALANCER_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readServerBalancerConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAssignments(db), getSummary(db)]);
      setAssignments(list); setSummary(sum);
    } catch (err) { console.error('[server-balancer-report] reload failed', err); toast.error('Failed to load assignments'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true); setProgress({ current: 0, total: 2 });
    try {
      const result = await runServerBalancer(db, config, (current, total) => setProgress({ current, total }));
      toast.success(result.assignments.length > 0
        ? `Balanced ${result.assignments.length} party assignments across ${result.scanned} servers`
        : `No incoming parties or active servers found`);
      await reload();
    } catch (err) { console.error('[server-balancer-report] analyze failed', err); toast.error('Balancing failed — see console'); }
    finally { setAnalyzing(false); setProgress({ current: 0, total: 0 }); }
  }, [db, config, reload]);

  const handleStatus = useCallback(async (id: string, status: string) => {
    try { await updateAssignmentStatus(db, id, status); toast.success(`Marked as ${status}`); await reload(); }
    catch { toast.error('Failed to update'); }
  }, [db, reload]);

  return (
    <Layout>
      <DocumentTitle parts={["Server Load Balancer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUserGear} className="text-blue-600" />
              Server Load Balancer
            </h1>
            <p className="text-sm text-neutral-500">
              AI real-time server assignment — load + performance scoring (POSR-exclusive)
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Balancing… (${progress.current}/${progress.total})` : 'Balance load'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading assignments…</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCheckCircle} className="text-5xl mb-4 text-emerald-400" />
            <p className="text-lg font-medium text-emerald-600">No pending assignments!</p>
            <p className="text-sm mt-1">All servers balanced. Click "Balance load" to recheck.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
                <div className="text-xs text-blue-600">Pending assignments</div>
                <div className="text-2xl font-bold text-blue-700 tabular-nums">{summary.totalPending}</div>
              </div>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 text-center">
                <div className="text-xs text-amber-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faChartBar} />Avg load</div>
                <div className={`text-2xl font-bold tabular-nums ${summary.avgLoad >= 80 ? 'text-rose-600' : 'text-amber-700'}`}>{Math.round(summary.avgLoad)}/100</div>
              </div>
              <div className="bg-rose-50 rounded-lg border border-rose-200 p-3 text-center">
                <div className="text-xs text-rose-600 flex items-center justify-center gap-1"><FontAwesomeIcon icon={faTriangleExclamation} />Overloaded</div>
                <div className="text-2xl font-bold text-rose-700 tabular-nums">{summary.overloadedCount}</div>
              </div>
            </div>

            <div className="space-y-3">
              {assignments.map((a, idx) => {
                const loadColor = a.load_score >= 80 ? 'text-rose-600' : a.load_score >= 50 ? 'text-amber-600' : 'text-emerald-600';
                return (
                  <div key={idx} className="rounded-lg border-2 p-4 bg-white border-blue-200">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FontAwesomeIcon icon={faUserGear} className="text-xl text-blue-600" />
                        <span className="font-semibold">→ {a.server_name}</span>
                        {a.customer_name && <span className="text-sm text-neutral-500">· Party: {a.customer_name}</span>}
                        <span className="text-sm text-neutral-500 flex items-center gap-1">
                          · <FontAwesomeIcon icon={faUsers} />{a.party_size}
                        </span>
                      </div>
                      <div className="flex gap-4 text-right">
                        <div>
                          <div className="text-xs text-neutral-500">Load</div>
                          <div className={`font-bold tabular-nums ${loadColor}`}>{a.load_score}/100</div>
                        </div>
                        <div>
                          <div className="text-xs text-neutral-500">Perf</div>
                          <div className="font-bold tabular-nums text-emerald-600">{a.performance_score}/100</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-4 text-xs text-neutral-600 mb-2">
                      <span>Active tables: <strong className="tabular-nums">{a.current_tables}</strong></span>
                      <span>Active orders: <strong className="tabular-nums">{a.current_orders}</strong></span>
                    </div>

                    {a.recommendation_reason && (
                      <div className="bg-blue-50 rounded p-2 mb-2 border border-blue-200">
                        <p className="text-xs text-blue-700"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{a.recommendation_reason}</p>
                      </div>
                    )}

                    {a.ai_insight && (
                      <div className="bg-violet-50/70 rounded p-2 mb-2 border border-violet-200">
                        <p className="text-xs text-violet-700 italic"><FontAwesomeIcon icon={faLightbulb} className="mr-1" />{a.ai_insight}</p>
                      </div>
                    )}

                    <div className="flex gap-1 ml-auto">
                      <button onClick={() => a.id && handleStatus(a.id, 'assigned')} className="px-2 py-1 rounded text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                        <FontAwesomeIcon icon={faCheckCircle} /> Accept
                      </button>
                      <button onClick={() => a.id && handleStatus(a.id, 'rejected')} className="px-2 py-1 rounded text-xs bg-rose-100 text-rose-700 hover:bg-rose-200">
                        <FontAwesomeIcon icon={faXmark} /> Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Max tables: <strong>{config.maxTables}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default ServerLoadBalancerScreen;
