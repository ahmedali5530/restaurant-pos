import type {ImportDbLike} from "@/lib/data-import/types.ts";
import type {ImportSummary} from "@/lib/data-import/types.ts";
import {runImport} from "@/lib/data-import/run-import.ts";
import {createDishImportConfig} from "@/components/settings/dishes/dish.import.config.ts";
import type {TFunc, WriteProposal} from "@/lib/ai/tools/write-tools.ts";

/**
 * The ONLY function in the write path allowed to persist changes. Call this
 * exclusively from the widget's explicit Confirm action, after the user has
 * reviewed the full line-by-line proposal (WriteProposal.records) — never
 * from the assistant chat loop automatically.
 *
 * Records with blocking errors are skipped by runImport itself (counted as
 * failed), so it's still safe to call even if the caller forgot to check
 * hasBlockingErrors — but the widget should block the Confirm button on it
 * so the user isn't surprised by partial application.
 */
export async function commitWriteProposal(
  db: ImportDbLike,
  t: TFunc,
  proposal: WriteProposal,
  options: {signal?: AbortSignal; onProgress?: (current: number, total: number) => void} = {},
): Promise<ImportSummary> {
  if (proposal.configId !== "dishes") {
    throw new Error(`No write executor registered for config "${proposal.configId}"`);
  }

  const config = createDishImportConfig({db, t});

  return runImport(config, proposal.records, {
    mode: proposal.mode,
    signal: options.signal,
    onProgress: options.onProgress,
  });
}
