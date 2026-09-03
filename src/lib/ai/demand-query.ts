import {
  resolveDemandHorizon,
  toIsoDate,
  upcomingWeekday,
} from "@/api/reports/demand/horizon.ts";
import type {LocalEventInput} from "@/api/reports/demand/types.ts";
import {DateTime} from "luxon";
import {getAppTimezone} from "@/lib/datetime.ts";

const WEEKDAY_TO_NUM: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

const hasInventoryWord = /\b(inventory|stock|ingredient)\b/i;
const hasNeedWord = /\b(need(?:ed)?|required|require|restock|prep(?:are)?)\b/i;

/** Coming-days / named-day inventory qty + purchase suggestion (not consumption trend). */
export const isInventoryNeedPrompt = (prompt: string): boolean => {
  if (!prompt.trim()) {
    return false;
  }
  if (/\bconsumption\b/i.test(prompt) && !hasNeedWord.test(prompt) && !/\bhow much\b/i.test(prompt)) {
    return false;
  }
  if (/\bhow much (inventory|stock)\b/i.test(prompt)) {
    return true;
  }
  if (/\bwhat should i (buy|purchase|order|restock)\b/i.test(prompt)) {
    return true;
  }
  if (hasInventoryWord.test(prompt) && hasNeedWord.test(prompt)) {
    return true;
  }
  if (/\b(prep(?:are)? for (the )?next|inventory for (the )?next)\b/i.test(prompt)) {
    return true;
  }
  return false;
};

export const isStaffNeedPrompt = (prompt: string): boolean => {
  if (!prompt.trim()) {
    return false;
  }
  if (/\b(labor|labour)\s+(cost|percent|%|overtime|payroll|trend)\b/i.test(prompt)
    && !/\b(how many|headcount|staff needed)\b/i.test(prompt)) {
    return false;
  }
  return /\b(how many (staff|people|employees|workers)|staff needed|staff required|headcount|how many people (do i|should i)|staff for (this|next|tomorrow)|how many (staff|people).*(need|schedule|friday|saturday|sunday|monday))\b/i.test(prompt);
};

export const extractLocalEventsFromPrompt = (prompt: string): LocalEventInput[] => {
  const liftMatch = prompt.match(/(\d+)\s*%\s*(?:busier|more|higher|lift|increase)?/i);
  const liftPct = liftMatch ? Number(liftMatch[1]) : undefined;
  const eventMatch = prompt.match(
    /\b((?:[A-Za-z0-9][A-Za-z0-9'&-]*\s+){0,5}(?:concert|festival|match|final|cricket|wedding|parade|game|tournament|fair|carnival|eid|holiday|event|closure|road\s+closure))\b/i,
  );
  if (!eventMatch && liftPct == null) {
    return [];
  }
  if (!eventMatch && liftPct != null && !/\b(busier|expect|event|festival|concert|match)\b/i.test(prompt)) {
    return [];
  }

  const name = (eventMatch?.[1] || "Local demand note").replace(/\s+/g, " ").trim();
  const now = DateTime.now().setZone(getAppTimezone());
  let startDate: string | undefined;
  let endDate: string | undefined;

  if (/\bweekend\b/i.test(prompt)) {
    const saturday = upcomingWeekday(6, now);
    startDate = saturday.toISODate() ?? undefined;
    endDate = saturday.plus({days: 1}).toISODate() ?? undefined;
  } else {
    const dayMatch = prompt.match(/\b(this|next|coming)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
    if (dayMatch) {
      const weekday = WEEKDAY_TO_NUM[dayMatch[2].toLowerCase()];
      if (weekday) {
        startDate = upcomingWeekday(weekday, now, dayMatch[1]?.toLowerCase() === "next").toISODate() ?? undefined;
        endDate = startDate;
      }
    } else if (/\btomorrow\b/i.test(prompt)) {
      startDate = now.plus({days: 1}).toISODate() ?? undefined;
      endDate = startDate;
    }
  }

  return [{
    name,
    startDate,
    endDate,
    liftPct,
  }];
};

export const parseLocalEventsArg = (value: unknown): LocalEventInput[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((row: any) => ({
      name: String(row?.name ?? "").trim(),
      startDate: toIsoDate(row?.startDate ?? row?.date),
      endDate: toIsoDate(row?.endDate ?? row?.date),
      liftPct: row?.liftPct != null ? Number(row.liftPct) : undefined,
    }))
    .filter(row => row.name);
};

export const resolveInventoryNeedArgsFromPrompt = (prompt: string) => {
  const horizon = resolveDemandHorizon({prompt});
  return {
    days: horizon.horizonDays,
    phrase: horizon.mode === "day" ? undefined : undefined,
    targetDate: horizon.targetDate,
    prompt,
    localEvents: extractLocalEventsFromPrompt(prompt),
  };
};

export const resolveStaffNeedArgsFromPrompt = (prompt: string) => resolveInventoryNeedArgsFromPrompt(prompt);
