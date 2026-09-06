/**
 * AI Self-Service Kiosk & Terminal Optimizer — predicts how self-service
 * kiosks and ordering terminals (kiosk placement, screen size, UI/UX design,
 * payment integration, upsell prompts, accessibility, wait time reduction,
 * order accuracy, kiosk-to-table delivery, multi-language) impact operational
 * efficiency, labor cost reduction, order accuracy, average ticket size, and
 * customer satisfaction.
 *
 * 181st POSR-exclusive differentiator.
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
  faDisplay, faRotate, faTabletScreenButton, faEye, faHandPointer,
  faUniversalAccess, faBroom, faCreditCard, faLanguage,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runKioskTerminalEngine, getActiveKioskTerminalAlerts, getKioskTerminalSummary,
  updateKioskTerminalAlertStatus, readKioskTerminalConfig, DEFAULT_KIOSK_TERMINAL_CONFIG,
  type KioskTerminalAlert,
} from "@/lib/self-service-kiosk-terminal.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  kiosk_absent_high_volume:               { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faDisplay,           label: 'NO KIOSK' },
  kiosk_count_insufficient:               { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faTabletScreenButton, label: 'TOO FEW KIOSKS' },
  kiosk_placement_poor:                   { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faEye,               label: 'POOR PLACEMENT' },
  upsell_prompts_missing:                 { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faHandPointer,       label: 'NO UPSELL PROMPTS' },
  kiosk_ada_noncompliant:                 { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faUniversalAccess,   label: 'ADA NONCOMPLIANT' },
  kiosk_screen_dirty:                     { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faBroom,             label: 'DIRTY SCREEN' },
  kiosk_payment_integration_incomplete:   { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faCreditCard,        label: 'PAYMENT INCOMPLETE' },
  kiosk_multilingual_absent:              { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faLanguage,          label: 'NO MULTILINGUAL' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function SelfServiceKioskTerminalScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<KioskTerminalAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noKioskCount: 0, noUpsellCount: 0, adaNoncompliantCount: 0, noMultilingualCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_KIOSK_TERMINAL_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readKioskTerminalConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveKioskTerminalAlerts(db), getKioskTerminalSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[self-service-kiosk-terminal-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runKioskTerminalEngine(db, config);
      toast.success(`Analyzed ${result.generated} self-service kiosk + terminal signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[self-service-kiosk-terminal-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateKioskTerminalAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[self-service-kiosk-terminal-report] status failed', err);
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
      <DocumentTitle parts={["AI Self-Service Kiosk & Terminal Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faDisplay} className="text-violet-600" />
              AI Self-Service Kiosk &amp; Terminal Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how self-service kiosks + ordering terminals (placement, screen size, UI/UX, payment integration, upsell prompts, accessibility, wait time reduction, order accuracy, kiosk-to-table delivery, multi-language) impact operational efficiency + labor cost + order accuracy + ticket size + customer satisfaction — kiosks increase ticket 15-30% (McDonalds 30%); reduce labor 25-40% peak (NRA); improve accuracy 35-45%; 65% under 35 prefer kiosk (NRA Gen Z); upsell prompts 45-55% acceptance vs 15-20% verbal; wait reduced 40-60%; kiosk placement critical (visible from entrance, min 2 for flow, ADA height); smudgy screens reduce usage 20-25%
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faDisplay} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze kiosks'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faDisplay} label="No kiosks" value={String(summary.noKioskCount)} color={summary.noKioskCount > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faHandPointer} label="No upsell prompts" value={String(summary.noUpsellCount)} color={summary.noUpsellCount > 0 ? 'text-orange-600' : 'text-emerald-600'} />
          <SummaryCard icon={faUniversalAccess} label="ADA noncompliant" value={String(summary.adaNoncompliantCount)} color={summary.adaNoncompliantCount > 0 ? 'text-emerald-600' : 'text-emerald-600'} />
          <SummaryCard icon={faLanguage} label="No multilingual" value={String(summary.noMultilingualCount)} color={summary.noMultilingualCount > 0 ? 'text-fuchsia-600' : 'text-emerald-600'} />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faDisplay} spin className="text-4xl mb-3" />
            <p>Analyzing self-service kiosk + terminal optimization opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No self-service kiosk / terminal alerts</p>
            <p className="text-sm mt-1">Kiosks deployed at entrance zone visible from entrance with 2+ units at ADA-compliant height, automated upsell prompts with 45-55% acceptance rate, all 6 payment types accepted (credit, debit, cash, mobile wallet, gift card, loyalty), daily screen cleaning with 90+ cleanliness score, multilingual support with 2+ languages, kiosk-to-table delivery enabled.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faDisplay, label: alert.rule_id.toUpperCase() };
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
                          {alert.location_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.location_id}</span>
                          )}
                          {alert.restaurant_tier && (
                            <span className="text-xs text-neutral-500">{alert.restaurant_tier}</span>
                          )}
                          {alert.market_setting && (
                            <span className="text-xs text-neutral-500">{alert.market_setting}</span>
                          )}
                          {alert.has_kiosks != null && (
                            <span className={`text-xs ${alert.has_kiosks ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_kiosks ? 'kiosks yes' : 'NO kiosks'}</span>
                          )}
                          {alert.kiosk_count != null && alert.kiosk_count > 0 && (
                            <span className={`text-xs ${alert.kiosk_count < 2 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.kiosk_count} kiosks</span>
                          )}
                          {alert.kiosk_brand && (
                            <span className="text-xs text-neutral-500">{alert.kiosk_brand}</span>
                          )}
                          {alert.kiosk_screen_size_in != null && alert.kiosk_screen_size_in > 0 && (
                            <span className={`text-xs ${alert.kiosk_screen_size_in < 24 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.kiosk_screen_size_in}" screen</span>
                          )}
                          {alert.kiosk_screen_type && (
                            <span className="text-xs text-neutral-500">{alert.kiosk_screen_type}</span>
                          )}
                          {alert.kiosk_visible_from_entrance != null && (
                            <span className={`text-xs ${alert.kiosk_visible_from_entrance ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_visible_from_entrance ? 'visible from entrance' : 'NOT visible'}</span>
                          )}
                          {alert.kiosk_location_zone && (
                            <span className="text-xs text-neutral-500">zone: {alert.kiosk_location_zone}</span>
                          )}
                          {alert.kiosk_distance_from_entrance_ft != null && alert.kiosk_distance_from_entrance_ft > 0 && (
                            <span className={`text-xs ${alert.kiosk_distance_from_entrance_ft > 20 ? 'text-rose-600 font-medium' : alert.kiosk_distance_from_entrance_ft > 10 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.kiosk_distance_from_entrance_ft} ft from entrance</span>
                          )}
                          {alert.kiosk_at_ada_height != null && (
                            <span className={`text-xs ${alert.kiosk_at_ada_height ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_at_ada_height ? 'ADA height ok' : 'ADA height BAD'}</span>
                          )}
                          {alert.kiosk_at_ada_reach != null && (
                            <span className={`text-xs ${alert.kiosk_at_ada_reach ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_at_ada_reach ? 'ADA reach ok' : 'ADA reach BAD'}</span>
                          )}
                          {alert.kiosk_peak_hourly_volume != null && alert.kiosk_peak_hourly_volume > 0 && (
                            <span className="text-xs text-neutral-500">{alert.kiosk_peak_hourly_volume} orders/hr peak</span>
                          )}
                          {alert.kiosk_avg_queue_min != null && alert.kiosk_avg_queue_min > 0 && (
                            <span className={`text-xs ${alert.kiosk_avg_queue_min > 5 ? 'text-rose-600 font-medium' : alert.kiosk_avg_queue_min > 3 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.kiosk_avg_queue_min} min queue</span>
                          )}
                          {alert.has_upsell_prompts != null && (
                            <span className={`text-xs ${alert.has_upsell_prompts ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_upsell_prompts ? 'upsell yes' : 'NO upsell'}</span>
                          )}
                          {alert.upsell_prompt_count != null && alert.upsell_prompt_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.upsell_prompt_count} prompts</span>
                          )}
                          {alert.upsell_acceptance_rate_pct != null && alert.upsell_acceptance_rate_pct > 0 && (
                            <span className={`text-xs ${alert.upsell_acceptance_rate_pct < 45 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.upsell_acceptance_rate_pct}% upsell accept</span>
                          )}
                          {alert.upsell_avg_ticket_lift_pct != null && alert.upsell_avg_ticket_lift_pct > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">+{alert.upsell_avg_ticket_lift_pct}% ticket lift</span>
                          )}
                          {alert.kiosk_accepts_credit != null && (
                            <span className={`text-xs ${alert.kiosk_accepts_credit ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_accepts_credit ? 'credit yes' : 'NO credit'}</span>
                          )}
                          {alert.kiosk_accepts_mobile_wallet != null && (
                            <span className={`text-xs ${alert.kiosk_accepts_mobile_wallet ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_accepts_mobile_wallet ? 'wallet yes' : 'NO wallet'}</span>
                          )}
                          {alert.kiosk_accepts_cash != null && (
                            <span className={`text-xs ${alert.kiosk_accepts_cash ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.kiosk_accepts_cash ? 'cash yes' : 'no cash'}</span>
                          )}
                          {alert.kiosk_accepts_gift_card != null && (
                            <span className={`text-xs ${alert.kiosk_accepts_gift_card ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_accepts_gift_card ? 'gift card yes' : 'NO GC'}</span>
                          )}
                          {alert.kiosk_accepts_loyalty != null && (
                            <span className={`text-xs ${alert.kiosk_accepts_loyalty ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_accepts_loyalty ? 'loyalty yes' : 'NO loyalty'}</span>
                          )}
                          {alert.kiosk_payment_methods_count != null && alert.kiosk_payment_methods_count > 0 && (
                            <span className={`text-xs ${alert.kiosk_payment_methods_count < 4 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.kiosk_payment_methods_count}/6 payment methods</span>
                          )}
                          {alert.kiosk_ada_compliant != null && (
                            <span className={`text-xs ${alert.kiosk_ada_compliant ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_ada_compliant ? 'ADA compliant' : 'ADA NONCOMPLIANT'}</span>
                          )}
                          {alert.kiosk_audio_assist != null && (
                            <span className={`text-xs ${alert.kiosk_audio_assist ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.kiosk_audio_assist ? 'audio assist' : 'no audio'}</span>
                          )}
                          {alert.kiosk_braille_labels != null && (
                            <span className={`text-xs ${alert.kiosk_braille_labels ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}`}>{alert.kiosk_braille_labels ? 'braille yes' : 'no braille'}</span>
                          )}
                          {alert.kiosk_wheelchair_clearance != null && (
                            <span className={`text-xs ${alert.kiosk_wheelchair_clearance ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_wheelchair_clearance ? 'wheelchair ok' : 'NO WC clear'}</span>
                          )}
                          {alert.kiosk_screen_cleanliness_score != null && alert.kiosk_screen_cleanliness_score > 0 && (
                            <span className={`text-xs ${alert.kiosk_screen_cleanliness_score < 60 ? 'text-rose-600 font-medium' : alert.kiosk_screen_cleanliness_score < 90 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>clean {alert.kiosk_screen_cleanliness_score}/100</span>
                          )}
                          {alert.kiosk_last_cleaned_hours != null && alert.kiosk_last_cleaned_hours > 0 && (
                            <span className={`text-xs ${alert.kiosk_last_cleaned_hours > 48 ? 'text-rose-600 font-medium' : alert.kiosk_last_cleaned_hours > 24 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.kiosk_last_cleaned_hours}h since clean</span>
                          )}
                          {alert.kiosk_cleaning_log_active != null && (
                            <span className={`text-xs ${alert.kiosk_cleaning_log_active ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.kiosk_cleaning_log_active ? 'log active' : 'no log'}</span>
                          )}
                          {alert.has_multilingual != null && (
                            <span className={`text-xs ${alert.has_multilingual ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_multilingual ? 'multilingual yes' : 'NO multilingual'}</span>
                          )}
                          {alert.kiosk_languages_count != null && alert.kiosk_languages_count > 0 && (
                            <span className={`text-xs ${alert.kiosk_languages_count < 2 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.kiosk_languages_count} languages</span>
                          )}
                          {alert.kiosk_languages && alert.kiosk_languages.length > 0 && (
                            <span className="text-xs text-neutral-500">{alert.kiosk_languages.join(', ')}</span>
                          )}
                          {alert.kiosk_default_language && (
                            <span className="text-xs text-neutral-500">default: {alert.kiosk_default_language}</span>
                          )}
                          {alert.has_kiosk_to_table != null && (
                            <span className={`text-xs ${alert.has_kiosk_to_table ? 'text-emerald-600 font-medium' : 'text-neutral-500'}`}>{alert.has_kiosk_to_table ? 'kiosk-to-table yes' : 'no k2t'}</span>
                          )}
                          {alert.kiosk_to_table_avg_minutes != null && alert.kiosk_to_table_avg_minutes > 0 && (
                            <span className="text-xs text-neutral-500">{alert.kiosk_to_table_avg_minutes} min to table</span>
                          )}
                          {alert.avg_kiosk_ticket != null && alert.avg_kiosk_ticket > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.avg_kiosk_ticket} kiosk ticket</span>
                          )}
                          {alert.avg_cashier_ticket != null && alert.avg_cashier_ticket > 0 && (
                            <span className="text-xs text-neutral-500">${alert.avg_cashier_ticket} cashier ticket</span>
                          )}
                          {alert.ticket_lift_pct != null && alert.ticket_lift_pct > 0 && (
                            <span className={`text-xs ${alert.ticket_lift_pct < 15 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>+{alert.ticket_lift_pct}% ticket lift</span>
                          )}
                          {alert.order_accuracy_pct != null && alert.order_accuracy_pct > 0 && (
                            <span className={`text-xs ${alert.order_accuracy_pct < 95 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.order_accuracy_pct}% kiosk accuracy</span>
                          )}
                          {alert.cashier_order_accuracy_pct != null && alert.cashier_order_accuracy_pct > 0 && (
                            <span className="text-xs text-neutral-500">{alert.cashier_order_accuracy_pct}% cashier accuracy</span>
                          )}
                          {alert.wait_time_cashier_min != null && alert.wait_time_cashier_min > 0 && (
                            <span className="text-xs text-neutral-500">{alert.wait_time_cashier_min} min cashier wait</span>
                          )}
                          {alert.wait_time_kiosk_min != null && alert.wait_time_kiosk_min > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.wait_time_kiosk_min} min kiosk wait</span>
                          )}
                          {alert.wait_reduction_pct != null && alert.wait_reduction_pct > 0 && (
                            <span className={`text-xs ${alert.wait_reduction_pct < 40 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>-{alert.wait_reduction_pct}% wait</span>
                          )}
                          {alert.labor_hours_saved_weekly != null && alert.labor_hours_saved_weekly > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.labor_hours_saved_weekly} hrs saved/wk</span>
                          )}
                          {alert.labor_cost_saved_monthly != null && alert.labor_cost_saved_monthly > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.labor_cost_saved_monthly}/mo labor saved</span>
                          )}
                          {alert.pct_under_35_customers != null && alert.pct_under_35_customers > 0 && (
                            <span className={`text-xs ${alert.pct_under_35_customers < 50 ? 'text-neutral-500' : 'text-violet-600 font-medium'}`}>{alert.pct_under_35_customers}% under 35</span>
                          )}
                          {alert.customer_satisfaction_kiosk != null && alert.customer_satisfaction_kiosk > 0 && (
                            <span className={`text-xs ${alert.customer_satisfaction_kiosk < 75 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.customer_satisfaction_kiosk}/100 kiosk CSAT</span>
                          )}
                          {alert.customer_satisfaction_cashier != null && alert.customer_satisfaction_cashier > 0 && (
                            <span className="text-xs text-neutral-500">{alert.customer_satisfaction_cashier}/100 cashier CSAT</span>
                          )}
                          {alert.monthly_kiosk_revenue != null && alert.monthly_kiosk_revenue > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.monthly_kiosk_revenue}/mo kiosk rev</span>
                          )}
                          {alert.kiosk_revenue_pct != null && alert.kiosk_revenue_pct > 0 && (
                            <span className={`text-xs ${alert.kiosk_revenue_pct < 30 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.kiosk_revenue_pct}% via kiosk</span>
                          )}
                          {alert.kiosk_unit_cost != null && alert.kiosk_unit_cost > 0 && (
                            <span className="text-xs text-neutral-500">${alert.kiosk_unit_cost}/unit</span>
                          )}
                          {alert.kiosk_software_monthly != null && alert.kiosk_software_monthly > 0 && (
                            <span className="text-xs text-neutral-500">${alert.kiosk_software_monthly}/mo software</span>
                          )}
                          {alert.kiosk_payment_processing_pct != null && alert.kiosk_payment_processing_pct > 0 && (
                            <span className="text-xs text-neutral-500">{alert.kiosk_payment_processing_pct}% processing</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.ticket_lift_projected_pct != null && alert.ticket_lift_projected_pct > 0 && (
                            <span className="text-emerald-600">+{alert.ticket_lift_projected_pct}% ticket lift (target)</span>
                          )}
                          {alert.labor_savings_projected != null && alert.labor_savings_projected > 0 && (
                            <span className="text-emerald-600">+${alert.labor_savings_projected}/mo labor saved (target)</span>
                          )}
                          {alert.wait_reduction_projected_pct != null && alert.wait_reduction_projected_pct > 0 && (
                            <span className="text-emerald-600">-{alert.wait_reduction_projected_pct}% wait reduction (target)</span>
                          )}
                          {alert.accuracy_lift_projected_pct != null && alert.accuracy_lift_projected_pct > 0 && (
                            <span className="text-emerald-600">+{alert.accuracy_lift_projected_pct}% accuracy lift (target)</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct > 0 && (
                            <span className="text-emerald-600">{alert.predicted_revenue_change_pct}% total revenue</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faDisplay} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo opportunity</div>
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
          <span>Kiosks: <span className={config.requireKiosks ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireKiosks ? 'required' : 'optional'}</span></span>
          <span>Kiosk count: <span className={config.requireKioskCount ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireKioskCount ? 'required' : 'optional'}</span></span>
          <span>Placement: <span className={config.requireKioskPlacement ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireKioskPlacement ? 'required' : 'optional'}</span></span>
          <span>Upsell prompts: <span className={config.requireUpsellPrompts ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireUpsellPrompts ? 'required' : 'optional'}</span></span>
          <span>ADA compliance: <span className={config.requireAdaCompliance ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireAdaCompliance ? 'required' : 'optional'}</span></span>
          <span>Screen cleaning: <span className={config.requireScreenCleaning ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireScreenCleaning ? 'required' : 'optional'}</span></span>
          <span>Payment integration: <span className={config.requirePaymentIntegration ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePaymentIntegration ? 'required' : 'optional'}</span></span>
          <span>Multilingual: <span className={config.requireMultilingual ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMultilingual ? 'required' : 'optional'}</span></span>
          <span>Min kiosk count: {config.minKioskCount}</span>
          <span>Min screen size: {config.minScreenSizeIn}"</span>
          <span>Min upsell acceptance: {config.minUpsellAcceptancePct}%</span>
          <span>Min cleanliness: {config.minScreenCleanliness}/100</span>
          <span>Min payment methods: {config.minPaymentMethods}</span>
          <span>Min languages: {config.minLanguages}</span>
          <span>Min wait reduction: {config.minWaitReductionPct}%</span>
          <span>Min ticket lift: {config.minTicketLiftPct}%</span>
          <span className="text-neutral-400">181st POSR-exclusive differentiator</span>
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

export default SelfServiceKioskTerminalScreen;
