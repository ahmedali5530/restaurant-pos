import { ID } from "@/api/model/common.ts";
import { Kitchen } from "@/api/model/kitchen.ts";
import { DateTime } from "surrealdb";

export interface Workflow extends ID {
  name: string
  stages?: WorkflowStage[]

  created_at?: DateTime
  deleted_at?: DateTime
}

export interface WorkflowStage extends ID {
  workflow: Workflow | string
  kitchen: Kitchen
  sequence: number
  name: string
  is_terminal?: boolean

  created_at?: DateTime
}

export const WORKFLOW_FETCHES = [
  'stages', 'stages.kitchen'
];
