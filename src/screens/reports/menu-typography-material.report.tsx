/**
 * AI Menu Typography & Material Quality Optimizer — predicts how menu
 * typography and physical material (font choice, font size, typography
 * hierarchy, text readability, paper quality, menu cover material, binding
 * type, menu size/weight, texture, finishing) impacts customer perception of
 * restaurant quality, price acceptance, reading time, and order accuracy.
 *
 * 169th POSR-exclusive differentiator.
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
  faFont, faRotate, faPenNib, faBookOpen, faFileLines,
  faMagnifyingGlass, faEye, faTextHeight, faLayerGroup,
  faWeightHanging, faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runMenuTypographyEngine, getActiveAlerts, getSummary, updateAlertStatus,
  readMenuTypographyConfig, DEFAULT_MENU_TYPOGRAPHY_CONFIG,
  type MenuTypographyAlert,
} from "@/lib/menu-typography-material.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  font_size_too_small:                  { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faTextHeight,       label: 'FONT TOO SMALL' },
  font_readability_poor:                 { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faFont,             label: 'POOR READABILITY' },
  typography_hierarchy_weak:             { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faLayerGroup,       label: 'WEAK HIERARCHY' },
  paper_quality_low:                     { bg: 'bg-stone-50',    text: 'text-stone-700',    icon: faFileLines,        label: 'CHEAP PAPER' },
  menu_cover_worn_stained:               { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faBookOpen,         label: 'WORN COVER' },
  font_brand_mismatch:                   { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faPenNib,           label: 'BRAND MISMATCH' },
  menu_size_weight_wrong:                { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faWeightHanging,    label: 'SIZE/WEIGHT WRONG' },
  text_contrast_insufficient:            { bg: 'bg-slate-50',    text: 'text-slate-700',    icon: faEye,              label: 'LOW CONTRAST' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function MenuTypographyMaterialScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<MenuTypographyAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, menusAtRisk: 0, smallFontMenus: 0, wornCoverMenus: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_MENU_TYPOGRAPHY_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readMenuTypographyConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveAlerts(db), getSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[menu-typography-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runMenuTypographyEngine(db, config);
      toast.success(`Analyzed ${result.generated} menu typography + material signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[menu-typography-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[menu-typography-report] status failed', err);
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
      <DocumentTitle parts={["AI Menu Typography & Material Quality Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faFont} className="text-rose-500" />
              AI Menu Typography &amp; Material Quality Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how menu typography + physical material (font choice, font size, hierarchy, readability, paper quality, menu cover, binding, size/weight, contrast) impact customer perception of quality, price acceptance, reading time, order accuracy — 72% judge restaurant quality by menu physical quality (Cornell CHR); font below 11pt causes reading difficulty for 40% over 40 (AOA); script fonts reduce reading speed 25-30%; paper quality signals restaurant tier; stained covers = perceived dirty restaurant
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faFont} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze menus'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faTextHeight} label="Small font menus" value={String(summary.smallFontMenus)} color={summary.smallFontMenus > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faBookOpen} label="Worn cover menus" value={String(summary.wornCoverMenus)} color={summary.wornCoverMenus > 0 ? 'text-orange-600' : 'text-emerald-600'} />
          <SummaryCard icon={faTriangleExclamation} label="Menus at risk" value={String(summary.menusAtRisk)} color={summary.menusAtRisk > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faFont} label="Monthly opportunity" value={fmt$(summary.totalOpportunity)} color="text-amber-600" />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faFont} spin className="text-4xl mb-3" />
            <p>Analyzing menu typography + material quality opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No menu typography/material alerts</p>
            <p className="text-sm mt-1">Font size adequate, font readable, hierarchy strong, paper quality matches tier, cover pristine, font matches brand, size/weight balanced, text contrast meets WCAG AA.</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faFont, label: alert.rule_id.toUpperCase() };
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
                          {alert.menu_id && (
                            <span className="text-sm font-semibold text-neutral-800 uppercase">{alert.menu_id}</span>
                          )}
                          {alert.restaurant_tier && (
                            <span className="text-xs text-neutral-500">{alert.restaurant_tier}</span>
                          )}
                          {alert.font_family_type && (
                            <span className={`text-xs ${alert.font_family_type === 'script' || alert.font_family_type === 'decorative' ? 'text-rose-600 font-medium' : 'text-neutral-600 font-medium'}`}>{alert.font_family_type}</span>
                          )}
                          {alert.font_name && (
                            <span className="text-xs text-neutral-500">{alert.font_name}</span>
                          )}
                          {alert.font_size_pt != null && alert.font_size_pt > 0 && (
                            <span className={`text-xs ${alert.font_size_pt < 9 ? 'text-rose-600 font-medium' : alert.font_size_pt < 11 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.font_size_pt}pt body</span>
                          )}
                          {alert.dish_name_font_size_pt != null && alert.dish_name_font_size_pt > 0 && (
                            <span className="text-xs text-neutral-600 font-medium">{alert.dish_name_font_size_pt}pt dish</span>
                          )}
                          {alert.description_font_size_pt != null && alert.description_font_size_pt > 0 && (
                            <span className="text-xs text-neutral-500">{alert.description_font_size_pt}pt desc</span>
                          )}
                          {alert.price_font_size_pt != null && alert.price_font_size_pt > 0 && (
                            <span className="text-xs text-neutral-600 font-medium">{alert.price_font_size_pt}pt price</span>
                          )}
                          {alert.typography_hierarchy_score != null && alert.typography_hierarchy_score > 0 && (
                            <span className={`text-xs ${alert.typography_hierarchy_score < 40 ? 'text-rose-600 font-medium' : alert.typography_hierarchy_score < 70 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.typography_hierarchy_score}/100 hierarchy</span>
                          )}
                          {alert.text_readability_score != null && alert.text_readability_score > 0 && (
                            <span className={`text-xs ${alert.text_readability_score < 50 ? 'text-rose-600 font-medium' : alert.text_readability_score < 75 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.text_readability_score}/100 read</span>
                          )}
                          {alert.text_contrast_ratio != null && alert.text_contrast_ratio > 0 && (
                            <span className={`text-xs ${alert.text_contrast_ratio < 3 ? 'text-rose-600 font-medium' : alert.text_contrast_ratio < 4.5 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.text_contrast_ratio}:1 contrast</span>
                          )}
                          {alert.paper_quality_gsm != null && alert.paper_quality_gsm > 0 && (
                            <span className={`text-xs ${alert.paper_quality_gsm < 90 ? 'text-rose-600 font-medium' : alert.paper_quality_gsm < 120 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.paper_quality_gsm}gsm</span>
                          )}
                          {alert.paper_finish && (
                            <span className="text-xs text-neutral-500">{alert.paper_finish}</span>
                          )}
                          {alert.menu_cover_material && (
                            <span className="text-xs text-neutral-600 font-medium">{alert.menu_cover_material} cover</span>
                          )}
                          {alert.menu_cover_condition && (
                            <span className={`text-xs ${alert.menu_cover_condition === 'torn' || alert.menu_cover_condition === 'stained' ? 'text-rose-600 font-medium' : alert.menu_cover_condition === 'worn' ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.menu_cover_condition}</span>
                          )}
                          {alert.menu_cover_stained != null && alert.menu_cover_stained && (
                            <span className="text-xs text-rose-600 font-medium">stained</span>
                          )}
                          {alert.menu_binding_type && (
                            <span className="text-xs text-neutral-500">{alert.menu_binding_type}</span>
                          )}
                          {alert.menu_size && (
                            <span className={`text-xs ${alert.menu_size === 'oversized' || alert.menu_size === 'small' ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.menu_size} size</span>
                          )}
                          {alert.menu_weight_grams != null && alert.menu_weight_grams > 0 && (
                            <span className={`text-xs ${alert.menu_weight_grams > 600 || alert.menu_weight_grams < 80 ? 'text-amber-600 font-medium' : 'text-neutral-500'}`}>{alert.menu_weight_grams}g</span>
                          )}
                          {alert.font_brand_match != null && !alert.font_brand_match && (
                            <span className="text-xs text-rose-600 font-medium">brand mismatch</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.customer_satisfaction_change != null && alert.customer_satisfaction_change < 0 && (
                            <span className="text-rose-600">{alert.customer_satisfaction_change}% satisfaction</span>
                          )}
                          {alert.perceived_quality_change != null && alert.perceived_quality_change < 0 && (
                            <span className="text-rose-600">{alert.perceived_quality_change}% perceived quality</span>
                          )}
                          {alert.price_acceptance_change != null && alert.price_acceptance_change < 0 && (
                            <span className="text-rose-600">{alert.price_acceptance_change}% price acceptance</span>
                          )}
                          {alert.reading_time_change != null && alert.reading_time_change > 0 && (
                            <span className="text-rose-600">+{alert.reading_time_change}% reading time</span>
                          )}
                          {alert.order_accuracy_change != null && alert.order_accuracy_change < 0 && (
                            <span className="text-rose-600">{alert.order_accuracy_change}% order accuracy</span>
                          )}
                          {alert.predicted_dwell_change != null && alert.predicted_dwell_change > 0 && (
                            <span className="text-rose-600">+{alert.predicted_dwell_change}% dwell</span>
                          )}
                          {alert.predicted_revenue_change_pct != null && alert.predicted_revenue_change_pct < 0 && (
                            <span className="text-rose-600">{alert.predicted_revenue_change_pct}% revenue</span>
                          )}
                        </div>
                        {alert.ai_insight && (
                          <div className="mt-2 bg-sky-50 border border-sky-200 rounded px-3 py-2 text-xs text-sky-800 flex items-start gap-2">
                            <FontAwesomeIcon icon={faMagnifyingGlass} className="mt-0.5 shrink-0" />
                            <span>{alert.ai_insight}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {alert.est_monthly_opportunity > 0 && (
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-emerald-600">{fmt$(alert.est_monthly_opportunity)}</div>
                        <div className="text-xs text-neutral-400">/mo at risk</div>
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
          <span>Min body font: {config.minFontSizePt}pt</span>
          <span>Min dish name font: {config.minDishNameFontSizePt}pt</span>
          <span>Min hierarchy: {config.minTypographyHierarchyScore}/100</span>
          <span>Min readability: {config.minTextReadabilityScore}/100</span>
          <span>Min contrast ratio: {config.minTextContrastRatio}:1</span>
          <span>Min contrast score: {config.minTextContrastScore}/100</span>
          <span>Min paper: {config.minPaperQualityGsm}gsm</span>
          <span>Cover pristine: <span className={config.requireCoverPristine ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCoverPristine ? 'required' : 'optional'}</span></span>
          <span>Font brand match: <span className={config.requireFontBrandMatch ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireFontBrandMatch ? 'required' : 'optional'}</span></span>
          <span>Standard size: <span className={config.requireStandardMenuSize ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireStandardMenuSize ? 'required' : 'optional'}</span></span>
          <span>Menu weight range: {config.minMenuWeightGrams}-{config.maxMenuWeightGrams}g</span>
          <span className="text-neutral-400">169th POSR-exclusive differentiator</span>
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

export default MenuTypographyMaterialScreen;
