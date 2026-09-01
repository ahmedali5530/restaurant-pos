import {throwIfAborted} from "@/lib/data-import/abort.ts";
import {detectSourceKind} from "@/lib/data-import/extract/detect.ts";
import {extractFromDocument} from "@/lib/data-import/extract/document.ts";
import {
  applyColumnMapping,
  autoMapColumns,
  mappingNeedsReview,
  parseStructuredFile,
} from "@/lib/data-import/extract/structured.ts";
import {normalizeRecords} from "@/lib/data-import/normalize.ts";
import {validateRecords} from "@/lib/data-import/validate.ts";
import type {
  ColumnMapping,
  ImportConfiguration,
  ImportRecord,
  PipelineOptions,
  StructuredExtractResult,
} from "@/lib/data-import/types.ts";

export type PipelinePhaseResult =
  | {
      phase: "mapping_required";
      structured: StructuredExtractResult;
      mapping: ColumnMapping;
    }
  | {
      phase: "ready";
      records: ImportRecord[];
      structured?: StructuredExtractResult;
      mapping?: ColumnMapping;
    };

/**
 * Run extraction through normalize + validate.
 * For CSV/Excel without an explicit mapping, may return mapping_required.
 */
export async function runImportPipeline(
  config: ImportConfiguration,
  file: File,
  options: PipelineOptions = {}
): Promise<PipelinePhaseResult> {
  const {signal, onProgress} = options;
  throwIfAborted(signal);

  onProgress?.({stage: "detect", current: 0, total: 1});
  const kind = detectSourceKind(file);
  if (kind === "unknown") {
    throw new Error("Unsupported file type. Upload CSV, Excel, PDF, or an image.");
  }

  if (kind === "csv" || kind === "excel") {
    onProgress?.({stage: "parse", current: 0, total: 1, message: "Parsing spreadsheet…"});
    const structured = await parseStructuredFile(file, {signal});
    const sheetIndex = options.sheetIndex ?? structured.sheetIndex ?? 0;
    structured.sheetIndex = sheetIndex;
    const sheet = structured.sheets[sheetIndex];
    if (!sheet) {
      throw new Error("Selected sheet not found.");
    }

    const mapping =
      options.mapping ??
      autoMapColumns(
        sheet.headers,
        config.fields.map((f) => ({
          name: f.name,
          label: f.label,
          aliases: f.aliases,
        }))
      );

    if (!options.mapping && mappingNeedsReview(config.fields, mapping)) {
      return {phase: "mapping_required", structured, mapping};
    }

    return finalizeStructured(config, structured, mapping, options);
  }

  onProgress?.({stage: "ocr", current: 0, total: 1, message: "Starting OCR…"});
  const raw = await extractFromDocument(config, file, kind, {
    signal,
    maxPdfPages: options.maxPdfPages,
    onProgress: (current, total, message) =>
      onProgress?.({stage: "ocr", current, total, message}),
  });

  if (raw.records.length === 0) {
    onProgress?.({stage: "normalize", current: 1, total: 1});
    return {phase: "ready", records: []};
  }

  onProgress?.({stage: "normalize", current: 1, total: 1});
  const normalized = normalizeRecords(config, raw.records, {
    confidence: raw.confidence,
    fieldConfidence: raw.fieldConfidence,
  });

  onProgress?.({stage: "validate", current: 1, total: 1});
  const records = await validateRecords(config, normalized, {signal});
  return {phase: "ready", records};
}

export async function finalizeStructured(
  config: ImportConfiguration,
  structured: StructuredExtractResult,
  mapping: ColumnMapping,
  options: PipelineOptions = {}
): Promise<{
  phase: "ready";
  records: ImportRecord[];
  structured?: StructuredExtractResult;
  mapping?: ColumnMapping;
}> {
  const {signal, onProgress} = options;
  throwIfAborted(signal);

  const sheet = structured.sheets[structured.sheetIndex] ?? structured.sheets[0];
  if (!sheet) {
    throw new Error("No sheet data available.");
  }

  onProgress?.({stage: "normalize", current: 1, total: 1, message: "Normalizing…"});
  const rawRows = applyColumnMapping(
    sheet.headers,
    sheet.rows,
    config.fields,
    mapping
  );
  const normalized = normalizeRecords(config, rawRows);

  onProgress?.({stage: "validate", current: 1, total: 1});
  const records = await validateRecords(config, normalized, {signal});
  return {
    phase: "ready",
    records,
    structured,
    mapping,
  };
}

/**
 * Re-validate records after user edits in the review grid.
 */
export async function revalidateImportRecords(
  config: ImportConfiguration,
  records: ImportRecord[],
  options?: {signal?: AbortSignal}
): Promise<ImportRecord[]> {
  return validateRecords(config, records, {
    signal: options?.signal,
    resolveRefs: true,
  });
}
