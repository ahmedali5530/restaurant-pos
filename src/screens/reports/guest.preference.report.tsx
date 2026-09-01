/**
 * Guest Preference Learning Dashboard — personalized guest profiles + AI recs.
 *
 * Unique to POSR — Toast and Square don't have individual guest preference
 * learning. POSR learns what each customer likes for personalized service.
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
  faUser, faUtensils, faClock, faChair, faRobot, faRotate,
  faLightbulb, faStar, faUsers, faDollarSign,
} from "@fortawesome/free-solid-svg-icons";
import { withCurrency } from "@/lib/utils.ts";
import {
  analyzeGuestPreferences,
  getGuestPreferences,
  readGuestConfig,
  DEFAULT_GUEST_CONFIG,
  type GuestPreference,
} from "@/lib/guest-preference.service.ts";

export function GuestPreferenceScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [preferences, setPreferences] = useState<GuestPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [config, setConfig] = useState(DEFAULT_GUEST_CONFIG);
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readGuestConfig(settingsRows[0] ?? {}));
      const list = await getGuestPreferences(db);
      setPreferences(list);
    } catch (err) {
      console.error('[guest-report] reload failed', err);
      toast.error('Failed to load guest data');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setProgress({ current: 0, total: 3 });
    try {
      const result = await analyzeGuestPreferences(db, config, (current, total) => {
        setProgress({ current, total });
      });
      setPreferences(result.preferences);
      toast.success(`Learned preferences for ${result.preferences.length} guests`);
    } catch (err) {
      console.error('[guest-report] analyze failed', err);
      toast.error('Analysis failed — see console');
    } finally {
      setAnalyzing(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [db, config]);

  const selected = useMemo(() => {
    if (!selectedGuest) return preferences[0] ?? null;
    return preferences.find(p => p.customer_id === selectedGuest) ?? null;
  }, [preferences, selectedGuest]);

  return (
    <Layout>
      <DocumentTitle parts={["Guest Preferences", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faUser} className="text-violet-600" />
              Guest Preferences
            </h1>
            <p className="text-sm text-neutral-500">
              Personalized guest profiles — learned preferences, dietary notes, AI recommendations for next visit
            </p>
          </div>
          <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
            <FontAwesomeIcon icon={faRotate} spin={analyzing} />
            {analyzing ? `Learning… (${progress.current}/${progress.total})` : 'Learn preferences'}
          </Button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faRobot} spin className="text-4xl mb-3" />
            <p>Loading guest data…</p>
          </div>
        ) : preferences.length === 0 ? (
          <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faUser} className="text-5xl mb-4 opacity-40" />
            <p className="text-lg font-medium">No guest preferences yet</p>
            <p className="text-sm mt-1">Click "Learn preferences" to analyze customer order history.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Guest list (left) */}
              <div className="lg:col-span-1 bg-white rounded-lg border border-neutral-200 p-3 max-h-[70vh] overflow-y-auto">
                <h3 className="font-medium mb-2 text-sm text-neutral-600">Guests ({preferences.length})</h3>
                <div className="space-y-1">
                  {preferences.slice(0, 100).map((g, idx) => (
                    <button key={idx} onClick={() => setSelectedGuest(g.customer_id)}
                      className={`w-full text-left p-2 rounded-lg transition-colors ${
                        (selected?.customer_id ?? preferences[0]?.customer_id) === g.customer_id
                          ? 'bg-violet-100' : 'hover:bg-neutral-50'
                      }`}>
                      <div className="font-medium text-sm truncate">{g.customer_name}</div>
                      <div className="text-xs text-neutral-500">
                        {g.total_visits} visits · {withCurrency(g.avg_spend)} avg
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Guest detail (right) */}
              <div className="lg:col-span-2 space-y-3">
                {selected && (
                  <>
                    {/* Profile header */}
                    <div className="bg-white rounded-lg border border-neutral-200 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h2 className="text-xl font-bold">{selected.customer_name}</h2>
                          <p className="text-sm text-neutral-500">
                            {selected.total_visits} visits · avg {withCurrency(selected.avg_spend)}/visit · party of {selected.avg_party_size}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          {selected.email && <div className="text-neutral-500">{selected.email}</div>}
                          {selected.visit_frequency_days && <div className="text-neutral-500">Every {selected.visit_frequency_days} days</div>}
                        </div>
                      </div>

                      {/* Quick stats */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        {selected.preferred_order_time && (
                          <div className="bg-neutral-50 rounded p-2 text-center">
                            <FontAwesomeIcon icon={faClock} className="text-blue-500 mb-1" />
                            <div className="text-neutral-500">Preferred time</div>
                            <div className="font-semibold capitalize">{selected.preferred_order_time}</div>
                          </div>
                        )}
                        {selected.preferred_table && (
                          <div className="bg-neutral-50 rounded p-2 text-center">
                            <FontAwesomeIcon icon={faChair} className="text-amber-500 mb-1" />
                            <div className="text-neutral-500">Preferred table</div>
                            <div className="font-semibold">{selected.preferred_table}</div>
                          </div>
                        )}
                        {selected.preferred_payment_method && (
                          <div className="bg-neutral-50 rounded p-2 text-center">
                            <FontAwesomeIcon icon={faDollarSign} className="text-emerald-500 mb-1" />
                            <div className="text-neutral-500">Payment</div>
                            <div className="font-semibold">{selected.preferred_payment_method}</div>
                          </div>
                        )}
                        {selected.preferred_floor && (
                          <div className="bg-neutral-50 rounded p-2 text-center">
                            <FontAwesomeIcon icon={faChair} className="text-violet-500 mb-1" />
                            <div className="text-neutral-500">Floor</div>
                            <div className="font-semibold">{selected.preferred_floor}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Favorite dishes */}
                    {selected.favorite_dishes && selected.favorite_dishes.length > 0 && (
                      <div className="bg-white rounded-lg border border-neutral-200 p-4">
                        <h3 className="font-medium mb-3 flex items-center gap-2">
                          <FontAwesomeIcon icon={faUtensils} className="text-amber-500" />
                          Favorite dishes
                        </h3>
                        <div className="space-y-2">
                          {selected.favorite_dishes.map((d, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <FontAwesomeIcon icon={faStar} className="text-amber-400 text-xs" />
                                <span className="font-medium">{d.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-semibold tabular-nums">{d.times_ordered}x</span>
                                <span className="text-xs text-neutral-400 ml-2">
                                  last: {new Date(d.last_ordered).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dietary notes + addons */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {selected.dietary_notes && selected.dietary_notes.length > 0 && (
                        <div className="bg-white rounded-lg border border-neutral-200 p-4">
                          <h3 className="font-medium mb-2 text-sm">Dietary (inferred)</h3>
                          <div className="flex flex-wrap gap-2">
                            {selected.dietary_notes.map((d, idx) => (
                              <span key={idx} className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs capitalize">
                                {d.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selected.liked_addons && selected.liked_addons.length > 0 && (
                        <div className="bg-white rounded-lg border border-neutral-200 p-4">
                          <h3 className="font-medium mb-2 text-sm">Liked add-ons</h3>
                          <div className="flex flex-wrap gap-2">
                            {selected.liked_addons.map((a, idx) => (
                              <span key={idx} className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* AI recommendations */}
                    {selected.ai_insight && (
                      <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
                        <h3 className="font-medium mb-2 flex items-center gap-2 text-violet-800">
                          <FontAwesomeIcon icon={faLightbulb} />
                          AI Guest Insight
                        </h3>
                        <p className="text-sm text-violet-900 mb-3">{selected.ai_insight}</p>
                        {selected.ai_personalized_recs && selected.ai_personalized_recs.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-violet-700 uppercase mb-1">Recommendations for next visit</div>
                            {selected.ai_personalized_recs.map((rec, idx) => (
                              <div key={idx} className="text-sm text-violet-900 flex items-start gap-2 mb-1">
                                <FontAwesomeIcon icon={faStar} className="text-amber-400 text-xs mt-1" />
                                <span>{rec}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Special requests */}
                    {selected.special_requests && selected.special_requests.length > 0 && (
                      <div className="bg-white rounded-lg border border-neutral-200 p-4">
                        <h3 className="font-medium mb-2 text-sm">Special requests (frequent notes)</h3>
                        <div className="space-y-1">
                          {selected.special_requests.map((s, idx) => (
                            <div key={idx} className="text-sm text-neutral-600 italic">"{s}"</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Config footer */}
            <div className="text-xs text-neutral-500 flex flex-wrap gap-4">
              <span>AI: <strong>{config.aiEnabled ? 'enabled' : 'disabled'}</strong></span>
              <span>Min visits: <strong>{config.minVisits}</strong></span>
              <span>Lookback: <strong>{config.lookbackDays} days</strong></span>
              <span>Guests profiled: <strong>{preferences.length}</strong></span>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default GuestPreferenceScreen;
