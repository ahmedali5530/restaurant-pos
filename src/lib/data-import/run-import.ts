import type {
  ImportConfiguration,
  ImportRecord,
  ImportRowContext,
  ImportSummary,
} from "@/lib/data-import/types.ts";
import type {CsvImportMode} from "@/utils/csv-import.ts";
import {throwIfAborted} from "@/lib/data-import/abort.ts";
import {ensureCreatedReferences} from "@/lib/data-import/resolve-refs.ts";
import {recordHasBlockingErrors} from "@/lib/data-import/validate.ts";

export type RunImportOptions = {
  mode?: CsvImportMode;
  matchFields?: string[];
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
};

/**
 * Sequentially import validated review rows via config.onImportRow.
 * Creates missing linked references (strategy create) before each row handler.
 * Rows with blocking errors are counted as failed without calling the handler.
 * Skipped rows are counted as skipped.
 */
export async function runImport(
  config: ImportConfiguration,
  records: ImportRecord[],
  options: RunImportOptions = {}
): Promise<ImportSummary> {
  const mode = options.mode ?? config.defaultMode ?? "create";
  const matchFields =
    mode === "create"
      ? []
      : (options.matchFields ?? config.matchFields ?? []);
  const total = records.length;

  const summary: ImportSummary = {
    total,
    imported: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (let index = 0; index < records.length; index++) {
    throwIfAborted(options.signal);
    options.onProgress?.(index + 1, total);

    const record = records[index];
    if (record.skipped) {
      summary.skipped += 1;
      continue;
    }

    if (recordHasBlockingErrors(record)) {
      summary.failed += 1;
      const msg =
        record.issues.find((i) => i.severity === "error")?.message ||
        "Validation failed";
      summary.errors.push({index, message: msg});
      continue;
    }

    const ctx: ImportRowContext = {mode, matchFields, index};
    try {
      await ensureCreatedReferences(config, record);
      await config.onImportRow(record, ctx);
      summary.imported += 1;
    } catch (err: any) {
      summary.failed += 1;
      summary.errors.push({
        index,
        message: err?.message || String(err) || "Import failed",
      });
    }
  }

  return summary;
}
