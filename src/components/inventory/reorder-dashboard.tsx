/**
 * AI Reorder Dashboard — predictive purchase suggestions.
 *
 * Research finding: Lightspeed Pro $50+/mo for "Smart Reordering".
 * Toast Inventory Pro has demand-based reorder suggestions.
 * POSR offers it free — combines demand forecast + consumption + lead time.
 *
 * Three sections:
 *   1. Summary cards — total / critical / high / total value
 *   2. Generate button — runs the AI analysis (shows progress bar)
 *   3. Suggestions table — sortable, filterable, with accept/reject/convert
 *
 * Bulk actions:
 *   - Accept all critical (one click)
 *   - Convert accepted to PO (groups by supplier automatically)
 *   - Refresh suggestions (re-run analysis)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDB } from '@/api/db/db.ts';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faTriangleExclamation, faClock, faDollarSign, faRobot, faCheck, faXmark, faFileInvoice, faRotate } from '@fortawesome/free-solid-svg-icons';
import { Button } from '@/components/common/input/button.tsx';
import { withCurrency } from '@/lib/utils.ts';
import {
  generateReorderSuggestions,
  getPendingSuggestions,
  acceptSuggestion,
  rejectSuggestion,
  convertSuggestionsToPO,
  recomputeLeadTimes,
  readReorderConfig,
  type ReorderSuggestion,
  type ReorderUrgency,
} from '@/lib/inventory/reorder.service.ts';
import { useSecurity } from '@/hooks/useSecurity.ts';

const URGENCY_STYLE: Record<ReorderUrgency, { bg: string; text: string; label: string; icon: any }> = {
  critical: { bg: 'bg-rose-50 border-rose-400', text: 'text-rose-700', label: 'Critical', icon: faTriangleExclamation },
  high:     { bg: 'bg-orange-50 border-orange-400', text: 'text-orange-700', label: 'High', icon: faBolt },
  medium:   { bg: 'bg-amber-50 border-amber-400', text: 'text-amber-700', label: 'Medium', icon: faClock },
  low:      { bg: 'bg-emerald-50 border-emerald-400', text: 'text-emerald-700', label: 'Low', icon: faCheck },
};

export function ReorderDashboard() {
  const { t } = useTranslation(['admin', 'common']);
  const db = useDB();
  const { user } = useSecurity() as any;
  const [suggestions, setSuggestions] = useState<ReorderSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | ReorderUrgency>('all');
  const [config, setConfig] = useState(readReorderConfig({}));

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Load config from settings
      const settingsResult = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      const settings = settingsRows[0] ?? {};
      setConfig(readReorderConfig(settings));

      const list = await getPendingSuggestions(db);
      setSuggestions(list);
    } catch (err) {
      console.error('[reorder-dashboard] reload failed', err);
      toast.error('Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleGenerate = async () => {
    setGenerating(true);
    setProgress({ current: 0, total: 0 });
    try {
      // First recompute lead times from PO history (cheap, runs in background)
      await recomputeLeadTimes(db);
      // Then generate suggestions
      const result = await generateReorderSuggestions(db, config, (current, total) => {
        setProgress({ current, total });
      });
      toast.success(`Generated ${result.total} suggestions — ${result.critical} critical, ${result.high} high. Total value: ${withCurrency(result.totalValue)}`);
      await reload();
    } catch (err) {
      console.error('[reorder-dashboard] generate failed', err);
      toast.error('Generation failed — see console');
    } finally {
      setGenerating(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const handleAccept = async (id: string) => {
    try {
      await acceptSuggestion(db, id, user?.id?.toString?.() ?? '');
      toast.success('Suggestion accepted');
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to accept');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectSuggestion(db, id);
      toast.success('Suggestion rejected');
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject');
    }
  };

  const handleConvertToPO = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error('Select suggestions to convert');
      return;
    }
    try {
      const result = await convertSuggestionsToPO(db, ids, user?.id?.toString?.() ?? '');
      toast.success(`Created ${result.createdPOs.length} purchase order(s) — total ${withCurrency(result.totalValue)}`);
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create purchase orders');
    }
  };

  const handleAcceptAllCritical = async () => {
    const critical = suggestions.filter(s => s.urgency === 'critical' && s.id);
    if (critical.length === 0) {
      toast.info('No critical suggestions to accept');
      return;
    }
    try {
      for (const s of critical) {
        if (s.id) await acceptSuggestion(db, s.id, user?.id?.toString?.() ?? '');
      }
      toast.success(`Accepted ${critical.length} critical suggestions`);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to accept critical suggestions');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredSuggestions.map(s => s.id).filter(Boolean) as string[];
    if (selectedIds.size === visibleIds.length && visibleIds.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  const filteredSuggestions = useMemo(() => {
    if (filter === 'all') return suggestions;
    return suggestions.filter(s => s.urgency === filter);
  }, [suggestions, filter]);

  const totals = useMemo(() => ({
    total: suggestions.length,
    critical: suggestions.filter(s => s.urgency === 'critical').length,
    high: suggestions.filter(s => s.urgency === 'high').length,
    medium: suggestions.filter(s => s.urgency === 'medium').length,
    low: suggestions.filter(s => s.urgency === 'low').length,
    totalValue: suggestions.reduce((sum, s) => sum + (s.total_cost ?? 0), 0),
    selectedCount: selectedIds.size,
    selectedValue: suggestions
      .filter(s => s.id && selectedIds.has(s.id))
      .reduce((sum, s) => sum + (s.total_cost ?? 0), 0),
  }), [suggestions, selectedIds]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FontAwesomeIcon icon={faRobot} className="text-violet-600" />
            AI Reorder
          </h2>
          <p className="text-sm text-neutral-500">
            Predictive purchase suggestions — demand forecast + consumption rate + lead time
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generating}
            variant="primary"
            className="gap-2"
          >
            <FontAwesomeIcon icon={faRotate} spin={generating} />
            {generating ? 'Generating…' : 'Generate suggestions'}
          </Button>
        </div>
      </div>

      {/* Progress bar during generation */}
      {generating && progress.total > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
          <div className="flex justify-between text-sm text-violet-700 mb-1">
            <span>Analyzing inventory items…</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="h-2 bg-violet-200 rounded overflow-hidden">
            <div
              className="h-full bg-violet-600 transition-all"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <SummaryCard icon={faBolt} label="Total" value={totals.total} color="text-violet-600" />
        <SummaryCard icon={faTriangleExclamation} label="Critical" value={totals.critical} color="text-rose-600" />
        <SummaryCard icon={faBolt} label="High" value={totals.high} color="text-orange-600" />
        <SummaryCard icon={faClock} label="Medium" value={totals.medium} color="text-amber-600" />
        <SummaryCard icon={faDollarSign} label="Total value" value={withCurrency(totals.totalValue)} color="text-emerald-600" />
        <SummaryCard icon={faCheck} label="Selected" value={`${totals.selectedCount} (${withCurrency(totals.selectedValue)})`} color="text-blue-600" />
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={handleAcceptAllCritical} variant="custom" className="gap-2 border border-rose-300 text-rose-700 hover:bg-rose-50 px-3 py-2 text-sm">
          <FontAwesomeIcon icon={faCheck} /> Accept all critical ({totals.critical})
        </Button>
        <Button
          onClick={handleConvertToPO}
          variant="primary"
          disabled={selectedIds.size === 0}
          className="gap-2 px-3 py-2 text-sm"
        >
          <FontAwesomeIcon icon={faFileInvoice} />
          Convert {selectedIds.size} selected → PO
        </Button>
        <div className="ml-auto flex gap-2">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded text-sm transition-colors ${
                filter === f
                  ? 'bg-neutral-900 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {f === 'all' ? `All (${suggestions.length})` : `${f} (${suggestions.filter(s => s.urgency === f).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestions table */}
      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 sticky top-0 z-10">
              <tr>
                <th className="p-2 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredSuggestions.length && filteredSuggestions.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4"
                  />
                </th>
                <th className="text-left p-2">Item</th>
                <th className="text-right p-2">Current</th>
                <th className="text-right p-2">Par level</th>
                <th className="text-right p-2">Avg/day</th>
                <th className="text-right p-2">Days left</th>
                <th className="text-right p-2">Suggest</th>
                <th className="text-right p-2">Cost</th>
                <th className="text-center p-2">Urgency</th>
                <th className="text-left p-2">Reasons</th>
                <th className="text-center p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} className="p-6 text-center text-neutral-400">Loading…</td></tr>
              ) : filteredSuggestions.length === 0 ? (
                <tr><td colSpan={11} className="p-8 text-center text-neutral-400">
                  <FontAwesomeIcon icon={faRobot} className="text-4xl mb-3 opacity-40" />
                  <p>No pending suggestions.</p>
                  <p className="text-xs mt-1">Click "Generate suggestions" to run the AI analysis.</p>
                </td></tr>
              ) : (
                filteredSuggestions.map(s => {
                  const style = URGENCY_STYLE[s.urgency];
                  const isSelected = s.id ? selectedIds.has(s.id) : false;
                  return (
                    <tr key={s.id ?? s.item_id} className="border-t hover:bg-neutral-50">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => s.id && toggleSelect(s.id)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{s.item_name}</div>
                        {s.supplier_name && <div className="text-xs text-neutral-500">{s.supplier_name}</div>}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {s.current_stock.toFixed(1)} {s.uom ?? ''}
                      </td>
                      <td className="p-2 text-right tabular-nums text-neutral-500">
                        {s.par_level.toFixed(1)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {s.avg_daily_usage.toFixed(2)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {s.days_until_out >= 999 ? '∞' : `${s.days_until_out.toFixed(0)}d`}
                      </td>
                      <td className="p-2 text-right tabular-nums font-semibold text-violet-700">
                        {s.suggested_qty.toFixed(0)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {withCurrency(s.total_cost ?? 0)}
                      </td>
                      <td className="p-2 text-center">
                        <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.text}`}>
                          <FontAwesomeIcon icon={style.icon} className="mr-1" />
                          {style.label}
                        </span>
                      </td>
                      <td className="p-2 text-xs text-neutral-500 max-w-xs">
                        {s.reason_codes.slice(0, 2).map((r, i) => (
                          <div key={i} className="truncate">{r}</div>
                        ))}
                        {s.reason_codes.length > 2 && <div className="text-neutral-400">+{s.reason_codes.length - 2} more</div>}
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => s.id && handleAccept(s.id)}
                            className="w-7 h-7 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center justify-center"
                            title="Accept"
                          >
                            <FontAwesomeIcon icon={faCheck} />
                          </button>
                          <button
                            onClick={() => s.id && handleReject(s.id)}
                            className="w-7 h-7 rounded bg-rose-100 text-rose-700 hover:bg-rose-200 flex items-center justify-center"
                            title="Reject"
                          >
                            <FontAwesomeIcon icon={faXmark} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer info */}
      <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
        <span>Safety stock: <strong>{config.safetyStockDays} days</strong></span>
        <span>Lookback: <strong>{config.consumeLookbackDays} days</strong></span>
        <span>Min order: <strong>{withCurrency(config.minOrderValue)}</strong></span>
        <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
        <span>Suggestion expiry: <strong>{config.maxSuggestionAgeHours}h</strong></span>
        {config.autoApproveBelow > 0 && (
          <span>Auto-approve below: <strong>{withCurrency(config.autoApproveBelow)}</strong></span>
        )}
      </div>
    </div>
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

export default ReorderDashboard;
