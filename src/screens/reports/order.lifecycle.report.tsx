import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {OrderItem} from "@/api/model/order_item.ts";
import {OrderVoid} from "@/api/model/order_void.ts";
import {OrderItemKitchen} from "@/api/model/order_item_kitchen.ts";
import {toLuxonDateTime} from "@/lib/datetime.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
  faCircle,
  faMoneyBillWave,
  faPlayCircle,
  faPlusCircle,
  faTrash,
  faUtensils,
} from "@fortawesome/free-solid-svg-icons";
import {Tracking} from "@/api/model/tracking.ts";

type TimelineType = "start" | "addition" | "deletion" | "kitchen_complete" | "payment" | string;

type TimelineEvent = {
  key: string;
  type: TimelineType;
  timestamp: unknown;
  title: string;
  details?: string;
};

type LifecycleState = {
  order: Order | null;
  additions: OrderItem[];
  deletions: Array<{source: "void" | "item"; data: OrderVoid | OrderItem}>;
  kitchenCompletions: OrderItemKitchen[];
  tracking: Tracking[]
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const orderIdParam = (params.get("order_id") || "").trim();
  return {orderIdParam};
};

export const OrderLifecycleReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [state, setState] = useState<LifecycleState>({
    order: null,
    additions: [],
    deletions: [],
    kitchenCompletions: [],
    tracking: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filters = useMemo(parseFilters, []);
  const orderSuffix = useMemo(() => Number(filters.orderIdParam), [filters.orderIdParam]);
  const subtitle = filters.orderIdParam ? `Order: ${filters.orderIdParam}` : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  const fetchData = async () => {
    if (!orderSuffix) {
      setError("Order ID is required.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [orderRows] = await queryRef.current(
        `
          SELECT * FROM ${Tables.orders}
                   where auto_id = $orderSuffix
          FETCH items, items.item, payments, payments.payment_type, user, cashier
        `,
        {orderSuffix}
      );

      const order = (Array.isArray(orderRows) ? orderRows[0] : orderRows || null) as Order | null;

      if (!order) {
        setState({
          order: null,
          additions: [],
          deletions: [],
          kitchenCompletions: [],
          tracking: []
        });
        setLoading(false);
        return;
      }

      const [additionRows] = await queryRef.current(
        `
          SELECT * FROM ${Tables.order_items}
          WHERE order = type::record('${Tables.orders}', $orderSuffix)
          FETCH item, created_by
        `,
        {orderSuffix}
      );

      const [voidRows] = await queryRef.current(
        `
          SELECT * FROM ${Tables.order_voids}
          WHERE order = type::record('${Tables.orders}', $orderSuffix)
          FETCH deleted_by, order_item, items
        `,
        {orderSuffix}
      );

      const [deletedItemRows] = await queryRef.current(
        `
          SELECT * FROM ${Tables.order_items}
          WHERE order = type::record('${Tables.orders}', $orderSuffix) AND deleted_at != NONE
          FETCH item, created_by
        `,
        {orderSuffix}
      );

      const [kitchenRows] = await queryRef.current(
        `
          SELECT * FROM ${Tables.order_items_kitchen}
          WHERE order_item.order = type::record('${Tables.orders}', $orderSuffix) AND completed_at != NONE
          FETCH kitchen, order_item, order_item.item
        `,
        {orderSuffix}
      );

      const orderStart = toLuxonDateTime(order.created_at as any).toMillis();
      const additions = ((additionRows || []) as OrderItem[]).filter((item) => {
        if (item.is_addition) return true;
        return toLuxonDateTime(item.created_at as any).toMillis() > orderStart;
      });

      const deletions: Array<{source: "void" | "item"; data: OrderVoid | OrderItem}> = [
        ...((voidRows || []) as OrderVoid[]).map((item) => ({source: "void" as const, data: item})),
        ...((deletedItemRows || []) as OrderItem[]).map((item) => ({source: "item" as const, data: item})),
      ];

      const [tracking] = await queryRef.current(
        `SELECT * FROM ${Tables.tracking} where payload.order = $payload`,
        {
          payload: order.id.toString()
        }
      );

      setState({
        order,
        additions,
        deletions,
        kitchenCompletions: (kitchenRows || []) as OrderItemKitchen[],
        tracking: tracking
      });
    } catch (err) {
      console.error("Failed to load order lifecycle report", err);
      setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
  
    void fetchData();
  }, [orderSuffix]);

  const events = useMemo(() => {
    const timeline: TimelineEvent[] = [];
    if (!state.order) return timeline;

    timeline.push({
      key: `start-${state.order.id}`,
      type: "start",
      timestamp: state.order.created_at,
      title: "Order started",
      details: state.order.invoice_number ? `Invoice #${state.order.invoice_number}` : undefined,
    });

    state.additions.forEach((item) => {
      timeline.push({
        key: `addition-${item.id}`,
        type: "addition",
        timestamp: item.created_at,
        title: "Item added",
        details: `${item.item?.name || "Item"} x${item.quantity || 1}`,
      });
    });

    state.tracking.forEach(item => {
      timeline.push({
        key: `tracking-${item.id}`,
        type: item.module,
        timestamp: item.created_at,
        title: item.module,
        details: JSON.stringify(item.payload)
      });
    })

    state.deletions.forEach((entry, index) => {
      if (entry.source === "void") {
        const row = entry.data as OrderVoid;
        timeline.push({
          key: `deletion-void-${row.id}-${index}`,
          type: "deletion",
          timestamp: row.created_at,
          title: "Item deleted/voided",
          details: `${row.reason || "Reason not provided"}${row.comments ? ` - ${row.comments}` : ""}`,
        });
      } else {
        const row = entry.data as OrderItem;
        timeline.push({
          key: `deletion-item-${row.id}-${index}`,
          type: "deletion",
          timestamp: row.deleted_at || row.updated_at || row.created_at,
          title: "Item deleted",
          details: `${row.item?.name || "Item"} x${row.quantity || 1}`,
        });
      }
    });

    state.kitchenCompletions.forEach((row) => {
      timeline.push({
        key: `kitchen-${row.id}`,
        type: "kitchen_complete",
        timestamp: row.completed_at || row.created_at,
        title: "Kitchen completion",
        details: `${row.kitchen?.name || "Kitchen"} - ${row.order_item?.item?.name || "Item"}`,
      });
    });

    if (state.order.completed_at) {
      const paymentBreakdown = (state.order.payments || [])
        .map((payment) => `${payment.payment_type?.name || "Payment"} ${Number(payment.amount || 0)}`)
        .join(", ");
      timeline.push({
        key: `payment-${state.order.id}`,
        type: "payment",
        timestamp: state.order.completed_at,
        title: "Order payment",
        details: "Order marked as paid",
      });
    }

    return timeline.sort((a, b) => toLuxonDateTime(a.timestamp as any).toMillis() - toLuxonDateTime(b.timestamp as any).toMillis());
  }, [state]);

  const iconByType = (type: string) => {
    switch(type){
      case 'start':
        return faPlayCircle;
      case 'addition':
        return faPlusCircle;
      case 'deletion':
        return faTrash;
      case 'kitchen_complete':
        return faUtensils;
      case 'payment':
        return faMoneyBillWave;
      default:
        return faCircle;
    }
  }

  const reportTitle = 'Order lifecycle report';

  if (loading) {
    return <ReportsLayout title={reportTitle} subtitle={subtitle}><div className="py-12 text-center text-neutral-500">{t('loading.orderLifecycle')}</div></ReportsLayout>;
  }
  if (error) {
    return <ReportsLayout title={reportTitle} subtitle={subtitle}><div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div></ReportsLayout>;
  }
  if (!state.order) {
    return <ReportsLayout title={reportTitle} subtitle={subtitle}><div className="py-12 text-center text-neutral-500">{t('errors.noOrderFound')}</div></ReportsLayout>;
  }

  return (
    <ReportsLayout 
      title={reportTitle}
      subtitle={subtitle}
      onRefresh={fetchData}
    >
      <div className="space-y-4">
        <div className="border rounded-lg p-4 bg-neutral-50">
          <div className="text-sm text-neutral-500">{t('columns.order')}</div>
          <div className="text-xl font-semibold">{state.order.invoice_number ? `#${state.order.invoice_number}` : state.order.id.toString()}</div>
          <div className="text-sm text-neutral-600 mt-1">Status: {state.order.status}</div>
        </div>

        <div className="space-y-3">
          {events.length === 0 ? (
            <div className="py-6 text-center text-sm text-neutral-500 border rounded-lg">No lifecycle events found for this order.</div>
          ) : events.map((event) => (
            <div key={event.key} className="border rounded-lg p-4 flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-neutral-100 flex items-center justify-center">
                <FontAwesomeIcon icon={iconByType(event.type)} className="text-neutral-700" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-neutral-900">{event.title}</div>
                <div className="text-sm text-neutral-600">{toLuxonDateTime(event.timestamp as any).toFormat("yyyy-LL-dd HH:mm:ss")}</div>
                {event.details && <div className="text-sm text-neutral-700 mt-1">{event.details}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ReportsLayout>
  );
};
