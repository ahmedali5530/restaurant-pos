import { dispatchPrint } from "@/lib/print.service.ts";
import { posStore } from "@/infrastructure/pos-store/pos-store.ts";

/**
 * Multi-stage kitchen workflow engine.
 *
 * A dish may reference a reusable `workflow` (ordered `workflow_stage` rows,
 * each pointing to a kitchen). Per-product kitchen overrides live in
 * `menu_item.stage_overrides` (map of stage id -> kitchen id).
 *
 * At fire time one `order_item_kitchen` row is pre-created per stage (see
 * `kitchenStagesFromDish` + PosStore `createOrderWithItems` / `fireOrderItems`).
 * The first stage starts `pending`; later stages start `waiting`. Completing a
 * stage flips the next `waiting` stage to `pending`, which surfaces the item in
 * the next kitchen once the change syncs.
 *
 * Every mutation here goes through the PosStore (Dexie → outbox → Surreal);
 * this module only adds the KOT print side effect.
 */

type AnyDb = any;

/**
 * Best-effort KOT print for a stage row when it becomes active.
 * Builds the payload from Dexie — never waits on a Surreal FETCH.
 */
const fireStageKOT = async (db: AnyDb, oikId: any): Promise<void> => {
  try {
    const row = await posStore.getKitchenRowHydratedForPrint(String(oikId));
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
 * Complete multiple stage rows (local-first).
 *
 * Completion is tracked per-user via `completed_by`, so one user clearing a dish
 * does not remove it from another user's KDS. The first user to complete a row
 * also advances the dish through the workflow (global status / completed_at).
 * Dexie commits first; MERGE ops drain via the outbox. KOT prints for newly
 * activated stages are a best-effort side effect.
 */
export const completeStages = async (
  db: AnyDb,
  oikIds: string[],
  userId?: string | null
): Promise<void> => {
  if (oikIds.length === 0) return;
  const { activated } = await posStore.completeKitchenStages({
    kitchenRowIds: oikIds,
    userId: userId ? String(userId) : null,
  });
  if (activated.length) {
    // Print from local Dexie projection immediately — do not wait for Surreal.
    for (const next of activated) {
      void fireStageKOT(db, next.id);
    }
  }
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
  const { next } = await posStore.skipKitchenStage({
    kitchenRowId: oikId,
    userId: userId ? String(userId) : null,
  });
  if (next) {
    void fireStageKOT(db, next.id);
  }
};

/**
 * Recall a completed stage for a specific user: remove that user from
 * `completed_by` so the row reappears on their KDS. The global workflow state
 * is left intact (the dish has physically already moved on); recalling only
 * affects the calling user's view.
 */
export const recallStage = async (
  _db: AnyDb,
  oikId: string,
  userId?: string | null
): Promise<void> => {
  if (!userId) return;
  await posStore.recallKitchenStage({ kitchenRowId: oikId, userId: String(userId) });
};

/**
 * Cancel all non-completed stage rows for an order item (voids / cancellations)
 * so downstream waiting stages never surface on the KDS.
 */
export const cancelItemStages = async (
  _db: AnyDb,
  orderItemId: string
): Promise<void> => {
  // Local-first: Dexie rows flip to `cancelled` and MERGE ops drain via the outbox.
  await posStore.cancelItemKitchenStages(orderItemId);
};
