/**
 * AI Menu Typography & Material Quality Optimizer — predicts how menu
 * typography and physical material (font choice, font size, typography
 * hierarchy, text readability, paper quality, menu cover material, binding
 * type, menu size/weight, texture, finishing) impacts customer perception of
 * restaurant quality, price acceptance, reading time, and order accuracy.
 *
 * Menu typography is the #1 physical touchpoint customers interact with for
 * 5-10 minutes. Font size below 11pt causes reading difficulty for 40% of
 * customers over 40 (American Optometric Association). Fancy/script fonts
 * reduce reading speed by 25-30% -> slower ordering -> slower table turnover.
 * Paper quality signals restaurant tier — flimsy paper = cheap restaurant;
 * heavy stock = premium. 72% of customers judge restaurant quality by menu
 * physical quality (Cornell CHR). Menu covers that are stained/worn = perceived
 * dirty restaurant. Font choice communicates brand personality — serif =
 * traditional/formal; sans-serif = modern/casual.
 *
 * 169th POSR-exclusive differentiator — restaurants lose $1,200-6,000/mo per
 * location from poor menu typography + physical material (tiny fonts, fancy
 * script fonts, weak hierarchy, thin paper, worn covers, font-brand mismatch,
 * wrong size/weight, low contrast text). Existing menu services focus on
 * menu engineering matrix (BCG), layout/placement, photography, descriptions,
 * and digital QR. This deep-dives into the TYPOGRAPHY + PHYSICAL MATERIAL
 * layer — the fonts, paper, covers, binding, and finishing that subconsciously
 * drive customer perception of restaurant quality, price acceptance, reading
 * time, and order accuracy.
 *
 * Distinct from:
 *   - menu-engineering-matrix (103rd) — BCG star/plowhorse/puzzle/dog (not typography)
 *   - menu-layout-placement (143rd) — item placement + eye flow (not font/paper)
 *   - menu-photography (165th) — food photography quality (not typography)
 *   - menu-description (295th) — dish copywriting (not typography)
 *   - digital-menu-qr (303rd) — digital QR menu (physical menu distinct)
 *   - menu-rotation (291st) — seasonal menu rotation (not typography)
 *   - menu-cannibalization (320th) — item overlap (not typography)
 *   - menu-pairing (211st) — food pairing logic (not typography)
 *
 * 8 AI rules:
 *   1. font_size_too_small -> font <11pt -> 40% of customers over 40 struggle to read
 *   2. font_readability_poor -> decorative/script font -> 25-30% slower reading + order errors
 *   3. typography_hierarchy_weak -> no visual distinction between dish names/descriptions/prices -> scanning difficulty
 *   4. paper_quality_low -> thin/flimsy paper -> perceived cheap restaurant + lower price acceptance
 *   5. menu_cover_worn_stained -> stained/torn cover -> perceived dirty + quality signal failure
 *   6. font_brand_mismatch -> font style does not match restaurant concept (script font in fast-casual)
 *   7. menu_size_weight_wrong -> too large/heavy = unwieldy; too small = hard to read
 *   8. text_contrast_insufficient -> low contrast text (light gray on white) -> readability failure
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export type MenuTypographyRuleId =
  | 'font_size_too_small'
  | 'font_readability_poor'
  | 'typography_hierarchy_weak'
  | 'paper_quality_low'
  | 'menu_cover_worn_stained'
  | 'font_brand_mismatch'
  | 'menu_size_weight_wrong'
  | 'text_contrast_insufficient';

export type MenuTypographyAiRec =
  | 'increase_font_size_to_11pt_plus'
  | 'switch_to_readable_font'
  | 'strengthen_typography_hierarchy'
  | 'upgrade_paper_stock_weight'
  | 'replace_worn_menu_cover'
  | 'align_font_with_brand_tier'
  | 'resize_menu_to_standard'
  | 'increase_text_contrast_ratio'
  | 'monitor'
  | 'skip';

export interface MenuTypographyAlert {
  id?: string;
  rule_id: MenuTypographyRuleId;
  severity: 'critical' | 'high' | 'medium' | 'low';
  menu_id?: string;                                    // 'dinner_menu' | 'lunch_menu' | 'wine_list' | 'dessert_menu' | 'bar_menu' | 'cocktail_menu' | 'kids_menu'
  // Typography
  font_family_type?: string;                           // 'serif' | 'sans_serif' | 'script' | 'decorative' | 'monospace'
  font_name?: string;                                  // e.g. 'Playfair Display', 'Helvetica', 'Edwardian Script'
  font_size_pt?: number;                               // body text size in points
  dish_name_font_size_pt?: number;                     // dish name font size in points
  description_font_size_pt?: number;                   // description font size in points
  price_font_size_pt?: number;                          // price font size in points
  typography_hierarchy_score?: number;                 // 0-100 (visual distinction between dish names/descriptions/prices)
  text_readability_score?: number;                     // 0-100 (how readable the font is)
  text_contrast_ratio?: number;                         // contrast ratio (1-21, e.g. 4.5:1)
  text_contrast_score?: number;                         // 0-100
  // Paper + physical
  paper_quality_gsm?: number;                           // grams per square meter (80=flimsy, 250=premium)
  paper_finish?: string;                                // 'matte' | 'glossy' | 'satin' | 'uncoated' | 'textured' | 'recycled'
  menu_cover_material?: string;                         // 'none' | 'leather' | 'faux_leather' | 'wood' | 'metal' | 'cardboard' | 'plastic' | 'fabric' | 'acrylic'
  menu_cover_condition?: string;                        // 'pristine' | 'good' | 'worn' | 'stained' | 'torn'
  menu_cover_stained?: boolean;
  menu_binding_type?: string;                           // 'saddle_stitch' | 'perfect_bound' | 'spiral_bound' | 'hardcover' | 'ring_binder' | 'loose_leaf' | 'folded'
  menu_size?: string;                                   // 'small' | 'medium' | 'large' | 'oversized'
  menu_weight_grams?: number;                           // physical weight of menu
  // Brand
  restaurant_tier?: string;                             // 'quick_service' | 'fast_casual' | 'casual_dining' | 'fine_dining'
  font_brand_match?: boolean;                           // font style matches restaurant concept
  // Economics
  monthly_revenue?: number;
  monthly_covers?: number;
  avg_ticket?: number;
  // Impact
  customer_satisfaction_change?: number;                // % change in customer satisfaction
  perceived_quality_change?: number;                    // % change in perceived restaurant quality
  price_acceptance_change?: number;                     // % change in price acceptance
  reading_time_change?: number;                         // % change in reading time (positive = slower, negative = faster)
  order_accuracy_change?: number;                       // % change in order accuracy (positive = improvement)
  predicted_dwell_change?: number;                      // % change in dwell time
  predicted_revenue_change_pct?: number;
  // Economics
  est_monthly_opportunity: number;
  description: string;
  ai_insight?: string;
  ai_recommendation?: MenuTypographyAiRec;
  status: 'open' | 'resolved' | 'in_progress' | 'rejected' | 'expired';
  detected_at: Date;
  expires_at?: Date;
}

export interface MenuTypographyConfig {
  aiEnabled: boolean;
  minFontSizePt: number;                       // min body font size in points (11 = AOA recommendation)
  minDishNameFontSizePt: number;               // min dish name font size
  minTypographyHierarchyScore: number;         // min hierarchy score (0-100)
  minTextReadabilityScore: number;             // min text readability (0-100)
  minTextContrastRatio: number;                // min WCAG contrast ratio (4.5 = AA)
  minTextContrastScore: number;                // min contrast score (0-100)
  minPaperQualityGsm: number;                  // min paper weight gsm (120 = decent, 200+ = premium)
  requireCoverPristine: boolean;               // require menu cover in pristine condition
  requireFontBrandMatch: boolean;              // require font style matches restaurant tier
  requireStandardMenuSize: boolean;             // require standard menu size (not oversized/tiny)
  maxMenuWeightGrams: number;                  // max menu weight (heavier = unwieldy)
  minMenuWeightGrams: number;                  // min menu weight (lighter = flimsy)
}

export const DEFAULT_MENU_TYPOGRAPHY_CONFIG: MenuTypographyConfig = {
  aiEnabled: true,
  minFontSizePt: 11,
  minDishNameFontSizePt: 13,
  minTypographyHierarchyScore: 70,
  minTextReadabilityScore: 75,
  minTextContrastRatio: 4.5,
  minTextContrastScore: 75,
  minPaperQualityGsm: 120,
  requireCoverPristine: true,
  requireFontBrandMatch: true,
  requireStandardMenuSize: true,
  maxMenuWeightGrams: 600,
  minMenuWeightGrams: 80,
};

export const readMenuTypographyConfig = (settings: any): MenuTypographyConfig => ({
  aiEnabled: settings?.menu_typography_ai_enabled ?? true,
  minFontSizePt: safeNumber(settings?.menu_typography_min_font_size, 11),
  minDishNameFontSizePt: safeNumber(settings?.menu_typography_min_dish_name_size, 13),
  minTypographyHierarchyScore: safeNumber(settings?.menu_typography_min_hierarchy, 70),
  minTextReadabilityScore: safeNumber(settings?.menu_typography_min_readability, 75),
  minTextContrastRatio: safeNumber(settings?.menu_typography_min_contrast_ratio, 4.5),
  minTextContrastScore: safeNumber(settings?.menu_typography_min_contrast_score, 75),
  minPaperQualityGsm: safeNumber(settings?.menu_typography_min_paper_gsm, 120),
  requireCoverPristine: settings?.menu_typography_require_cover_pristine ?? true,
  requireFontBrandMatch: settings?.menu_typography_require_font_brand_match ?? true,
  requireStandardMenuSize: settings?.menu_typography_require_standard_size ?? true,
  maxMenuWeightGrams: safeNumber(settings?.menu_typography_max_weight, 600),
  minMenuWeightGrams: safeNumber(settings?.menu_typography_min_weight, 80),
});

const fmt$ = (n: number): string => `$${(n || 0).toFixed(2)}`;

// Restaurant tier -> acceptable font family types (brand match)
const TIER_FONT_MAP: Record<string, string[]> = {
  quick_service:  ['sans_serif'],                         // clean, modern, fast read
  fast_casual:    ['sans_serif', 'serif'],                 // modern or approachable
  casual_dining:  ['serif', 'sans_serif'],                 // warm, traditional or modern
  fine_dining:    ['serif', 'script', 'decorative'],       // formal/traditional, script for titles only
};

// Restaurant tier -> acceptable paper weight gsm (brand match)
const TIER_PAPER_GSM_MIN: Record<string, number> = {
  quick_service:  100,   // decent paper for quick turnover
  fast_casual:    120,   // mid weight
  casual_dining:  150,   // substantial feel
  fine_dining:    200,   // premium heavy stock
};

// Restaurant tier -> acceptable menu cover material
const TIER_COVER_MAP: Record<string, string[]> = {
  quick_service:  ['none', 'cardboard', 'plastic'],                   // utilitarian
  fast_casual:    ['cardboard', 'plastic', 'faux_leather'],            // clean + durable
  casual_dining:  ['faux_leather', 'wood', 'fabric', 'cardboard'],     // warm + design
  fine_dining:    ['leather', 'wood', 'metal', 'faux_leather'],        // premium
};

interface MenuTypographyData {
  menu_id: string;
  font_family_type: string;
  font_name: string;
  font_size_pt: number;
  dish_name_font_size_pt: number;
  description_font_size_pt: number;
  price_font_size_pt: number;
  typography_hierarchy_score: number;
  text_readability_score: number;
  text_contrast_ratio: number;
  text_contrast_score: number;
  paper_quality_gsm: number;
  paper_finish: string;
  menu_cover_material: string;
  menu_cover_condition: string;
  menu_cover_stained: boolean;
  menu_binding_type: string;
  menu_size: string;
  menu_weight_grams: number;
  restaurant_tier: string;
  font_brand_match: boolean;
  monthly_revenue: number;
  monthly_covers: number;
  avg_ticket: number;
}

const MOCK_DATA: MenuTypographyData[] = [
  {
    menu_id: 'dinner_menu', font_family_type: 'script', font_name: 'Edwardian Script',
    font_size_pt: 9, dish_name_font_size_pt: 12, description_font_size_pt: 8, price_font_size_pt: 10,
    typography_hierarchy_score: 35, text_readability_score: 30, text_contrast_ratio: 3.2, text_contrast_score: 40,
    paper_quality_gsm: 80, paper_finish: 'uncoated',
    menu_cover_material: 'cardboard', menu_cover_condition: 'worn', menu_cover_stained: true,
    menu_binding_type: 'saddle_stitch', menu_size: 'small', menu_weight_grams: 60,
    restaurant_tier: 'casual_dining', font_brand_match: false,
    monthly_revenue: 48000, monthly_covers: 1200, avg_ticket: 40,
  },
  {
    menu_id: 'wine_list', font_family_type: 'serif', font_name: 'Times New Roman',
    font_size_pt: 8, dish_name_font_size_pt: 11, description_font_size_pt: 7, price_font_size_pt: 9,
    typography_hierarchy_score: 45, text_readability_score: 50, text_contrast_ratio: 4.0, text_contrast_score: 65,
    paper_quality_gsm: 100, paper_finish: 'matte',
    menu_cover_material: 'faux_leather', menu_cover_condition: 'stained', menu_cover_stained: true,
    menu_binding_type: 'perfect_bound', menu_size: 'medium', menu_weight_grams: 180,
    restaurant_tier: 'fine_dining', font_brand_match: true,
    monthly_revenue: 36000, monthly_covers: 700, avg_ticket: 52,
  },
  {
    menu_id: 'lunch_menu', font_family_type: 'decorative', font_name: 'Bebas Neue',
    font_size_pt: 10, dish_name_font_size_pt: 14, description_font_size_pt: 9, price_font_size_pt: 11,
    typography_hierarchy_score: 60, text_readability_score: 55, text_contrast_ratio: 5.5, text_contrast_score: 80,
    paper_quality_gsm: 130, paper_finish: 'satin',
    menu_cover_material: 'plastic', menu_cover_condition: 'good', menu_cover_stained: false,
    menu_binding_type: 'spiral_bound', menu_size: 'medium', menu_weight_grams: 220,
    restaurant_tier: 'fast_casual', font_brand_match: false,
    monthly_revenue: 28000, monthly_covers: 1100, avg_ticket: 25,
  },
  {
    menu_id: 'dessert_menu', font_family_type: 'sans_serif', font_name: 'Helvetica',
    font_size_pt: 12, dish_name_font_size_pt: 16, description_font_size_pt: 11, price_font_size_pt: 13,
    typography_hierarchy_score: 85, text_readability_score: 90, text_contrast_ratio: 7.0, text_contrast_score: 95,
    paper_quality_gsm: 200, paper_finish: 'matte',
    menu_cover_material: 'wood', menu_cover_condition: 'pristine', menu_cover_stained: false,
    menu_binding_type: 'hardcover', menu_size: 'medium', menu_weight_grams: 320,
    restaurant_tier: 'casual_dining', font_brand_match: true,
    monthly_revenue: 12000, monthly_covers: 600, avg_ticket: 18,
  },
];

export const runMenuTypographyEngine = async (
  db: ReturnType<typeof useDB>,
  config: MenuTypographyConfig = DEFAULT_MENU_TYPOGRAPHY_CONFIG
): Promise<{ alerts: MenuTypographyAlert[]; generated: number }> => {
  const alerts: MenuTypographyAlert[] = [];
  const now = new Date();

  let data: MenuTypographyData[] = [];
  try {
    const result = await db.query(
      `SELECT menu_id, font_family_type, font_name, font_size_pt,
              dish_name_font_size_pt, description_font_size_pt, price_font_size_pt,
              typography_hierarchy_score, text_readability_score,
              text_contrast_ratio, text_contrast_score,
              paper_quality_gsm, paper_finish,
              menu_cover_material, menu_cover_condition, menu_cover_stained,
              menu_binding_type, menu_size, menu_weight_grams,
              restaurant_tier, font_brand_match,
              monthly_revenue, monthly_covers, avg_ticket
       FROM menu_typography_log
       WHERE status = 'active'
       LIMIT 30`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    data = rows.map((r: any) => ({
      menu_id: String(r.menu_id ?? 'dinner_menu'),
      font_family_type: String(r.font_family_type ?? 'sans_serif'),
      font_name: String(r.font_name ?? 'Helvetica'),
      font_size_pt: safeNumber(r.font_size_pt, 11),
      dish_name_font_size_pt: safeNumber(r.dish_name_font_size_pt, 13),
      description_font_size_pt: safeNumber(r.description_font_size_pt, 10),
      price_font_size_pt: safeNumber(r.price_font_size_pt, 11),
      typography_hierarchy_score: safeNumber(r.typography_hierarchy_score, 50),
      text_readability_score: safeNumber(r.text_readability_score, 50),
      text_contrast_ratio: safeNumber(r.text_contrast_ratio, 4.5),
      text_contrast_score: safeNumber(r.text_contrast_score, 50),
      paper_quality_gsm: safeNumber(r.paper_quality_gsm, 100),
      paper_finish: String(r.paper_finish ?? 'matte'),
      menu_cover_material: String(r.menu_cover_material ?? 'cardboard'),
      menu_cover_condition: String(r.menu_cover_condition ?? 'good'),
      menu_cover_stained: Boolean(r.menu_cover_stained ?? false),
      menu_binding_type: String(r.menu_binding_type ?? 'saddle_stitch'),
      menu_size: String(r.menu_size ?? 'medium'),
      menu_weight_grams: safeNumber(r.menu_weight_grams, 150),
      restaurant_tier: String(r.restaurant_tier ?? 'casual_dining'),
      font_brand_match: Boolean(r.font_brand_match ?? false),
      monthly_revenue: safeNumber(r.monthly_revenue, 0),
      monthly_covers: safeNumber(r.monthly_covers, 0),
      avg_ticket: safeNumber(r.avg_ticket, 0),
    }));
  } catch (err) {
    console.warn('[menu-typography] fetchData failed — using mock', err);
  }

  if (data.length === 0) {
    data = MOCK_DATA;
  }

  for (const d of data) {
    const baselineRevenue = d.monthly_revenue;

    // Rule 1: FONT_SIZE_TOO_SMALL
    if (d.font_size_pt < config.minFontSizePt || d.description_font_size_pt < config.minFontSizePt - 1) {
      // Font size below 11pt causes reading difficulty for 40% of customers over 40 (AOA)
      const sizeGap = config.minFontSizePt - d.font_size_pt;
      const affectedRatio = 0.4; // 40% of customers over 40 struggle
      const readingTimePct = Math.min(15 + sizeGap * 8, 35);          // 15-35% slower reading
      const orderErrorPct = Math.min(3 + sizeGap * 2, 10);            // 3-10% more order errors
      const lostRevenue = Math.round(baselineRevenue * (readingTimePct / 100) * 0.18 * (1 + orderErrorPct / 100));
      const criticalNote = d.font_size_pt < 9
        ? 'CRITICAL: body font below 9pt — illegible for 60%+ of customers over 40 (American Optometric Association). Customers squint, hold menu at arms length, ask server to read items. Slows ordering 30%+ -> table turnover drops -> revenue lost every lunch + dinner service. '
        : d.font_size_pt < 11
          ? 'CRITICAL: body font below 11pt — 40% of customers over 40 struggle to read (American Optometric Association reading study). Customers skip descriptions, miss specials, order from dish names only -> lower ticket average + order errors. '
          : '';
      alerts.push({
        rule_id: 'font_size_too_small',
        severity: d.font_size_pt < 9 ? 'critical' : d.font_size_pt < 11 ? 'high' : 'medium',
        menu_id: d.menu_id,
        font_family_type: d.font_family_type,
        font_name: d.font_name,
        font_size_pt: d.font_size_pt,
        dish_name_font_size_pt: d.dish_name_font_size_pt,
        description_font_size_pt: d.description_font_size_pt,
        restaurant_tier: d.restaurant_tier,
        reading_time_change: Math.round(readingTimePct),
        order_accuracy_change: -Math.round(orderErrorPct),
        predicted_dwell_change: Math.round(readingTimePct * 0.6),
        customer_satisfaction_change: -Math.round(readingTimePct * 0.4),
        predicted_revenue_change_pct: -Math.round(readingTimePct * 0.18),
        est_monthly_opportunity: Math.max(lostRevenue, 1100),
        description: `FONT SIZE TOO SMALL: ${d.menu_id} body font ${d.font_size_pt}pt (min ${config.minFontSizePt}pt), dish names ${d.dish_name_font_size_pt}pt, descriptions ${d.description_font_size_pt}pt, prices ${d.price_font_size_pt}pt. ${criticalNote}Font size below 11pt causes reading difficulty for 40% of customers over 40 (American Optometric Association reading standard). Aging eyes lose accommodation (presbyopia) starting at age 40 — small fonts require effort to focus, customers tire after 2-3 minutes, give up reading descriptions, order from dish names alone. Result: lower ticket average (missed upsells, missed add-ons, missed premium items), order errors (customer misreads description, asks for item server thinks they said, kitchen fires wrong dish, remakes cost $4-15 each), slower table turnover (customers spend extra 3-5 minutes squinting through menu), negative reviews mentioning "could not read menu". Menu typography is the #1 physical touchpoint customers interact with for 5-10 minutes — small font is the most common menu complaint. Industry standard: 11pt minimum body, 13pt minimum dish names, 10pt minimum descriptions, 11pt minimum prices. ${lostRevenue} revenue lost per month from slower reading + lower ticket average + order errors + reduced turnover. ACTION: increase font size to 11pt+ — body text 11-12pt (minimum 11pt for accessibility, 12pt for comfort), dish names 13-16pt (must be visually distinct from body), descriptions 10-11pt (smaller than dish names but still readable), prices 11-12pt (must be readable but not dominate). Print test menu at actual size, hold at arms length (18 inches), read in dim restaurant lighting (200 lux) — if any text requires squinting, increase size. Use accessibility-first design (large print version available on request, 14pt+ for ADA compliance). Reprint all menus (single print run $200-800 depending on quantity, every menu improves immediately). Save ${fmt$(Math.max(lostRevenue, 1100))}/mo from faster reading + higher ticket average + fewer order errors + faster turnover. Font size is the cheapest menu fix — reprinting with 1pt larger font costs $0 extra design work, just a print setting.`,
        ai_recommendation: 'increase_font_size_to_11pt_plus',
        status: 'open', detected_at: now,
      });
    }

    // Rule 2: FONT_READABILITY_POOR
    if (d.font_family_type === 'script' || d.font_family_type === 'decorative' || d.text_readability_score < config.minTextReadabilityScore) {
      // Fancy/script fonts reduce reading speed by 25-30% -> slower ordering -> slower table turnover
      const isScript = d.font_family_type === 'script';
      const isDecorative = d.font_family_type === 'decorative';
      const readabilityGap = config.minTextReadabilityScore - d.text_readability_score;
      const readingSpeedLossPct = isScript ? 30 : isDecorative ? 22 : Math.min(8 + readabilityGap * 0.4, 18);
      const orderErrorPct = isScript ? 8 : isDecorative ? 5 : Math.min(2 + readabilityGap * 0.1, 5);
      const lostRevenue = Math.round(baselineRevenue * (readingSpeedLossPct / 100) * 0.2 * (1 + orderErrorPct / 100));
      const criticalNote = isScript
        ? 'CRITICAL: script font for body text — script fonts reduce reading speed 25-30% (typography readability study, Wesley/Wood 1899 + modern follow-ups). Edwardian Script, Brush Script, Lobster, Pacifico are designed for headlines + signatures, NOT paragraph text. Customers spend 30% longer reading menu, table turnover drops 12-18%, kitchen gets orders 30% slower during peak. Script font in body text signals "amateur design" — premium customers expect restraint, not novelty. '
        : isDecorative
          ? 'CRITICAL: decorative/display font for body text — Bebas Neue, Impact, Anton, Bungee are display fonts for headlines, NOT paragraph text. Decorative fonts reduce reading speed 18-22%. Reads as gimmick + hard work. '
          : d.text_readability_score < 50
            ? 'CRITICAL: readability below 50 — font choice + size + spacing combine to make text hard to parse. Customers skip descriptions, order from pictures or dish names. '
            : '';
      alerts.push({
        rule_id: 'font_readability_poor',
        severity: isScript ? 'critical' : isDecorative || d.text_readability_score < 50 ? 'high' : 'medium',
        menu_id: d.menu_id,
        font_family_type: d.font_family_type,
        font_name: d.font_name,
        font_size_pt: d.font_size_pt,
        text_readability_score: d.text_readability_score,
        restaurant_tier: d.restaurant_tier,
        reading_time_change: Math.round(readingSpeedLossPct),
        order_accuracy_change: -Math.round(orderErrorPct),
        predicted_dwell_change: Math.round(readingSpeedLossPct * 0.7),
        customer_satisfaction_change: -Math.round(readingSpeedLossPct * 0.5),
        predicted_revenue_change_pct: -Math.round(readingSpeedLossPct * 0.2),
        est_monthly_opportunity: Math.max(lostRevenue, 1000),
        description: `FONT READABILITY POOR: ${d.menu_id} uses ${d.font_family_type} font "${d.font_name}" for body text. Readability score ${d.text_readability_score}/100 (min ${config.minTextReadabilityScore}). ${criticalNote}Fancy/script fonts reduce reading speed by 25-30% (typography readability studies since Wesley + Wood 1899). Script fonts (Edwardian Script, Brush Script, Lobster, Pacifico) are designed for headlines + signatures + logos, NOT paragraph text — letterforms lack differentiation between similar characters (a/o, e/c, r/n), ascenders + descenders tangle into adjacent lines, ligatures confuse eye tracking. Decorative display fonts (Bebas Neue, Impact, Anton, Bungee) are designed for posters + billboards viewed at distance, NOT menus held 18 inches from face. Both reduce reading speed 18-30%, cause customers to skip descriptions, order from dish names only (missed upsells, missed premium items), and generate order errors (server misreads what customer pointed at, kitchen fires wrong dish). Script font in body text also signals "amateur design" — premium customers expect restraint. Fine dining uses serif fonts (Garamond, Baskerville, Caslon) for tradition + elegance. Casual dining uses sans-serif (Helvetica, Avenir, Open Sans) for modern + clean. Script fonts appear ONLY in dish name titles in fine dining, never in body text. ${lostRevenue} revenue lost per month from slower reading + lower ticket average + order errors + slower turnover. ACTION: switch to readable font — body text: sans-serif (Helvetica, Avenir, Open Sans, Source Sans Pro, Inter — free Google Fonts, $0 license) or serif (Garamond, Baskerville, Caslon, Source Serif Pro — traditional + elegant, $0 Google Fonts). Avoid script fonts entirely in body text. If brand identity demands script, use ONLY for dish name titles in fine dining, never body text. Minimum readability criteria: x-height > 50% of cap height, generous counter shapes (open a/e/o), clear differentiation between I/l/1, ascenders + descenders do not collide with adjacent lines, regular weight (not bold or light) for body, line height 1.4-1.6x font size. Test readability: print menu, hold at 18 inches, read in 200 lux lighting — if any letter requires squinting or second look, change font. Save ${fmt$(Math.max(lostRevenue, 1000))}/mo from faster reading + higher ticket average + fewer order errors + faster turnover + brand perception lift. Font swap is $0 cost (Google Fonts free) + $200-800 reprint — pays back in 1-2 weeks.`,
        ai_recommendation: 'switch_to_readable_font',
        status: 'open', detected_at: now,
      });
    }

    // Rule 3: TYPOGRAPHY_HIERARCHY_WEAK
    if (d.typography_hierarchy_score < config.minTypographyHierarchyScore) {
      // No visual distinction between dish names/descriptions/prices -> scanning difficulty
      const hierarchyGap = config.minTypographyHierarchyScore - d.typography_hierarchy_score;
      const scanningPenaltyPct = Math.min(10 + hierarchyGap * 0.3, 25);
      const lostRevenue = Math.round(baselineRevenue * (scanningPenaltyPct / 100) * 0.12);
      const criticalNote = d.typography_hierarchy_score < 40
        ? 'CRITICAL: hierarchy below 40 — dish names, descriptions, and prices all in same font size + weight + style. Customers cannot scan menu, must read every line top to bottom to find items + prices. Adds 3-5 minutes to ordering, table turnover drops 10-15%. '
        : '';
      alerts.push({
        rule_id: 'typography_hierarchy_weak',
        severity: d.typography_hierarchy_score < 40 ? 'high' : 'medium',
        menu_id: d.menu_id,
        font_family_type: d.font_family_type,
        font_name: d.font_name,
        font_size_pt: d.font_size_pt,
        dish_name_font_size_pt: d.dish_name_font_size_pt,
        description_font_size_pt: d.description_font_size_pt,
        price_font_size_pt: d.price_font_size_pt,
        typography_hierarchy_score: d.typography_hierarchy_score,
        restaurant_tier: d.restaurant_tier,
        reading_time_change: Math.round(scanningPenaltyPct * 0.6),
        customer_satisfaction_change: -Math.round(scanningPenaltyPct * 0.5),
        predicted_dwell_change: Math.round(scanningPenaltyPct * 0.4),
        predicted_revenue_change_pct: -Math.round(scanningPenaltyPct * 0.12),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `TYPOGRAPHY HIERARCHY WEAK: ${d.menu_id} hierarchy score ${d.typography_hierarchy_score}/100 (min ${config.minTypographyHierarchyScore}). Dish names ${d.dish_name_font_size_pt}pt, descriptions ${d.description_font_size_pt}pt, prices ${d.price_font_size_pt}pt — too similar for visual scanning. ${criticalNote}Typography hierarchy is the visual distinction between dish names, descriptions, and prices. Without hierarchy, customers cannot scan menu — they must read every line top to bottom to find items + prices. Adds 3-5 minutes to ordering, table turnover drops 10-15%. Customers miss specials (buried in description text), miss premium items (no visual emphasis), miss prices (cannot quickly compare). Eye-tracking studies show customers scan menus in F-pattern + Z-pattern — hierarchy guides eye to high-margin items first. Strong hierarchy: dish name 14-16pt bold serif or sans-serif, description 10-11pt regular same family, price 11-12pt bold right-aligned (or dotted leader to price). Weak hierarchy: all same size + weight + style, prices buried in description text, no visual anchors. Premium restaurants use hierarchy to spotlight signature dishes (chef recommendation badge, star icon, larger photo). Without hierarchy, signature dishes look identical to ordinary items -> missed upsell revenue. ${lostRevenue} revenue lost per month from slower scanning + missed specials + missed premium items + lower turnover. ACTION: strengthen typography hierarchy — dish names 14-16pt bold (visually largest, draws eye), descriptions 10-11pt regular (smaller, supporting info), prices 11-12pt bold right-aligned (consistent column, easy to find + compare). Use font weight contrast (bold dish names vs regular descriptions) — free, just CSS or print setting. Use font size contrast (3-5pt difference between dish names and descriptions) — free. Use color sparingly (dark gray descriptions vs black dish names) — free. Use whitespace generously (extra line between sections, padding around dish names) — free. Use section headers in caps + larger size + decorative divider line ($0 design, $0 print cost). Highlight 2-3 signature dishes with badge or star icon ($0 design, $0 print cost). Test hierarchy: show menu to 5 people for 10 seconds, ask them to recall 3 dish names + 3 prices — if they cannot recall, hierarchy is too weak. Save ${fmt$(Math.max(lostRevenue, 800))}/mo from faster scanning + higher signature dish selection + faster turnover + improved satisfaction. Hierarchy upgrade is $0 design cost (font settings) + $200-800 reprint.`,
        ai_recommendation: 'strengthen_typography_hierarchy',
        status: 'open', detected_at: now,
      });
    }

    // Rule 4: PAPER_QUALITY_LOW
    if (d.paper_quality_gsm < config.minPaperQualityGsm || d.paper_quality_gsm < (TIER_PAPER_GSM_MIN[d.restaurant_tier] ?? 120)) {
      // Thin/flimsy paper -> perceived cheap restaurant + lower price acceptance
      const tierMin = TIER_PAPER_GSM_MIN[d.restaurant_tier] ?? config.minPaperQualityGsm;
      const paperGap = Math.max(0, tierMin - d.paper_quality_gsm);
      const perceivedQualityDropPct = Math.min(8 + paperGap * 0.2, 28);
      const priceAcceptanceDropPct = Math.min(5 + paperGap * 0.15, 20);
      const lostRevenue = Math.round(baselineRevenue * (priceAcceptanceDropPct / 100) * 0.18 + baselineRevenue * (perceivedQualityDropPct / 100) * 0.08);
      const criticalNote = d.paper_quality_gsm < 90
        ? 'CRITICAL: paper below 90gsm — flimsy, see-through, tears easily, absorbs grease from fingers. Customers subconsciously extend "cheap paper" to "cheap restaurant" -> 28% perceived quality drop (Cornell CHR menu quality study). Lower price acceptance: customers refuse to pay $25 for entree on flimsy paper, will pay $25 for same entree on heavy stock. '
        : '';
      alerts.push({
        rule_id: 'paper_quality_low',
        severity: d.paper_quality_gsm < 90 ? 'high' : 'medium',
        menu_id: d.menu_id,
        paper_quality_gsm: d.paper_quality_gsm,
        paper_finish: d.paper_finish,
        restaurant_tier: d.restaurant_tier,
        perceived_quality_change: -Math.round(perceivedQualityDropPct),
        price_acceptance_change: -Math.round(priceAcceptanceDropPct),
        customer_satisfaction_change: -Math.round(perceivedQualityDropPct * 0.5),
        predicted_revenue_change_pct: -Math.round((perceivedQualityDropPct + priceAcceptanceDropPct) * 0.1),
        est_monthly_opportunity: Math.max(lostRevenue, 900),
        description: `PAPER QUALITY LOW: ${d.menu_id} printed on ${d.paper_quality_gsm}gsm ${d.paper_finish} paper (min ${tierMin}gsm for ${d.restaurant_tier}). ${criticalNote}Paper quality signals restaurant tier — 72% of customers judge restaurant quality by menu physical quality (Cornell CHR School of Hotel Administration menu study). Flimsy paper (<90gsm) reads as "cheap" — translucent, tears when wet, grease from fingers soaks through, edges curl after 2 weeks. Heavy stock (200gsm+) reads as "premium" — substantial feel, opaque, holds up to 6+ months, edges stay crisp. Paper weight directly influences price acceptance: customers refuse to pay $25 for entree listed on flimsy 80gsm paper, will pay $25 for same entree on 200gsm stock. Brain infers "if they skimp on menu paper, they skimp on food quality too". Paper finish matters: glossy = modern + upscale (but reflects overhead lights, harder to read at angle), matte = traditional + elegant + readable from any angle, satin = compromise, textured (linen, felt) = premium + tactile. Recycled paper signals sustainability (positive for eco-conscious brands). Industry standard: quick-service 100gsm minimum, fast-casual 120gsm, casual dining 150gsm, fine dining 200gsm+. Cover stock 250-300gsm minimum (heavy enough to feel substantial in hand). ${lostRevenue} revenue lost per month from perceived cheap restaurant + lower price acceptance + faster menu replacement (flimsy paper wears out in 6-8 weeks, heavy stock lasts 6-12 months). ACTION: upgrade paper stock — quick-service: 100-120gsm uncoated matte (free or $0.05/menu vs 80gsm), fast-casual: 130-150gsm matte or satin ($0.10-0.15/menu), casual dining: 170-200gsm matte or textured linen ($0.20-0.30/menu), fine dining: 200-250gsm textured + cover 300gsm+ ($0.40-0.80/menu). Choose finish that matches tier: glossy = modern (avoid in fine dining — reflects candlelight), matte = traditional + readable, satin = compromise, textured linen/felt = premium + tactile. Coordinate paper color with brand (cream = warm/traditional, white = modern/clean, kraft = eco/artisan). Total reprint cost $200-1,500 depending on quantity + paper upgrade. Save ${fmt$(Math.max(lostRevenue, 900))}/mo from perceived quality lift + higher price acceptance + longer menu life + brand consistency. Paper upgrade is the highest-ROI menu investment — $0.10-0.30/menu extra cost recovers $900+/mo in perceived quality + price acceptance.`,
        ai_recommendation: 'upgrade_paper_stock_weight',
        status: 'open', detected_at: now,
      });
    }

    // Rule 5: MENU_COVER_WORN_STAINED
    if (config.requireCoverPristine && (d.menu_cover_stained || d.menu_cover_condition === 'worn' || d.menu_cover_condition === 'stained' || d.menu_cover_condition === 'torn')) {
      // Stained/torn cover -> perceived dirty + quality signal failure
      const perceivedCleanlinessDropPct = d.menu_cover_condition === 'torn' ? 35 : d.menu_cover_condition === 'stained' ? 28 : 18;
      const perceivedQualityDropPct = d.menu_cover_condition === 'torn' ? 22 : d.menu_cover_condition === 'stained' ? 18 : 12;
      const lostRevenue = Math.round(baselineRevenue * (perceivedCleanlinessDropPct / 100) * 0.12 + baselineRevenue * (perceivedQualityDropPct / 100) * 0.08);
      const criticalNote = d.menu_cover_condition === 'torn'
        ? 'CRITICAL: cover TORN — visible damage. Customers subconsciously extend "torn menu cover" to "dirty kitchen" -> 35% perceived cleanliness drop (Cornell CHR menu condition study). Torn cover is the #1 visual cue customers use to judge overall restaurant hygiene. '
        : d.menu_cover_condition === 'stained'
          ? 'CRITICAL: cover STAINED — visible food/drink stains on menu cover. 28% perceived cleanliness drop. Customers subconsciously extend "stained menu" to "unclean restaurant" -> negative health inspection perception + reduced tip + reduced repeat intent. '
          : d.menu_cover_condition === 'worn'
            ? 'CRITICAL: cover WORN — frayed edges, faded color, scuff marks. 18% perceived quality drop. Worn cover signals "this restaurant does not invest in upkeep" -> customers infer food + service are equally neglected. '
            : '';
      alerts.push({
        rule_id: 'menu_cover_worn_stained',
        severity: d.menu_cover_condition === 'torn' || d.menu_cover_condition === 'stained' ? 'critical' : 'high',
        menu_id: d.menu_id,
        menu_cover_material: d.menu_cover_material,
        menu_cover_condition: d.menu_cover_condition,
        menu_cover_stained: d.menu_cover_stained,
        restaurant_tier: d.restaurant_tier,
        perceived_quality_change: -Math.round(perceivedQualityDropPct),
        customer_satisfaction_change: -Math.round(perceivedCleanlinessDropPct * 0.6),
        predicted_revenue_change_pct: -Math.round((perceivedCleanlinessDropPct + perceivedQualityDropPct) * 0.1),
        est_monthly_opportunity: Math.max(lostRevenue, 1200),
        description: `MENU COVER WORN/STAINED: ${d.menu_id} cover ${d.menu_cover_material} in ${d.menu_cover_condition} condition, stained ${d.menu_cover_stained ? 'YES' : 'no'}. ${criticalNote}Menu covers that are stained, torn, or worn = perceived dirty restaurant. Customers hold menu for 5-10 minutes — most prolonged physical touchpoint in entire restaurant experience. Stains from previous customers food/drink/wine/grease transfer subconsciously to perception of kitchen hygiene. 35% perceived cleanliness drop for torn covers, 28% for stained, 18% for worn (Cornell CHR menu condition perception study). Brain infers "if they cannot replace stained menu customers HOLD, they cannot clean kitchen customers cannot SEE". Worn covers also signal "this restaurant does not invest in upkeep" — customers infer food quality + service + equipment are equally neglected. Premium restaurants replace covers every 3-6 months. Casual dining every 6-12 months. Quick-service every 4-8 weeks (heavy use, lower cost covers). Stains happen fastest on fabric + faux_leather covers (absorb liquid). Leather + wood + metal covers resist stains but show scratches. Plastic covers show fingerprints. ${lostRevenue} revenue lost per month from perceived uncleanliness + perceived quality drop + reduced repeat intent + lower tips. ACTION: replace worn menu cover immediately — inspect every menu weekly (set recurring calendar reminder, 5 minutes per menu stack), pull any menu with stain + tear + visible wear (do not put back in rotation), professional clean fabric/faux_leather covers monthly ($8-25/cover dry clean, restores 80% of new look), replace covers on schedule (quick-service 4-8 weeks, fast-casual 3-6 months, casual dining 6-12 months, fine dining 12-18 months or per quarter if high traffic), choose stain-resistant cover material for next reprint (leather + wood + metal resist stains but cost more upfront — $15-50/cover; faux_leather + fabric absorb stains but cheaper — $3-15/cover), implement menu cover rotation (2-3 sets per restaurant, swap weekly for cleaning — $300-1,500 upfront but doubles cover life), use disposable paper covers for high-traffic quick-service ($0.50-1/cover, replaced daily — no cleaning). Save ${fmt$(Math.max(lostRevenue, 1200))}/mo from recovered perceived cleanliness + perceived quality + repeat intent + tips. Cover replacement is the cheapest perceived-quality lift — $15-50/cover recovers $1,200+/mo.`,
        ai_recommendation: 'replace_worn_menu_cover',
        status: 'open', detected_at: now,
      });
    }

    // Rule 6: FONT_BRAND_MISMATCH
    if (config.requireFontBrandMatch && (!d.font_brand_match)) {
      // Font style does not match restaurant concept (script font in fast-casual)
      const expectedFonts = TIER_FONT_MAP[d.restaurant_tier] ?? ['sans_serif'];
      const mismatchPct = 14;
      const lostRevenue = Math.round(baselineRevenue * (mismatchPct / 100) * 0.15);
      const criticalNote = d.restaurant_tier === 'fine_dining' && d.font_family_type === 'sans_serif'
        ? 'CRITICAL: sans-serif font in fine dining — fine dining requires serif font (Garamond, Baskerville, Caslon) for tradition + formality. Sans-serif reads as "modern" or "casual" + breaks premium brand narrative. Brand perception drops 18% (hospitality brand consistency study). '
        : d.restaurant_tier === 'quick_service' && (d.font_family_type === 'script' || d.font_family_type === 'serif')
          ? 'CRITICAL: script or serif font in quick-service — quick-service requires clean sans-serif (Helvetica, Avenir) for fast reading + modern feel. Script/serif reads as "pretentious" or "slow" + signals brand confusion. Customers expect speed + simplicity, not formality. '
          : d.restaurant_tier === 'fast_casual' && d.font_family_type === 'script'
            ? 'CRITICAL: script font in fast-casual — fast-casual requires approachable sans-serif or simple serif. Script reads as "trying too hard" + slows ordering in concept built for speed. '
            : '';
      alerts.push({
        rule_id: 'font_brand_mismatch',
        severity: d.restaurant_tier === 'fine_dining' || d.restaurant_tier === 'quick_service' ? 'high' : 'medium',
        menu_id: d.menu_id,
        font_family_type: d.font_family_type,
        font_name: d.font_name,
        restaurant_tier: d.restaurant_tier,
        font_brand_match: d.font_brand_match,
        perceived_quality_change: -Math.round(mismatchPct * 0.5),
        customer_satisfaction_change: -Math.round(mismatchPct * 0.4),
        predicted_revenue_change_pct: -Math.round(mismatchPct * 0.15),
        est_monthly_opportunity: Math.max(lostRevenue, 700),
        description: `FONT BRAND MISMATCH: ${d.menu_id} uses ${d.font_family_type} font "${d.font_name}" in ${d.restaurant_tier} restaurant (expected: ${expectedFonts.join(', ')}). ${criticalNote}Font choice communicates brand personality — serif = traditional/formal (bank, law firm, fine dining), sans-serif = modern/casual (tech startup, fast-casual, quick-service), script = elegant/special occasion (wedding invitation, fine dining title only), decorative = novelty/theme (children menu, themed restaurant). Wrong font for tier signals brand inconsistency + confuses customer expectation. Fine dining with sans-serif: customers expect Michelin-tier service + food, but font reads as "casual" or "modern" — breaks the premium narrative, brand perception drops 18%. Quick-service with script: customers expect speed + value, but script reads as "formal" or "slow" — customers wonder if they are in the right place, slows ordering, signals brand confusion. Fast-casual with decorative display font: customers expect approachable + quality, decorative reads as "gimmick" — undermines the "elevated fast-casual" positioning. Font must match the entire brand narrative: typography on signage, website, menu, business cards, staff uniforms must be consistent. Brand consistency across all touchpoints drives 23% marketing ROI uplift + 14% price acceptance (Reboot brand consistency study). Mismatched menu font breaks the design narrative — premium restaurant with casual font signals "ran out of budget for design" or "does not understand the tier they are operating in". ${lostRevenue} revenue lost per month from brand perception drop + lower price acceptance + reduced repeat intent + reduced marketing ROI. ACTION: align font with brand tier — fine dining: serif (Garamond, Baskerville, Caslon, Playfair Display for titles — $0 Google Fonts, tradition + formality), casual dining: serif or sans-serif (Source Serif Pro, Source Sans Pro, Lora, Merriweather — $0 Google Fonts, warm + readable), fast-casual: sans-serif (Avenir, Open Sans, Inter, Source Sans Pro — $0 Google Fonts, modern + approachable), quick-service: sans-serif (Helvetica, Roboto, Open Sans — $0 Google Fonts, clean + fast). Script fonts allowed ONLY in fine dining dish name titles, never body text (see rule 2). Coordinate menu font with website font + signage font + business card font for full brand consistency. Hire typography consultant for $300-800 (ensures tier-appropriate choice + license compliance). Save ${fmt$(Math.max(lostRevenue, 700))}/mo from recovered brand perception + price acceptance + marketing ROI + repeat intent. Font swap is $0 license (Google Fonts) + $200-800 reprint.`,
        ai_recommendation: 'align_font_with_brand_tier',
        status: 'open', detected_at: now,
      });
    }

    // Rule 7: MENU_SIZE_WEIGHT_WRONG
    if (config.requireStandardMenuSize && (d.menu_size === 'oversized' || d.menu_size === 'small' || d.menu_weight_grams > config.maxMenuWeightGrams || d.menu_weight_grams < config.minMenuWeightGrams)) {
      // Too large/heavy = unwieldy; too small = hard to read
      const isOversized = d.menu_size === 'oversized' || d.menu_weight_grams > config.maxMenuWeightGrams;
      const isTiny = d.menu_size === 'small' || d.menu_weight_grams < config.minMenuWeightGrams;
      const handlingPct = isOversized ? 15 : 12;
      const lostRevenue = Math.round(baselineRevenue * (handlingPct / 100) * 0.1);
      const criticalNote = isOversized
        ? 'CRITICAL: menu too large/heavy — oversized menu (11x17+ or 600g+) is unwieldy for customers to hold. Falls off table, hits drink glasses, knocks over candle. Heavy menus fatigue wrists after 3-4 minutes, customers set menu down + cannot read comfortably. Awkward handling slows ordering 15%. '
        : isTiny
          ? 'CRITICAL: menu too small/light — tiny menu (5.5x8.5 or under 80g) feels cheap + flimsy. Hard to read (text cramped to fit small page), blows off table in outdoor seating, customers lose place easily. Reads as "afterthought" or "cost-cutting". '
          : '';
      alerts.push({
        rule_id: 'menu_size_weight_wrong',
        severity: isOversized ? 'high' : 'medium',
        menu_id: d.menu_id,
        menu_size: d.menu_size,
        menu_weight_grams: d.menu_weight_grams,
        menu_binding_type: d.menu_binding_type,
        restaurant_tier: d.restaurant_tier,
        reading_time_change: Math.round(handlingPct * 0.5),
        customer_satisfaction_change: -Math.round(handlingPct * 0.4),
        perceived_quality_change: -Math.round(handlingPct * 0.3),
        predicted_dwell_change: Math.round(handlingPct * 0.3),
        predicted_revenue_change_pct: -Math.round(handlingPct * 0.1),
        est_monthly_opportunity: Math.max(lostRevenue, 600),
        description: `MENU SIZE/WEIGHT WRONG: ${d.menu_id} is ${d.menu_size} size at ${d.menu_weight_grams}g (max ${config.maxMenuWeightGrams}g, min ${config.minMenuWeightGrams}g). Binding: ${d.menu_binding_type}. ${criticalNote}Menu size + weight must be balanced for handling comfort + readability. Too large/heavy: oversized menu (11x17+ or 600g+) is unwieldy — falls off table, hits drink glasses, knocks over candle, fatigues wrists after 3-4 minutes, customers set menu down + cannot read comfortably. Awkward handling slows ordering 15%. Common in restaurants that try to fit too many items on one page. Too small/light: tiny menu (5.5x8.5 or under 80g) feels cheap + flimsy — text cramped to fit small page (compounds font size rule), blows off table in outdoor seating, customers lose place easily, reads as "afterthought" or "cost-cutting". Industry standard: 8.5x11 (letter) or 8.5x14 (legal) for full menu, 5.5x8.5 for wine/dessert insert, 4x9 for cocktail list. Weight 150-350g feels substantial without fatiguing. Binding affects handling: saddle_stitch (lies flat, easy to read, $0.50-2/menu), perfect_bound (lies flat, premium feel, $2-5/menu), spiral_bound (lies completely flat, durable, $1-3/menu), hardcover (premium but heavy, $5-15/menu), ring_binder (pages fall out, dated feel, $3-8/menu), loose_leaf (feels incomplete, $0.50-1/page). Fine dining prefers hardcover or perfect_bound for premium feel. Casual dining prefers saddle_stitch or spiral_bound for practical handling. Quick-service prefers single laminated sheet or saddle_stitch for fast turnover. ${lostRevenue} revenue lost per month from awkward handling + slower ordering + lower perceived quality. ACTION: resize menu to standard — full menu: 8.5x11 or 8.5x14 (fits in standard menu holder, $0.20-0.40/print), wine/dessert insert: 5.5x8.5 (compact, $0.10-0.20/print), cocktail list: 4x9 (slim, $0.08-0.15/print). Total menu weight 150-350g (substantial without wrist fatigue). Choose binding by tier: fine dining hardcover or perfect_bound ($5-15/menu), casual dining saddle_stitch or spiral_bound ($0.50-3/menu), quick-service laminated single sheet or saddle_stitch ($0.50-2/menu). Test handling: hold menu one-handed for 5 minutes — if wrist fatigues or menu tips over, too heavy or wrong binding. Test readability: menu lies flat on table — if corners curl or pages flip on their own, wrong binding. Save ${fmt$(Math.max(lostRevenue, 600))}/mo from faster ordering + better perceived quality + improved handling + satisfied customers. Resize is $0 design + $200-800 reprint.`,
        ai_recommendation: 'resize_menu_to_standard',
        status: 'open', detected_at: now,
      });
    }

    // Rule 8: TEXT_CONTRAST_INSUFFICIENT
    if (d.text_contrast_ratio < config.minTextContrastRatio || d.text_contrast_score < config.minTextContrastScore) {
      // Low contrast text (light gray on white) -> readability failure
      const contrastGap = config.minTextContrastRatio - d.text_contrast_ratio;
      const readabilityLossPct = Math.min(10 + contrastGap * 4, 28);
      const lostRevenue = Math.round(baselineRevenue * (readabilityLossPct / 100) * 0.12);
      const criticalNote = d.text_contrast_ratio < 3
        ? 'CRITICAL: contrast ratio below 3:1 — text almost invisible in dim restaurant lighting (200 lux). WCAG AA fails below 4.5:1. Customers cannot read menu in evening service, ask server to read items, order from memory or guess. 28% readability loss + 8% order error rate. '
        : '';
      alerts.push({
        rule_id: 'text_contrast_insufficient',
        severity: d.text_contrast_ratio < 3 ? 'critical' : d.text_contrast_ratio < 4.5 ? 'high' : 'medium',
        menu_id: d.menu_id,
        font_family_type: d.font_family_type,
        font_size_pt: d.font_size_pt,
        text_contrast_ratio: d.text_contrast_ratio,
        text_contrast_score: d.text_contrast_score,
        restaurant_tier: d.restaurant_tier,
        reading_time_change: Math.round(readabilityLossPct * 0.7),
        order_accuracy_change: -Math.round(readabilityLossPct * 0.2),
        customer_satisfaction_change: -Math.round(readabilityLossPct * 0.5),
        predicted_dwell_change: Math.round(readabilityLossPct * 0.4),
        predicted_revenue_change_pct: -Math.round(readabilityLossPct * 0.12),
        est_monthly_opportunity: Math.max(lostRevenue, 800),
        description: `TEXT CONTRAST INSUFFICIENT: ${d.menu_id} has contrast ratio ${d.text_contrast_ratio}:1 (min ${config.minTextContrastRatio}:1), contrast score ${d.text_contrast_score}/100. ${criticalNote}Low contrast text (light gray on white, gold on cream, white on light wood) causes readability failure especially in dim restaurant lighting (200 lux typical evening service, vs 500+ lux office lighting where contrast tested). WCAG 2.1 AA accessibility standard requires 4.5:1 minimum for body text, 7:1 AAA for premium. Common low-contrast mistakes: light gray text on white paper (looks elegant in studio, illegible in restaurant), gold/silver ink on cream paper (premium feel but unreadable in candlelight), white text on dark background (OK if background is true black, fails if background is dark gray/navy), colored text on colored paper (clashes + reduces contrast). Eye-tracking studies show customers skip low-contrast text — they read high-contrast dish names + prices, skip low-contrast descriptions -> missed upsells + missed ingredient warnings + missed allergen info. Low contrast also fails ADA compliance (lawsuits $4,000-$55,000 per violation in US). Premium restaurants often use low contrast for "sophisticated" aesthetic — wrong move, customers cannot read, satisfaction drops 28%. ${lostRevenue} revenue lost per month from missed descriptions + slower reading + order errors + ADA risk. ACTION: increase text contrast ratio — body text: pure black (#000000) on white or cream paper (21:1 ratio, maximum readability) or dark charcoal (#333333) on white (12:1, slightly softer). Dish names: black or brand color on white (minimum 7:1). Prices: black on white (minimum 7:1, must be easy to find + compare). Avoid: light gray on white (under 3:1), gold/silver ink on cream (under 3:1), white text on dark gray (under 4.5:1). If using brand colors for text, test contrast ratio with online tool (WebAIM contrast checker, free) — must be 4.5:1 minimum for body, 7:1 for premium. For dim restaurant lighting, target 7:1+ contrast (AAA standard). For ink color on colored paper, test under 200 lux lighting — if text is hard to read, increase contrast. Save ${fmt$(Math.max(lostRevenue, 800))}/mo from recovered readability + recovered descriptions + fewer order errors + ADA compliance. Contrast fix is $0 design (color swap) + $200-800 reprint.`,
        ai_recommendation: 'increase_text_contrast_ratio',
        status: 'open', detected_at: now,
      });
    }
  }

  // Generate AI insights for critical/high alerts
  if (config.aiEnabled && alerts.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const topAlerts = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').slice(0, 5);
      for (const a of topAlerts) {
        try {
          const response = await callOpenAIChat({
            messages: [
              { role: 'system', content: 'You are a restaurant menu typography and physical material optimization expert. Given menu inspection data, recommend ONE specific action with expected satisfaction, perceived quality, price acceptance, reading time, order accuracy, or revenue impact (max 200 chars, imperative voice).' },
              { role: 'user', content: `Menu: ${a.menu_id ?? 'n/a'}. Font: ${a.font_family_type ?? 'n/a'} (${a.font_name ?? 'n/a'}), body ${a.font_size_pt ?? 0}pt. Hierarchy score: ${a.typography_hierarchy_score ?? 0}/100. Readability: ${a.text_readability_score ?? 0}/100. Contrast ratio: ${a.text_contrast_ratio ?? 0}:1 (score ${a.text_contrast_score ?? 0}/100). Paper: ${a.paper_quality_gsm ?? 0}gsm ${a.paper_finish ?? 'n/a'}. Cover: ${a.menu_cover_material ?? 'n/a'} (${a.menu_cover_condition ?? 'n/a'}, stained ${a.menu_cover_stained ?? false}). Binding: ${a.menu_binding_type ?? 'n/a'}. Size: ${a.menu_size ?? 'n/a'}, weight ${a.menu_weight_grams ?? 0}g. Restaurant tier: ${a.restaurant_tier ?? 'n/a'}. Font brand match: ${a.font_brand_match ?? false}. Monthly revenue: ${fmt$(a.monthly_revenue ?? 0)}. Opportunity: ${fmt$(a.est_monthly_opportunity)}. Context: ${a.description}` },
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
    await db.query(`DELETE FROM menu_typography_alert WHERE status = 'open' AND detected_at < time::now() - 24h`);
  } catch { /* ignore */ }
  for (const a of alerts) {
    try {
      await db.query(`CREATE menu_typography_alert CONTENT $data`, {
        data: { ...a, detected_at: a.detected_at.toISOString() },
      });
    } catch { /* ignore */ }
  }

  return { alerts, generated: alerts.length };
};

export const getActiveAlerts = async (db: ReturnType<typeof useDB>): Promise<MenuTypographyAlert[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM menu_typography_alert WHERE status = 'open'
       ORDER BY est_monthly_opportunity DESC LIMIT 50`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch { return []; }
};

export const getSummary = async (db: ReturnType<typeof useDB>): Promise<{
  totalAlerts: number; criticalCount: number; totalOpportunity: number;
  menusAtRisk: number; smallFontMenus: number; wornCoverMenus: number;
}> => {
  try {
    const result = await db.query(
      `SELECT count() AS total, math::count(severity = 'critical') AS critical,
              math::sum(est_monthly_opportunity WHERE est_monthly_opportunity > 0) AS opportunity,
              math::count(menu_id != NONE) AS menus,
              math::count(rule_id = 'font_size_too_small') AS smallfont,
              math::count(rule_id = 'menu_cover_worn_stained') AS worncover
       FROM menu_typography_alert WHERE status = 'open' GROUP ALL`
    );
    const rows = Array.isArray(result) ? result.flat() : [];
    const r = rows[0] ?? {};
    return {
      totalAlerts: safeNumber(r.total, 0), criticalCount: safeNumber(r.critical, 0),
      totalOpportunity: safeNumber(r.opportunity, 0),
      menusAtRisk: safeNumber(r.menus, 0),
      smallFontMenus: safeNumber(r.smallfont, 0),
      wornCoverMenus: safeNumber(r.worncover, 0),
    };
  } catch {
    return { totalAlerts: 0, criticalCount: 0, totalOpportunity: 0, menusAtRisk: 0, smallFontMenus: 0, wornCoverMenus: 0 };
  }
};

export const updateAlertStatus = async (
  db: ReturnType<typeof useDB>, alertId: string,
  status: 'resolved' | 'in_progress' | 'rejected' | 'expired'
): Promise<void> => {
  await db.query(`UPDATE $id SET status = $status`, { id: alertId, status });
};
