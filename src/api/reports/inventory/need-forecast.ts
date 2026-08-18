import {DateTime} from "luxon";
import {getDemandContext} from "@/api/reports/demand/context.ts";
import {
  DEMAND_HISTORY_DAYS,
  historyQueryRange,
  resolveDemandHorizon,
  weekdayName,
} from "@/api/reports/demand/horizon.ts";
import type {LocalEventInput} from "@/api/reports/demand/types.ts";
import {getPerItemDailyConsumption} from "@/api/reports/inventory/consumption-daily.ts";
import {unwrapQueryResult} from "@/api/reports/shared/query.ts";
import {recordIdToString, recordToString} from "@/api/reports/shared/records.ts";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {Tables} from "@/api/db/tables.ts";
import {getAppTimezone} from "@/lib/datetime.ts";
import {fetchLedgerNetsByStore} from "@/lib/inventory/ledger.service.ts";
import {safeNumber} from "@/lib/utils.ts";
import {getReorderLevelForStore} from "@/utils/inventory.ts";

const ITEM_CAP = 40;
const round2 = (value: number) => Math.round(value * 100) / 100;

const normalizeKey = (id: unknown): string => {
  const str = recordIdToString(id) || String(id ?? "");
  const colon = str.lastIndexOf(":");
  return colon >= 0 ? str.slice(colon + 1) : str;
};

const weekdayOf = (isoDate: string): number =>
  DateTime.fromISO(isoDate, {zone: getAppTimezone()}).weekday;

const average = (values: number[]): number => {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const priorSameWeekday = (
  points: Array<{period: string; value: number}>,
  targetDate: string,
): {date?: string; value: number} => {
  const targetWeekday = weekdayOf(targetDate);
  const prior = points
    .filter(point => point.period < targetDate && weekdayOf(point.period) === targetWeekday)
    .sort((a, b) => b.period.localeCompare(a.period));
  if (!prior.length) {
    return {value: 0};
  }
  return {date: prior[0].period, value: round2(prior[0].value)};
};

const weekdayAverage = (
  points: Array<{period: string; value: number}>,
  targetDate: string,
): number => {
  const targetWeekday = weekdayOf(targetDate);
  const same = points.filter(point => weekdayOf(point.period) === targetWeekday).map(point => point.value);
  if (same.length) {
    return round2(average(same));
  }
  return round2(average(points.map(point => point.value)));
};

export interface ForecastInventoryNeedOptions {
  days?: number;
  phrase?: string;
  targetDate?: string;
  prompt?: string;
  store?: string;
  localEvents?: LocalEventInput[];
}

export const forecastInventoryNeed = async (
  db: DbClient,
  options: ForecastInventoryNeedOptions = {},
) => {
  const horizon = resolveDemandHorizon({
    phrase: options.phrase,
    targetDate: options.targetDate,
    days: options.days,
    prompt: options.prompt,
  });
  const historyRange = historyQueryRange(DEMAND_HISTORY_DAYS);
  const storeKey = options.store ? normalizeKey(options.store) : undefined;

  const [context, perItem, items, ledgerNets] = await Promise.all([
    getDemandContext(db, {dates: horizon.dates, localEvents: options.localEvents}),
    getPerItemDailyConsumption(db, historyRange),
    unwrapQueryResult<{
      id: unknown;
      name?: string;
      code?: string;
      uom?: string;
      reorder_levels?: Record<string, number>;
    }>(await db.query(`SELECT id, name, code, uom, reorder_levels FROM ${Tables.inventory_items}`)),
    fetchLedgerNetsByStore(db as any),
  ]);

  const itemByKey = new Map<string, (typeof items)[0]>();
  items.forEach(item => {
    const full = recordToString(item.id);
    itemByKey.set(full, item);
    itemByKey.set(normalizeKey(full), item);
  });

  const onHandByItem = new Map<string, number>();
  const maxReorderByItem = new Map<string, number>();
  ledgerNets.forEach(row => {
    if (storeKey && normalizeKey(row.locationId) !== storeKey) {
      return;
    }
    const itemKey = normalizeKey(row.itemId);
    onHandByItem.set(itemKey, (onHandByItem.get(itemKey) || 0) + row.net);
    const item = itemByKey.get(row.itemId) || itemByKey.get(itemKey);
    const reorder = getReorderLevelForStore(item as any, row.locationId);
    if (reorder > 0) {
      maxReorderByItem.set(itemKey, Math.max(maxReorderByItem.get(itemKey) || 0, reorder));
    }
  });

  const dayByDate = new Map(context.days.map(day => [day.date, day]));
  const mapped = Array.from(perItem.entries()).map(([key, entry]) => {
    const meta = itemByKey.get(key);
    const onHand = round2(onHandByItem.get(key) || 0);
    const reorderLevel = maxReorderByItem.get(key) || undefined;
    const firstDate = horizon.dates[0];
    const prior = firstDate ? priorSameWeekday(entry.points, firstDate) : {value: 0};
    const typical = firstDate ? weekdayAverage(entry.points, firstDate) : round2(average(entry.points.map(p => p.value)));

    const dailyNeed = horizon.dates.map(date => {
      const baselineQty = weekdayAverage(entry.points, date);
      const day = dayByDate.get(date);
      const multiplier = day?.multiplier ?? 1;
      const adjustedQty = round2(baselineQty * multiplier);
      const priorForDay = priorSameWeekday(entry.points, date);
      return {
        date,
        weekday: weekdayName(date),
        baselineQty,
        adjustedQty,
        priorSameWeekdayActual: priorForDay.value,
        priorSameWeekdayDate: priorForDay.date,
        drivers: day?.drivers ?? [],
      };
    });

    const totalNeed = round2(dailyNeed.reduce((sum, row) => sum + row.adjustedQty, 0));
    const shortfall = round2(Math.max(0, totalNeed - onHand));
    const reorderGap = reorderLevel != null ? round2(Math.max(0, reorderLevel - onHand)) : 0;
    const suggestedPurchaseQty = round2(Math.max(shortfall, reorderGap));
    const avgDaily = dailyNeed.length ? totalNeed / dailyNeed.length : 0;
    const daysOfCover = avgDaily > 0 ? round2(onHand / avgDaily) : onHand > 0 ? 99 : 0;
    let reason = `Need ${totalNeed} vs on-hand ${onHand}`;
    if (reorderGap > shortfall && reorderLevel != null) {
      reason = `Need ${totalNeed} vs on-hand ${onHand}; reorder level ${reorderLevel}`;
    }

    return {
      itemId: recordToString(meta?.id) || key,
      itemName: meta?.name || entry.name,
      unit: meta?.uom || entry.uom,
      onHand,
      reorderLevel,
      priorSameWeekdayActual: prior.value,
      priorSameWeekdayDate: prior.date,
      weekdayAverage: typical,
      dailyNeed,
      totalNeed,
      shortfall,
      suggestedPurchaseQty,
      daysOfCover,
      purchaseReason: reason,
    };
  });

  mapped.sort((a, b) => b.totalNeed - a.totalNeed || b.suggestedPurchaseQty - a.suggestedPurchaseQty);
  const mustKeep = mapped.filter(row => row.suggestedPurchaseQty > 0);
  const rest = mapped.filter(row => row.suggestedPurchaseQty <= 0);
  const capped = [...mustKeep, ...rest].slice(0, ITEM_CAP);

  const purchaseList = capped
    .filter(row => row.suggestedPurchaseQty > 0)
    .map(row => ({
      itemName: row.itemName,
      unit: row.unit,
      suggestedPurchaseQty: row.suggestedPurchaseQty,
      reason: row.purchaseReason,
    }));

  const method = horizon.mode === "day"
    ? "Same-weekday average (last 28 days) vs last same weekday actual, adjusted for holidays/weather/prompt events; purchase = max(need − on-hand, reorder − on-hand)."
    : "Same-weekday average over the next days (28-day history), adjusted for holidays/weather/prompt events; purchase = max(need − on-hand, reorder − on-hand).";

  const pointCount = Array.from(perItem.values()).reduce((max, entry) => Math.max(max, entry.points.length), 0);
  const confidenceNote = pointCount < 7
    ? "Low confidence: fewer than 7 days of consumption history."
    : pointCount < 14
      ? "Low confidence: less than 14 days of history."
      : "Moderate confidence based on same-weekday averages. Projections are estimates.";

  return {
    found: perItem.size > 0,
    mode: horizon.mode,
    targetDate: horizon.targetDate,
    horizonDays: horizon.horizonDays,
    historyDays: DEMAND_HISTORY_DAYS,
    items: capped.map(({purchaseReason: _reason, ...row}) => row),
    purchaseList,
    context: {
      ...context,
      warnings: [...horizon.warnings, ...context.warnings],
    },
    method,
    confidenceNote,
  };
};
