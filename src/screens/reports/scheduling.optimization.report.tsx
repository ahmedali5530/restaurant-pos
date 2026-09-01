/**
 * Staff Scheduling Optimization Dashboard — AI-generated schedules.
 *
 * Research finding: Lightspeed Team Schedule add-on $60/mo, Toast Team
 * Schedule part of higher tier. POSR offers it free.
 *
 * Layout:
 *   1. Summary cards (total shifts, total hours, total cost, overtime hours, coverage gaps, projected savings)
 *   2. AI insights panel (overall assessment from OpenAI)
 *   3. Weekly schedule grid (days × shifts, color-coded by cost/utilization)
 *   4. Cost breakdown (by employee, by day, overtime %)
 *   5. Generate button (runs optimization with AI refinement)
 *
 * Placement: new route /reports/scheduling-optimization
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
  faCalendarWeek, faClock, faDollarSign, faTriangleExclamation, faUserClock,
  faArrowTrendUp, faRobot, faRotate, faCheck, faXmark, faLightbulb, faUsers,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  generateOptimizedSchedule,
  getLatestOptimization,
  updateShiftStatus,
  readScheduleConfig,
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleOptimization,
  type GeneratedShift,
} from "@/lib/scheduling.service.ts";

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatTime = (date: Date | string): string => {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
};

export function SchedulingOptimizationScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [optimization, setOptimization] = useState<ScheduleOptimization | null>(null);
  const [shifts, setShifts] = useState<GeneratedShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_SCHEDULE_CONFIG);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readScheduleConfig(settingsRows[0] ?? {}));
      const { optimization, shifts } = await getLatestOptimization(db);
      setOptimization(optimization);
      setShifts(shifts);
    } catch (err) {
      console.error('[scheduling-report] reload failed', err);
      toast.error('Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setProgress({ current: 0, total: 5 });
    try {
      const result = await generateOptimizedSchedule(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setOptimization(result.optimization);
      setShifts(result.shifts);
      toast.success(
        `Schedule generated — ${result.optimization.total_shifts} shifts, ${result.optimization.total_hours}h, ${withCurrency(result.optimization.total_cost)}. Projected savings: ${withCurrency(result.optimization.projected_savings)}`
      );
    } catch (err) {
      console.error('[scheduling-report] generate failed', err);
      const message = err instanceof Error ? err.message : 'Generation failed';
      toast.error(message);
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const handleShiftAction = useCallback(async (shiftId: string, status: 'accepted' | 'rejected') => {
    try {
      await updateShiftStatus(db, shiftId, status);
      setShifts(prev => prev.map(s => s.id === shiftId ? { ...s, status } : s));
      toast.success(`Shift ${status}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update shift');
    }
  }, [db]);

  // Group shifts by day
  const shiftsByDay = useMemo(() => {
    const byDay = new Map<number, GeneratedShift[]>();
    for (let i = 0; i < 7; i++) byDay.set(i, []);
    for (const s of shifts) {
      const list = byDay.get(s.day_of_week) ?? [];
      list.push(s);
      byDay.set(s.day_of_week, list);
    }
    // Sort each day's shifts by start time
    for (const list of byDay.values()) {
      list.sort((a, b) => a.start_at.getTime() - b.start_at.getTime());
    }
    return byDay;
  }, [shifts]);

  // Cost by employee
  const costByEmployee = useMemo(() => {
    const byEmp = new Map<string, { name: string; hours: number; cost: number; overtime: number; shifts: number }>();
    for (const s of shifts) {
      if (!byEmp.has(s.employee_id)) {
        byEmp.set(s.employee_id, { name: s.employee_name, hours: 0, cost: 0, overtime: 0, shifts: 0 });
      }
      const emp = byEmp.get(s.employee_id)!;
      emp.hours += s.duration_hours;
      emp.cost += s.shift_cost;
      if (s.is_overtime) emp.overtime += s.duration_hours;
      emp.shifts += 1;
    }
    return Array.from(byEmp.values()).sort((a, b) => b.cost - a.cost);
  }, [shifts]);

  return (
    <Layout>
      <DocumentTitle parts={["Scheduling Optimization", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faCalendarWeek} className="text-violet-600" />
              Scheduling Optimization
            </h1>
            <p className="text-sm text-neutral-500">
              AI-generated weekly schedule — demand-driven, cost-optimized, with coverage analysis
            </p>
          </div>
          <Button onClick={handleGenerate} disabled={generating} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={generating} />
            {generating ? `Generating… (${progress.current}/${progress.total})` : 'Generate schedule'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading schedule…</p>
          </div>
        ) : !optimization ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faCalendarWeek} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No schedule generated yet</p>
            <p className="text-sm mt-1">Click "Generate schedule" to run the AI-powered optimization.</p>
            <p className="text-xs mt-2 text-neutral-400">Requires: active employees with pay profiles + demand forecast.</p>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <SummaryCard icon={faCalendarWeek} label="Shifts" value={optimization.total_shifts} color="text-violet-600" />
              <SummaryCard icon={faClock} label="Hours" value={optimization.total_hours} color="text-blue-600" />
              <SummaryCard icon={faDollarSign} label="Total cost" value={withCurrency(optimization.total_cost)} color="text-emerald-600" />
              <SummaryCard icon={faUserClock} label="Overtime" value={`${optimization.overtime_hours}h`} color={optimization.overtime_hours > 0 ? 'text-amber-600' : 'text-emerald-600'} />
              <SummaryCard icon={faTriangleExclamation} label="Coverage gaps" value={optimization.coverage_gaps} color={optimization.coverage_gaps > 0 ? 'text-rose-600' : 'text-emerald-600'} />
              <SummaryCard icon={faArrowTrendUp} label="Proj. savings" value={withCurrency(optimization.projected_savings)} color="text-emerald-600" />
            </div>

            {/* AI insights panel */}
            {optimization.ai_insights && (
              <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                  <FontAwesomeIcon icon={faLightbulb} />
                  AI Insights
                </h3>
                <p className="text-sm text-violet-900 whitespace-pre-wrap">{optimization.ai_insights}</p>
              </div>
            )}

            {/* Quick stats */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-xs text-neutral-500">Employees used</div>
                  <div className="font-bold text-lg">{optimization.employees_used}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Avg utilization</div>
                  <div className="font-bold text-lg">{(optimization.avg_utilization * 100).toFixed(0)}%</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Overstaffed hours</div>
                  <div className="font-bold text-lg">{optimization.overstaffed_hours}</div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500">Avg cost/shift</div>
                  <div className="font-bold text-lg tabular-nums">{withCurrency(optimization.total_shifts > 0 ? optimization.total_cost / optimization.total_shifts : 0)}</div>
                </div>
              </div>
            </div>

            {/* Weekly schedule grid */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium flex items-center gap-2">
                  <FontAwesomeIcon icon={faCalendarWeek} className="text-violet-600" />
                  Weekly schedule
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedDay(null)}
                    className={`px-3 py-1 rounded text-xs ${selectedDay === null ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}
                  >
                    All days
                  </button>
                  {DAY_ABBR.map((day, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedDay(idx)}
                      className={`px-3 py-1 rounded text-xs ${selectedDay === idx ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}
                    >
                      {day} ({shiftsByDay.get(idx)?.length ?? 0})
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
                {DAYS.map((dayName, dayIdx) => {
                  if (selectedDay !== null && selectedDay !== dayIdx) return null;
                  const dayShifts = shiftsByDay.get(dayIdx) ?? [];
                  return (
                    <div key={dayIdx} className="border border-neutral-200 rounded-lg p-3">
                      <div className="font-semibold text-sm mb-2 flex items-center justify-between">
                        <span>{dayName}</span>
                        <span className="text-xs text-neutral-500">
                          {dayShifts.length} shifts · {dayShifts.reduce((s, sh) => s + sh.duration_hours, 0).toFixed(1)}h
                        </span>
                      </div>
                      {dayShifts.length === 0 ? (
                        <p className="text-xs text-neutral-400 italic">No shifts scheduled</p>
                      ) : (
                        <div className="space-y-2">
                          {dayShifts.map(shift => (
                            <div
                              key={shift.id}
                              className={`rounded border p-2 text-xs ${
                                shift.status === 'rejected' ? 'bg-rose-50 border-rose-200 opacity-60'
                                : shift.status === 'accepted' ? 'bg-emerald-50 border-emerald-200'
                                : shift.is_overtime ? 'bg-amber-50 border-amber-200'
                                : 'bg-neutral-50 border-neutral-200'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium">{shift.employee_name}</span>
                                <span className="font-semibold tabular-nums">{withCurrency(shift.shift_cost)}</span>
                              </div>
                              <div className="flex items-center justify-between text-neutral-500">
                                <span>{formatTime(shift.start_at)} - {formatTime(shift.end_at)}</span>
                                <span>{shift.duration_hours}h</span>
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <div className="flex gap-1 flex-wrap">
                                  {shift.is_overtime && <span className="text-amber-600 text-xs">⏱ OT</span>}
                                  {shift.is_weekend && <span className="text-blue-600 text-xs">Wkend</span>}
                                  {shift.position && <span className="text-neutral-500 text-xs">{shift.position}</span>}
                                  <span className="text-neutral-500 text-xs">{(shift.expected_utilization * 100).toFixed(0)}% util</span>
                                </div>
                                {shift.status === 'proposed' && (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => shift.id && handleShiftAction(shift.id, 'accepted')}
                                      className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center"
                                      title="Accept"
                                    >
                                      <FontAwesomeIcon icon={faCheck} className="text-xs" />
                                    </button>
                                    <button
                                      onClick={() => shift.id && handleShiftAction(shift.id, 'rejected')}
                                      className="w-5 h-5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 flex items-center justify-center"
                                      title="Reject"
                                    >
                                      <FontAwesomeIcon icon={faXmark} className="text-xs" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              {shift.ai_recommendation && (
                                <div className="mt-1 text-violet-600 italic text-xs border-t border-violet-100 pt-1">
                                  💡 {shift.ai_recommendation}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cost by employee */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <FontAwesomeIcon icon={faUsers} className="text-violet-600" />
                Cost by employee
              </h3>
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Employee</th>
                      <th className="text-center p-2">Shifts</th>
                      <th className="text-right p-2">Hours</th>
                      <th className="text-right p-2">Overtime</th>
                      <th className="text-right p-2">Cost</th>
                      <th className="text-right p-2">Avg/hr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costByEmployee.map((emp, idx) => (
                      <tr key={idx} className="border-t hover:bg-neutral-50">
                        <td className="p-2 font-medium">{emp.name}</td>
                        <td className="p-2 text-center tabular-nums">{emp.shifts}</td>
                        <td className="p-2 text-right tabular-nums">{emp.hours.toFixed(1)}h</td>
                        <td className="p-2 text-right tabular-nums">
                          {emp.overtime > 0 ? <span className="text-amber-600">{emp.overtime.toFixed(1)}h</span> : '—'}
                        </td>
                        <td className="p-2 text-right tabular-nums font-semibold">{withCurrency(emp.cost)}</td>
                        <td className="p-2 text-right tabular-nums text-neutral-500">
                          {emp.hours > 0 ? withCurrency(emp.cost / emp.hours) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>Orders/staff/hour: <strong>{config.ordersPerStaffHour}</strong></span>
              <span>Staff range: <strong>{config.minStaffPerHour}-{config.maxStaffPerHour}</strong></span>
              <span>Shift length: <strong>{config.minShiftHours}-{config.maxShiftHours}h</strong></span>
              <span>Min rest: <strong>{config.minRestHours}h</strong></span>
              <span>Overtime threshold: <strong>{config.overtimeThresholdHours}h/wk</strong></span>
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Status: <strong className="capitalize">{optimization.status}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const SummaryCard = ({
  icon,
  label,
  value,
  color,
}: { icon: any; label: string; value: number | string; color: string }) => (
  <div className="bg-white rounded-lg border border-neutral-200 p-3">
    <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
      <FontAwesomeIcon icon={icon} className={color} />
      <span>{label}</span>
    </div>
    <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
  </div>
);

export default SchedulingOptimizationScreen;
