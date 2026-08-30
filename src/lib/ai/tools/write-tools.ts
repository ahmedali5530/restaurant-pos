import type {ImportConfiguration, ImportDbLike, ImportRecord} from "@/lib/data-import/types.ts";
import {normalizeRecords} from "@/lib/data-import/normalize.ts";
import {validateRecords} from "@/lib/data-import/validate.ts";
import type {CsvImportMode} from "@/utils/csv-import.ts";
import {
  getWriteRegistryEntry,
  getWriteModeForTool,
} from "@/lib/ai/tools/write-tool-registry.ts";

export type TFunc = (key: string, options?: any) => string;

export type WriteProposal = {
  /** Stable id for correlating a confirm/cancel click back to this proposal. */
  proposalId: string;
  toolName: string;
  configId: string;
  entityLabel: string;
  mode: CsvImportMode;
  records: ImportRecord[];
  /** Snapshot of field names at proposal time for stable preview columns. */
  fieldNames: string[];
  /** True if any record has a blocking (severity: "error") issue — commit must be disabled. */
  hasBlockingErrors: boolean;
};

let proposalSeq = 0;
const nextProposalId = () => `wp_${Date.now()}_${proposalSeq++}`;

const recordHasError = (record: ImportRecord) =>
  record.issues.some(issue => issue.severity === "error");

/**
 * validateRecord() (validate.ts) only checks ImportField.required — match
 * fields like dish.import.config's "number" aren't marked required (it's
 * optional/auto-assigned on create), so a missing match value on an UPDATE
 * row sails through validation clean and only fails later, per-row, inside
 * runImport's assertCsvMatchValues (write-executor.ts's commit path) — after
 * the user already confirmed a preview that showed no errors. Flag it here
 * instead, at proposal time, so the preview is the actual ground truth.
 */
function flagMissingMatchFields(config: ImportConfiguration, mode: CsvImportMode, records: ImportRecord[]): void {
  if (mode === "create") return;
  const matchFields = config.matchFields ?? [];
  if (matchFields.length === 0) return;

  for (const record of records) {
    for (const field of matchFields) {
      const value = record.values[field];
      const empty = value === null || value === undefined || String(value).trim() === "";
      if (empty) {
        record.issues.push({
          field,
          code: "required",
          severity: "error",
          message: `"${field}" is required to match the row to update`,
        });
      }
    }
  }
}

/**
 * Builds a write proposal from raw AI tool-call args: normalize -> resolve
 * references -> validate. Never writes to the database. Mirrors the same
 * pipeline runImportPipeline/revalidateImportRecords use for file imports
 * (normalizeRecords + validateRecords({resolveRefs: true})), so an AI-driven
 * proposal goes through identical validation to a spreadsheet import.
 */
async function buildProposal(
  toolName: string,
  config: ImportConfiguration,
  mode: CsvImportMode,
  rawRecords: Array<Record<string, unknown>>,
): Promise<WriteProposal> {
  const normalized = normalizeRecords(config, rawRecords);
  const records = await validateRecords(config, normalized, {resolveRefs: true});
  flagMissingMatchFields(config, mode, records);

  return {
    proposalId: nextProposalId(),
    toolName,
    configId: config.id,
    entityLabel: config.entityLabel,
    mode,
    records,
    fieldNames: config.fields.map(f => f.name),
    hasBlockingErrors: records.some(recordHasError),
  };
}

export type WriteToolContext = {
  userId?: string;
  user?: {id: string};
};

export type BuildWriteProposalOptions = {
  db: ImportDbLike;
  t: TFunc;
  context?: WriteToolContext;
};

/**
 * Dispatch for AI write tool calls. Only ever returns a WriteProposal —
 * no case here may call runImport / onImportRow / db writes. That happens
 * exclusively in write-executor.ts, after explicit user confirmation.
 */
export const buildWriteProposal = async (
  toolName: string,
  args: Record<string, unknown>,
  options: BuildWriteProposalOptions,
): Promise<WriteProposal> => {
  const {db, t, context} = options;
  const entry = getWriteRegistryEntry(toolName);
  if (!entry) {
    throw new Error(`Unknown write tool: ${toolName}`);
  }

  const mode = getWriteModeForTool(toolName);
  if (!mode) {
    throw new Error(`Unknown write tool mode: ${toolName}`);
  }

  const config = entry.deleteToolName === toolName && entry.deleteConfig
    ? entry.deleteConfig({db, t, context})
    : entry.createConfig({db, t, context});
  const rawRecords = Array.isArray(args[entry.recordsArgKey])
    ? args[entry.recordsArgKey] as Array<Record<string, unknown>>
    : [];

  const records = mode === "update" && entry.mergeUpdatePatches && entry.deleteToolName !== toolName
    ? await entry.mergeUpdatePatches(db, rawRecords)
    : rawRecords;

  const proposal = await buildProposal(toolName, config, mode, records);
  return {...proposal, configId: entry.configId};
};
