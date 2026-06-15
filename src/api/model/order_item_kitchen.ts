import { ID } from "@/api/model/common.ts";
import { Kitchen } from "@/api/model/kitchen.ts";
import { OrderItem } from "@/api/model/order_item.ts";
import { Workflow, WorkflowStage } from "@/api/model/workflow.ts";
import { User } from "@/api/model/user.ts";
import { DateTime } from "surrealdb";

export enum OrderItemKitchenStatus {
  Waiting = 'waiting',
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Skipped = 'skipped',
  Cancelled = 'cancelled',
}

export interface OrderItemKitchen extends ID {
  created_at: DateTime
  activated_at?: DateTime
  started_at?: DateTime
  completed_at?: DateTime
  kitchen: Kitchen
  order_item: OrderItem

  stage?: WorkflowStage
  stage_name?: string
  workflow?: Workflow
  sequence?: number
  status?: string
  is_terminal?: boolean

  // user who first completed the stage (drives workflow advancement, nullable)
  user?: User

  // users who have cleared this row from their own KDS (per-user completion)
  completed_by?: User[]
}
