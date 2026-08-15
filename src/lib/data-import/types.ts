import type {CsvImportMode} from "@/utils/csv-import.ts";

export type ImportFieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "reference"
  | "reference[]";

export type LookupStrategy =
  | "exact"
  | "case_insensitive"
  | "fuzzy"
  | "create"
  | "require_selection";

export type ImportIssueSeverity = "error" | "warning";

export type ImportIssueCode =
  | "required"
  | "invalid_type"
  | "unresolved_reference"
  | "ambiguous_reference"
  | "low_confidence"
  | "duplicate"
  | "custom";

export type ImportIssue = {
  field?: string;
  code: ImportIssueCode;
  severity: ImportIssueSeverity;
  message: string;
};

export type ResolvedReference = {
  /** Display / raw text from the source */
  label: string;
  /** Matched record id, if resolved */
  id?: string;
  /** True when the user (or config) will create this reference on import */
  create?: boolean;
  /** Candidate options when ambiguous or require_selection */
  candidates?: Array<{label: string; value: string}>;
};

export type ImportFieldLookup = {
  table: string;
  searchFields: string[];
  strategy: LookupStrategy;
  /** Soft-delete filter (default true) */
  softDelete?: boolean;
  /**
   * Extra fields merged into db.create when strategy is `create` and
   * onCreateMissingReference is not provided.
   */
  createDefaults?: Record<string, any>;
};

export type ImportField = {
  name: string;
  label: string;
  type: ImportFieldType;
  required?: boolean;
  /** When true, field need not be mapped for structured imports */
  optional?: boolean;
  description?: string;
  /** Alternate CSV/Excel header names for auto-mapping */
  aliases?: string[];
  defaultValue?: any;
  /** Post-parse transform (runs after type coercion) */
  transform?: (value: any, row: Record<string, any>) => any;
  lookup?: ImportFieldLookup;
};

export type ImportRecord = {
  /** Stable client id for React keys */
  clientId: string;
  values: Record<string, any>;
  issues: ImportIssue[];
  confidence?: number;
  fieldConfidence?: Record<string, number>;
  /** Skip this row on import */
  skipped?: boolean;
};

export type ImportShape = "records" | "document";

export type ImportRowContext = {
  mode: CsvImportMode;
  matchFields: string[];
  index: number;
};

export type ImportSummary = {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  errors: Array<{index: number; message: string}>;
};

export type ImportDbLike = {
  query: (sql: string, vars?: Record<string, any>) => Promise<any[]>;
  insert?: (table: string, data: any) => Promise<any>;
  create?: (table: string, data: any) => Promise<any>;
  merge?: (thing: any, data: any) => Promise<any>;
};

export type ImportConfiguration = {
  id: string;
  entityLabel: string;
  shape?: ImportShape;
  fields: ImportField[];
  /**
   * Free-text appended to the generated AI prompt.
   * This is the only place entity-specific extraction wording should live.
   */
  extractionInstructions: string;
  matchFields?: string[];
  defaultMode?: CsvImportMode;
  /**
   * Persist one validated review row. Throws on failure.
   * Return value is ignored; success is inferred from no throw.
   */
  onImportRow: (record: ImportRecord, ctx: ImportRowContext) => Promise<void>;
  /**
   * Optional: create a missing reference when strategy is `create`
   * and the user confirmed create (or auto-create is enabled).
   */
  onCreateMissingReference?: (
    field: ImportField,
    label: string,
    db: ImportDbLike
  ) => Promise<{id: string; label: string}>;
  /** Optional DB handle for lookup resolution during validate */
  db?: ImportDbLike;
};

export type SourceKind = "csv" | "excel" | "image" | "pdf" | "unknown";

export type StructuredSheet = {
  name: string;
  headers: string[];
  rows: string[][];
};

export type StructuredExtractResult = {
  kind: "csv" | "excel";
  sheets: StructuredSheet[];
  /** Selected sheet index (default 0) */
  sheetIndex: number;
};

export type RawExtractedRecords = {
  records: Array<Record<string, any>>;
  /** Optional per-record confidence from AI */
  confidence?: number[];
  fieldConfidence?: Array<Record<string, number> | undefined>;
};

export type ColumnMapping = Record<string, string | "">;

export type ExtractProgress = {
  stage: "detect" | "parse" | "ocr" | "normalize" | "validate" | "import";
  current: number;
  total: number;
  message?: string;
};

export type PipelineOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: ExtractProgress) => void;
  /** When structured headers need remapping */
  mapping?: ColumnMapping;
  sheetIndex?: number;
  /** Max PDF pages to process */
  maxPdfPages?: number;
};

/** Registry for optional discovery (modules still pass config as a prop). */
const registry = new Map<string, ImportConfiguration>();

export function registerImportConfiguration(config: ImportConfiguration): void {
  registry.set(config.id, config);
}

export function getImportConfiguration(id: string): ImportConfiguration | undefined {
  return registry.get(id);
}

export function listImportConfigurations(): ImportConfiguration[] {
  return Array.from(registry.values());
}
