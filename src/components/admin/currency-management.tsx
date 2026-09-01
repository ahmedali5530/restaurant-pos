/**
 * Currencies admin panel — multi-currency configuration.
 *
 * Research finding: Toast multi-location + multi-currency is gated to the
 * highest tier (~$165+/mo). Square / Lightspeed bundle it only in Plus/Pro.
 * POSR offers it free.
 *
 * Three sections:
 *   1. Currency list — table of registered currencies (add / edit / set base)
 *   2. Exchange rates — current rates table + refresh button + provider selector
 *   3. Display settings — base currency, accepted currencies, dual display toggle
 *
 * Placement: new tab in Admin screen (21st tab, after 'reservations')
 */

import { useState, useEffect, useCallback } from "react";
import { useDB } from "@/api/db/db.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/common/input/button.tsx";
import {
  loadCurrenciesFromDb,
  saveCurrencyToDb,
  setBaseCurrency,
  refreshExchangeRates,
  getRate,
  getLastRateFetch,
  isRateStale,
  getCurrencyConfig,
  setCurrencyConfig,
  type Currency,
  type RateProvider,
  type RoundingMode,
} from "@/lib/currency.service.ts";
import { getShowCurrencySymbolInUi, setShowCurrencySymbolInUi } from "@/lib/currency-format.ts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faRefresh, faStar, faCheck } from "@fortawesome/free-solid-svg-icons";

const PROVIDERS: { value: RateProvider; label: string; hint: string }[] = [
  { value: 'ecb', label: 'ECB (free, no key)', hint: 'European Central Bank reference rates — EUR base, daily refresh' },
  { value: 'manual', label: 'Manual', hint: 'Operator enters rates — no network required' },
  { value: 'fixer', label: 'Fixer.io', hint: 'Requires API key — 170+ currencies, intraday' },
  { value: 'openexchangerates', label: 'Open Exchange Rates', hint: 'Requires API key — 200+ currencies' },
];

const ROUNDING_MODES: { value: RoundingMode; label: string }[] = [
  { value: 'standard', label: 'Standard (half-up)' },
  { value: 'swedish', label: 'Swedish (banker\'s)' },
  { value: 'up', label: 'Round up' },
  { value: 'down', label: 'Round down' },
];

export function AdminCurrencies() {
  const { t } = useTranslation(["admin", "common"]);
  const db = useDB();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [showSymbol, setShowSymbol] = useState(getShowCurrencySymbolInUi());

  // New currency form
  const [newCode, setNewCode] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newName, setNewName] = useState('');
  const [newDecimals, setNewDecimals] = useState(2);

  // Settings
  const cfg = getCurrencyConfig();
  const [baseCurrency, setBaseCurrencyState] = useState(cfg.base);
  const [acceptedCurrencies, setAcceptedCurrencies] = useState<string[]>(cfg.accepted);
  const [provider, setProvider] = useState<RateProvider>(cfg.provider);
  const [ttlMinutes, setTtlMinutes] = useState(cfg.ttlMinutes);
  const [roundingMode, setRoundingMode] = useState<RoundingMode>(cfg.roundingMode);
  const [displayDual, setDisplayDual] = useState(cfg.displayDual);
  const [dualTarget, setDualTarget] = useState(cfg.dualTarget ?? '');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadCurrenciesFromDb(db);
      setCurrencies(list);
      setLastFetch(getLastRateFetch());
    } catch (err) {
      console.error('[admin.currencies] reload failed', err);
      toast.error('Failed to load currencies');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAddCurrency = async () => {
    if (!newCode || !newSymbol || !newName) {
      toast.error('Code, symbol and name are required');
      return;
    }
    const code = newCode.toUpperCase().slice(0, 3);
    try {
      await saveCurrencyToDb(db, {
        code,
        symbol: newSymbol,
        name: newName,
        decimals: newDecimals,
        is_base: false,
        is_active: true,
        sort_order: currencies.length * 10 + 200,
      });
      toast.success(`Currency ${code} added`);
      setNewCode(''); setNewSymbol(''); setNewName(''); setNewDecimals(2);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to add currency');
    }
  };

  const handleSetBase = async (code: string) => {
    try {
      await setBaseCurrency(db, code);
      setBaseCurrencyState(code);
      setCurrencyConfig({ base: code });
      toast.success(`Base currency set to ${code}`);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Failed to set base currency');
    }
  };

  const handleToggleAccepted = (code: string) => {
    const next = acceptedCurrencies.includes(code)
      ? acceptedCurrencies.filter(c => c !== code)
      : [...acceptedCurrencies, code];
    // Always include base
    if (!next.includes(baseCurrency)) next.push(baseCurrency);
    setAcceptedCurrencies(next);
    setCurrencyConfig({ accepted: next });
  };

  const handleRefreshRates = async () => {
    setRefreshing(true);
    try {
      const result = await refreshExchangeRates(db, getCurrencyConfig());
      setLastFetch(result.at);
      toast.success(`Refreshed ${result.fetched} rates from ${result.source}`);
      await reload();
    } catch (err) {
      console.error(err);
      toast.error('Rate refresh failed — using cached rates');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveSettings = () => {
    setCurrencyConfig({
      base: baseCurrency,
      accepted: acceptedCurrencies,
      provider,
      ttlMinutes,
      roundingMode,
      displayDual,
      dualTarget: dualTarget || undefined,
    });
    setShowCurrencySymbolInUi(showSymbol);
    toast.success('Currency settings saved');
  };

  const ratesStale = isRateStale();

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t('admin:currencies.title', 'Multi-Currency')}</h2>
          <p className="text-sm text-neutral-500">
            Base: <strong>{baseCurrency}</strong> · {acceptedCurrencies.length} accepted ·
            Last rates: {lastFetch ? lastFetch.toLocaleString() : 'never'}
            {ratesStale && <span className="ml-2 text-amber-600">● stale</span>}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleRefreshRates}
          disabled={refreshing}
          className="gap-2"
        >
          <FontAwesomeIcon icon={faRefresh} spin={refreshing} />
          {refreshing ? 'Refreshing…' : 'Refresh rates'}
        </Button>
      </div>

      {/* Section 1: Currency list */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="font-medium mb-3">Registered currencies</h3>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 sticky top-0">
              <tr>
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Symbol</th>
                <th className="text-left p-2">Name</th>
                <th className="text-right p-2">Decimals</th>
                <th className="text-right p-2">Rate (1 {baseCurrency} =)</th>
                <th className="text-center p-2">Base</th>
                <th className="text-center p-2">Accepted</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-4 text-center text-neutral-400">Loading…</td></tr>
              ) : currencies.length === 0 ? (
                <tr><td colSpan={7} className="p-4 text-center text-neutral-400">No currencies registered</td></tr>
              ) : (
                currencies.map((c) => {
                  const isAccepted = acceptedCurrencies.includes(c.code);
                  const rate = c.code === baseCurrency ? 1 : getRate(baseCurrency, c.code);
                  return (
                    <tr key={c.code} className="border-t hover:bg-neutral-50">
                      <td className="p-2 font-mono font-medium">{c.code}</td>
                      <td className="p-2">{c.symbol}</td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2 text-right">{c.decimals}</td>
                      <td className="p-2 text-right tabular-nums">
                        {rate ? rate.toFixed(4) : '—'}
                      </td>
                      <td className="p-2 text-center">
                        {c.is_base ? (
                          <span className="text-amber-600"><FontAwesomeIcon icon={faStar} /></span>
                        ) : (
                          <button
                            onClick={() => handleSetBase(c.code)}
                            className="text-neutral-400 hover:text-amber-600 transition-colors"
                            title={`Set ${c.code} as base`}
                          >
                            <FontAwesomeIcon icon={faCheck} />
                          </button>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={isAccepted}
                          onChange={() => handleToggleAccepted(c.code)}
                          className="w-4 h-4"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Add new currency */}
        <div className="mt-4 pt-4 border-t border-neutral-100">
          <h4 className="text-sm font-medium mb-2">Add currency</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-end">
            <div>
              <label className="text-xs text-neutral-500">Code (ISO 4217)</label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="USD"
                className="w-full px-3 py-2 border border-neutral-300 rounded text-sm uppercase"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Symbol</label>
              <input
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.slice(0, 4))}
                placeholder="$"
                className="w-full px-3 py-2 border border-neutral-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="US Dollar"
                className="w-full px-3 py-2 border border-neutral-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Decimals</label>
              <input
                type="number"
                min={0}
                max={8}
                value={newDecimals}
                onChange={(e) => setNewDecimals(parseInt(e.target.value) || 2)}
                className="w-full px-3 py-2 border border-neutral-300 rounded text-sm"
              />
            </div>
            <Button variant="primary" onClick={handleAddCurrency} className="gap-2 justify-center">
              <FontAwesomeIcon icon={faPlus} /> Add
            </Button>
          </div>
        </div>
      </section>

      {/* Section 2: Display + provider settings */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h3 className="font-medium mb-3">Configuration</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: provider + cache */}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Rate provider</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as RateProvider)}
                className="w-full px-3 py-2 border border-neutral-300 rounded text-sm"
              >
                {PROVIDERS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="text-xs text-neutral-400 mt-1">
                {PROVIDERS.find(p => p.value === provider)?.hint}
              </p>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Cache TTL (minutes)</label>
              <input
                type="number"
                min={5}
                max={1440}
                value={ttlMinutes}
                onChange={(e) => setTtlMinutes(parseInt(e.target.value) || 60)}
                className="w-full px-3 py-2 border border-neutral-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">Rounding mode</label>
              <select
                value={roundingMode}
                onChange={(e) => setRoundingMode(e.target.value as RoundingMode)}
                className="w-full px-3 py-2 border border-neutral-300 rounded text-sm"
              >
                {ROUNDING_MODES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: display settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Show currency symbol in UI</label>
                <p className="text-xs text-neutral-400">Hide for compact displays</p>
              </div>
              <input
                type="checkbox"
                checked={showSymbol}
                onChange={(e) => setShowSymbol(e.target.checked)}
                className="w-5 h-5"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">Dual-currency display</label>
                <p className="text-xs text-neutral-400">Show secondary currency on receipts + displays</p>
              </div>
              <input
                type="checkbox"
                checked={displayDual}
                onChange={(e) => setDisplayDual(e.target.checked)}
                className="w-5 h-5"
              />
            </div>
            {displayDual && (
              <div>
                <label className="text-xs text-neutral-500 block mb-1">Secondary currency</label>
                <select
                  value={dualTarget}
                  onChange={(e) => setDualTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded text-sm"
                >
                  <option value="">— Select —</option>
                  {currencies.filter(c => c.code !== baseCurrency).map(c => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={handleSaveSettings} className="gap-2">
            <FontAwesomeIcon icon={faCheck} /> Save settings
          </Button>
        </div>
      </section>

      {/* Section 3: Sample dual-currency preview */}
      {displayDual && dualTarget && (
        <section className="rounded-lg border border-neutral-200 bg-white p-4">
          <h3 className="font-medium mb-3">Preview</h3>
          <div className="bg-neutral-50 rounded p-4 text-center">
            <div className="text-3xl font-semibold tabular-nums">
              {(() => {
                const r = getRate(baseCurrency, dualTarget);
                return `${baseCurrency} 100.00 = ${dualTarget} ${(100 * r).toFixed(2)}`;
              })()}
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Sample dual-currency display on receipts
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
