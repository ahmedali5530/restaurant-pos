/**
 * AI Guest Preference Learning service — personalized guest profiles.
 *
 * Unique to POSR — Toast and Square don't have individual guest preference
 * learning. POSR analyzes each customer's order history to learn preferences.
 */

import { useDB } from '@/api/db/db.ts';
import { safeNumber } from '@/lib/utils.ts';

export interface GuestPreference {
  id?: string;
  customer_id: string;
  customer_name: string;
  email?: string;
  phone?: string;
  total_visits: number;
  favorite_dishes?: Array<{ name: string; times_ordered: number; last_ordered: string }>;
  favorite_categories?: string[];
  preferred_order_time?: string;
  preferred_table?: string;
  preferred_floor?: string;
  avg_party_size: number;
  preferred_payment_method?: string;
  dietary_notes?: string[];
  liked_addons?: string[];
  special_requests?: string[];
  avg_spend: number;
  last_visit_date?: Date;
  visit_frequency_days?: number;
  ai_personalized_recs?: string[];
  ai_insight?: string;
  generated_at: Date;
}

export interface GuestPrefConfig {
  aiEnabled: boolean;
  minVisits: number;
  lookbackDays: number;
}

export const DEFAULT_GUEST_CONFIG: GuestPrefConfig = {
  aiEnabled: true,
  minVisits: 2,
  lookbackDays: 365,
};

export const readGuestConfig = (settings: any): GuestPrefConfig => ({
  aiEnabled: settings?.guest_pref_ai_enabled ?? true,
  minVisits: safeNumber(settings?.guest_pref_min_visits, 2),
  lookbackDays: safeNumber(settings?.guest_pref_lookback_days, 365),
});

const categorizeOrderTime = (hour: number): string => {
  if (hour >= 6 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'dinner';
  return 'late_night';
};

const inferDietary = (
  orderedCategories: string[],
  _avoidedCategories: string[],
  dishNames: string[]
): string[] => {
  const notes: string[] = [];
  const lowerDishes = dishNames.map(d => d.toLowerCase());

  // Vegetarian: never ordered meat, orders veg frequently
  const meatKeywords = ['beef', 'chicken', 'pork', 'lamb', 'fish', 'seafood', 'bacon', 'steak', 'burger'];
  const hasMeat = lowerDishes.some(d => meatKeywords.some(m => d.includes(m)));
  if (!hasMeat && orderedCategories.length > 0) {
    const vegKeywords = ['vegetarian', 'vegan', 'salad', 'tofu', 'veg'];
    const hasVeg = lowerDishes.some(d => vegKeywords.some(v => d.includes(v)));
    if (hasVeg) notes.push('likely_vegetarian');
  }

  // No spicy: never ordered spicy items
  const spicyKeywords = ['spicy', 'hot', 'chili', 'curry', 'buffalo'];
  const hasSpicy = lowerDishes.some(d => spicyKeywords.some(s => d.includes(s)));
  if (!hasSpicy && dishNames.length >= 3) notes.push('avoids_spicy');

  // Gluten-free: orders gluten-free items
  if (lowerDishes.some(d => d.includes('gluten free') || d.includes('gf'))) {
    notes.push('gluten_free');
  }

  return notes;
};

export const analyzeGuestPreferences = async (
  db: ReturnType<typeof useDB>,
  config: GuestPrefConfig = DEFAULT_GUEST_CONFIG,
  onProgress?: (current: number, total: number) => void
): Promise<{ preferences: GuestPreference[] }> => {
  if (onProgress) onProgress(0, 3);

  const cutoff = new Date(Date.now() - config.lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch orders with customer + items + table + payments
  const byCustomer = new Map<string, {
    name: string; email?: string; phone?: string;
    orders: any[]; dishes: Map<string, { count: number; last: Date }>;
    categories: Map<string, number>; addons: Map<string, number>;
    notes: Map<string, number>; times: Map<string, number>;
    tables: Map<string, number>; floors: Map<string, number>;
    partySizes: number[]; payments: Map<string, number>;
    totalSpend: number; firstVisit: Date | null; lastVisit: Date | null;
    visitDates: Date[];
  }>();

  try {
    const result = await db.query(
      `SELECT id, total, created_at, covers, notes,
         customer.id AS customer_id, customer.name AS customer_name,
         customer.email AS email, customer.phone AS phone,
         table.id AS table_id, table.name AS table_name,
         table.floor.name AS floor_name,
         items, payments
       FROM order
       WHERE created_at > $cutoff AND status = 'Paid' AND deleted_at IS NONE
         AND customer != NONE
       FETCH customer, table, table.floor, items, items.item, items.modifiers, payments`,
      { cutoff: cutoff.toISOString() }
    );
    const rows = Array.isArray(result) ? result.flat() : [];

    for (const order of rows) {
      const cid = order.customer_id?.toString?.() ?? '';
      if (!cid) continue;
      if (!byCustomer.has(cid)) {
        byCustomer.set(cid, {
          name: order.customer_name ?? 'Unknown', email: order.email, phone: order.phone?.toString?.(),
          orders: [], dishes: new Map(), categories: new Map(),
          addons: new Map(), notes: new Map(), times: new Map(),
          tables: new Map(), floors: new Map(), partySizes: [],
          payments: new Map(), totalSpend: 0, firstVisit: null, lastVisit: null,
          visitDates: [],
        });
      }
      const data = byCustomer.get(cid)!;
      const date = new Date(order.created_at);
      const total = safeNumber(order.total, 0);
      const covers = safeNumber(order.covers, 2);

      data.orders.push(order);
      data.totalSpend += total;
      data.partySizes.push(covers);
      data.visitDates.push(date);
      if (!data.firstVisit || date < data.firstVisit) data.firstVisit = date;
      if (!data.lastVisit || date > data.lastVisit) data.lastVisit = date;

      // Dishes
      if (Array.isArray(order.items)) {
        for (const item of order.items) {
          const dishName = item?.item?.name ?? item?.name ?? 'Unknown';
          if (!data.dishes.has(dishName)) data.dishes.set(dishName, { count: 0, last: date });
          const d = data.dishes.get(dishName)!;
          d.count++;
          if (date > d.last) d.last = date;

          // Categories
          const cats = item?.item?.categories ?? item?.categories ?? [];
          if (Array.isArray(cats)) {
            for (const cat of cats) {
              const cn = cat?.name ?? cat?.toString?.() ?? '';
              if (cn) data.categories.set(cn, (data.categories.get(cn) ?? 0) + 1);
            }
          }

          // Addons/modifiers
          const mods = item?.modifiers ?? [];
          if (Array.isArray(mods)) {
            for (const mg of mods) {
              const sels = mg?.selectedModifiers ?? [];
              if (Array.isArray(sels)) {
                for (const sel of sels) {
                  const name = sel?.name ?? sel?.dish?.name ?? '';
                  if (name) data.addons.set(name, (data.addons.get(name) ?? 0) + 1);
                }
              }
            }
          }
        }
      }

      // Order time
      const timeCat = categorizeOrderTime(date.getHours());
      data.times.set(timeCat, (data.times.get(timeCat) ?? 0) + 1);

      // Table/floor
      const tableName = order.table_name ?? '';
      const floorName = order.floor_name ?? '';
      if (tableName) data.tables.set(tableName, (data.tables.get(tableName) ?? 0) + 1);
      if (floorName) data.floors.set(floorName, (data.floors.get(floorName) ?? 0) + 1);

      // Notes
      const notes = order.notes ?? '';
      if (notes && notes.length > 2) {
        data.notes.set(notes.slice(0, 50), (data.notes.get(notes.slice(0, 50)) ?? 0) + 1);
      }

      // Payment method
      const payments = Array.isArray(order.payments) ? order.payments : [];
      for (const p of payments) {
        const ptype = p?.payment_type?.name ?? p?.method ?? 'Unknown';
        data.payments.set(ptype, (data.payments.get(ptype) ?? 0) + 1);
      }
    }
  } catch (err) {
    console.error('[guest-pref] fetch failed', err);
    return { preferences: [] };
  }
  if (onProgress) onProgress(1, 3);

  // Build preferences
  const preferences: GuestPreference[] = [];

  for (const [cid, data] of byCustomer) {
    if (data.orders.length < config.minVisits) continue;

    // Favorite dishes (top 5 by count)
    const favoriteDishes = Array.from(data.dishes.entries())
      .map(([name, v]) => ({ name, times_ordered: v.count, last_ordered: v.last.toISOString() }))
      .sort((a, b) => b.times_ordered - a.times_ordered)
      .slice(0, 5);

    // Favorite categories (top 3)
    const favoriteCategories = Array.from(data.categories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c]) => c);

    // Preferred order time
    const preferredTime = Array.from(data.times.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // Preferred table/floor
    const preferredTable = Array.from(data.tables.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    const preferredFloor = Array.from(data.floors.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // Preferred payment
    const preferredPayment = Array.from(data.payments.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    // Avg party size
    const avgParty = data.partySizes.length > 0
      ? data.partySizes.reduce((s, n) => s + n, 0) / data.partySizes.length
      : 2;

    // Avg spend
    const avgSpend = data.orders.length > 0 ? data.totalSpend / data.orders.length : 0;

    // Liked addons (top 3)
    const likedAddons = Array.from(data.addons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    // Special requests (frequent notes)
    const specialRequests = Array.from(data.notes.entries())
      .filter(([, count]) => count >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([note]) => note);

    // Dietary notes
    const orderedDishes = Array.from(data.dishes.keys());
    const dietaryNotes = inferDietary(favoriteCategories, [], orderedDishes);

    // Visit frequency
    let visitFreq: number | undefined;
    if (data.visitDates.length >= 2) {
      const sorted = [...data.visitDates].sort((a, b) => a.getTime() - b.getTime());
      const gaps: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push((sorted[i].getTime() - sorted[i - 1].getTime()) / (24 * 60 * 60 * 1000));
      }
      visitFreq = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length * 10) / 10;
    }

    preferences.push({
      customer_id: cid,
      customer_name: data.name,
      email: data.email,
      phone: data.phone,
      total_visits: data.orders.length,
      favorite_dishes: favoriteDishes,
      favorite_categories: favoriteCategories,
      preferred_order_time: preferredTime,
      preferred_table: preferredTable,
      preferred_floor: preferredFloor,
      avg_party_size: Math.round(avgParty * 10) / 10,
      preferred_payment_method: preferredPayment,
      dietary_notes: dietaryNotes.length > 0 ? dietaryNotes : undefined,
      liked_addons: likedAddons.length > 0 ? likedAddons : undefined,
      special_requests: specialRequests.length > 0 ? specialRequests : undefined,
      avg_spend: Math.round(avgSpend * 100) / 100,
      last_visit_date: data.lastVisit ?? undefined,
      visit_frequency_days: visitFreq,
      generated_at: new Date(),
    });
  }

  // Sort by total visits descending
  preferences.sort((a, b) => b.total_visits - a.total_visits);
  if (onProgress) onProgress(2, 3);

  // AI enhancement (top 20 guests)
  if (config.aiEnabled && preferences.length > 0) {
    const { callOpenAIChat } = await import('@/lib/openai.service.ts').catch(() => ({} as any));
    if (callOpenAIChat) {
      const top = preferences.slice(0, 20);
      const prompt = `You are a restaurant guest relations expert.
Analyze these guest preferences and generate personalized recommendations.

Guests (JSON):
${JSON.stringify(top.map(g => ({
  name: g.customer_name,
  visits: g.total_visits,
  favorites: g.favorite_dishes?.map(d => d.name) ?? [],
  categories: g.favorite_categories ?? [],
  preferred_time: g.preferred_order_time,
  avg_spend: g.avg_spend,
  party_size: g.avg_party_size,
  dietary: g.dietary_notes ?? [],
  addons: g.liked_addons ?? [],
  frequency: g.visit_frequency_days,
})), null, 2)}

Respond with JSON array:
[{
  "name": "<match guest name>",
  "insight": "<max 200 chars — what this guest values + how to surprise them>",
  "recommendations": ["<max 100 chars each — specific dish/offer to suggest next visit>"]
}]`;

      try {
        const response = await callOpenAIChat([
          { role: 'system', content: 'You are a restaurant guest relations AI. Respond only with valid JSON.' },
          { role: 'user', content: prompt },
        ], { temperature: 0.4, maxTokens: 1500 });

        const text = typeof response === 'string' ? response : (response as any)?.content ?? '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Array<{
            name: string; insight?: string; recommendations?: string[];
          }>;
          for (const item of parsed) {
            const g = preferences.find(p => p.customer_name === item.name);
            if (!g) continue;
            if (item.insight) g.ai_insight = item.insight.slice(0, 200);
            if (item.recommendations) g.ai_personalized_recs = item.recommendations.slice(0, 5);
          }
        }
      } catch (err) {
        console.warn('[guest-pref] AI failed', err);
      }
    }
  }
  if (onProgress) onProgress(3, 3);

  // Persist (top 200)
  try {
    await db.query(`UPDATE guest_preference SET expires_at = time::now() WHERE expires_at = NONE OR expires_at > time::now()`);
    for (const g of preferences.slice(0, 200)) {
      try {
        await db.query(`CREATE guest_preference CONTENT $data`, {
          data: {
            ...g,
            last_visit_date: g.last_visit_date?.toISOString(),
            generated_at: g.generated_at.toISOString(),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        });
      } catch { /* non-fatal */ }
    }
  } catch (err) {
    console.warn('[guest-pref] persist failed', err);
  }

  return { preferences };
};

export const getGuestPreferences = async (
  db: ReturnType<typeof useDB>
): Promise<GuestPreference[]> => {
  try {
    const result = await db.query(
      `SELECT * FROM guest_preference WHERE expires_at > time::now()
       ORDER BY total_visits DESC LIMIT 200`
    );
    return Array.isArray(result) ? result.flat() : [];
  } catch (err) {
    console.error('[guest-pref] getGuestPreferences failed', err);
    return [];
  }
};
