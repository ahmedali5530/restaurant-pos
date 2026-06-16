import { Tables } from "@/api/db/tables.ts";
import { toRecordId } from "@/lib/utils.ts";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import { dispatchPrint } from "@/lib/print.service.ts";
import { OrderItemKitchenStatus } from "@/api/model/order_item_kitchen.ts";
import { Dish } from "@/api/model/dish.ts";

/**
 * Multi-stage kitchen workflow engine.
 *
 * A dish may reference a reusable `workflow` (ordered `workflow_stage` rows,
 * each pointing to a kitchen). Per-product kitchen overrides live in
 * `menu_item.stage_overrides` (map of stage id -> kitchen id).
 *
 * At fire time one `order_item_kitchen` row is pre-created per stage. The first
 * stage starts `pending`; later stages start `waiting`. Completing a stage flips
 * the next `waiting` stage to `pending`, which surfaces the item in the next
 * kitchen via the KDS live subscription.
 *
 * Dishes without a workflow fall back to the legacy parallel routing
 * (`kitchen.items ?= dish`), producing one terminal stage row per kitchen.
 */

type AnyDb = any;

interface ResolvedStage {
  id: string;
  name: string;
  sequence: number;
  kitchenId: string;
  is_terminal: boolean;
  workflowId: string;
}

const firstRow = <T = any>(result: any): T | undefined => {
  const rows = Array.isArray(result) ? result[0] : undefined;
  if (Array.isArray(rows)) {
    return rows[0] as T;
  }
  return rows as T | undefined;
};

const rowsOf = <T = any>(result: any): T[] => {
  const rows = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(rows) ? (rows as T[]) : [];
};

const pushKitchenItem = (
  kitchenItems: Record<string, any[]> | undefined,
  kitchenId: string,
  item: any
) => {
  if (!kitchenItems) return;
  if (!kitchenItems[kitchenId]) {
    kitchenItems[kitchenId] = [];
  }
  kitchenItems[kitchenId].push(item);
};

/**
 * Resolve the ordered, override-applied stages for a dish.
 * Returns null when the dish has no (usable) workflow -> caller uses legacy path.
 */
export const resolveStages = async (
  db: AnyDb,
  dishId: string
): Promise<ResolvedStage[] | null> => {
  const dishRow = firstRow<{ workflow?: any; stage_overrides?: Record<string, string> }>(
    await db.query(`SELECT workflow, stage_overrides FROM $dish`, {
      dish: toRecordId(dishId),
    })
  );

  const workflowId = dishRow?.workflow ? dishRow.workflow.toString() : null;
  if (!workflowId) {
    return null;
  }

  const overrides = dishRow?.stage_overrides ?? {};

  const stages = rowsOf<any>(
    await db.query(
      `SELECT * FROM ${Tables.workflow_stages} WHERE workflow = $wf ORDER BY sequence ASC`,
      { wf: toRecordId(workflowId) }
    )
  );

  if (stages.length === 0) {
    return null;
  }

  return stages.map((stage) => {
    const stageId = stage.id.toString();
    const overrideKitchen = overrides?.[stageId];
    const kitchenId = (overrideKitchen ?? stage.kitchen)?.toString();
    return {
      id: stageId,
      name: stage.name,
      sequence: Number(stage.sequence ?? 0),
      kitchenId,
      is_terminal: !!stage.is_terminal,
      workflowId,
    };
  });
};

/**
 * Create the kitchen routing rows for a freshly fired order item.
 * Populates `kitchenItems` with the items that should print a KOT now
 * (first stage for workflows, every kitchen for legacy dishes).
 */
export const createStageRows = async (
  db: AnyDb,
  params: {
    orderItem: any;
    dish: Dish;
    fireDate: Date;
    kitchenItems?: Record<string, any[]>;
  }
): Promise<void> => {
  const { orderItem, dish, fireDate, kitchenItems } = params;
  const orderItemRef = toRecordId(orderItem.id.toString());
  const dishId = dish.id.toString();

  const stages = await resolveStages(db, dishId);

  // Legacy parallel routing: one terminal row per kitchen that has the dish.
  if (!stages) {
    const kitchens = rowsOf<any>(
      await db.query(
        `SELECT * FROM ${Tables.kitchens} WHERE items ?= $dish AND deleted_at = none`,
        { dish: toRecordId(dishId) }
      )
    );

    for (const k of kitchens) {
      const kitchenId = k.id.toString();
      await db.create(Tables.order_items_kitchen, {
        created_at: fireDate,
        activated_at: fireDate,
        kitchen: toRecordId(kitchenId),
        order_item: orderItemRef,
        status: OrderItemKitchenStatus.Pending,
        sequence: 0,
        is_terminal: true,
      });

      pushKitchenItem(kitchenItems, kitchenId, { ...orderItem, item: dish });
    }
    return;
  }

  // Workflow routing: pre-create one row per stage.
  const firstStage = stages[0];
  await db.merge(orderItemRef, {
    workflow: toRecordId(firstStage.workflowId),
    workflow_status: "in_progress",
    current_sequence: firstStage.sequence,
  });

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const isFirst = i === 0;
    const isLast = i === stages.length - 1;

    await db.create(Tables.order_items_kitchen, {
      created_at: fireDate,
      activated_at: isFirst ? fireDate : undefined,
      kitchen: toRecordId(stage.kitchenId),
      order_item: orderItemRef,
      stage: toRecordId(stage.id),
      stage_name: stage.name,
      workflow: toRecordId(stage.workflowId),
      sequence: stage.sequence,
      status: isFirst ? OrderItemKitchenStatus.Pending : OrderItemKitchenStatus.Waiting,
      is_terminal: stage.is_terminal || isLast,
    });

    if (isFirst) {
      pushKitchenItem(kitchenItems, stage.kitchenId, { ...orderItem, item: dish });
    }
  }
};

/**
 * Best-effort KOT print for a stage row when it becomes active.
 */
const fireStageKOT = async (db: AnyDb, oikId: any): Promise<void> => {
  try {
    const row = firstRow<any>(
      await db.query(
        `SELECT * FROM $oik FETCH order_item, order_item.item, order_item.order, order_item.order.table, kitchen, kitchen.printers`,
        { oik: toRecordId(oikId.toString()) }
      )
    );

    if (!row?.kitchen) return;

    const orderItem = row.order_item;
    const order = orderItem?.order;

    await dispatchPrint(
      db,
      "kitchen",
      {
        items: [{ ...orderItem, item: orderItem?.item }],
        order,
        kitchenName: row.kitchen?.name,
        table: order?.table,
        isAddOn: true,
      },
      {
        title: "Kitchen print",
        copies: 1,
        printers: row.kitchen?.printers,
      }
    );
  } catch (error) {
    console.error("Failed to fire stage KOT", error);
  }
};

/**
 * Advance an order item from the given (just-closed) stage row to the next
 * waiting stage. Shared by completeStage and skipStage.
 */
const advanceFrom = async (
  db: AnyDb,
  row: { id: any; order_item: any; sequence?: number; workflow?: any },
  now: any
): Promise<void> => {
  const next = firstRow<any>(
    await db.query(
      `SELECT * FROM ${Tables.order_items_kitchen}
       WHERE order_item = $oi AND status = $waiting AND sequence > $seq
       ORDER BY sequence ASC LIMIT 1`,
      {
        oi: row.order_item,
        waiting: OrderItemKitchenStatus.Waiting,
        seq: Number(row.sequence ?? 0),
      }
    )
  );

  if (next) {
    await db.merge(next.id, {
      status: OrderItemKitchenStatus.Pending,
      activated_at: now,
    });
    await db.merge(row.order_item, {
      current_sequence: Number(next.sequence ?? 0),
    });
    await fireStageKOT(db, next.id);
    return;
  }

  // No further stages -> the item's workflow is complete.
  if (row.workflow) {
    await db.merge(row.order_item, {
      workflow_status: "completed",
    });
  }
};

const recordKey = (value: any): string => value?.toString?.() ?? String(value);

/**
 * Complete multiple stage rows in a fixed number of DB round trips.
 *
 * Completion is tracked per-user via `completed_by`, so one user clearing a dish
 * does not remove it from another user's KDS. The first user to complete a row
 * also advances the dish through the workflow (global status / completed_at).
 */
export const completeStages = async (
  db: AnyDb,
  oikIds: string[],
  userId?: string | null
): Promise<void> => {
  if (oikIds.length === 0) return;

  const now = nowSurrealDateTime();
  const ids = oikIds.map((id) => toRecordId(id));

  const rows = rowsOf<any>(
    await db.query(
      `SELECT * FROM ${Tables.order_items_kitchen} WHERE id IN $ids`,
      { ids }
    )
  );
  if (rows.length === 0) return;

  if (userId) {
    await db.query(
      `UPDATE ${Tables.order_items_kitchen}
       SET completed_by = array::add(completed_by ?? [], $user)
       WHERE id IN $ids`,
      { ids, user: toRecordId(userId) }
    );
  }

  const toComplete = rows.filter(
    (row) => row.status !== OrderItemKitchenStatus.Completed
  );
  if (toComplete.length === 0) return;

  const toCompleteIds = toComplete.map((row) => row.id);

  await db.query(
    `UPDATE ${Tables.order_items_kitchen}
     SET status = $completed, completed_at = $now, user = $user
     WHERE id IN $toCompleteIds`,
    {
      toCompleteIds,
      completed: OrderItemKitchenStatus.Completed,
      now,
      user: userId ? toRecordId(userId) : null,
    }
  );

  const orderItems = [
    ...new Set(toComplete.map((row) => row.order_item)),
  ];

  const allWaiting = rowsOf<any>(
    await db.query(
      `SELECT * FROM ${Tables.order_items_kitchen}
       WHERE order_item IN $ois AND status = $waiting
       ORDER BY sequence ASC`,
      {
        ois: orderItems,
        waiting: OrderItemKitchenStatus.Waiting,
      }
    )
  );

  const activations: { next: any; row: any }[] = [];
  const workflowCompletions: any[] = [];

  for (const row of toComplete) {
    const orderItemKey = recordKey(row.order_item);
    const next = allWaiting.find(
      (waiting) =>
        recordKey(waiting.order_item) === orderItemKey &&
        Number(waiting.sequence ?? 0) > Number(row.sequence ?? 0)
    );

    if (next) {
      activations.push({ next, row });
    } else if (row.workflow) {
      workflowCompletions.push(row.order_item);
    }
  }

  await Promise.all(
    activations.map(({ next }) =>
      db.merge(next.id, {
        status: OrderItemKitchenStatus.Pending,
        activated_at: now,
      })
    )
  );
  await Promise.all(
    activations.map(({ next, row }) =>
      db.merge(row.order_item, {
        current_sequence: Number(next.sequence ?? 0),
      })
    )
  );
  await Promise.all(
    workflowCompletions.map((orderItem) =>
      db.merge(orderItem, { workflow_status: "completed" })
    )
  );
  await Promise.all(
    activations.map(({ next }) => fireStageKOT(db, next.id))
  );
};

/**
 * Complete a single stage row for a specific user.
 */
export const completeStage = async (
  db: AnyDb,
  oikId: string,
  userId?: string | null
): Promise<void> => completeStages(db, [oikId], userId);

/**
 * Skip a stuck stage (station offline / manual override) and advance.
 */
export const skipStage = async (
  db: AnyDb,
  oikId: string,
  userId?: string | null
): Promise<void> => {
  const now = nowSurrealDateTime();
  const row = firstRow<any>(
    await db.query(`SELECT * FROM $oik`, { oik: toRecordId(oikId) })
  );
  if (!row) return;

  await db.merge(toRecordId(oikId), {
    status: OrderItemKitchenStatus.Skipped,
    completed_at: now,
    user: userId ? toRecordId(userId) : null,
  });

  await advanceFrom(db, row, now);
};

/**
 * Recall a completed stage for a specific user: remove that user from
 * `completed_by` so the row reappears on their KDS. The global workflow state
 * is left intact (the dish has physically already moved on); recalling only
 * affects the calling user's view.
 */
export const recallStage = async (
  db: AnyDb,
  oikId: string,
  userId?: string | null
): Promise<void> => {
  if (!userId) return;

  await db.query(
    `UPDATE $oik SET completed_by = array::complement(completed_by ?? [], [$user])`,
    { oik: toRecordId(oikId), user: toRecordId(userId) }
  );
};

/**
 * Cancel all non-completed stage rows for an order item (voids / cancellations)
 * so downstream waiting stages never surface on the KDS.
 */
export const cancelItemStages = async (
  db: AnyDb,
  orderItemId: string
): Promise<void> => {
  await db.query(
    `UPDATE ${Tables.order_items_kitchen}
     SET status = $cancelled
     WHERE order_item = $oi AND status != $completed`,
    {
      cancelled: OrderItemKitchenStatus.Cancelled,
      completed: OrderItemKitchenStatus.Completed,
      oi: toRecordId(orderItemId),
    }
  );
};
