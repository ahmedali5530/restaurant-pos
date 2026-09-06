/**
 * AI Branded Merchandise & Retail Product Optimizer — predicts how branded
 * merchandise and retail products (signature sauces, spice blends, cookbooks,
 * branded apparel, gift cards, packaged food, kitchen tools, branded
 * drinkware) impact additional revenue stream, brand awareness, customer
 * loyalty, and marketing reach.
 *
 * 179th POSR-exclusive differentiator.
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
  faStore, faRotate, faBottleWater, faEye, faGift, faShirt,
  faBook, faCookie, faBagShopping,
  faCheckCircle, faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  runBrandedMerchEngine, getActiveBrandedMerchAlerts, getBrandedMerchSummary,
  updateBrandedMerchAlertStatus, readBrandedMerchConfig, DEFAULT_BRANDED_MERCH_CONFIG,
  type BrandedMerchAlert,
} from "@/lib/branded-merchandise-retail.service.ts";

const RULE_STYLE: Record<string, { bg: string; text: string; icon: any; label: string }> = {
  retail_products_absent:        { bg: 'bg-rose-50',     text: 'text-rose-700',     icon: faStore,          label: 'NO RETAIL' },
  signature_sauce_not_bottled:   { bg: 'bg-amber-50',    text: 'text-amber-700',    icon: faBottleWater,    label: 'SAUCE NOT BOTTLED' },
  merchandise_display_poor:      { bg: 'bg-orange-50',   text: 'text-orange-700',   icon: faEye,            label: 'POOR DISPLAY' },
  gift_card_display_absent:      { bg: 'bg-sky-50',      text: 'text-sky-700',      icon: faGift,           label: 'NO GIFT CARD DISPLAY' },
  branded_apparel_missing:       { bg: 'bg-violet-50',   text: 'text-violet-700',   icon: faShirt,          label: 'NO APPAREL' },
  cookbook_opportunity:          { bg: 'bg-yellow-50',   text: 'text-yellow-700',   icon: faBook,           label: 'NO COOKBOOK' },
  packaged_food_absent:          { bg: 'bg-fuchsia-50',  text: 'text-fuchsia-700',  icon: faCookie,         label: 'NO PACKAGED FOOD' },
  online_store_absent:           { bg: 'bg-emerald-50',  text: 'text-emerald-700',  icon: faBagShopping,    label: 'NO ONLINE STORE' },
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-rose-500',
  high:     'bg-amber-500',
  medium:   'bg-yellow-400',
  low:      'bg-neutral-300',
};

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

export function BrandedMerchandiseRetailScreen() {
  const { t } = useTranslation(["reports", "common"]);
  const db = useDB();
  const [alerts, setAlerts] = useState<BrandedMerchAlert[]>([]);
  const [summary, setSummary] = useState({ totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noRetailCount: 0, sauceNotBottledCount: 0, noGiftCardDisplayCount: 0, noOnlineStoreCount: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [config, setConfig] = useState(DEFAULT_BRANDED_MERCH_CONFIG);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const settingsResult = await db.query('SELECT * FROM settings LIMIT 1');
      const settingsRows = Array.isArray(settingsResult) ? settingsResult.flat() : [];
      setConfig(readBrandedMerchConfig(settingsRows[0] ?? {}));
      const [list, sum] = await Promise.all([getActiveBrandedMerchAlerts(db), getBrandedMerchSummary(db)]);
      setAlerts(list); setSummary(sum);
    } catch (err) { console.error('[branded-merchandise-retail-report] reload failed', err); toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [db]);

  useMemo(() => { reload(); }, [reload]);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    try {
      const result = await runBrandedMerchEngine(db, config);
      toast.success(`Analyzed ${result.generated} branded merchandise + retail signals — ${fmt$(summary.totalOpportunity)}/mo opportunity`);
      await reload();
    } catch (err) {
      console.error('[branded-merchandise-retail-report] analyze failed', err);
      toast.error('Analysis failed');
    } finally { setAnalyzing(false); }
  }, [db, config, reload, summary.totalOpportunity]);

  const handleStatus = useCallback(async (alertId: string, status: 'resolved' | 'in_progress' | 'rejected') => {
    try {
      await updateBrandedMerchAlertStatus(db, alertId, status);
      toast.success(`Marked as ${status}`);
      await reload();
    } catch (err) {
      console.error('[branded-merchandise-retail-report] status failed', err);
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
      <DocumentTitle parts={["AI Branded Merchandise & Retail Product Optimizer", t('reports:title', { defaultValue: 'Reports' })]} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FontAwesomeIcon icon={faStore} className="text-emerald-600" />
              AI Branded Merchandise &amp; Retail Product Optimizer
            </h1>
            <p className="text-sm text-neutral-500">
              Predicts how branded merchandise + retail products (signature sauces, spice blends, cookbooks, branded apparel, gift cards, packaged food, kitchen tools, branded drinkware) impact additional revenue + brand awareness + customer loyalty + marketing reach — 35% of customers would buy branded products (NRA); retail generates 8-15% additional revenue at 60-80% margins; signature sauces are #1 product (55% would buy); gift cards are #1 impulse purchase (45% overspend); branded apparel = 400 impressions per item (free advertising); display near checkout increases impulse 40-60%; cookbooks sell 5,000-50,000 copies; online store captures 30% of retail revenue
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={reload} variant="custom" className="gap-2 border border-neutral-300 px-3 py-2 text-sm">
              <FontAwesomeIcon icon={faRotate} /> Refresh
            </Button>
            <Button onClick={handleAnalyze} disabled={analyzing} variant="primary" className="gap-2">
              <FontAwesomeIcon icon={faStore} spin={analyzing} />
              {analyzing ? 'Analyzing…' : 'Analyze retail'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard icon={faStore} label="No retail products" value={String(summary.noRetailCount)} color={summary.noRetailCount > 0 ? 'text-rose-600' : 'text-emerald-600'} />
          <SummaryCard icon={faBottleWater} label="Sauce not bottled" value={String(summary.sauceNotBottledCount)} color={summary.sauceNotBottledCount > 0 ? 'text-amber-600' : 'text-emerald-600'} />
          <SummaryCard icon={faGift} label="No gift card display" value={String(summary.noGiftCardDisplayCount)} color={summary.noGiftCardDisplayCount > 0 ? 'text-sky-600' : 'text-emerald-600'} />
          <SummaryCard icon={faBagShopping} label="No online store" value={String(summary.noOnlineStoreCount)} color={summary.noOnlineStoreCount > 0 ? 'text-emerald-600' : 'text-emerald-600'} />
        </div>

        {loading ? (
          <div className="p-12 text-center text-neutral-400">
            <FontAwesomeIcon icon={faStore} spin className="text-4xl mb-3" />
            <p>Analyzing branded merchandise + retail product opportunities…</p>
          </div>
        ) : sortedAlerts.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 border border-dashed border-neutral-300 rounded-lg">
            <FontAwesomeIcon icon={faCheckCircle} className="text-4xl mb-3 text-emerald-500" />
            <p className="font-medium">No branded merchandise / retail alerts</p>
            <p className="text-sm mt-1">Retail products sold across multiple categories (sauces bottled, gift cards displayed at register, branded apparel with 400+ impressions/item, cookbook published, packaged food line active, online store live, merchandise display visible at checkout).</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {sortedAlerts.map((alert, idx) => {
              const style = RULE_STYLE[alert.rule_id] ?? { bg: 'bg-neutral-50', text: 'text-neutral-700', icon: faStore, label: alert.rule_id.toUpperCase() };
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
                          {alert.has_retail_products != null && (
                            <span className={`text-xs ${alert.has_retail_products ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_retail_products ? 'has retail' : 'NO retail'}</span>
                          )}
                          {alert.retail_product_categories && alert.retail_product_categories.length > 0 && (
                            <span className="text-xs text-neutral-500">{alert.retail_product_categories.length} categories: {alert.retail_product_categories.join(', ')}</span>
                          )}
                          {alert.retail_product_count != null && alert.retail_product_count > 0 && (
                            <span className={`text-xs ${alert.retail_product_count < 5 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.retail_product_count} SKU(s)</span>
                          )}
                          {alert.signature_sauce_popular != null && alert.signature_sauce_popular && (
                            <span className="text-xs text-neutral-500">sauce: {alert.signature_sauce_name ?? 'house'}</span>
                          )}
                          {alert.signature_sauce_bottled != null && (
                            <span className={`text-xs ${alert.signature_sauce_bottled ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.signature_sauce_bottled ? 'bottled' : 'NOT bottled'}</span>
                          )}
                          {alert.monthly_sauce_sales != null && alert.monthly_sauce_sales > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.monthly_sauce_sales}/mo sauce</span>
                          )}
                          {alert.merchandise_display_at_checkout != null && (
                            <span className={`text-xs ${alert.merchandise_display_at_checkout ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.merchandise_display_at_checkout ? 'display@counter' : 'NO display@counter'}</span>
                          )}
                          {alert.merchandise_display_visible != null && (
                            <span className={`text-xs ${alert.merchandise_display_visible ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.merchandise_display_visible ? 'visible' : 'NOT visible'}</span>
                          )}
                          {alert.display_fixture_count != null && alert.display_fixture_count > 0 && (
                            <span className={`text-xs ${alert.display_fixture_count < 2 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.display_fixture_count} fixture(s)</span>
                          )}
                          {alert.gift_cards_displayed != null && (
                            <span className={`text-xs ${alert.gift_cards_displayed ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.gift_cards_displayed ? 'gift cards shown' : 'NO gift card display'}</span>
                          )}
                          {alert.gift_card_purchase_rate_pct != null && alert.gift_card_purchase_rate_pct > 0 && (
                            <span className={`text-xs ${alert.gift_card_purchase_rate_pct < 5 ? 'text-rose-600 font-medium' : alert.gift_card_purchase_rate_pct < 8 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.gift_card_purchase_rate_pct}% GC rate</span>
                          )}
                          {alert.gift_card_revenue_monthly != null && alert.gift_card_revenue_monthly > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.gift_card_revenue_monthly}/mo GC</span>
                          )}
                          {alert.gift_card_avg_value != null && alert.gift_card_avg_value > 0 && (
                            <span className="text-xs text-neutral-500">${alert.gift_card_avg_value} avg GC</span>
                          )}
                          {alert.branded_apparel_available != null && (
                            <span className={`text-xs ${alert.branded_apparel_available ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.branded_apparel_available ? 'apparel yes' : 'NO apparel'}</span>
                          )}
                          {alert.apparel_items_count != null && alert.apparel_items_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.apparel_items_count} apparel SKU(s)</span>
                          )}
                          {alert.apparel_designs_count != null && alert.apparel_designs_count > 0 && (
                            <span className="text-xs text-neutral-500">{alert.apparel_designs_count} designs</span>
                          )}
                          {alert.apparel_revenue_monthly != null && alert.apparel_revenue_monthly > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.apparel_revenue_monthly}/mo apparel</span>
                          )}
                          {alert.apparel_impressions_per_item != null && alert.apparel_impressions_per_item > 0 && (
                            <span className={`text-xs ${alert.apparel_impressions_per_item < 400 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.apparel_impressions_per_item} imp/item</span>
                          )}
                          {alert.has_signature_dishes != null && alert.has_signature_dishes && (
                            <span className="text-xs text-neutral-500">{alert.signature_dish_count ?? 0} signature dishes</span>
                          )}
                          {alert.has_cookbook != null && (
                            <span className={`text-xs ${alert.has_cookbook ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_cookbook ? 'cookbook yes' : 'NO cookbook'}</span>
                          )}
                          {alert.cookbook_copies_sold != null && alert.cookbook_copies_sold > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">{alert.cookbook_copies_sold.toLocaleString()} copies sold</span>
                          )}
                          {alert.cookbook_revenue_total != null && alert.cookbook_revenue_total > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${(alert.cookbook_revenue_total / 1000).toFixed(0)}k lifetime</span>
                          )}
                          {alert.has_packaged_food != null && (
                            <span className={`text-xs ${alert.has_packaged_food ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_packaged_food ? 'packaged food yes' : 'NO packaged food'}</span>
                          )}
                          {alert.packaged_food_categories != null && alert.packaged_food_categories > 0 && (
                            <span className="text-xs text-neutral-500">{alert.packaged_food_categories} pkg categories</span>
                          )}
                          {alert.packaged_food_revenue_monthly != null && alert.packaged_food_revenue_monthly > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.packaged_food_revenue_monthly}/mo pkg</span>
                          )}
                          {alert.has_online_store != null && (
                            <span className={`text-xs ${alert.has_online_store ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}`}>{alert.has_online_store ? 'online store yes' : 'NO online store'}</span>
                          )}
                          {alert.online_store_url && (
                            <span className="text-xs text-sky-600 font-medium">{alert.online_store_url}</span>
                          )}
                          {alert.monthly_online_sales != null && alert.monthly_online_sales > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.monthly_online_sales}/mo online</span>
                          )}
                          {alert.online_orders_per_month != null && alert.online_orders_per_month > 0 && (
                            <span className="text-xs text-neutral-500">{alert.online_orders_per_month} orders/mo</span>
                          )}
                          {alert.monthly_retail_revenue != null && alert.monthly_retail_revenue > 0 && (
                            <span className="text-xs text-emerald-600 font-medium">${alert.monthly_retail_revenue}/mo retail</span>
                          )}
                          {alert.retail_revenue_pct != null && alert.retail_revenue_pct > 0 && (
                            <span className={`text-xs ${alert.retail_revenue_pct < 8 ? 'text-rose-600 font-medium' : alert.retail_revenue_pct < 12 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.retail_revenue_pct}% of total</span>
                          )}
                          {alert.retail_margin_pct != null && alert.retail_margin_pct > 0 && (
                            <span className={`text-xs ${alert.retail_margin_pct < 60 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}`}>{alert.retail_margin_pct}% margin</span>
                          )}
                          {alert.avg_retail_ticket != null && alert.avg_retail_ticket > 0 && (
                            <span className="text-xs text-neutral-500">${alert.avg_retail_ticket} avg ticket</span>
                          )}
                          {alert.branded_impressions_monthly != null && alert.branded_impressions_monthly > 0 && (
                            <span className="text-xs text-violet-600 font-medium">{alert.branded_impressions_monthly.toLocaleString()} imp/mo</span>
                          )}
                          <span className={`inline-flex items-center gap-1 text-xs ${alert.severity === 'critical' ? 'text-rose-600' : alert.severity === 'high' ? 'text-amber-600' : 'text-neutral-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[alert.severity]}`} />
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{alert.description}</p>
                        <div className="flex items-center gap-4 flex-wrap mt-2 text-xs text-neutral-500">
                          {alert.revenue_lift_pct != null && alert.revenue_lift_pct > 0 && (
                            <span className="text-emerald-600">+{alert.revenue_lift_pct}% revenue lift (target)</span>
                          )}
                          {alert.retail_revenue_change != null && alert.retail_revenue_change > 0 && (
                            <span className="text-emerald-600">+${alert.retail_revenue_change}/mo retail</span>
                          )}
                          {alert.impression_change != null && alert.impression_change > 0 && (
                            <span className="text-violet-600">+{alert.impression_change.toLocaleString()} brand impressions/mo</span>
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
                            <FontAwesomeIcon icon={faStore} className="mt-0.5 shrink-0" />
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
          <span>Retail products: <span className={config.requireRetailProducts ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireRetailProducts ? 'required' : 'optional'}</span></span>
          <span>Sauce bottled: <span className={config.requireSignatureSauceBottled ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireSignatureSauceBottled ? 'required' : 'optional'}</span></span>
          <span>Display at checkout: <span className={config.requireMerchandiseDisplayAtCheckout ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireMerchandiseDisplayAtCheckout ? 'required' : 'optional'}</span></span>
          <span>Gift card display: <span className={config.requireGiftCardDisplay ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireGiftCardDisplay ? 'required' : 'optional'}</span></span>
          <span>Branded apparel: <span className={config.requireBrandedApparel ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireBrandedApparel ? 'required' : 'optional'}</span></span>
          <span>Cookbook: <span className={config.requireCookbook ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireCookbook ? 'required' : 'optional'}</span></span>
          <span>Packaged food: <span className={config.requirePackagedFood ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requirePackagedFood ? 'required' : 'optional'}</span></span>
          <span>Online store: <span className={config.requireOnlineStore ? 'text-emerald-600 font-medium' : 'text-neutral-400'}>{config.requireOnlineStore ? 'required' : 'optional'}</span></span>
          <span>Min retail %: {config.minRetailRevenuePct}%</span>
          <span>Min apparel impressions/item: {config.minApparelImpressionsPerItem}</span>
          <span>Min gift card rate: {config.minGiftCardPurchaseRatePct}%</span>
          <span>Min retail margin: {config.minRetailMarginPct}%</span>
          <span className="text-neutral-400">179th POSR-exclusive differentiator</span>
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

export default BrandedMerchandiseRetailScreen;
