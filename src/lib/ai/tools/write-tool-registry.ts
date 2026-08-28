import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";
import type {ImportConfiguration, ImportDbLike} from "@/lib/data-import/types.ts";
import {createDishImportConfig} from "@/components/settings/dishes/dish.import.config.ts";
import {Tables} from "@/api/db/tables.ts";
import {normalizeModules} from "@/lib/access.rules.ts";
import type {TFunc} from "@/lib/ai/tools/write-tools.ts";

export type WriteToolRegistryEntry = {
  configId: string;
  recordsArgKey: string;
  createToolName: string;
  updateToolName?: string;
  permissionModules: {create: string; update: string};
  keywords: RegExp;
  createConfig: (opts: {db: ImportDbLike; t: TFunc}) => ImportConfiguration;
  mergeUpdatePatches?: (
    db: ImportDbLike,
    patches: Array<Record<string, unknown>>,
  ) => Promise<Array<Record<string, unknown>>>;
  buildToolDefinitions: () => OpenAIToolDefinition[];
};

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

async function mergeDishUpdatePatches(
  db: ImportDbLike,
  patches: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  return Promise.all(patches.map(async (patch) => {
    const number = patch.number !== undefined && patch.number !== null ? String(patch.number).trim() : "";
    if (!number) return patch;

    const existing = await fetchExistingDishRaw(db, number);
    if (!existing) return patch;

    return {...existing, ...patch};
  }));
}

const DISH_CREATE_TOOL: OpenAIToolDefinition = {
  type: "function",
  function: {
    name: "propose_create_dishes",
    description:
      "Propose creating one or more new dishes/menu items. This does NOT save anything — " +
      "it only prepares a preview for the user to review and confirm. Use for requests " +
      "like 'add a dish called X at $9' or bulk additions from a list.",
    parameters: {
      type: "object",
      properties: {
        dishes: {
          type: "array",
          description: "One entry per dish to create.",
          items: {
            type: "object",
            properties: {
              name: {type: "string", description: "Dish/menu item name"},
              number: {type: "string", description: "Internal item number; omit to auto-assign"},
              priority: {type: "number", description: "Display sort priority", default: 0},
              price: {type: "number", description: "Sale price"},
              cost: {type: "number", description: "Cost price", default: 0},
              categories: {
                type: "array",
                items: {type: "string"},
                description: "Menu category name(s). Unknown categories will be created — flagged in the preview.",
              },
              tax: {type: "string", description: "Tax name, if applicable"},
            },
            required: ["name", "price", "categories"],
          },
        },
      },
      required: ["dishes"],
    },
  },
};

const DISH_UPDATE_TOOL: OpenAIToolDefinition = {
  type: "function",
  function: {
    name: "propose_update_dishes",
    description:
      "Propose updating one or more existing dishes, matched by their item number. This does NOT " +
      "save anything — it only prepares a preview for the user to review and confirm. Use for " +
      "requests like 'raise the price of dish #12 to $10' or bulk price/category changes. " +
      "Only include fields that should change; omitted fields are left as-is.",
    parameters: {
      type: "object",
      properties: {
        dishes: {
          type: "array",
          description: "One entry per dish to update.",
          items: {
            type: "object",
            properties: {
              number: {type: "string", description: "Item number of the dish to update (required to match the row)"},
              name: {type: "string"},
              priority: {type: "number"},
              price: {type: "number"},
              cost: {type: "number"},
              categories: {type: "array", items: {type: "string"}},
              tax: {type: "string"},
            },
            required: ["number"],
          },
        },
      },
      required: ["dishes"],
    },
  },
};

const WRITE_TOOL_REGISTRY: WriteToolRegistryEntry[] = [
  {
    configId: "dishes",
    recordsArgKey: "dishes",
    createToolName: "propose_create_dishes",
    updateToolName: "propose_update_dishes",
    permissionModules: {
      create: "admin.dishes.create",
      update: "admin.dishes.update",
    },
    keywords: /\b(dish|dishes|menu item|menu items|menu)\b/i,
    createConfig: createDishImportConfig,
    mergeUpdatePatches: mergeDishUpdatePatches,
    buildToolDefinitions: () => [DISH_CREATE_TOOL, DISH_UPDATE_TOOL],
  },
];

const toolNameIndex = new Map<string, WriteToolRegistryEntry>();
const configIdIndex = new Map<string, WriteToolRegistryEntry>();

for (const entry of WRITE_TOOL_REGISTRY) {
  toolNameIndex.set(entry.createToolName, entry);
  if (entry.updateToolName) {
    toolNameIndex.set(entry.updateToolName, entry);
  }
  configIdIndex.set(entry.configId, entry);
}

export const getWriteRegistryEntry = (toolName: string): WriteToolRegistryEntry | undefined =>
  toolNameIndex.get(toolName);

export const getWriteRegistryEntryByConfigId = (configId: string): WriteToolRegistryEntry | undefined =>
  configIdIndex.get(configId);

export const listWriteToolDefinitions = (): OpenAIToolDefinition[] =>
  WRITE_TOOL_REGISTRY.flatMap(entry => entry.buildToolDefinitions());

export const listWriteToolNames = (): string[] =>
  listWriteToolDefinitions().map(tool => tool.function.name);

export const buildWriteToolPermissionMap = (): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const entry of WRITE_TOOL_REGISTRY) {
    map[entry.createToolName] = entry.permissionModules.create;
    if (entry.updateToolName) {
      map[entry.updateToolName] = entry.permissionModules.update;
    }
  }
  return map;
};

const isCreateTool = (toolName: string, entry: WriteToolRegistryEntry) =>
  toolName === entry.createToolName;

const isUpdateTool = (toolName: string, entry: WriteToolRegistryEntry) =>
  toolName === entry.updateToolName;

export const detectWriteToolsForPrompt = (
  prompt: string,
  allowedModules: string[],
): OpenAIToolDefinition[] => {
  const matched: OpenAIToolDefinition[] = [];

  for (const entry of WRITE_TOOL_REGISTRY) {
    if (!entry.keywords.test(prompt)) continue;

    const normalized = normalizeModules(allowedModules);
    const tools = entry.buildToolDefinitions();
    for (const tool of tools) {
      const name = tool.function.name;
      const module = isCreateTool(name, entry)
        ? entry.permissionModules.create
        : isUpdateTool(name, entry)
          ? entry.permissionModules.update
          : null;
      if (!module || !normalized.includes(module)) continue;
      matched.push(tool);
    }
  }

  return matched;
};

export const getWriteModeForTool = (toolName: string): "create" | "update" | null => {
  const entry = getWriteRegistryEntry(toolName);
  if (!entry) return null;
  if (toolName === entry.createToolName) return "create";
  if (toolName === entry.updateToolName) return "update";
  return null;
};
