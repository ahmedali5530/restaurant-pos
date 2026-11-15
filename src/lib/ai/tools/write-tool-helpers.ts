import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";
import {findRecordsByIdOrKeys, ID_WRITE_FIELD} from "@/lib/data-import/match-by-id.ts";

export type WriteFieldSpec = {
  name: string;
  type: "string" | "number" | "boolean" | "string[]";
  description?: string;
  requiredOnCreate?: boolean;
};

type BuildWriteToolDefinitionsOptions = {
  entityLabel: string;
  recordsArgKey: string;
  createToolName: string;
  updateToolName?: string;
  fields: WriteFieldSpec[];
  matchFields: string[];
  createDescription?: string;
  updateDescription?: string;
};

const jsonSchemaForField = (field: WriteFieldSpec) => {
  const base: Record<string, unknown> = {
    description: field.description,
  };
  switch (field.type) {
    case "number":
      return {...base, type: "number"};
    case "boolean":
      return {...base, type: "boolean"};
    case "string[]":
      return {...base, type: "array", items: {type: "string"}};
    default:
      return {...base, type: "string"};
  }
};

const buildItemSchema = (
  fields: WriteFieldSpec[],
  mode: "create" | "update",
  _matchFields: string[],
) => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of fields) {
    properties[field.name] = jsonSchemaForField(field);
    if (mode === "create" && field.requiredOnCreate) {
      required.push(field.name);
    }
    // Updates: id OR legacy match fields — validated in flagMissingMatchFields, not JSON required.
  }

  return {
    type: "object",
    properties,
    ...(required.length ? {required} : {}),
  };
};

const withIdField = (fields: WriteFieldSpec[]): WriteFieldSpec[] => {
  if (fields.some((f) => f.name === "id")) return fields;
  return [ID_WRITE_FIELD, ...fields];
};

export const buildWriteToolDefinitionsFromFields = (
  opts: BuildWriteToolDefinitionsOptions,
): OpenAIToolDefinition[] => {
  const {
    entityLabel,
    recordsArgKey,
    createToolName,
    updateToolName,
    fields,
    matchFields,
    createDescription,
    updateDescription,
  } = opts;

  const entityLower = entityLabel.toLowerCase();
  const updateFields = withIdField(fields);
  const preferIdHint =
    " Prefer matching by id from list_* tools; business keys are fallback when id is unknown.";

  const createTool: OpenAIToolDefinition = {
    type: "function",
    function: {
      name: createToolName,
      description:
        createDescription ??
        `Propose creating one or more new ${entityLower} records. This does NOT save anything — ` +
        `it only prepares a preview for the user to review and confirm.`,
      parameters: {
        type: "object",
        properties: {
          [recordsArgKey]: {
            type: "array",
            description: `One entry per ${entityLower} to create.`,
            items: buildItemSchema(fields, "create", matchFields),
          },
        },
        required: [recordsArgKey],
      },
    },
  };

  if (!updateToolName) {
    return [createTool];
  }

  return [
    createTool,
    {
      type: "function",
      function: {
        name: updateToolName,
        description:
          (updateDescription ??
            `Propose updating one or more existing ${entityLower} records. This does NOT save anything — ` +
              `it only prepares a preview for the user to review and confirm. ` +
              `Only include fields that should change; omitted fields are left as-is.`)
          + preferIdHint,
        parameters: {
          type: "object",
          properties: {
            [recordsArgKey]: {
              type: "array",
              description: `One entry per ${entityLower} to update.`,
              items: buildItemSchema(updateFields, "update", matchFields),
            },
          },
          required: [recordsArgKey],
        },
      },
    },
  ];
};

export const buildDeleteToolDefinitionFromFields = (
  opts: {
    entityLabel: string;
    recordsArgKey: string;
    deleteToolName: string;
    fields: WriteFieldSpec[];
    matchFields: string[];
    deleteDescription?: string;
  },
): OpenAIToolDefinition => {
  const entityLower = opts.entityLabel.toLowerCase();
  const fields = withIdField(opts.fields);
  return {
    type: "function",
    function: {
      name: opts.deleteToolName,
      description:
        (opts.deleteDescription ??
          `Propose soft-deleting one or more ${entityLower} records. This does NOT save anything — ` +
            `it only prepares a preview for the user to review and confirm.`)
        + " Prefer matching by id from list_* tools.",
      parameters: {
        type: "object",
        properties: {
          [opts.recordsArgKey]: {
            type: "array",
            description: `One entry per ${entityLower} to delete (id preferred, or match fields).`,
            items: buildItemSchema(fields, "update", opts.matchFields),
          },
        },
        required: [opts.recordsArgKey],
      },
    },
  };
};

const patchMatchValue = (patch: Record<string, unknown>, field: string): string =>
  String(patch[field] ?? "").trim();

export const createMergeUpdatePatchesByFetcher = (
  fetchExisting: (db: ImportDbLike, patch: Record<string, unknown>) => Promise<Record<string, unknown> | null>,
) =>
  async (db: ImportDbLike, patches: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> =>
    Promise.all(patches.map(async (patch) => {
      const existing = await fetchExisting(db, patch);
      if (!existing) return patch;
      return {...existing, ...patch};
    }));

export const createMergeUpdatePatchesByMatchFields = (
  table: string,
  matchFields: string[],
  options: {
    softDelete?: boolean;
    /** When legacy keys can collide (e.g. table number), refuse silent LIMIT 1. */
    rejectAmbiguousKeys?: boolean;
    fetchTransform?: (row: Record<string, unknown>) => Record<string, unknown>;
  } = {},
) => {
  const softDelete = options.softDelete ?? true;
  const rejectAmbiguousKeys = options.rejectAmbiguousKeys ?? false;

  return createMergeUpdatePatchesByFetcher(async (db, patch) => {
    const hasId = String(patch.id ?? "").trim() !== "";
    const keys: Record<string, unknown> = {};
    for (const field of matchFields) {
      const value = patchMatchValue(patch, field);
      if (!value) {
        if (!hasId) return null;
        continue;
      }
      keys[field] = value;
    }
    if (!hasId && Object.keys(keys).length !== matchFields.length) return null;

    const rows = await findRecordsByIdOrKeys(db, table, {
      id: hasId ? patch.id : undefined,
      keys: hasId ? undefined : keys,
      softDelete,
      rejectAmbiguousKeys,
      limit: rejectAmbiguousKeys ? 2 : 1,
    });

    if (rows.length === 0) return null;
    if (rejectAmbiguousKeys && rows.length > 1 && !String(patch.id ?? "").trim()) {
      return null;
    }

    const row = rows[0] as Record<string, unknown>;
    const base = options.fetchTransform ? options.fetchTransform(row) : row;
    // Always surface id so subsequent commits can rematch uniquely.
    return {...base, id: String(row.id ?? base.id ?? "")};
  });
};
