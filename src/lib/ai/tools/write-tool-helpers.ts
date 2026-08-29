import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";

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
  matchFields: string[],
) => {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const field of fields) {
    properties[field.name] = jsonSchemaForField(field);
    if (mode === "create" && field.requiredOnCreate) {
      required.push(field.name);
    }
    if (mode === "update" && matchFields.includes(field.name)) {
      required.push(field.name);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length ? {required} : {}),
  };
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
          updateDescription ??
          `Propose updating one or more existing ${entityLower} records. This does NOT save anything — ` +
          `it only prepares a preview for the user to review and confirm. ` +
          `Only include fields that should change; omitted fields are left as-is.`,
        parameters: {
          type: "object",
          properties: {
            [recordsArgKey]: {
              type: "array",
              description: `One entry per ${entityLower} to update.`,
              items: buildItemSchema(fields, "update", matchFields),
            },
          },
          required: [recordsArgKey],
        },
      },
    },
  ];
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
    fetchTransform?: (row: Record<string, unknown>) => Record<string, unknown>;
  } = {},
) => {
  const softDelete = options.softDelete ?? true;

  return createMergeUpdatePatchesByFetcher(async (db, patch) => {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    for (const field of matchFields) {
      const value = patchMatchValue(patch, field);
      if (!value) return null;
      const param = `m_${field}`;
      conditions.push(`${field} = $${param}`);
      params[param] = value;
    }

    if (conditions.length === 0) return null;

    const deletedClause = softDelete ? " AND deleted_at = none" : "";
    const [rows] = await db.query(
      `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")}${deletedClause} LIMIT 1`,
      params,
    );
    const row = rows?.[0];
    if (!row) return null;

    return options.fetchTransform ? options.fetchTransform(row as Record<string, unknown>) : row;
  });
};
