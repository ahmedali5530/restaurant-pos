import { useMemo, useSyncExternalStore } from "react";
import { ToHumanDurationOptions } from "luxon";
import { DateInput, nowInAppTimezone, toLuxonDateTime } from "@/lib/datetime.ts";

interface Props {
  time: DateInput
  showAll?: boolean
}

const listeners = new Set<() => void>();
let tick = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function emit() {
  tick += 1;
  for (const listener of listeners) listener();
}

function startClock() {
  if (timer != null || listeners.size === 0) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  timer = setInterval(emit, 1000);
}

function stopClock() {
  if (timer == null) return;
  clearInterval(timer);
  timer = null;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopClock();
      return;
    }
    emit();
    startClock();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startClock();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopClock();
  };
}

function getSnapshot() {
  return tick;
}

const humanFormat: ToHumanDurationOptions = {
  unitDisplay: 'narrow',
  maximumFractionDigits: 0,
};

function formatElapsed(time: DateInput, showAll: boolean | undefined): string {
  const startedAt = toLuxonDateTime(time);
  const now = nowInAppTimezone();
  if (showAll) {
    return now.diff(startedAt).shiftTo('hours', 'minutes', 'seconds').toHuman(humanFormat);
  }
  const hours = now.diff(startedAt).as('hours');
  if (hours < 1) {
    return now.diff(startedAt).shiftTo('minutes', 'seconds').toHuman(humanFormat);
  }
  return now.diff(startedAt).shiftTo('hours', 'minutes').toHuman(humanFormat);
}

export const Countdown = ({ time, showAll }: Props) => {
  const nowTick = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const diff = useMemo(
    () => formatElapsed(time, showAll),
    [time, showAll, nowTick],
  );

  return (
    <span className="tabular-nums">{diff}</span>
  );
};
