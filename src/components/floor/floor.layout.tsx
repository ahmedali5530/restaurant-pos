import {useAtom} from "jotai";
import {appAlert, appPage, appSettings, appState} from "@/store/jotai.ts";
import {CSSProperties, useEffect, useMemo, useState} from "react";
import {Button} from "@/components/common/input/button.tsx";
import {cn, toRecordId} from "@/lib/utils.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Table} from "@/api/model/table.ts";
import {FloorTable} from "@/components/settings/floors/layout/table.tsx";
import {useDB} from "@/api/db/db.ts";
import {Order, OrderStatus} from "@/api/model/order.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faChair} from "@fortawesome/free-solid-svg-icons";
import {ne, LiveSubscription} from "surrealdb";
import {nowSurrealDateTime} from "@/lib/datetime.ts";
import {getOrderPunchDisabledMessage, isCurrentCycleClosed} from "@/lib/closing.guard.ts";


export const FloorLayout = () => {
  const [state, setState] = useAtom(appState);
  const [, setSettings] = useAtom(appSettings);
  const db = useDB();
  const [liveQuery, setLiveQuery] = useState<LiveSubscription | null>(null);
  const [tablesLiveQuery, setTablesLiveQuery] = useState<LiveSubscription | null>(null);
  const [page] = useAtom(appPage);
  const [, setAlert] = useAtom(appAlert);
  const [settings] = useAtom(appSettings);
  const [isClosingLocked, setIsClosingLocked] = useState(false);

  const floors = useMemo(() => {
    return settings.floors;
  }, [settings.floors]);

  const tables = useMemo(() => {
    if (state.floor) {
      return settings.tables.filter(item => item.floor.id.toString() === state.floor.id.toString());
    }

    return settings.tables;
  }, [settings.tables, state.floor]);

  const categories = useMemo(() => {
    return settings.categories.filter(item => item.show_in_menu);
  }, [settings.categories]);

  const orderTypes = useMemo(() => {
    return settings.order_types;
  }, [settings.order_types]);

  const paymentTypes = useMemo(() => {
    return settings.payment_types;
  }, [settings.payment_types]);

  const {
    data: orders,
    fetchData: fetchOrders
  } = useApi<SettingsData<Order>>(Tables.orders, [`status = "${OrderStatus["In Progress"]}"`], ['created_at asc'],
    undefined, undefined, ['customer', 'items', 'items.item', 'order_type', 'table', 'user'], {}, [
      'covers', 'created_at', 'floor', 'id', 'invoice_number', 'order_type', 'status', 'table', 'tags', 'user', 'items.*'
    ]);

  const fetchTables = async () => {
    const [t] = await db.query<Table[]>(
      `SELECT id, locked_at, locked_by, is_locked, priority
       FROM ${Tables.tables}
       ORDER BY priority ASC`
    );

    const tableLocks = Array.isArray(t) ? t : [];
    if (tableLocks.length === 0) {
      return;
    }

    setSettings(prev => ({
      ...prev,
      tables: prev.tables.map((cachedTable) => {
        const updatedTable = tableLocks.find(item => item.id.toString() === cachedTable.id.toString());
        if (!updatedTable) {
          return cachedTable;
        }

        return {
          ...cachedTable,
          is_locked: updatedTable.is_locked,
          locked_at: updatedTable.locked_at,
          locked_by: updatedTable.locked_by,
          priority: updatedTable.priority,
        };
      })
    }));
  }

  const runLiveQuery = async () => {
    const result = await db.live(Tables.orders, function () {
      fetchOrders();
    });

    setLiveQuery(result);
  }

  const runTablesLiveQuery = async () => {
    const result = await db.live(Tables.tables, function () {
      fetchTables();
    });

    setTablesLiveQuery(result);
  }

  useEffect(() => {
    runLiveQuery().then();
    runTablesLiveQuery().then();

    return () => {
      liveQuery?.kill().catch(() => undefined);
      tablesLiveQuery?.kill().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const checkLock = async () => {
      try {
        const locked = await isCurrentCycleClosed(db);
        setIsClosingLocked(locked);
        if (locked) {
          setAlert(prev => ({
            ...prev,
            message: getOrderPunchDisabledMessage(),
            type: "warning",
            opened: true
          }));
        }
      } catch (error) {
        console.error("Failed to check closing lock:", error);
      }
    };

    checkLock().then();
  }, []);

  useEffect(() => {
    if (!state.floor && floors?.length > 0) {
      setState(prev => ({
        ...prev,
        floor: floors[0]
      }));
    }
  }, [floors, state.floor]);

  const tableOrders = (tableId: string) => {
    return orders?.data?.filter(item => item?.table?.id?.toString() === tableId.toString())
  }

  const tableOrder = (tableId: string) => {
    return orders?.data?.find(item =>
      item?.table?.id?.toString() === tableId.toString()
    )
  }

  const onClick = async (item: Table) => {
    if (isClosingLocked) {
      setAlert(prev => ({
        ...prev,
        message: getOrderPunchDisabledMessage(),
        type: "warning",
        opened: true
      }));
      return;
    }

    if (item.is_locked) {
      setAlert(prev => ({
        ...prev,
        message: `${item.locked_by} is already taking order on this table`,
        type: 'error',
        opened: true
      }))
    }

    if (!item.is_block && !item.is_locked) {
      const order = tableOrder(item.id);
      let cart = state.cart;

      if (state.switchTable) {
        if (state.order.id !== 'new') {
          // update new table in order
          await db.merge(toRecordId(state.order.id), {
            table: toRecordId(item.id),
          });
        }
        cart = [];
      }

      if (order) {
        cart = [];
      }

      const seats = new Map();
      order?.items.forEach(item => {
        if (item.seat) {
          seats.set(item.seat, item.seat);
        }
      });

      const seatsArray = Array.from(seats.values());

      const noSeat = state.cart.some(item => item.seat === undefined);

      setState(prev => ({
        ...prev,
        table: item,
        showFloor: false,
        showPersons: tableOrder(item.id) ? false : item.ask_for_covers,
        persons: tableOrder(item.id) ? tableOrder(item.id)?.covers?.toString() : '1',
        orders: tableOrders(item.id),
        cart: cart,
        seats: seatsArray,
        seat: noSeat ? undefined : (seatsArray.length > 0 ? seatsArray[0] : undefined),
        order: {
          order: order,
          id: order ? order.id : 'new'
        },
        switchTable: false, // turn off switch table flag
        customer: order?.customer, // clear customer
        orderType: (item.order_types?.length > 0 ? item.order_types : orderTypes)[0]
      }));

      setSettings(prev => ({
        ...prev,
        categories: item.categories?.length > 0 ? item.categories : categories,
        order_types: item.order_types?.length > 0 ? item.order_types : orderTypes,
        payment_types: item.payment_types?.length > 0 ? item.payment_types : paymentTypes,
      }));

      await db.merge(item.id, {
        is_locked: true,
        locked_at: nowSurrealDateTime(),
        locked_by: `${page.user.first_name} ${page.user.last_name}`
      });
    }
  }

  return (
    <>
      <div className="flex flex-col transition-all delay-75" style={{
        background: state.floor?.background
      }}>
        <div className="h-[80px] bg-white p-3 flex items-center">
          {state.switchTable && <div className="text-xl"><FontAwesomeIcon icon={faChair}/> Switch from
              Table {state?.table?.name}{state?.table?.number} to another</div>}
          {isClosingLocked && (
            <div className="alert alert-warning w-full">
              {getOrderPunchDisabledMessage()}
            </div>
          )}
        </div>
        <div className="layout relative h-[calc(100vh_-_80px_-_80px)] p-3 overflow-hidden">
          {state.floor && (
            <>
              {tables?.map(item => (
                <FloorTable
                  order={tableOrder(item.id)}
                  table={item}
                  isEditing={false}
                  isLocked={item.is_locked}
                  onClick={() => onClick(item)}
                  key={item.id}
                  numberOfOrders={tableOrders(item.id)?.length}
                />
              ))}
            </>
          )}
        </div>
        <div className="floor-btns flex gap-3 p-3">
          {floors?.map(item => (
            <Button
              variant="custom"
              key={item.id}
              size="lg"
              className={
                cn(
                  "flex-1 relative outline-none pressable",
                  state?.floor && item.id.toString() === state?.floor?.id?.toString() && 'bg-gradient'
                )
              }
              onClick={() => setState(prev => ({
                ...prev,
                floor: item
              }))}
              style={{
                '--background': item.background,
                '--color': item.color,
                '--scale': 0.98
              } as CSSProperties}
            >{item.name}</Button>
          ))}
        </div>
      </div>
    </>
  );
}
