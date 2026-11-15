import type {Dish} from "@/api/model/dish.ts";
import type {QuickOrderDishSuggestion} from "@/lib/quick-order-scan.ts";
import {cn, withCurrency} from "@/lib/utils.ts";
import {useTranslation} from "react-i18next";

interface Props {
  suggestions: QuickOrderDishSuggestion[];
  activeIndex: number;
  onHover: (index: number) => void;
  onSelect: (dish: Dish) => void;
}

export const QuickOrderScanSuggestions = ({
  suggestions,
  activeIndex,
  onHover,
  onSelect,
}: Props) => {
  const {t} = useTranslation(["quick-order"]);

  if (!suggestions.length) {
    return null;
  }

  return (
    <ul
      className="absolute z-30 left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-surface-elevated shadow-lg"
      data-testid="quick-order-scan-suggestions"
      data-quick-order-scan-suggestions="true"
      role="listbox"
    >
      {suggestions.map((row, index) => {
        const dish = row.dish;
        const number =
          typeof dish.number === "string"
            ? dish.number.trim()
            : String(dish.number ?? "").trim();
        const barcode =
          typeof dish.barcode === "string" ? dish.barcode.trim() : "";
        const meta =
          row.matchedOn === "name"
            ? number || barcode
            : row.matchedOn === "number"
              ? barcode || number
              : number || barcode;

        return (
          <li key={String(dish.id)} role="option" aria-selected={index === activeIndex}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface",
                index === activeIndex && "bg-primary/10",
              )}
              data-testid={`quick-order-scan-suggestion-${String(dish.id)}`}
              onMouseEnter={() => onHover(index)}
              onMouseDown={(e) => {
                // Keep focus reclaim from stealing the click before onClick.
                e.preventDefault();
              }}
              onClick={() => onSelect(dish)}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">
                  {dish.name}
                </span>
                <span className="block truncate text-xs text-muted">
                  {meta
                    ? t("quick-order:scan.suggestionMeta", {
                        meta,
                        match: t(`quick-order:scan.match.${row.matchedOn}`),
                      })
                    : t(`quick-order:scan.match.${row.matchedOn}`)}
                </span>
              </span>
              <span className="shrink-0 font-medium text-foreground">
                {withCurrency(Number(dish.price) || 0)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
