import { KitchenOrder as KitchenOrderModel } from "@/api/model/kitchen.ts";
import { Countdown } from "@/components/floor/countdown.tsx";
import { DateTime } from "luxon";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/common/input/button.tsx";
import { useDB } from "@/api/db/db.ts";
import { OrderItemName } from "@/components/common/order/order.item.tsx";
import {getInvoiceNumber} from "@/lib/order.ts";
import { toLuxonDateTime } from "@/lib/datetime.ts";
import { completeStage, completeStages } from "@/lib/kitchen/workflow.service.ts";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import {useTranslation} from "react-i18next";

interface Props {
  order: KitchenOrderModel
}

export const KitchenOrder = ({
  order
}: Props) => {
  const db = useDB();
  const [page] = useAtom(appPage);
  const {t} = useTranslation("kitchen");

  const stageStart = order.items[0]?.activated_at ?? order.items[0]?.created_at;
  const diff = DateTime.now().diff(toLuxonDateTime(stageStart)).as('minutes');

  const ready = async () => {
    const ids = order.items
      .filter((item) => !item.order_item?.deleted_at)
      .map((item) => item.id.toString());
    await completeStages(db, ids, page?.user?.id);
  }

  const singleReady = async (item: string) => {
    await completeStage(db, item, page?.user?.id);
  }

  const isAddon = () => {
    return order.items.filter(item => item.order_item.is_addition).length > 0
  }

  return (
    <div className="bg-white rounded-xl shadow">
      <div className={
        cn(
          "flex justify-between p-3 rounded-xl shadow-2xl",
          diff >= 30 && diff <= 59 && 'bg-warning-200 text-warning-700 kitchen-late-order',
          diff >= 60 && 'bg-danger-200 text-danger-700 kitchen-delayed-order',
        )
      }>
        <div className="flex gap-3">
          {order.order?.table && (
            <span className="p-3 text-lg rounded-xl min-w-[56px] flex justify-center items-center" style={{
              color: order.order?.table?.color,
              background: order.order?.table?.background
            }}>{order.order?.table?.name}{order.order?.table?.number}</span>
          )}


          <div className="flex flex-col items-start gap-1">
            <span className="font-bold text-xl">{order.order?.order_type?.name} / {getInvoiceNumber(order.order)}</span>
            <span className="text-xl font-bold">
              <Countdown time={stageStart} />
            </span>
          </div>
        </div>
        <div className="flex flex-col flex-1">
          <span className="text-lg font-bold px-1 rounded text-right">{order.order?.user?.first_name}</span>
          <span className="text-right text-xl text-primary-500">{isAddon() ? t("labels.addon") : ''}</span>
        </div>
      </div>
      <div className="p-3">
        {order.items.map(item => (
          <div
            onClick={() => singleReady(item.id)}
            className={
              cn(
                "flex flex-col",
                item.order_item?.deleted_at ? 'text-danger-700 line-through' : ''
              )
            }
            key={item.id}
          >
            <div className="flex items-center gap-2">
              <OrderItemName item={item.order_item} showQuantity />
              {/*{item.stage_name && (*/}
              {/*  <span className="text-xs font-semibold uppercase bg-primary-100 text-primary-700 rounded px-2 py-0.5">*/}
              {/*    {item.stage_name}*/}
              {/*  </span>*/}
              {/*)}*/}
            </div>
          </div>
        ))}
      </div>
      <div className="p-3">
        <Button variant="success" filled className="w-full" size="lg" onClick={ready}>{t("actions.ready")}</Button>
      </div>
    </div>
  )
}
