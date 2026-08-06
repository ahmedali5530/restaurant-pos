import { useState } from "react";
import { Kitchen, KitchenOrderBatch } from "@/api/model/kitchen.ts";
import { Order } from "@/api/model/order.ts";
import { OrderItemKitchen } from "@/api/model/order_item_kitchen.ts";
import { Countdown } from "@/components/floor/countdown.tsx";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/common/input/button.tsx";
import { useDB } from "@/api/db/db.ts";
import { OrderItemName } from "@/components/common/order/order.item.tsx";
import { getInvoiceNumber } from "@/lib/order.ts";
import { nowInAppTimezone, toLuxonDateTime } from "@/lib/datetime.ts";
import { completeStage, completeStages } from "@/lib/kitchen/workflow.service.ts";
import { dispatchPrint } from "@/lib/print.service.ts";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { useTranslation } from "react-i18next";

export type KitchenBoardTicket = {
  order: Order
  batch: KitchenOrderBatch
  /** Full batch items for full-batch reprint (when card is a chunk). */
  reprintItems: OrderItemKitchen[]
  isAddon: boolean
  isContinued: boolean
  chunkIndex: number
  chunkTotal: number
  showKindLabel: boolean
  /** Shared border color for multi-part tickets of the same order. */
  groupColor?: string
};

interface Props {
  ticket: KitchenBoardTicket
  kitchen?: Kitchen
  isNew?: boolean
}

const batchStart = (batch: KitchenOrderBatch) =>
  batch.items[0]?.activated_at ?? batch.items[0]?.created_at ?? batch.createdAt;

export const KitchenOrder = ({
  ticket,
  kitchen,
  isNew = false,
}: Props) => {
  const db = useDB();
  const [page] = useAtom(appPage);
  const { t } = useTranslation(["kitchen", "payment"]);
  const [printing, setPrinting] = useState(false);

  const { order, batch, reprintItems, isAddon, isContinued, showKindLabel, groupColor } = ticket;
  const stageStart = batchStart(batch);
  const diff = stageStart
    ? nowInAppTimezone().diff(toLuxonDateTime(stageStart)).as('minutes')
    : 0;

  const ready = async () => {
    const ids = batch.items
      .filter((item) => !item.order_item?.deleted_at)
      .map((item) => item.id.toString());
    await completeStages(db, ids, page?.user?.id);
  };

  const singleReady = async (item: string) => {
    await completeStage(db, item, page?.user?.id);
  };

  const reprint = async () => {
    if (!kitchen?.printers?.length || printing) {
      return;
    }

    const items = reprintItems
      .filter((item) => !item.order_item?.deleted_at && item.order_item)
      .map((item) => ({
        ...item.order_item,
        item: item.order_item.item,
      }));

    if (items.length === 0) {
      return;
    }

    setPrinting(true);
    try {
      await dispatchPrint(db, 'kitchen', {
        items,
        order,
        kitchenName: kitchen.name,
        table: order?.table,
        duplicate: true,
      }, {
        title: t("payment:print.kitchenTitle"),
        copies: 1,
        userId: page?.user?.id,
        printers: kitchen.printers,
      });
    } catch (error) {
      console.error('Kitchen KOT reprint failed', error);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div
      className={cn(
        "bg-white rounded-xl shadow flex flex-col w-full border-[3px]",
        isNew && "ring-2 ring-primary-500 kitchen-new-order",
        !groupColor && "border-transparent",
      )}
      style={groupColor ? { borderColor: groupColor } : undefined}
    >
      <div className={
        cn(
          "flex justify-between p-2 rounded-t-xl",
          diff >= 30 && diff <= 59 && 'bg-warning-200 text-warning-700 kitchen-late-order',
          diff >= 60 && 'bg-danger-200 text-danger-700 kitchen-delayed-order',
          !(diff >= 30) && isNew && 'bg-primary-100 text-primary-800',
        )
      }>
        <div className="flex gap-2 min-w-0">
          {order?.table && (
            <span className="p-2 text-base rounded-lg min-w-[48px] flex justify-center items-center shrink-0" style={{
              color: order?.table?.color,
              background: order?.table?.background
            }}>{order?.table?.name}{order?.table?.number}</span>
          )}

          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <span className="font-bold text-lg truncate max-w-full">
              {[order?.order_type?.name, getInvoiceNumber(order)].filter(Boolean).join(' / ')}
            </span>
            {stageStart && (
              <span className="text-lg font-bold">
                <Countdown time={stageStart} />
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col shrink-0 items-end">
          <span className="text-base font-bold px-1 rounded text-right">{order?.user?.first_name}</span>
          {(showKindLabel || isContinued) && (
            <span className={cn(
              "text-sm font-bold uppercase text-right",
              isAddon || isContinued ? "text-primary-500" : "text-neutral-500"
            )}>
              {isContinued
                ? t("labels.continued")
                : isAddon
                  ? t("labels.addon")
                  : t("labels.original")}
            </span>
          )}
        </div>
      </div>

      <div className={cn(
        "p-2",
        isNew && "bg-primary-50 kitchen-new-order-batch",
      )}>
        {batch.items.map(item => (
          <div
            onClick={() => singleReady(item.id.toString())}
            className={
              cn(
                "flex flex-col cursor-pointer",
                item.order_item?.deleted_at ? 'text-danger-700 line-through' : ''
              )
            }
            key={item.id}
          >
            <div className="flex items-center gap-2">
              <OrderItemName item={item.order_item} showQuantity />
            </div>
          </div>
        ))}
      </div>

      <div className="p-1.5 flex gap-1.5">
        <Button
          variant="neutral"
          className="flex-1"
          size="lg"
          isLoading={printing}
          disabled={!kitchen?.printers?.length}
          onClick={reprint}
        >
          {t("actions.reprint")}
        </Button>
        <Button
          variant="success"
          filled
          className="flex-1"
          size="lg"
          onClick={ready}
        >
          {t("actions.ready")}
        </Button>
      </div>
    </div>
  );
};
