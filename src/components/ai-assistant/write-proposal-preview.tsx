import {useMemo, useRef} from "react";
import {useTranslation} from "react-i18next";
import {useVirtualizer} from "@tanstack/react-virtual";
import {useDB} from "@/api/db/db.ts";
import type {ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import type {WriteProposal} from "@/lib/ai/tools/write-tools.ts";
import {getWriteRegistryEntryByConfigId} from "@/lib/ai/tools/write-tool-registry.ts";
import {formatImportDisplayValue} from "@/lib/data-import/format-display-value.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";

const ROW_HEIGHT = 40;
const VISIBLE_ROWS = 8;

type WriteProposalPreviewProps = {
  proposal: WriteProposal;
};

/**
 * Full line-by-line review of every proposed row — no summarizing.
 * Columns are driven by ImportConfiguration.fields via the write registry.
 * Virtualized with TanStack Virtual since bulk edits can be large.
 */
export function WriteProposalPreview({proposal}: WriteProposalPreviewProps) {
  const {t} = useTranslation("common");
  const db = useDB() as unknown as ImportDbLike;
  const parentRef = useRef<HTMLDivElement>(null);

  const entry = getWriteRegistryEntryByConfigId(proposal.configId);
  const config = useMemo(() => {
    if (!entry) return null;
    return entry.createConfig({db, t});
  }, [entry, db, t]);

  const columns: ImportField[] = useMemo(() => {
    if (!config) return [];
    const fieldMap = new Map(config.fields.map(f => [f.name, f]));
    return proposal.fieldNames
      .map(name => fieldMap.get(name))
      .filter((f): f is ImportField => f !== undefined);
  }, [config, proposal.fieldNames]);

  const rowHasError = (record: ImportRecord) => record.issues.some(i => i.severity === "error");
  const rowWarnings = (record: ImportRecord) =>
    record.issues.filter(i => i.severity === "warning").map(i => i.message);

  const errorCount = useMemo(
    () => proposal.records.filter(rowHasError).length,
    [proposal.records],
  );

  const virtualizer = useVirtualizer({
    count: proposal.records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  const listHeight = Math.min(proposal.records.length, VISIBLE_ROWS) * ROW_HEIGHT || ROW_HEIGHT;

  if (!config || columns.length === 0) {
    return (
      <div className="text-sm text-danger-600">
        {t("aiAssistant.unknownConfig", {defaultValue: "Unknown import configuration for preview."})}
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div className="flex items-center px-2 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600">
        <div className="w-6 shrink-0">#</div>
        {columns.map(col => (
          <div key={col.name} className="flex-1 min-w-0 truncate pr-2">{col.label}</div>
        ))}
        <div className="w-40 shrink-0">{t("aiAssistant.issues", {defaultValue: "Issues"})}</div>
      </div>

      <div ref={parentRef} style={{height: listHeight, overflow: "auto"}}>
        <div style={{height: virtualizer.getTotalSize(), position: "relative", width: "100%"}}>
          {virtualizer.getVirtualItems().map(virtualRow => {
            const record = proposal.records[virtualRow.index];
            const hasError = rowHasError(record);
            const warnings = rowWarnings(record);
            const errorMessages = record.issues
              .filter(i => i.severity === "error")
              .map(i => i.message);

            return (
              <div
                key={record.clientId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`flex items-center border-b border-gray-100 px-2 text-sm ${hasError ? "bg-danger-100" : ""}`}
                title={[...errorMessages, ...warnings].join("; ") || undefined}
              >
                <div className="w-6 shrink-0 text-gray-400">{virtualRow.index + 1}</div>
                {columns.map(col => (
                  <div key={col.name} className="flex-1 min-w-0 truncate pr-2">
                    {formatImportDisplayValue(col, record.values[col.name], t)}
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
          })}
        </div>
      </div>

      <div className="px-2 py-1.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
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
