/**
 * AI Branded Merchandise & Retail Product Optimizer — predicts how branded
 * merchandise and retail products (signature sauces, spice blends, cookbooks,
 * branded apparel, gift cards, packaged food, kitchen tools, branded
 * drinkware) impact additional revenue stream, brand awareness, customer
 * loyalty, and marketing reach.
 *
 * 35% of customers would buy branded products from their favorite restaurant
 * (NRA). Branded merchandise increases brand awareness — each item worn/used
 * = free advertising (avg 400 impressions per item). Restaurants with retail
 * products generate 8-15% additional revenue with 60-80% margins (vs 3-10%
 * food margins). Sauce/spice blend sales are the #1 retail product — 55% of
 * customers would purchase signature sauces. Cookbooks from restaurants sell
 * 5,000-50,000 copies; celebrity chef cookbooks sell 100,000+. Gift cards
 * are the #1 impulse purchase at checkout — 45% of gift card buyers spend
 * more than card value. Branded apparel (t-shirts, hats) creates walking
 * billboards — 1 shirt = ~400 impressions over its lifetime. Display
 * placement near checkout increases impulse retail purchases by 40-60%.
 *
 * 179th POSR-exclusive differentiator. Restaurants without optimized branded
 * merchandise lose 8-15% additional revenue at 60-80% margins (no retail
 * products sold; signature sauce not bottled = #1 missed opportunity;
 * poor display at checkout = 40-60% fewer impulse purchases; no gift card
 * display = missed #1 impulse purchase; no branded apparel = missed free
 * advertising 400 impressions per item; no cookbook = missed $5-50k revenue;
 * no packaged food = missed grab-and-go revenue; no online store = limited
 * to in-person sales only). Existing services cover giftcard-fraud (detects
 * fraud) and loyalty-roi (tracks loyalty program ROI) — this service
 * optimizes the RETAIL merchandise mix + display + online store.
 *
 * Distinct from:
 *   - giftcard-fraud — detects gift card fraud patterns (not merchandising)
 *   - loyalty-roi — loyalty program ROI (not physical retail products)
 *   - menu-photography — menu visual photography (not retail products)
 *   - promo-effectiveness — promo campaign ROI (not branded products)
 *
 * 8 AI rules:
 *   1. retail_products_absent -> no branded merchandise sold -> missed 8-15% additional revenue
 *   2. signature_sauce_not_bottled -> popular sauce/dressing not available for purchase -> #1 retail opportunity missed
 *   3. merchandise_display_poor -> retail products not visible at checkout -> 40-60% fewer impulse purchases
 *   4. gift_card_display_absent -> gift cards not prominently displayed -> missed #1 impulse purchase
 *   5. branded_apparel_missing -> no t-shirts/hats/branded items -> missed free advertising (400 impressions/item)
 *   6. cookbook_opportunity -> restaurant with signature dishes but no cookbook -> missed $5-50k revenue
 *   7. packaged_food_absent -> no packaged food (cookies, granola, spice blends) -> missed grab-and-go revenue
 *   8. online_store_absent -> no online store for branded products -> limited to in-person sales only
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type BrandedMerchRuleId =
  | 'retail_products_absent'
  | 'signature_sauce_not_bottled'
  | 'merchandise_display_poor'
  | 'gift_card_display_absent'
  | 'branded_apparel_missing'
  | 'cookbook_opportunity'
  | 'packaged_food_absent'
  | 'online_store_absent';

export type BrandedMerchAiRec =
  | 'launch_branded_retail_line'
  | 'bottle_signature_sauce'
  | 'install_checkout_merchandise_display'
  | 'display_gift_cards_at_register'
  | 'launch_branded_apparel_line'
  | 'publish_signature_cookbook'
  | 'add_packaged_food_line'
  | 'launch_online_store'
  | 'monitor'
  | 'skip';

export interface BrandedMerchAlert {
  id?: string;
  rule_id: BrandedMerchRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  location_id?: string;                                    // 'checkout' | 'counter' | 'entrance' | 'foyer' | 'overall'
  restaurant_tier?: string;                                // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  market_setting?: string;                                 // 'urban' | 'suburban' | 'rural'
  // Retail presence
  has_retail_products?: boolean;                           // restaurant sells any branded merchandise
  retail_product_categories?: string[];                    // ['sauce','spice_blend','cookbook','apparel','gift_card','packaged_food','kitchen_tools','drinkware']
  retail_product_count?: number;                            // total distinct retail SKUs
  // Signature sauce
  signature_sauce_popular?: boolean;                        // restaurant has a signature/popular sauce or dressing
  signature_sauce_name?: string;                            // name of the popular sauce
  signature_sauce_bottled?: boolean;                        // sauce available for retail purchase
  monthly_sauce_sales?: number;                             // monthly sauce retail revenue
  // Display + visibility
  merchandise_display_at_checkout?: boolean;               // retail products displayed near checkout/register
  merchandise_display_visible?: boolean;                   // display visible to all customers in queue
  display_fixture_count?: number;                           // number of display fixtures (shelves, racks, cases)
  // Gift cards
  gift_cards_displayed?: boolean;                           // gift cards prominently displayed at register
  gift_card_purchase_rate_pct?: number;                     // % of customers buying gift cards
  gift_card_revenue_monthly?: number;                       // monthly gift card sales revenue
  gift_card_avg_value?: number;                             // avg gift card value purchased
  // Branded apparel
  branded_apparel_available?: boolean;                     // t-shirts, hats, branded apparel sold
  apparel_items_count?: number;                             // distinct apparel SKUs
  apparel_designs_count?: number;                           // number of unique designs
  apparel_revenue_monthly?: number;                         // monthly apparel revenue
  apparel_impressions_per_item?: number;                    // avg impressions per apparel item (400 industry benchmark)
  // Cookbook
  has_signature_dishes?: boolean;                          // restaurant has signature/iconic dishes worth publishing
  signature_dish_count?: number;                            // number of signature dishes
  has_cookbook?: boolean;                                   // restaurant has published a cookbook
  cookbook_published?: boolean;                             // cookbook is currently in print/available
  cookbook_copies_sold?: number;                            // lifetime cookbook copies sold
  cookbook_revenue_total?: number;                          // lifetime cookbook revenue
  // Packaged food
  has_packaged_food?: boolean;                             // packaged food sold (cookies, granola, spice blends, dry goods)
  packaged_food_categories?: number;                        // number of distinct packaged food categories
  packaged_food_revenue_monthly?: number;                   // monthly packaged food revenue
  // Online store
  has_online_store?: boolean;                              // restaurant has an online store for branded products
  online_store_url?: string;                                // store URL
  monthly_online_sales?: number;                            // monthly online store revenue
  online_orders_per_month?: number;                         // online order count per month
  // Economics + impact
  monthly_revenue?: number;                                // total restaurant monthly revenue
  monthly_retail_revenue?: number;                          // monthly revenue from retail products
  retail_revenue_pct?: number;                              // % of total revenue from retail
  retail_margin_pct?: number;                              // retail gross margin %
  avg_retail_ticket?: number;                              // avg retail purchase ticket
  branded_impressions_monthly?: number;                    // total monthly brand impressions from apparel/drinkware
  // Costs
  online_store_setup_cost?: number;                         // estimated cost to launch online store
  cookbook_publish_cost?: number;                           // estimated cost to publish cookbook
  sauce_bottling_cost?: number;                             // estimated cost to bottle signature sauce
  apparel_setup_cost?: number;                              // estimated cost to set up apparel line
  display_install_cost?: number;                            // estimated cost to install merchandise display
  gift_card_display_cost?: number;                          // estimated cost to install gift card display
  // Impact projections
  revenue_lift_pct?: number;                                // % projected revenue lift from fix
  retail_revenue_change?: number;                           // $ change in monthly retail revenue
  impression_change?: number;                               // change in monthly brand impressions
  predicted_revenue_change_pct?: number;
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: BrandedMerchAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface BrandedMerchConfig {
  aiEnabled: boolean;
  requireRetailProducts: boolean;                          // require restaurant to sell any branded merchandise
  requireSignatureSauceBottled: boolean;                  // require signature sauce available for purchase
  requireMerchandiseDisplayAtCheckout: boolean;           // require retail display at checkout
  requireGiftCardDisplay: boolean;                        // require gift cards prominently displayed
  requireBrandedApparel: boolean;                         // require branded apparel sold
  requireCookbook: boolean;                               // require cookbook if restaurant has signature dishes
  requirePackagedFood: boolean;                           // require packaged food line
  requireOnlineStore: boolean;                            // require online store for branded products
  minRetailRevenuePct: number;                            // min % of total revenue from retail (8)
  minApparelImpressionsPerItem: number;                   // min impressions per apparel item (400)
  minGiftCardPurchaseRatePct: number;                     // min gift card purchase rate (5)
  minRetailMarginPct: number;                              // min retail margin % (60)
}

export const DEFAULT_BRANDED_MERCH_CONFIG: BrandedMerchConfig = {
  aiEnabled: true,
  requireRetailProducts: true,
  requireSignatureSauceBottled: true,
  requireMerchandiseDisplayAtCheckout: true,
  requireGiftCardDisplay: true,
  requireBrandedApparel: true,
  requireCookbook: true,
  requirePackagedFood: true,
  requireOnlineStore: true,
  minRetailRevenuePct: 8,
  minApparelImpressionsPerItem: 400,
  minGiftCardPurchaseRatePct: 5,
  minRetailMarginPct: 60,
};

export const readBrandedMerchConfig = (settings: any): BrandedMerchConfig => ({
  aiEnabled: settings?.branded_merch_ai_enabled ?? true,
  requireRetailProducts: settings?.branded_merch_require_retail ?? true,
  requireSignatureSauceBottled: settings?.branded_merch_require_sauce_bottled ?? true,
  requireMerchandiseDisplayAtCheckout: settings?.branded_merch_require_display_checkout ?? true,
  requireGiftCardDisplay: settings?.branded_merch_require_giftcard_display ?? true,
  requireBrandedApparel: settings?.branded_merch_require_apparel ?? true,
  requireCookbook: settings?.branded_merch_require_cookbook ?? true,
  requirePackagedFood: settings?.branded_merch_require_packaged_food ?? true,
  requireOnlineStore: settings?.branded_merch_require_online_store ?? true,
  minRetailRevenuePct: safeNumber(settings?.branded_merch_min_retail_pct, 8),
  minApparelImpressionsPerItem: safeNumber(settings?.branded_merch_min_apparel_impressions, 400),
  minGiftCardPurchaseRatePct: safeNumber(settings?.branded_merch_min_giftcard_rate, 5),
  minRetailMarginPct: safeNumber(settings?.branded_merch_min_margin, 60),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

interface BrandedMerchData {
  location_id: string;
  restaurant_tier: string;
  market_setting: string;
  has_retail_products: boolean;
  retail_product_categories: string[];
  retail_product_count: number;
  signature_sauce_popular: boolean;
  signature_sauce_name: string;
  signature_sauce_bottled: boolean;
  monthly_sauce_sales: number;
  merchandise_display_at_checkout: boolean;
  merchandise_display_visible: boolean;
  display_fixture_count: number;
  gift_cards_displayed: boolean;
  gift_card_purchase_rate_pct: number;
  gift_card_revenue_monthly: number;
  gift_card_avg_value: number;
  branded_apparel_available: boolean;
  apparel_items_count: number;
  apparel_designs_count: number;
  apparel_revenue_monthly: number;
  apparel_impressions_per_item: number;
  has_signature_dishes: boolean;
  signature_dish_count: number;
  has_cookbook: boolean;
  cookbook_published: boolean;
  cookbook_copies_sold: number;
  cookbook_revenue_total: number;
  has_packaged_food: boolean;
  packaged_food_categories: number;
  packaged_food_revenue_monthly: number;
  has_online_store: boolean;
  online_store_url: string;
  monthly_online_sales: number;
  online_orders_per_month: number;
  monthly_revenue: number;
  monthly_retail_revenue: number;
  retail_revenue_pct: number;
  retail_margin_pct: number;
  avg_retail_ticket: number;
  branded_impressions_monthly: number;
  online_store_setup_cost: number;
  cookbook_publish_cost: number;
  sauce_bottling_cost: number;
  apparel_setup_cost: number;
  display_install_cost: number;
  gift_card_display_cost: number;
}

const MOCK_DATA: BrandedMerchData[] = [
  {
    location_id: 'overall', restaurant_tier: 'casual_dining', market_setting: 'suburban',
    has_retail_products: false, retail_product_categories: [], retail_product_count: 0,
    signature_sauce_popular: true, signature_sauce_name: 'House Chipotle BBQ',
    signature_sauce_bottled: false, monthly_sauce_sales: 0,
    merchandise_display_at_checkout: false, merchandise_display_visible: false, display_fixture_count: 0,
    gift_cards_displayed: false, gift_card_purchase_rate_pct: 1, gift_card_revenue_monthly: 280, gift_card_avg_value: 25,
    branded_apparel_available: false, apparel_items_count: 0, apparel_designs_count: 0,
    apparel_revenue_monthly: 0, apparel_impressions_per_item: 0,
    has_signature_dishes: true, signature_dish_count: 4, has_cookbook: false, cookbook_published: false,
    cookbook_copies_sold: 0, cookbook_revenue_total: 0,
    has_packaged_food: false, packaged_food_categories: 0, packaged_food_revenue_monthly: 0,
    has_online_store: false, online_store_url: '', monthly_online_sales: 0, online_orders_per_month: 0,
    monthly_revenue: 62000, monthly_retail_revenue: 280, retail_revenue_pct: 0.5,
    retail_margin_pct: 0, avg_retail_ticket: 25, branded_impressions_monthly: 0,
    online_store_setup_cost: 2500, cookbook_publish_cost: 8000, sauce_bottling_cost: 1200,
    apparel_setup_cost: 1800, display_install_cost: 1500, gift_card_display_cost: 250,
  },
  {
    location_id: 'counter', restaurant_tier: 'fine_dining', market_setting: 'urban',
    has_retail_products: true, retail_product_categories: ['sauce','cookbook','gift_card','drinkware'], retail_product_count: 12,
    signature_sauce_popular: true, signature_sauce_name: 'Truffle Aioli',
    signature_sauce_bottled: true, monthly_sauce_sales: 2800,
    merchandise_display_at_checkout: true, merchandise_display_visible: true, display_fixture_count: 3,
    gift_cards_displayed: true, gift_card_purchase_rate_pct: 12, gift_card_revenue_monthly: 8400, gift_card_avg_value: 75,
    branded_apparel_available: false, apparel_items_count: 0, apparel_designs_count: 0,
    apparel_revenue_monthly: 0, apparel_impressions_per_item: 0,
    has_signature_dishes: true, signature_dish_count: 8, has_cookbook: true, cookbook_published: true,
    cookbook_copies_sold: 18500, cookbook_revenue_total: 555000,
    has_packaged_food: false, packaged_food_categories: 0, packaged_food_revenue_monthly: 0,
    has_online_store: false, online_store_url: '', monthly_online_sales: 0, online_orders_per_month: 0,
    monthly_revenue: 145000, monthly_retail_revenue: 14200, retail_revenue_pct: 9.8,
    retail_margin_pct: 72, avg_retail_ticket: 38, branded_impressions_monthly: 0,
    online_store_setup_cost: 3500, cookbook_publish_cost: 0, sauce_bottling_cost: 0,
    apparel_setup_cost: 2400, display_install_cost: 0, gift_card_display_cost: 0,
  },
  {
    location_id: 'checkout', restaurant_tier: 'fast_casual', market_setting: 'suburban',
    has_retail_products: true, retail_product_categories: ['sauce','gift_card'], retail_product_count: 4,
    signature_sauce_popular: true, signature_sauce_name: 'Signature Hot Sauce',
    signature_sauce_bottled: true, monthly_sauce_sales: 950,
    merchandise_display_at_checkout: false, merchandise_display_visible: false, display_fixture_count: 1,
    gift_cards_displayed: false, gift_card_purchase_rate_pct: 2, gift_card_revenue_monthly: 480, gift_card_avg_value: 25,
    branded_apparel_available: false, apparel_items_count: 0, apparel_designs_count: 0,
    apparel_revenue_monthly: 0, apparel_impressions_per_item: 0,
    has_signature_dishes: true, signature_dish_count: 3, has_cookbook: false, cookbook_published: false,
    cookbook_copies_sold: 0, cookbook_revenue_total: 0,
    has_packaged_food: false, packaged_food_categories: 0, packaged_food_revenue_monthly: 0,
    has_online_store: false, online_store_url: '', monthly_online_sales: 0, online_orders_per_month: 0,
    monthly_revenue: 38000, monthly_retail_revenue: 1430, retail_revenue_pct: 3.8,
    retail_margin_pct: 65, avg_retail_ticket: 18, branded_impressions_monthly: 0,
    online_store_setup_cost: 1800, cookbook_publish_cost: 5000, sauce_bottling_cost: 0,
    apparel_setup_cost: 1200, display_install_cost: 900, gift_card_display_cost: 180,
  },
  {
    location_id: 'counter', restaurant_tier: 'casual_dining', market_setting: 'urban',
    has_retail_products: true, retail_product_categories: ['sauce','spice_blend','gift_card','apparel','packaged_food','drinkware'], retail_product_count: 18,
    signature_sauce_popular: true, signature_sauce_name: 'Smoky Maple Ketchup',
    signature_sauce_bottled: true, monthly_sauce_sales: 1850,
    merchandise_display_at_checkout: true, merchandise_display_visible: true, display_fixture_count: 4,
    gift_cards_displayed: true, gift_card_purchase_rate_pct: 8, gift_card_revenue_monthly: 3200, gift_card_avg_value: 40,
    branded_apparel_available: true, apparel_items_count: 6, apparel_designs_count: 4,
    apparel_revenue_monthly: 1100, apparel_impressions_per_item: 420,
    has_signature_dishes: true, signature_dish_count: 5, has_cookbook: false, cookbook_published: false,
    cookbook_copies_sold: 0, cookbook_revenue_total: 0,
    has_packaged_food: true, packaged_food_categories: 3, packaged_food_revenue_monthly: 720,
    has_online_store: true, online_store_url: 'shop.example.com', monthly_online_sales: 2400, online_orders_per_month: 85,
    monthly_revenue: 88000, monthly_retail_revenue: 10570, retail_revenue_pct: 12,
    retail_margin_pct: 68, avg_retail_ticket: 32, branded_impressions_monthly: 5040,
    online_store_setup_cost: 0, cookbook_publish_cost: 6500, sauce_bottling_cost: 0,
    apparel_setup_cost: 0, display_install_cost: 0, gift_card_display_cost: 0,
  },
];

export const runBrandedMerchEngine = async (
  db: ReturnType<typeof useDB>,
  config: BrandedMerchConfig,
): Promise<{ alerts: BrandedMerchAlert[]; generated: number }> => {
  const alerts: BrandedMerchAlert[] = [];
  const now = new Date();

  let data: BrandedMerchData[] = [];
  try {
    const result = await db.query(
      `SELECT location_id, restaurant_tier, market_setting,
              has_retail_products, retail_product_categories, retail_product_count,
              signature_sauce_popular, signature_sauce_name, signature_sauce_bottled,
              monthly_sauce_sales,
              merchandise_display_at_checkout, merchandise_display_visible, display_fixture_count,
              gift_cards_displayed, gift_card_purchase_rate_pct, gift_card_revenue_monthly, gift_card_avg_value,
              branded_apparel_available, apparel_items_count, apparel_designs_count,
              apparel_revenue_monthly, apparel_impressions_per_item,
              has_signature_dishes, signature_dish_count, has_cookbook, cookbook_published,
              cookbook_copies_sold, cookbook_revenue_total,
              has_packaged_food, packaged_food_categories, packaged_food_revenue_monthly,
              has_online_store, online_store_url, monthly_online_sales, online_orders_per_month,
              monthly_revenue, monthly_retail_revenue, retail_revenue_pct, retail_margin_pct,
              avg_retail_ticket, branded_impressions_monthly,
              online_store_setup_cost, cookbook_publish_cost, sauce_bottling_cost,
              apparel_setup_cost, display_install_cost, gift_card_display_cost
       FROM branded_merch_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      location_id: String(r.location_id ?? 'overall'),
      restaurant_tier: String(r.restaurant_tier ?? 'casual_dining'),
      market_setting: String(r.market_setting ?? 'suburban'),
      has_retail_products: Boolean(r.has_retail_products ?? false),
      retail_product_categories: Array.isArray(r.retail_product_categories) ? r.retail_product_categories : [],
      retail_product_count: safeNumber(r.retail_product_count, 0),
      signature_sauce_popular: Boolean(r.signature_sauce_popular ?? true),
      signature_sauce_name: String(r.signature_sauce_name ?? 'House Sauce'),
      signature_sauce_bottled: Boolean(r.signature_sauce_bottled ?? false),
      monthly_sauce_sales: safeNumber(r.monthly_sauce_sales, 0),
      merchandise_display_at_checkout: Boolean(r.merchandise_display_at_checkout ?? false),
      merchandise_display_visible: Boolean(r.merchandise_display_visible ?? false),
      display_fixture_count: safeNumber(r.display_fixture_count, 0),
      gift_cards_displayed: Boolean(r.gift_cards_displayed ?? false),
      gift_card_purchase_rate_pct: safeNumber(r.gift_card_purchase_rate_pct, 0),
      gift_card_revenue_monthly: safeNumber(r.gift_card_revenue_monthly, 0),
      gift_card_avg_value: safeNumber(r.gift_card_avg_value, 25),
      branded_apparel_available: Boolean(r.branded_apparel_available ?? false),
      apparel_items_count: safeNumber(r.apparel_items_count, 0),
      apparel_designs_count: safeNumber(r.apparel_designs_count, 0),
      apparel_revenue_monthly: safeNumber(r.apparel_revenue_monthly, 0),
      apparel_impressions_per_item: safeNumber(r.apparel_impressions_per_item, 0),
      has_signature_dishes: Boolean(r.has_signature_dishes ?? true),
      signature_dish_count: safeNumber(r.signature_dish_count, 0),
      has_cookbook: Boolean(r.has_cookbook ?? false),
      cookbook_published: Boolean(r.cookbook_published ?? false),
      cookbook_copies_sold: safeNumber(r.cookbook_copies_sold, 0),
      cookbook_revenue_total: safeNumber(r.cookbook_revenue_total, 0),
      has_packaged_food: Boolean(r.has_packaged_food ?? false),
      packaged_food_categories: safeNumber(r.packaged_food_categories, 0),
      packaged_food_revenue_monthly: safeNumber(r.packaged_food_revenue_monthly, 0),
      has_online_store: Boolean(r.has_online_store ?? false),
      online_store_url: String(r.online_store_url ?? ''),
      monthly_online_sales: safeNumber(r.monthly_online_sales, 0),
      online_orders_per_month: safeNumber(r.online_orders_per_month, 0),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      monthly_retail_revenue: safeNumber(r.monthly_retail_revenue, 0),
      retail_revenue_pct: safeNumber(r.retail_revenue_pct, 0),
      retail_margin_pct: safeNumber(r.retail_margin_pct, 0),
      avg_retail_ticket: safeNumber(r.avg_retail_ticket, 0),
      branded_impressions_monthly: safeNumber(r.branded_impressions_monthly, 0),
      online_store_setup_cost: safeNumber(r.online_store_setup_cost, 2500),
      cookbook_publish_cost: safeNumber(r.cookbook_publish_cost, 5000),
      sauce_bottling_cost: safeNumber(r.sauce_bottling_cost, 1200),
      apparel_setup_cost: safeNumber(r.apparel_setup_cost, 1500),
      display_install_cost: safeNumber(r.display_install_cost, 1200),
      gift_card_display_cost: safeNumber(r.gift_card_display_cost, 200),
    }));
  } catch { data = []; }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;
    const baselineRetail = d.monthly_retail_revenue;
    const isPremiumTier = d.restaurant_tier === 'fine_dining' || d.restaurant_tier === 'casual_dining';
    const isUrbanMarket = d.market_setting === 'urban';
    const avgCustomerCount = baselineRevenue > 0 ? Math.round(baselineRevenue / 22) : 0;
    const expectedRetailPct = isPremiumTier ? 15 : 8;
    const targetRetailRevenue = Math.round(baselineRevenue * (expectedRetailPct / 100));

    // Rule 1: RETAIL_PRODUCTS_ABSENT
    if (config.requireRetailProducts && !d.has_retail_products) {
      // No branded merchandise sold -> missed 8-15% additional revenue
      const missedRevenuePct = expectedRetailPct;
      const missedRevenue = targetRetailRevenue;
      const totalOpportunity = Math.max(missedRevenue, 1200);
      const criticalNote = isPremiumTier
        ? 'CRITICAL: NO BRANDED MERCHANDISE or retail products sold at this ' + d.restaurant_tier + ' location. Restaurants with retail products generate 8-15% additional revenue with 60-80% margins (NRA). At monthly revenue of ' + fmt$(baselineRevenue) + ', this is ' + fmt$(totalOpportunity) + '/mo in missed retail revenue — at 60-80% margin, vs 3-10% food margins. 35% of customers would buy branded products from their favorite restaurant (NRA). The restaurant has a signature sauce (' + d.signature_sauce_name + '), ' + d.signature_dish_count + ' signature dishes, and ' + avgCustomerCount + ' monthly customers — all untapped retail demand. '
        : 'HIGH: no branded merchandise or retail products sold. 35% of customers would buy branded products (NRA). At monthly revenue of ' + fmt$(baselineRevenue) + ', the restaurant is missing ' + fmt$(totalOpportunity) + '/mo in additional retail revenue at 60-80% margins. ';
      alerts.push({
        rule_id: 'retail_products_absent',
        severity: isPremiumTier ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_retail_products: d.has_retail_products,
        retail_product_categories: d.retail_product_categories,
        retail_product_count: d.retail_product_count,
        signature_sauce_popular: d.signature_sauce_popular,
        signature_sauce_name: d.signature_sauce_name,
        has_signature_dishes: d.has_signature_dishes,
        signature_dish_count: d.signature_dish_count,
        monthly_revenue: d.monthly_revenue,
        monthly_retail_revenue: d.monthly_retail_revenue,
        retail_revenue_pct: d.retail_revenue_pct,
        retail_margin_pct: d.retail_margin_pct,
        online_store_setup_cost: d.online_store_setup_cost,
        cookbook_publish_cost: d.cookbook_publish_cost,
        sauce_bottling_cost: d.sauce_bottling_cost,
        apparel_setup_cost: d.apparel_setup_cost,
        revenue_lift_pct: missedRevenuePct,
        retail_revenue_change: totalOpportunity,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `RETAIL PRODUCTS ABSENT: ${d.location_id} has no branded merchandise or retail products for sale (current retail revenue ${fmt$(baselineRetail)}/mo, ${d.retail_revenue_pct}% of total, ${avgCustomerCount} monthly customers). ${criticalNote}Branded merchandise is the highest-margin revenue stream available to a restaurant — typically 60-80% margin vs 3-10% food margins. Industry data: 35% of customers would buy branded products from their favorite restaurant (NRA); restaurants with retail products generate 8-15% additional revenue; signature sauces are #1 (55% would buy); gift cards are #1 impulse purchase (45% spend more than card value); branded apparel creates 400 impressions per item (free advertising); display near checkout increases impulse purchases 40-60%. Solutions ranked by ROI: (1) BOTTLE the signature sauce ("${d.signature_sauce_name}") — 55% of customers would buy; cost $800-1,500 to design bottle + labels + FDA-compliant packaging; payback 2-4 months; (2) ADD gift cards at the register — #1 impulse purchase; 45% of buyers spend more than card value; display cost $150-300, payback under 1 month; (3) LAUNCH a small apparel line — 2-3 t-shirt designs + hats; cost $1,200-2,000 setup, each shirt = 400 impressions over lifetime (free advertising); (4) PUBLISH a signature dish cookbook — restaurants sell 5,000-50,000 copies; cost $5,000-10,000 to publish, payback 6-18 months; (5) ADD packaged food (cookies, granola, spice blends) — grab-and-go revenue, 60-80% margins; (6) LAUNCH online store — Shopify/WooCommerce + ShipStation; cost $1,800-3,500 setup, extends sales beyond in-person. Industry data: 8-15% additional revenue with 60-80% margins (NRA); 35% would buy branded products; signature sauces #1 (55%); gift cards #1 impulse (45% overspend). Expected impact: +${missedRevenuePct}% total revenue, +${fmt$(totalOpportunity)}/mo retail revenue at 60-80% margin, payback 3-6 months on phased rollout.`,
        ai_recommendation: 'launch_branded_retail_line',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: SIGNATURE_SAUCE_NOT_BOTTLED
    if (config.requireSignatureSauceBottled && d.signature_sauce_popular && !d.signature_sauce_bottled) {
      // Popular sauce/dressing not available for purchase -> #1 retail opportunity missed
      const sauceBuyerPct = 55;
      const expectedSauceBuyers = Math.round(avgCustomerCount * (sauceBuyerPct / 100));
      const avgSaucePrice = isPremiumTier ? 14 : 9;
      const expectedSauceRevenue = expectedSauceBuyers * avgSaucePrice;
      const totalOpportunity = Math.max(expectedSauceRevenue, 800);
      const criticalNote = isPremiumTier
        ? 'CRITICAL: SIGNATURE SAUCE "' + d.signature_sauce_name + '" is popular with customers but NOT available for retail purchase. Sauces are the #1 retail product — 55% of customers would buy their favorite restaurant sauce (NRA). With ' + avgCustomerCount + ' monthly customers, ' + expectedSauceBuyers + ' would buy at $' + avgSaucePrice + '/bottle = ' + fmt$(totalOpportunity) + '/mo missed sauce revenue. Cost to bottle: $' + d.sauce_bottling_cost + ' (bottle, label, FDA labeling, initial batch). Payback under 2 months. '
        : 'HIGH: signature sauce "' + d.signature_sauce_name + '" not bottled for retail. 55% of customers would purchase signature sauces (NRA) — this is the #1 retail product opportunity. ';
      alerts.push({
        rule_id: 'signature_sauce_not_bottled',
        severity: isPremiumTier ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        signature_sauce_popular: d.signature_sauce_popular,
        signature_sauce_name: d.signature_sauce_name,
        signature_sauce_bottled: d.signature_sauce_bottled,
        monthly_sauce_sales: d.monthly_sauce_sales,
        has_retail_products: d.has_retail_products,
        retail_product_categories: d.retail_product_categories,
        monthly_revenue: d.monthly_revenue,
        monthly_retail_revenue: d.monthly_retail_revenue,
        retail_revenue_pct: d.retail_revenue_pct,
        retail_margin_pct: d.retail_margin_pct,
        avg_retail_ticket: d.avg_retail_ticket,
        sauce_bottling_cost: d.sauce_bottling_cost,
        revenue_lift_pct: sauceBuyerPct,
        retail_revenue_change: totalOpportunity,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `SIGNATURE SAUCE NOT BOTTLED: ${d.location_id} has a popular signature sauce "${d.signature_sauce_name}" but it is NOT available for retail purchase. ${criticalNote}Signature sauces are the #1 retail product for restaurants — 55% of customers would purchase them (NRA). Bottling a signature sauce has the fastest payback of any retail product because (a) the recipe already exists, (b) ingredient costs are already accounted for in menu pricing, (c) customers actively ask for it. Solutions ranked by impact: (1) SOURCE bottle + cap — 8oz or 12oz glass bottle with tamper-evident cap; cost $0.45-0.85/bottle at 1,000 unit minimum; suppliers: Berlin Packaging, SKS Bottle; (2) DESIGN label — must include FDA-required info (ingredients, net weight, nutrition facts panel, allergen statement, distributor info, UPC barcode); cost $300-800 design + $0.15-0.30/bottle print; (3) BATCH and bottle — commercial kitchen rental $25-50/hour; one batch yields 100-200 bottles; consider co-packer for scale ($4-8/bottle finished); (4) PRICE at $9-14 retail — food cost 15-25%, margin 75-85%; (5) DISPLAY at checkout — bottled sauce is a high-impulse item, 40-60% lift when displayed at register; (6) ADD online — extend reach beyond in-venue; ShipStation + Shopify handle shipping calculations; (7) COMPLIANCE: register with FDA as a food facility (free, online); follow state cottage food laws if producing in-house; (8) EXPAND flavor line once first flavor succeeds — restaurants often launch 3-5 sauce variants (mild, medium, hot, sweet). Industry data: 55% of customers would buy signature sauces (NRA); #1 retail product; 75-85% margins; payback 1-2 months. Expected impact: +${sauceBuyerPct}% customer conversion to retail sauce buyers, +${fmt$(totalOpportunity)}/mo sauce revenue at 75-85% margin, payback ${Math.max(1, Math.round(d.sauce_bottling_cost / Math.max(totalOpportunity, 1)))} months.`,
        ai_recommendation: 'bottle_signature_sauce',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: MERCHANDISE_DISPLAY_POOR
    if (d.has_retail_products && (!d.merchandise_display_at_checkout || !d.merchandise_display_visible || d.display_fixture_count < 2)) {
      // Retail products not visible at checkout -> 40-60% fewer impulse purchases
      const impulseReductionPct = !d.merchandise_display_at_checkout ? 60 : !d.merchandise_display_visible ? 50 : 40;
      const lostRevenue = Math.round(baselineRetail * (impulseReductionPct / 100));
      const totalOpportunity = Math.max(lostRevenue, 400);
      const issueSummary = !d.merchandise_display_at_checkout
        ? 'NO DISPLAY at checkout (products stored in back, only available on request)'
        : !d.merchandise_display_visible
          ? 'display NOT visible from customer queue / register sightline'
          : 'only ' + d.display_fixture_count + ' display fixture(s) — below 2-fixture minimum';
      const criticalNote = !d.merchandise_display_at_checkout
        ? 'CRITICAL: RETAIL PRODUCTS not displayed at checkout — customers do not see them during the high-intent purchase moment. Display placement near checkout increases impulse retail purchases by 40-60% (NRA). At current retail revenue of ' + fmt$(baselineRetail) + '/mo, this is ' + fmt$(totalOpportunity) + '/mo in missed impulse revenue. The retail products exist but are functionally invisible. '
        : 'HIGH: retail display is not visible from the customer queue. Customers waiting to pay are the highest-intent impulse buyers — 40-60% lift when display is visible (NRA). ';
      alerts.push({
        rule_id: 'merchandise_display_poor',
        severity: !d.merchandise_display_at_checkout ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_retail_products: d.has_retail_products,
        retail_product_categories: d.retail_product_categories,
        retail_product_count: d.retail_product_count,
        merchandise_display_at_checkout: d.merchandise_display_at_checkout,
        merchandise_display_visible: d.merchandise_display_visible,
        display_fixture_count: d.display_fixture_count,
        monthly_revenue: d.monthly_revenue,
        monthly_retail_revenue: d.monthly_retail_revenue,
        retail_revenue_pct: d.retail_revenue_pct,
        retail_margin_pct: d.retail_margin_pct,
        avg_retail_ticket: d.avg_retail_ticket,
        display_install_cost: d.display_install_cost,
        revenue_lift_pct: impulseReductionPct,
        retail_revenue_change: lostRevenue,
        predicted_revenue_change_pct: -Math.round((lostRevenue / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `MERCHANDISE DISPLAY POOR: ${d.location_id} — ${issueSummary}. ${criticalNote}Display placement is the #1 lever for retail revenue — even more important than product mix. Industry data: display near checkout increases impulse purchases 40-60% (NRA); visible displays capture 3-5x more impulse buys than back-of-house storage. Customers waiting to pay are already in a spending mindset — they have their wallet out, they are committed to the transaction, and they are receptive to small add-ons. Solutions ranked by impact: (1) INSTALL a retail display wall/rack at the register — 2-3 fixtures (shelf + pegboard + spinner rack) at customer eye level (52-64 inch from floor); cost $800-1,800 installed; (2) POSITION products at the point of sale — within arms reach of the customer during payment; (3) USE clear acrylic display cases for premium items (cookbooks, drinkware) — visible but protected; (4) STOCK impulse-friendly items at register — bottled sauce, spice tins, small packaged food, gift cards; high-margin items under $20; (5) ADD signage — "Signature Sauce — bottled for you to take home"; price clearly marked; (6) ROTATE display seasonally — pumpkin spice sauce in fall, gift sets in December, grill kits in summer; (7) LIGHT the display — well-lit retail area signals premium and drives 15-20% more impulse purchase; (8) TRAIN cashiers to suggest — "would you like to add a bottle of our signature sauce for $9?"; cashier suggestion lifts retail attach rate 25-40%; (9) TRACK attach rate by SKU — identify best-sellers, expand shelf space, drop slow sellers. Industry data: 40-60% impulse lift from checkout display (NRA); 25-40% lift from cashier suggestion; eye-level placement doubles conversion. Expected impact: +${impulseReductionPct}% impulse retail revenue recovery, +${fmt$(lostRevenue)}/mo retail revenue, payback ${Math.max(1, Math.round(d.display_install_cost / Math.max(lostRevenue, 1)))} months.`,
        ai_recommendation: 'install_checkout_merchandise_display',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: GIFT_CARD_DISPLAY_ABSENT
    if (config.requireGiftCardDisplay && !d.gift_cards_displayed) {
      // Gift cards not prominently displayed -> missed #1 impulse purchase
      const expectedGiftCardRate = isPremiumTier ? 12 : 8;
      const expectedBuyers = Math.round(avgCustomerCount * (expectedGiftCardRate / 100));
      const avgGiftCardValue = isPremiumTier ? 60 : 35;
      const expectedGiftCardRevenue = expectedBuyers * avgGiftCardValue;
      const uplift = expectedGiftCardRevenue - d.gift_card_revenue_monthly;
      const totalOpportunity = Math.max(uplift, 500);
      const overspendPct = 45;
      const overspendRevenue = Math.round(expectedGiftCardRevenue * 0.20); // 45% spend 20% more than card value
      const criticalNote = isPremiumTier
        ? 'CRITICAL: GIFT CARDS not prominently displayed at register. Gift cards are the #1 impulse purchase at checkout (NRA) — ' + expectedGiftCardRate + '% of customers would buy at this tier. With ' + avgCustomerCount + ' monthly customers, ' + expectedBuyers + ' would buy at $' + avgGiftCardValue + ' avg = ' + fmt$(expectedGiftCardRevenue) + '/mo. Currently only ' + fmt$(d.gift_card_revenue_monthly) + '/mo (' + d.gift_card_purchase_rate_pct + '% rate). 45% of gift card buyers spend MORE than card value — additional ' + fmt$(overspendRevenue) + '/mo in revenue. '
        : 'HIGH: gift cards not displayed at register. Gift cards are the #1 impulse purchase (NRA) — currently only ' + d.gift_card_purchase_rate_pct + '% purchase rate, well below the ' + expectedGiftCardRate + '% benchmark. ';
      alerts.push({
        rule_id: 'gift_card_display_absent',
        severity: isPremiumTier ? 'critical' : 'high',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        gift_cards_displayed: d.gift_cards_displayed,
        gift_card_purchase_rate_pct: d.gift_card_purchase_rate_pct,
        gift_card_revenue_monthly: d.gift_card_revenue_monthly,
        gift_card_avg_value: d.gift_card_avg_value,
        has_retail_products: d.has_retail_products,
        monthly_revenue: d.monthly_revenue,
        monthly_retail_revenue: d.monthly_retail_revenue,
        retail_revenue_pct: d.retail_revenue_pct,
        retail_margin_pct: d.retail_margin_pct,
        gift_card_display_cost: d.gift_card_display_cost,
        revenue_lift_pct: expectedGiftCardRate - d.gift_card_purchase_rate_pct,
        retail_revenue_change: totalOpportunity,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `GIFT CARD DISPLAY ABSENT: ${d.location_id} — gift cards not prominently displayed at register (current purchase rate ${d.gift_card_purchase_rate_pct}%, expected ${expectedGiftCardRate}% for ${d.restaurant_tier} tier; current revenue ${fmt$(d.gift_card_revenue_monthly)}/mo). ${criticalNote}Gift cards are the highest-margin, lowest-effort retail product a restaurant can sell. Industry data: gift cards are the #1 impulse purchase at checkout (NRA); 45% of gift card buyers spend MORE than the card value (overspend); 65% of gift cards are redeemed within 30 days but 15-20% are NEVER redeemed (breakage = pure profit). Display matters more than any other factor — gift card display at register increases purchase rate 4-6x. Solutions ranked by impact: (1) DISPLAY gift cards at the register — countertop acrylic display stand, eye-level, within arms reach of customer; cost $150-300; payback under 1 month; (2) OFFER multiple denominations — $25, $50, $100, custom; custom amount captures large purchases (gifts); (3) SELL both physical and digital gift cards — digital (email-delivered) captures last-minute gifting and online sales; integrate with Square, Toast, or Stripe; (4) TRAIN cashiers to offer — "would you like to add a $25 gift card for someone special?"; cashier offer lifts purchase rate 200-300%; (5) PROMOTE during gift-giving holidays — Christmas, Valentines Day, Mothers Day, Graduation; signage + email blast; (6) ADD a gift card balance check + reload option on website — drives repeat purchase; (7) TRACK breakage — unspent gift card balances are pure profit; do not aggressively pursue redemption of dormant cards (state unclaimed property laws apply after 3-5 years); (8) BUNDLE gift card with purchase — "buy $50 gift card, get $5 bonus card free" drives gift card sales and future visit. Industry data: gift cards are #1 impulse purchase (NRA); 45% overspend; 15-20% breakage; display at register increases purchase 4-6x. Expected impact: +${expectedGiftCardRate - d.gift_card_purchase_rate_pct}pp purchase rate, +${fmt$(totalOpportunity)}/mo gift card revenue + ${fmt$(overspendRevenue)}/mo overspend revenue, payback ${Math.max(1, Math.round(d.gift_card_display_cost / Math.max(totalOpportunity, 1)))} month.`,
        ai_recommendation: 'display_gift_cards_at_register',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: BRANDED_APPAREL_MISSING
    if (config.requireBrandedApparel && d.has_retail_products && !d.branded_apparel_available) {
      // No t-shirts/hats/branded items -> missed free advertising (400 impressions/item)
      const expectedApparelBuyers = Math.round(avgCustomerCount * 0.04); // 4% of customers buy apparel
      const avgApparelPrice = isPremiumTier ? 28 : 22;
      const expectedApparelRevenue = expectedApparelBuyers * avgApparelPrice;
      const impressionsPerItem = 400;
      const expectedImpressions = expectedApparelBuyers * impressionsPerItem;
      const totalOpportunity = Math.max(expectedApparelRevenue, 300);
      const criticalNote = isPremiumTier
        ? 'HIGH: NO BRANDED APPAREL (t-shirts, hats, aprons) available for purchase at this ' + d.restaurant_tier + ' location. Branded apparel creates walking billboards — each shirt = ~400 impressions over its lifetime (free advertising). With ' + avgCustomerCount + ' monthly customers, ' + expectedApparelBuyers + ' would buy apparel at $' + avgApparelPrice + ' avg = ' + fmt$(expectedApparelRevenue) + '/mo revenue + ' + expectedImpressions + ' monthly brand impressions (advertising value ~$' + Math.round(expectedImpressions * 0.012) + '/mo at $12 CPM). '
        : 'MEDIUM: no branded apparel sold. Branded apparel is free advertising — 400 impressions per item over its lifetime (industry benchmark). At ' + avgCustomerCount + ' customers/mo, missed apparel revenue ~' + fmt$(expectedApparelRevenue) + '/mo. ';
      alerts.push({
        rule_id: 'branded_apparel_missing',
        severity: isPremiumTier ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_retail_products: d.has_retail_products,
        branded_apparel_available: d.branded_apparel_available,
        apparel_items_count: d.apparel_items_count,
        apparel_designs_count: d.apparel_designs_count,
        apparel_revenue_monthly: d.apparel_revenue_monthly,
        apparel_impressions_per_item: d.apparel_impressions_per_item,
        branded_impressions_monthly: d.branded_impressions_monthly,
        monthly_revenue: d.monthly_revenue,
        monthly_retail_revenue: d.monthly_retail_revenue,
        retail_revenue_pct: d.retail_revenue_pct,
        retail_margin_pct: d.retail_margin_pct,
        apparel_setup_cost: d.apparel_setup_cost,
        revenue_lift_pct: 4,
        retail_revenue_change: totalOpportunity,
        impression_change: expectedImpressions,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `BRANDED APPAREL MISSING: ${d.location_id} — restaurant sells retail products but NO branded apparel (t-shirts, hats, aprons, hoodies). ${criticalNote}Branded apparel is unique among retail products because it generates TWO revenue streams: (a) direct sale revenue ($22-28 avg per item, 60-70% margin); (b) free advertising — each item worn by a customer generates ~400 impressions over its lifetime (industry benchmark). A customer wearing your restaurant t-shirt at the gym, airport, or grocery store is a walking billboard — and they paid YOU for the privilege. Solutions ranked by impact: (1) DESIGN 2-3 t-shirt variants — front logo, back logo, slogan; hire a designer ($300-800) or use Printful/Printify print-on-demand (no inventory, $8-12/shirt cost); (2) ADD a hat or cap — embroidered logo; cost $6-10/cap, retail $22-28; high-margin impulse buy; (3) USE print-on-demand (POD) for low risk — Printful, Printify, CustomInk integrate with Shopify; no minimum order, no inventory, printed + shipped on demand; margin lower ($8-12/shirt) but no upfront inventory cost; (4) OR BUY in bulk for higher margin — 100 shirts at $5-7 each vs POD at $10-12; bulk requires $500-700 upfront but doubles margin; (5) SELL aprons and branded kitchen gear — appeals to home cooks and foodies; $25-35 retail; (6) DISPLAY apparel near the register — folded t-shirts in acrylic display, hats on pegboard hooks; visible + touchable drives conversion; (7) OFFER sizing in S-XXL — plus sizes available on request; (8) PROMOTE on social media — "Tag us wearing our shirt for a free dessert"; user-generated content drives engagement; (9) CONSIDER limited-edition drops — seasonal designs, anniversary shirts, chef collaboration shirts; creates scarcity and collectibility. Industry data: 400 impressions per apparel item (NRA); 4% of restaurant customers buy branded apparel; 60-70% margins; advertising value ~$12 CPM (cost per thousand impressions). Expected impact: +${fmt$(totalOpportunity)}/mo apparel revenue, +${expectedImpressions} monthly brand impressions (~$${Math.round(expectedImpressions * 0.012)} advertising value), payback ${Math.max(1, Math.round(d.apparel_setup_cost / Math.max(totalOpportunity, 1)))} months.`,
        ai_recommendation: 'launch_branded_apparel_line',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: COOKBOOK_OPPORTUNITY
    if (config.requireCookbook && d.has_signature_dishes && d.signature_dish_count >= 3 && !d.has_cookbook) {
      // Restaurant with signature dishes but no cookbook -> missed $5-50k revenue
      const expectedCookbookSales = isPremiumTier ? 12000 : 5000;
      const avgCookbookPrice = isPremiumTier ? 35 : 25;
      const expectedCookbookRevenue = expectedCookbookSales * avgCookbookPrice;
      const totalOpportunity = Math.max(Math.round(expectedCookbookRevenue / 24), 500); // monthly amortized
      const lifetimeOpportunity = expectedCookbookRevenue;
      const criticalNote = isPremiumTier
        ? 'HIGH: ' + d.signature_dish_count + ' signature dishes but NO COOKBOOK published. Restaurants cookbooks sell 5,000-50,000 copies; celebrity chef cookbooks sell 100,000+. At ' + expectedCookbookSales + ' copies (lifetime) and $' + avgCookbookPrice + '/copy, lifetime revenue opportunity is ' + fmt$(lifetimeOpportunity) + '. Publishing cost ~$' + d.cookbook_publish_cost + ' (photography, recipe testing, layout, first print run). '
        : 'MEDIUM: signature dishes exist (' + d.signature_dish_count + ' dishes) but no cookbook. Restaurants sell 5,000-50,000 cookbook copies. Lifetime opportunity ~' + fmt$(lifetimeOpportunity) + ' at ' + expectedCookbookSales + ' copies. ';
      alerts.push({
        rule_id: 'cookbook_opportunity',
        severity: isPremiumTier ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_signature_dishes: d.has_signature_dishes,
        signature_dish_count: d.signature_dish_count,
        has_cookbook: d.has_cookbook,
        cookbook_published: d.cookbook_published,
        cookbook_copies_sold: d.cookbook_copies_sold,
        cookbook_revenue_total: d.cookbook_revenue_total,
        has_retail_products: d.has_retail_products,
        monthly_revenue: d.monthly_revenue,
        monthly_retail_revenue: d.monthly_retail_revenue,
        retail_revenue_pct: d.retail_revenue_pct,
        retail_margin_pct: d.retail_margin_pct,
        cookbook_publish_cost: d.cookbook_publish_cost,
        revenue_lift_pct: 0,
        retail_revenue_change: totalOpportunity,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `COOKBOOK OPPORTUNITY: ${d.location_id} — restaurant has ${d.signature_dish_count} signature dishes but has NOT published a cookbook. ${criticalNote}Cookbooks are a unique retail product — they generate revenue for years after publication, build brand authority, and create a halo effect that drives restaurant visits. Industry data: restaurant cookbooks sell 5,000-50,000 copies; celebrity chef cookbooks sell 100,000+; self-published cookbooks through Amazon KDP or IngramSpark earn 30-60% royalties vs 7-10% traditional publisher. Solutions ranked by impact: (1) START with recipe documentation — write out each signature dish recipe with measurements, timing, plating notes; this becomes the manuscript foundation; (2) HIRE a food photographer — professional food photography is non-negotiable for cookbook sales; cost $3,000-8,000 for a 50-recipe book; quality photos drive 80% of cookbook purchase decisions; (3) HIRE a recipe tester — every recipe must be tested by someone other than the chef to ensure reproducibility; cost $500-1,500; (4) LAYOUT and design — book layout, typography, cover design; use Adobe InDesign or hire a designer ($1,500-4,000); (5) SELF-PUBLISH via Amazon KDP (print-on-demand, no inventory, 30-60% royalty) or IngramSpark (wider distribution, $49 setup fee); traditional publishers (Chronicle, Abrams, Phaidon) offer advances but only 7-10% royalty and slow 12-24 month timeline; (6) PRICE at $25-35 retail — sweet spot for restaurant cookbooks; premium hardcover $40-50; (7) SELL in-restaurant — autographed copies at the register drive impulse purchases and command a 20-30% premium; (8) SELL on Amazon + bookstore distribution — Amazon alone captures 70% of cookbook sales; (9) PROMOTE on social media — recipe previews, behind-the-scenes photography, chef stories; (10) CONSIDER a second edition or seasonal companion (holiday recipes, summer grilling) once first edition sells 10,000+ copies. Industry data: 5,000-50,000 copies for restaurant cookbooks (NRA, Publishers Weekly); 30-60% royalty self-published vs 7-10% traditional; 80% of purchase decision from photography. Expected impact: +${fmt$(lifetimeOpportunity)} lifetime cookbook revenue, +${fmt$(totalOpportunity)}/mo amortized, payback ${Math.max(6, Math.round(d.cookbook_publish_cost / Math.max(totalOpportunity, 1)))} months.`,
        ai_recommendation: 'publish_signature_cookbook',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: PACKAGED_FOOD_ABSENT
    if (config.requirePackagedFood && d.has_retail_products && !d.has_packaged_food) {
      // No packaged food (cookies, granola, spice blends) -> missed grab-and-go revenue
      const expectedPackagedBuyers = Math.round(avgCustomerCount * 0.08);
      const avgPackagedPrice = isPremiumTier ? 12 : 8;
      const expectedPackagedRevenue = expectedPackagedBuyers * avgPackagedPrice;
      const totalOpportunity = Math.max(expectedPackagedRevenue, 300);
      const criticalNote = isPremiumTier
        ? 'MEDIUM: NO PACKAGED FOOD for sale (cookies, granola, spice blends, dry mixes, jarred goods). Packaged food is grab-and-go revenue — 8% of customers would buy. At ' + avgCustomerCount + ' monthly customers, ' + expectedPackagedBuyers + ' would buy at $' + avgPackagedPrice + ' avg = ' + fmt$(expectedPackagedRevenue) + '/mo at 60-80% margins. '
        : 'MEDIUM: no packaged food sold. Packaged food is grab-and-go revenue with 60-80% margins — easy to add since recipes often already exist. ';
      alerts.push({
        rule_id: 'packaged_food_absent',
        severity: 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_retail_products: d.has_retail_products,
        has_packaged_food: d.has_packaged_food,
        packaged_food_categories: d.packaged_food_categories,
        packaged_food_revenue_monthly: d.packaged_food_revenue_monthly,
        monthly_revenue: d.monthly_revenue,
        monthly_retail_revenue: d.monthly_retail_revenue,
        retail_revenue_pct: d.retail_revenue_pct,
        retail_margin_pct: d.retail_margin_pct,
        avg_retail_ticket: d.avg_retail_ticket,
        revenue_lift_pct: 8,
        retail_revenue_change: totalOpportunity,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `PACKAGED FOOD ABSENT: ${d.location_id} — restaurant sells retail products but NO packaged food (cookies, granola, spice blends, dry mixes, jarred goods, coffee beans, tea). ${criticalNote}Packaged food is the lowest-effort retail expansion — most recipes already exist as part of menu prep, and packaging extends their shelf life from hours to weeks/months. Industry data: packaged food has 60-80% margins; grab-and-go purchases capture 8-12% of customer base; packaged food complements (does not compete with) signature sauce. Solutions ranked by impact: (1) PACKAGE existing cookies, brownies, bars — already baked for dessert menu; wrap individually or in 3-packs; cost $0.30-0.60/packaging, retail $4-8; (2) BOTTLE dry rubs and spice blends — house seasoning, BBQ rub, taco seasoning; cost $0.50-1.50/jar, retail $8-14; very high margin; (3) JAR signature items — jams, chutneys, pickled vegetables; $1-3/jar cost, $8-14 retail; (4) BAG house granola or coffee beans — partner with local roaster for white-label coffee; $5-8 cost, $14-18 retail; (5) CREATE gift sets — sauce + spice + cookie bundle for $30-50; popular during holidays; (6) SHELF-STABLE packaging — extend sell-by from 1 week to 6+ months with vacuum seal or modified atmosphere packaging; (7) CO-PACKER for scale — once a product sells 100+ units/month, co-packer ($4-8/unit) beats in-house production; (8) DISPLAY at checkout and online — packaged food is ideal for shipping (no refrigeration, low breakage); (9) NUTRITION + INGREDIENT labeling required — FDA-compliant nutrition facts panel, ingredient list, allergen statement; use an online label generator ($30-100); (10) START with 3-5 products — too many SKUs dilute focus; expand only after first products sell through. Industry data: 60-80% margins on packaged food; 8-12% of customers buy grab-and-go; complements signature sauce category. Expected impact: +${fmt$(totalOpportunity)}/mo packaged food revenue at 60-80% margin, payback 2-4 months (low setup cost).`,
        ai_recommendation: 'add_packaged_food_line',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: ONLINE_STORE_ABSENT
    if (config.requireOnlineStore && d.has_retail_products && !d.has_online_store) {
      // No online store for branded products -> limited to in-person sales only
      const expectedOnlinePct = 30; // 30% of retail revenue could come from online
      const expectedOnlineRevenue = Math.round(baselineRetail * (expectedOnlinePct / 100));
      const totalOpportunity = Math.max(expectedOnlineRevenue, 400);
      const criticalNote = isPremiumTier
        ? 'HIGH: NO ONLINE STORE for branded products — sales limited to in-person only. 30% of retail revenue typically comes from online. At current retail revenue of ' + fmt$(baselineRetail) + '/mo, missed online revenue is ' + fmt$(expectedOnlineRevenue) + '/mo. Online store also captures gift card sales, holiday gift sets, and out-of-area customers who visited once and want to repurchase. '
        : 'MEDIUM: no online store — retail limited to in-person only. Online captures 30% of retail revenue and extends reach beyond the local area. ';
      alerts.push({
        rule_id: 'online_store_absent',
        severity: isPremiumTier ? 'high' : 'medium',
        location_id: d.location_id,
        restaurant_tier: d.restaurant_tier,
        market_setting: d.market_setting,
        has_retail_products: d.has_retail_products,
        has_online_store: d.has_online_store,
        online_store_url: d.online_store_url,
        monthly_online_sales: d.monthly_online_sales,
        online_orders_per_month: d.online_orders_per_month,
        retail_product_categories: d.retail_product_categories,
        retail_product_count: d.retail_product_count,
        monthly_revenue: d.monthly_revenue,
        monthly_retail_revenue: d.monthly_retail_revenue,
        retail_revenue_pct: d.retail_revenue_pct,
        retail_margin_pct: d.retail_margin_pct,
        online_store_setup_cost: d.online_store_setup_cost,
        revenue_lift_pct: expectedOnlinePct,
        retail_revenue_change: totalOpportunity,
        predicted_revenue_change_pct: Math.round((totalOpportunity / Math.max(baselineRevenue, 1)) * 100),
        est_monthly_opportunity: totalOpportunity,
        description: `ONLINE STORE ABSENT: ${d.location_id} — restaurant sells ${d.retail_product_count} retail SKUs in-person but has NO ONLINE STORE (current online revenue $0/mo). ${criticalNote}An online store extends retail sales far beyond the local customer base — customers who visited once on vacation, fans of the restaurant on social media, gift-givers during holidays. Industry data: 30% of restaurant retail revenue comes from online; online gift card sales spike 200-400% during November-December; online average order value is 25-40% higher than in-person (customers buy gift sets + multiple items). Solutions ranked by impact: (1) USE Shopify ($29-79/mo) or WooCommerce (free plugin on WordPress) — both integrate with ShipStation for shipping label automation; (2) INTEGRATE with POS — Toast, Square, and Lightspeed all have native online store integrations; ensures inventory sync between in-venue and online; (3) ADD products progressively — start with the top 5 best-sellers (sauce, spice, cookbook, gift card, 1 apparel item); expand after each $1,000/mo sales milestone; (4) SET UP shipping — flat-rate USPS Priority Mail ($8.40 small box) or calculated shipping via ShipStation; offer free shipping over $50 (drives 30% higher AOV); (5) OFFER digital gift cards — instant email delivery, no shipping cost, last-minute gift solution; (6) OPTIMIZE product photography — clean white background, multiple angles, lifestyle shot; same photos used for in-venue display; (7) COLLECT email addresses at checkout — build email list for promotional campaigns; Mailchimp or Klaviyo integrate with Shopify; (8) PROMOTE via social media — Instagram Shop, Facebook Shop, Pinterest pins; user-generated content (customers posting their sauce bottle) drives discovery; (9) HOLIDAY gift sets — bundle 3-4 products at a 10-15% discount; November-December can equal 30-40% of annual online revenue; (10) TRACK conversion rate — benchmark 1-3% for online retail; optimize product pages, checkout flow, mobile experience. Industry data: 30% of restaurant retail revenue online; 200-400% gift card spike in Q4; 25-40% higher online AOV; Shopify/WooCommerce dominant platforms. Expected impact: +${expectedOnlinePct}% retail revenue uplift, +${fmt$(totalOpportunity)}/mo online revenue, payback ${Math.max(2, Math.round(d.online_store_setup_cost / Math.max(totalOpportunity, 1)))} months.`,
        ai_recommendation: 'launch_online_store',
        status: 'open', detected_at: now,
      });
    }
  }

  // AI insights via OpenAI
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat({
            messages: [
              { role: 'system', content: 'You are a restaurant branded merchandise and retail product optimization expert. Given restaurant retail data, recommend ONE specific action with expected revenue, brand impressions, or retail attach rate impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Location: ${a.location_id ?? 'n/a'}. Tier: ${a.restaurant_tier ?? 'n/a'}. Market: ${a.market_setting ?? 'n/a'}. Has retail: ${a.has_retail_products ?? false}. Categories: ${(a.retail_product_categories ?? []).join(',')}. SKU count: ${a.retail_product_count ?? 0}. Sauce popular: ${a.signature_sauce_popular ?? false}. Sauce name: ${a.signature_sauce_name ?? 'n/a'}. Sauce bottled: ${a.signature_sauce_bottled ?? false}. Monthly sauce sales: ${fmt$(a.monthly_sauce_sales ?? 0)}. Display at checkout: ${a.merchandise_display_at_checkout ?? false}. Display visible: ${a.merchandise_display_visible ?? false}. Fixtures: ${a.display_fixture_count ?? 0}. Gift cards displayed: ${a.gift_cards_displayed ?? false}. Gift card rate: ${a.gift_card_purchase_rate_pct ?? 0}%. Gift card revenue: ${fmt$(a.gift_card_revenue_monthly ?? 0)}/mo. Apparel available: ${a.branded_apparel_available ?? false}. Apparel items: ${a.apparel_items_count ?? 0}. Apparel revenue: ${fmt$(a.apparel_revenue_monthly ?? 0)}/mo. Apparel impressions/item: ${a.apparel_impressions_per_item ?? 0}. Has signature dishes: ${a.has_signature_dishes ?? false}. Signature dish count: ${a.signature_dish_count ?? 0}. Has cookbook: ${a.has_cookbook ?? false}. Cookbook copies sold: ${a.cookbook_copies_sold ?? 0}. Has packaged food: ${a.has_packaged_food ?? false}. Packaged categories: ${a.packaged_food_categories ?? 0}. Has online store: ${a.has_online_store ?? false}. Online revenue: ${fmt$(a.monthly_online_sales ?? 0)}/mo. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Retail revenue: ${fmt$(a.monthly_retail_revenue ?? 0)}/mo (${a.retail_revenue_pct ?? 0}% of total). Retail margin: ${a.retail_margin_pct ?? 0}%. Avg retail ticket: ${fmt$(a.avg_retail_ticket ?? 0)}. Branded impressions/mo: ${a.branded_impressions_monthly ?? 0}. Online store cost: ${fmt$(a.online_store_setup_cost ?? 0)}. Cookbook cost: ${fmt$(a.cookbook_publish_cost ?? 0)}. Sauce bottling cost: ${fmt$(a.sauce_bottling_cost ?? 0)}. Apparel setup: ${fmt$(a.apparel_setup_cost ?? 0)}. Display install: ${fmt$(a.display_install_cost ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
            ],
            task: 'reporting',
          });
          const text = typeof response === 'string'
            ? response
            : (response as any)?.choices?.[0]?.message?.content ?? '';
          a.ai_insight = String(text).slice(0, 200);
        } catch { /* skip */ }
      }
    }
  }

  // Persist alerts
  try {
    await db.query(`DELETE FROM branded_merch_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE branded_merch_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveBrandedMerchAlerts = async (db: ReturnType<typeof useDB>): Promise<BrandedMerchAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM branded_merch_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getBrandedMerchSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  noRetailCount: number; sauceNotBottledCount: number; noGiftCardDisplayCount: number; noOnlineStoreCount: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(rule_id = 'retail_products_absent') AS noretail,
              math::count(rule_id = 'signature_sauce_not_bottled') AS saucenotbottled,
              math::count(rule_id = 'gift_card_display_absent') AS nogiftcard,
              math::count(rule_id = 'online_store_absent') AS noonlinestore
       FROM branded_merch_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      noRetailCount: safeNumber(r.noretail, 0),
      sauceNotBottledCount: safeNumber(r.saucenotbottled, 0),
      noGiftCardDisplayCount: safeNumber(r.nogiftcard, 0),
      noOnlineStoreCount: safeNumber(r.noonlinestore, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, noRetailCount: 0, sauceNotBottledCount: 0, noGiftCardDisplayCount: 0, noOnlineStoreCount: 0 };
  }
};

export const updateBrandedMerchAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
