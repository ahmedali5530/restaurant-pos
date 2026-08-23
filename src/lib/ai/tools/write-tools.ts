import type {ImportConfiguration, ImportDbLike, ImportRecord} from "@/lib/data-import/types.ts";
import {normalizeRecords} from "@/lib/data-import/normalize.ts";
import {validateRecords} from "@/lib/data-import/validate.ts";
import {createDishImportConfig} from "@/components/settings/dishes/dish.import.config.ts";
import {Tables} from "@/api/db/tables.ts";
import type {CsvImportMode} from "@/utils/csv-import.ts";

export type TFunc = (key: string, options?: any) => string;

export type WriteProposal = {
  /** Stable id for correlating a confirm/cancel click back to this proposal. */
  proposalId: string;
  toolName: string;
  configId: string;
  entityLabel: string;
  mode: CsvImportMode;
  records: ImportRecord[];
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
 * dish.import.config.ts's onImportRow always requires name/price/categories,
 * for BOTH create and update — it was built for full-row CSV imports, never
 * for partial "just change the price" updates. Reusing it as-is for update
 * mode would either (a) block every partial update in the preview as
 * missing-required, or worse (b) pass preview clean by suppressing that
 * check and then still throw at commit inside onImportRow itself (same
 * "preview isn't ground truth" class of bug already fixed once for match
 * fields). Real fix: fetch the existing dish and merge the AI's partial
 * patch onto it BEFORE normalize/validate, so an omitted field falls back
 * to its current value instead of reading as missing. dish.import.config.ts
 * and the shared import pipeline are untouched — this is AI-write-path-only.
 */
async function fetchExistingDishRaw(
  db: ImportDbLike,
  number: string,
): Promise<Record<string, unknown> | null> {
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.dishes} WHERE number = $number AND deleted_at = none LIMIT 1 FETCH categories, tax`,
    {number},
  );
  const dish = rows?.[0];
  if (!dish) return null;

  const categories = Array.isArray(dish.categories)
    ? dish.categories
        .filter((c: any) => c && c.id)
        .map((c: any) => ({label: String(c.name ?? ""), id: String(c.id)}))
    : [];
  const tax = dish.tax && dish.tax.id
    ? {label: String(dish.tax.name ?? ""), id: String(dish.tax.id)}
    : undefined;

  return {
    name: dish.name,
    number: dish.number,
    priority: dish.priority,
    price: dish.price,
    cost: dish.cost,
    categories,
    tax,
  };
}

async function mergeUpdatePatchesWithExisting(
  db: ImportDbLike,
  patches: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  return Promise.all(patches.map(async (patch) => {
    const number = patch.number !== undefined && patch.number !== null ? String(patch.number).trim() : "";
    if (!number) return patch; // no match key — flagMissingMatchFields will catch this

    const existing = await fetchExistingDishRaw(db, number);
    if (!existing) return patch; // no such dish — let it fail honestly, nothing to merge from

    return {...existing, ...patch};
  }));
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
    hasBlockingErrors: records.some(recordHasError),
  };
}

export type BuildWriteProposalOptions = {
  db: ImportDbLike;
  t: TFunc;
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
  const {db, t} = options;

  switch (toolName) {
    case "propose_create_dishes": {
      const config = createDishImportConfig({db, t});
      const dishes = Array.isArray(args.dishes) ? args.dishes : [];
      return buildProposal(toolName, config, "create", dishes as Array<Record<string, unknown>>);
    }

    case "propose_update_dishes": {
      const config = createDishImportConfig({db, t});
      const patches = Array.isArray(args.dishes) ? args.dishes as Array<Record<string, unknown>> : [];
      const merged = await mergeUpdatePatchesWithExisting(db, patches);
      return buildProposal(toolName, config, "update", merged);
    }

    default:
      throw new Error(`Unknown write tool: ${toolName}`);
  }
};
