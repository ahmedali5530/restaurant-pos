import {cn} from "@/lib/utils.ts";
import type {AiKpiTone, AiKpiWidget} from "@/lib/ai/kpi-widgets.ts";

const TONE_CLASSES: Record<AiKpiTone, string> = {
  neutral: "border-border bg-surface-elevated",
  success: "border-success-300 bg-success-50 dark:border-success-700 dark:bg-success-950/40",
  warning: "border-warning-300 bg-warning-50 dark:border-warning-700 dark:bg-warning-950/40",
  danger: "border-danger-400 bg-danger-50 dark:border-danger-700 dark:bg-danger-950/40",
  info: "border-info-300 bg-info-50 dark:border-info-700 dark:bg-info-950/40",
};

const VALUE_CLASSES: Record<AiKpiTone, string> = {
  neutral: "text-foreground",
  success: "text-success-800 dark:text-success-300",
  warning: "text-warning-800 dark:text-warning-300",
  danger: "text-danger-800 dark:text-danger-300",
  info: "text-info-800 dark:text-info-300",
};

type Props = {
  widgets: AiKpiWidget[];
  compact?: boolean;
};

export function AiKpiWidgets({widgets, compact}: Props) {
  if (!widgets.length) return null;

  return (
    <div
      className={cn(
        "grid gap-2",
        compact ? "my-2 grid-cols-2" : "my-3 grid-cols-2 sm:grid-cols-3",
      )}
    >
      {widgets.map((widget, index) => (
        <div
          key={`${widget.label}-${index}`}
          className={cn(
            "rounded-lg border px-3 py-2 shadow-sm",
            TONE_CLASSES[widget.tone],
            compact ? "min-w-0" : "min-w-0",
          )}
        >
          <div className={cn(
            "font-medium uppercase tracking-wide text-muted",
            compact ? "text-[10px] leading-tight" : "text-xs",
          )}>
            {widget.label}
          </div>
          <div className={cn(
            "mt-0.5 font-bold tabular-nums leading-tight",
            VALUE_CLASSES[widget.tone],
            compact ? "text-base" : "text-xl",
          )}>
            {widget.value}
          </div>
          {widget.hint ? (
            <div className={cn(
              "mt-1 text-muted",
              compact ? "text-[10px] leading-snug" : "text-xs",
            )}>
              {widget.hint}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
