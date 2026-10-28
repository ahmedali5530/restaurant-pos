import {finalizeStructured, runImportPipeline} from "@/lib/data-import/pipeline.ts";
import type {
  ColumnMapping,
  ImportConfiguration,
  ImportIssue,
  ImportRecord,
  PipelineOptions,
  StructuredExtractResult,
} from "@/lib/data-import/types.ts";

export type CleanseIssuesSummary = {
  totalRows: number;
  readyRows: number;
  skippedRows: number;
  errorRows: number;
  warningRows: number;
  unresolvedRefs: number;
  /** Up to 20 sample issue lines for chat summary. */
  samples: Array<{row: number; severity: string; message: string; field?: string}>;
};

export type CleanseImportResult = {
  records: ImportRecord[];
  mapping?: ColumnMapping;
  structured?: StructuredExtractResult;
  issuesSummary: CleanseIssuesSummary;
  /** True when column mapping needed review but was auto-accepted for cleanse. */
  mappingAutoAccepted?: boolean;
};

const countIssues = (records: ImportRecord[]): CleanseIssuesSummary => {
  let readyRows = 0;
  let skippedRows = 0;
  let errorRows = 0;
  let warningRows = 0;
  let unresolvedRefs = 0;
  const samples: CleanseIssuesSummary["samples"] = [];

  records.forEach((record, index) => {
    if (record.skipped) {
      skippedRows += 1;
      return;
    }
    const errors = record.issues.filter((i: ImportIssue) => i.severity === "error");
    const warnings = record.issues.filter((i: ImportIssue) => i.severity === "warning");
    if (errors.length) {
      errorRows += 1;
    } else if (warnings.length) {
      warningRows += 1;
    } else {
      readyRows += 1;
    }
    for (const issue of record.issues) {
      if (issue.code === "unresolved_reference" || issue.code === "ambiguous_reference") {
        unresolvedRefs += 1;
      }
      if (samples.length < 20) {
        samples.push({
          row: index + 1,
          severity: issue.severity,
          message: issue.message,
          field: issue.field,
        });
      }
    }
  });

  return {
    totalRows: records.length,
    readyRows,
    skippedRows,
    errorRows,
    warningRows,
    unresolvedRefs,
    samples,
  };
};

/**
 * Headless cleanse: parse → map → normalize → validate (fuzzy match).
 * Never writes to the DB. On mapping_required, auto-accepts the best-effort map.
 */
export async function cleanseImportFile(
  config: ImportConfiguration,
  file: File,
  options: PipelineOptions = {},
): Promise<CleanseImportResult> {
  const phase = await runImportPipeline(config, file, options);

  if (phase.phase === "ready") {
    return {
      records: phase.records,
      mapping: phase.mapping,
      structured: phase.structured,
      issuesSummary: countIssues(phase.records),
    };
  }

  // mapping_required — finalize with auto-map so the assistant path never blocks on UI.
  const finalized = await finalizeStructured(
    config,
    phase.structured,
    phase.mapping,
    options,
  );
  return {
    records: finalized.records,
    mapping: finalized.mapping,
    structured: finalized.structured,
    issuesSummary: countIssues(finalized.records),
    mappingAutoAccepted: true,
  };
}
