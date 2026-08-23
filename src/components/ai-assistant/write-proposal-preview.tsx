import {useMemo} from "react";
import {useTranslation} from "react-i18next";
import {FixedSizeList} from "react-window";
import type {ImportRecord} from "@/lib/data-import/types.ts";
import type {WriteProposal} from "@/lib/ai/tools/write-tools.ts";

const ROW_HEIGHT = 40;
const VISIBLE_ROWS = 8;

/** Field order/labels shown in the preview table — mirrors dish.import.config.ts's fields. */
const DISH_COLUMNS: Array<{key: string; label: string}> = [
  {key: "number", label: "#"},
  {key: "name", label: "Name"},
  {key: "categories", label: "Categories"},
  {key: "price", label: "Price"},
  {key: "cost", label: "Cost"},
  {key: "tax", label: "Tax"},
];

const formatCell = (key: string, value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "categories" && Array.isArray(value)) {
    return value
      .map((ref: any) => (ref?.create ? `${ref.label} (new)` : ref?.label))
      .filter(Boolean)
      .join(", ") || "—";
  }
  if (key === "tax") {
    const ref = value as {label?: string; create?: boolean} | null;
    if (!ref?.label) return "—";
    return ref.create ? `${ref.label} (new)` : ref.label;
  }
  return String(value);
};

/**
 * Full line-by-line review of every proposed row — no summarizing, per
 * Ahmed's explicit ask ("we don't want any surprises and silent updates").
 * Virtualized (react-window) since bulk edits can be large.
 */
export function WriteProposalPreview({proposal}: {proposal: WriteProposal}) {
  const {t} = useTranslation("common");

  const rowHasError = (record: ImportRecord) => record.issues.some(i => i.severity === "error");
  const rowWarnings = (record: ImportRecord) =>
    record.issues.filter(i => i.severity === "warning").map(i => i.message);

  const errorCount = useMemo(
    () => proposal.records.filter(rowHasError).length,
    [proposal.records],
  );

  const Row = ({index, style}: {index: number; style: React.CSSProperties}) => {
    const record = proposal.records[index];
    const hasError = rowHasError(record);
    const warnings = rowWarnings(record);
    const errorMessages = record.issues.filter(i => i.severity === "error").map(i => i.message);

    return (
      <div
        style={style}
        className={`flex items-center border-b border-gray-100 px-2 text-sm ${hasError ? "bg-danger-100" : ""}`}
        title={[...errorMessages, ...warnings].join("; ") || undefined}
      >
        <div className="w-6 shrink-0 text-gray-400">{index + 1}</div>
        {DISH_COLUMNS.map(col => (
          <div key={col.key} className="flex-1 truncate pr-2">
            {formatCell(col.key, record.values[col.key])}
          </div>
        ))}
        <div className="w-40 shrink-0 truncate text-xs">
          {hasError && <span className="text-danger-600">{errorMessages.join("; ")}</span>}
          {!hasError && warnings.length > 0 && (
            <span className="text-warning-600">{warnings.join("; ")}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div className="flex items-center px-2 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600">
        <div className="w-6 shrink-0">#</div>
        {DISH_COLUMNS.map(col => (
          <div key={col.key} className="flex-1">{col.label}</div>
        ))}
        <div className="w-40 shrink-0">{t("aiAssistant.issues", {defaultValue: "Issues"})}</div>
      </div>
      <FixedSizeList
        height={Math.min(proposal.records.length, VISIBLE_ROWS) * ROW_HEIGHT || ROW_HEIGHT}
        itemCount={proposal.records.length}
        itemSize={ROW_HEIGHT}
        width="100%"
      >
        {Row}
      </FixedSizeList>
      <div className="px-2 py-1.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        {/* "row(s)" pluralizes safely for any entityLabel; naively appending "s" to the
            label itself breaks for most entities (Dish -> "dishs", Category -> "categorys"). */}
        {proposal.records.length} {proposal.entityLabel} row{proposal.records.length === 1 ? "" : "s"} · {proposal.mode}
        {errorCount > 0 && (
          <span className="text-danger-600 ml-2">
            {errorCount} row{errorCount === 1 ? "" : "s"} will be skipped (blocking errors)
          </span>
        )}
      </div>
    </div>
  );
}
