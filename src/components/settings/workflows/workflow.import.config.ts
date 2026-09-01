import {Tables} from "@/api/db/tables.ts";
import type {ImportConfiguration, ImportDbLike, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import {type TFunc} from "@/lib/data-import/helpers.ts";
import {assertCsvMatchValues, buildMatchConditions, findCsvImportMatches} from "@/utils/csv-import.ts";
import {toRecordId} from "@/lib/utils.ts";
import {StringRecordId} from "surrealdb";

const unwrapRows = <T>(result: unknown): T[] => {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  return [];
};

type StageInput = {name?: string; kitchen_name?: string; kitchen?: string};

export function createWorkflowImportConfig({db, t}: {db: ImportDbLike; t: TFunc}): ImportConfiguration {
  const fields: ImportField[] = [
    {name: "name", label: t("admin:columns.name"), type: "string", required: true},
    {
      name: "stages",
      label: t("admin:forms.stages", {defaultValue: "Stages"}),
      type: "string",
      required: true,
      description: "JSON array of {name, kitchen_name} objects in order",
    },
  ];

  const parseStages = (raw: unknown): StageInput[] => {
    if (typeof raw === "string") {
      return JSON.parse(raw) as StageInput[];
    }
    if (Array.isArray(raw)) return raw as StageInput[];
    throw new Error("stages must be a JSON array");
  };

  return {
    id: "workflows",
    entityLabel: t("admin:buttons.workflow", {defaultValue: "Workflow"}),
    shape: "records",
    fields,
    matchFields: ["name"],
    defaultMode: "create",
    db,
    extractionInstructions: "Extract workflow name and ordered stages with kitchen names.",
    onImportRow: async (record: ImportRecord, ctx) => {
      const name = String(record.values.name ?? "").trim();
      if (!name) throw new Error(t("validation:required"));
      const stages = parseStages(record.values.stages);
      if (!stages.length) throw new Error(t("forms.addAtLeastOneStage"));

      const rowData = {name};
      assertCsvMatchValues(rowData, ctx.matchFields, field => t("common:csvImport.emptyMatchValue", {field}));
      const conditions = buildMatchConditions(rowData, ctx.matchFields, (_field, value) => ({column: "name", value}));
      const existing = ctx.mode === "create" ? [] : await findCsvImportMatches(db, Tables.workflows, conditions);

      let workflowId: unknown;
      if (ctx.mode !== "create" && existing.length === 1) {
        workflowId = existing[0].id;
        await db.merge?.(workflowId, {name});
      } else if (ctx.mode === "update") {
        throw new Error(t("common:csvImport.recordNotFound"));
      } else {
        const created = await db.create?.(Tables.workflows, {name});
        const row = Array.isArray(created) ? created[0] : created;
        workflowId = row?.id;
      }

      await db.query(`DELETE ${Tables.workflow_stages} WHERE workflow = $wf`, {
        wf: new StringRecordId(String(workflowId)),
      });

      const lastIndex = stages.length - 1;
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        const stageName = String(stage.name ?? "").trim();
        const kitchenName = String(stage.kitchen_name ?? stage.kitchen ?? "").trim();
        if (!stageName || !kitchenName) throw new Error(t("forms.kitchenRequired"));

        const kitchenRows = unwrapRows<{id: unknown}>(
          await db.query(
            `SELECT id FROM ${Tables.kitchens} WHERE deleted_at = NONE AND string::lowercase(name) = string::lowercase($name) LIMIT 1`,
            {name: kitchenName},
          ),
        );
        if (!kitchenRows[0]?.id) throw new Error(`Kitchen not found: ${kitchenName}`);

        await db.create?.(Tables.workflow_stages, {
          workflow: new StringRecordId(String(workflowId)),
          kitchen: toRecordId(kitchenRows[0].id),
          name: stageName,
          sequence: i + 1,
          is_terminal: i === lastIndex,
        });
      }
    },
  };
}
