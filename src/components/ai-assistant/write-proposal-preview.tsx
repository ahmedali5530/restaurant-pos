import {useMemo, useRef} from "react";
import {useTranslation} from "react-i18next";
import {useVirtualizer} from "@tanstack/react-virtual";
import {useDB} from "@/api/db/db.ts";
import type {ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import type {WriteProposal} from "@/lib/ai/tools/write-tools.ts";
import {getWriteRegistryEntryByConfigId} from "@/lib/ai/tools/write-tool-registry.ts";
import {formatImportDisplayValue} from "@/lib/data-import/format-display-value.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";
import {
  selectPreviewFields,
  shouldUseCardPreviewLayout,
} from "@/components/ai-assistant/write-proposal-preview.helpers.ts";

const ROW_HEIGHT = 40;
const VISIBLE_ROWS = 8;

type WriteProposalPreviewProps = {
  proposal: WriteProposal;
};

const RecordIssues = ({
  record,
  t,
}: {
  record: ImportRecord;
  t: (key: string, options?: Record<string, unknown>) => string;
}) => {
  const errorMessages = record.issues
    .filter(issue => issue.severity === "error")
    .map(issue => issue.message);
  const warnings = record.issues
    .filter(issue => issue.severity === "warning")
    .map(issue => issue.message);

  if (!errorMessages.length && !warnings.length) return null;

  return (
    <div className="mt-2 border-t border-neutral-200 pt-2 text-xs">
      {errorMessages.length > 0 && (
        <div className="text-danger-600">{errorMessages.join("; ")}</div>
      )}
      {warnings.length > 0 && (
        <div className="text-warning-600">{warnings.join("; ")}</div>
      )}
    </div>
  );
};

function ProposalRecordCard({
  index,
  record,
  columns,
  matchFields,
  t,
}: {
  index: number;
  record: ImportRecord;
  columns: ImportField[];
  matchFields: string[];
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const fields = selectPreviewFields(columns, record, matchFields);
  const hasError = record.issues.some(issue => issue.severity === "error");

  return (
    <div
      className={`rounded-md border border-neutral-200 bg-white p-2 ${hasError ? "border-danger-300 bg-danger-50" : ""}`}
    >
      <div className="mb-2 text-xs font-semibold text-neutral-700">
        #{index + 1}
      </div>
      <dl className="grid grid-cols-1 gap-1.5">
        {fields.map(col => (
          <div
            key={col.name}
            className="grid grid-cols-[minmax(8rem,42%)_1fr] gap-x-3 gap-y-0.5 text-xs"
          >
            <dt className="truncate text-neutral-500" title={col.label}>
              {col.label}
            </dt>
            <dd className="break-words text-neutral-900">
              {formatImportDisplayValue(col, record.values[col.name], t)}
            </dd>
          </div>
        ))}
      </dl>
      <RecordIssues record={record} t={t} />
    </div>
  );
}

/**
 * Line-by-line review of proposed rows. Wide configs (e.g. discounts) use a
 * vertical card layout instead of squeezing dozens of columns into one row.
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

  const matchFields = config?.matchFields ?? [];
  const useCardLayout = shouldUseCardPreviewLayout(columns.length);

  const rowHasError = (record: ImportRecord) => record.issues.some(i => i.severity === "error");

  const errorCount = useMemo(
    () => proposal.records.filter(rowHasError).length,
    [proposal.records],
  );

  const tableColumns = useMemo(() => {
    if (useCardLayout || proposal.records.length === 0) return columns;
    return selectPreviewFields(columns, proposal.records[0], matchFields);
  }, [useCardLayout, columns, proposal.records, matchFields]);

  const virtualizer = useVirtualizer({
    count: useCardLayout ? 0 : proposal.records.length,
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

  if (useCardLayout) {
    return (
      <div className="overflow-hidden rounded-md border border-neutral-200">
        <div className="max-h-72 space-y-2 overflow-y-auto p-2">
          {proposal.records.map((record, index) => (
            <ProposalRecordCard
              key={record.clientId}
              index={index}
              record={record}
              columns={columns}
              matchFields={matchFields}
              t={t}
            />
          ))}
        </div>
        <div className="border-t border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs text-neutral-600">
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

  return (
    <div className="overflow-hidden rounded-md border border-neutral-200">
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-center border-b border-neutral-200 bg-neutral-900 px-2 py-1.5 text-xs font-medium text-warning-500">
          <div className="w-6 shrink-0">#</div>
          {tableColumns.map(col => (
            <div key={col.name} className="w-28 shrink-0 truncate pr-2">{col.label}</div>
          ))}
          <div className="w-40 shrink-0">{t("aiAssistant.issues", {defaultValue: "Issues"})}</div>
        </div>

        <div ref={parentRef} style={{height: listHeight, overflow: "auto"}}>
          <div style={{height: virtualizer.getTotalSize(), position: "relative", width: "100%"}}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const record = proposal.records[virtualRow.index];
              const hasError = rowHasError(record);
              const rowColumns = selectPreviewFields(columns, record, matchFields);
              const errorMessages = record.issues
                .filter(i => i.severity === "error")
                .map(i => i.message);
              const warnings = record.issues
                .filter(i => i.severity === "warning")
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
                  className={`flex min-w-max items-center border-b border-neutral-100 px-2 text-sm ${hasError ? "bg-danger-100" : ""}`}
                  title={[...errorMessages, ...warnings].join("; ") || undefined}
                >
                  <div className="w-6 shrink-0 text-neutral-400">{virtualRow.index + 1}</div>
                  {tableColumns.map(col => (
                    <div key={col.name} className="w-28 shrink-0 truncate pr-2">
                      {rowColumns.some(field => field.name === col.name)
                        ? formatImportDisplayValue(col, record.values[col.name], t)
                        : "—"}
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
      </div>

      <div className="border-t border-neutral-200 bg-neutral-50 px-2 py-1.5 text-xs text-neutral-600">
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
