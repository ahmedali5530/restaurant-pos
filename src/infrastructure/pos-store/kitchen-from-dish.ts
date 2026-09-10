import type { Dish } from '@/api/model/dish.ts';
import type { CreateOrderItemInput } from '@/infrastructure/pos-store/types.ts';
import { OrderItemKitchenStatus } from '@/api/model/order_item_kitchen.ts';

type KitchenLike = { id: any; items?: any[] | null; deleted_at?: any };

const idOf = (value: any): string =>
  value && typeof value === 'object' && value.id != null ? String(value.id) : String(value ?? '');

/**
 * Build kitchen stage payloads from an in-memory hydrated dish (no DB round-trip).
 *
 * Workflow dishes yield one row per stage (first `pending`, rest `waiting`).
 * When `kitchens` is provided, dishes without a workflow fall back to the legacy
 * parallel routing (`kitchen.items ?= dish`): one terminal `pending` row per kitchen.
 */
export function kitchenStagesFromDish(
  dish: Dish | null | undefined,
  kitchens?: KitchenLike[] | null,
): CreateOrderItemInput['kitchenStages'] {
  const workflow = dish?.workflow;
  if (workflow && typeof workflow === 'object' && Array.isArray(workflow.stages) && workflow.stages.length > 0) {
    const overrides = dish?.stage_overrides ?? {};
    return workflow.stages.map((stage: any, index: number) => {
      const stageId = String(stage.id);
      const override = overrides[stageId];
      const kitchenRaw = override ?? stage.kitchen;
      const kitchenId =
        kitchenRaw && typeof kitchenRaw === 'object' && kitchenRaw.id != null
          ? String(kitchenRaw.id)
          : String(kitchenRaw ?? '');
      return {
        kitchenId,
        sequence: Number(stage.sequence ?? index),
        isTerminal: !!stage.is_terminal || index === workflow.stages!.length - 1,
        workflowId: String(workflow.id),
        stageId,
        stageName: stage.name != null ? String(stage.name) : null,
        status:
          index === 0 ? OrderItemKitchenStatus.Pending : OrderItemKitchenStatus.Waiting,
      };
    });
  }

  if (dish?.id && Array.isArray(kitchens) && kitchens.length > 0) {
    const dishId = idOf(dish.id);
    return kitchens
      .filter((kitchen) => !kitchen.deleted_at && (kitchen.items ?? []).some((item) => idOf(item) === dishId))
      .map((kitchen) => ({
        kitchenId: idOf(kitchen.id),
        sequence: 0,
        isTerminal: true,
        status: OrderItemKitchenStatus.Pending,
      }));
  }
  return [];
}
