import {Layout} from "@/screens/partials/layout.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Order as OrderModel, ORDER_FETCHES, OrderStatus} from "@/api/model/order.ts";
import {Tables} from "@/api/db/tables.ts";
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import {OrderBox} from "@/components/orders/order.box.tsx";
import ScrollContainer from "react-indiana-drag-scroll";
import {Floor} from "@/api/model/floor.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {User} from "@/api/model/user.ts";
import {useAtom} from "jotai";
import {appAlert, appPage, appState, AppStateInterface} from "@/store/jotai.ts";
import {OrderType} from "@/api/model/order_type.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {getLocalTimeZone, today} from '@internationalized/date';
import {DateValue} from "react-aria-components";
import {Button} from "@/components/common/input/button.tsx";
import {faBars, faChair, faTableColumns} from "@fortawesome/free-solid-svg-icons";
import {OrderRow} from "@/components/orders/order.row.tsx";
import {Table} from "@/api/model/table.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {Dropdown, DropdownItem} from "@/components/common/react-aria/dropdown.tsx";
import {LiveSubscription, RecordId, StringRecordId} from "surrealdb";
import {toast} from "sonner";
import {useQueryBuilder} from "@/api/db/query-builder.ts";
import {LabelValue} from "@/api/model/common.ts";
import {assertOrderMutationsAllowed} from "@/lib/closing.guard.ts";
import {OrderMerge, OrderMergeCreatePayload} from "@/api/model/order_merge.ts";
import {toRecordId} from "@/lib/utils.ts";
import {generateNextInvoiceNumber, getNextAutoId} from "@/lib/invoice.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {useTranslation} from "react-i18next";
import {translateOrderStatus} from "@/lib/order.ts";

export const Orders = () => {
  const {t} = useTranslation('orders');
  const db = useDB();
  const [liveQuery, setLiveQuery] = useState<LiveSubscription | null>(null);

  const [state, setState] = useAtom(appState);
  const [date, setDate] = useState<DateValue>(today(getLocalTimeZone()));
  const [view, setView] = useState<'row' | 'column'>('column');
  const selectedOrderFilters = useMemo(() => ({
    users: state?.ordersFilters?.users ?? [],
    floors: state?.ordersFilters?.floors ?? [],
    statuses: state?.ordersFilters?.statuses ?? [],
    orderTypes: state?.ordersFilters?.orderTypes ?? [],
  }), [state?.ordersFilters]);

  const [merging, setMerging] = useState<boolean>(false);
  const [mergingOrders, setMergingOrders] = useState<OrderModel[]>([]);
  const [mergingTable, setMergingTable] = useState<string>();

  const [, setAlert] = useAtom(appAlert);
  const [app,] = useAtom(appPage);

  const [orders, setOrders] = useState<OrderModel[]>([]);

  const updateOrderFilter = useCallback((key: keyof AppStateInterface['ordersFilters'], value: LabelValue[]) => {
    setState(prev => ({
      ...prev,
      ordersFilters: {
        users: prev?.ordersFilters?.users ?? [],
        floors: prev?.ordersFilters?.floors ?? [],
        statuses: prev?.ordersFilters?.statuses ?? [],
        orderTypes: prev?.ordersFilters?.orderTypes ?? [],
        [key]: value ?? [],
      }
    }));
  }, [setState]);


  const orderFilters = useMemo(() => {
    const floorFilters = [];
    const userFilters = [];
    const orderTypeFilters = [];
    const statusFilters = [];

    const f = [];

    selectedOrderFilters?.floors?.forEach(floor => {
      floorFilters.push(`floor = ${floor.value}`);
    });
    if (floorFilters.length > 0) {
      f.push(`(${floorFilters.join(' or ')})`);
    }

    selectedOrderFilters?.users?.forEach(user => {
      userFilters.push(`user = ${user.value}`);
    });
    if (userFilters.length > 0) {
      f.push(`(${userFilters.join(' or ')})`);
    }

    selectedOrderFilters?.statuses?.forEach(status => {
      statusFilters.push(`status = "${status.value}"`);
    });
    if (statusFilters.length > 0) {
      f.push(`(${statusFilters.join(' or ')})`);
    }

    selectedOrderFilters?.orderTypes?.forEach(order_type => {
      orderTypeFilters.push(`order_type = ${order_type.value}`);
    });
    if (orderTypeFilters.length > 0) {
      f.push(`(${orderTypeFilters.join(' or ')})`);
    }

    if (date) {
      f.push(`(time::format(created_at, "%Y-%m-%d") = "${date?.toString()}")`);
    }

    return f;
  }, [selectedOrderFilters, date]);

  const ordersQb = useQueryBuilder(
    Tables.orders, '*', orderFilters.map(item => `and ${item}`), 99999, 0, ['created_at desc'],
    ORDER_FETCHES
  );

  useEffect(() => {
    ordersQb.setWheres(orderFilters.map(item => `and ${item}`));
  }, [orderFilters]);

  const fetchOrders = useCallback(async () => {
    const [listQuery] = await db.query(ordersQb.queryString, ordersQb.parameters);

    setOrders(listQuery as OrderModel[]);
  }, [ordersQb.queryString, ordersQb.parameters]);

  useEffect(() => {
    fetchOrders();
  }, [ordersQb.queryString, ordersQb.parameters]);

  const {
    data: floors,
  } = useApi<SettingsData<Floor>>(Tables.floors, ['deleted_at = none'], ['priority asc'], 0, 99999);

  const {
    data: tables,
  } = useApi<SettingsData<Table>>(Tables.tables, ['deleted_at = none'], ['floor.name asc'], 0, 99999);

  const {
    data: users,
  } = useApi<SettingsData<User>>(Tables.users, ['deleted_at = none'], [], 0, 99999);

  const {
    data: orderTypes,
  } = useApi<SettingsData<OrderType>>(Tables.order_types, ['deleted_at = none'], [], 0, 99999);

  const runLiveQuery = async () => {
    const result = await db.live(Tables.orders, function (action,) {
      // delete or adding new orders will result in new data
      if (action === 'CREATE' || action === 'DELETE') {
        fetchOrders();
      }

      // TODO: handle order updates smartly
    });

    setLiveQuery(result);
  }

  useEffect(() => {
    runLiveQuery().then();

    return () => {
      liveQuery?.kill().then(() => console.log('live query killed')).catch(() => undefined);
    }
  }, []);

  const selectedTable = useMemo(() => {
    return tables?.data.find(item => item.id.toString() === mergingTable);
  }, [mergingTable, tables?.data]);

  const [isSaving, setIsSaving] = useState(false);
  const confirmMerge = async () => {

    if (!mergingTable) {
      setAlert(prev => ({
        ...prev,
        opened: true,
        type: 'error',
        message: t('merge.chooseTableAlert')
      }))

      return;
    }

    try {
      await assertOrderMutationsAllowed(db);
      setIsSaving(true);
      let items: string[] = [];
      const oldItems: OrderMerge['old_items'] = {};

      for (const order of mergingOrders) {
        const orderItems = order.items.map(item => toRecordId(item.id.toString()));
        oldItems[order.id.toString()] = orderItems;

        // Collect item ids from all selected orders
        items = [
          ...items,
          ...orderItems
        ];

        // Mark orders as merged
        await db.merge(order.id, {
          status: OrderStatus['Merged'],
          items: [], // remove items from main order
          tags: [...(order.tags || []), OrderStatus['Merged']]
        });
      }

      const nextInvoiceNumber = await generateNextInvoiceNumber(db);
      const nextAutoId = await getNextAutoId(db);

      const orderData = {
        floor: new RecordId('floor', selectedTable.floor.id),
        covers: mergingOrders.reduce((prev, item) => prev + item.covers, 0) || 1, // Distribute covers
        // tax: order.tax ? new StringRecordId(order.tax.id.toString()) : null,
        // tax_amount: 0, // Will be calculated per split
        tags: [OrderStatus['Merged']],
        // discount: order.discount ? new StringRecordId(order.discount.id.toString()) : null,
        // discount_amount: 0, // Will be calculated per split
        // customer: order.customer ? new StringRecordId(order.customer.id.toString()) : null,
        order_type: mergingOrders[0].order_type.id,
        status: OrderStatus["In Progress"],
        auto_id: nextAutoId,
        invoice_number: nextInvoiceNumber,
        items: items,
        table: new StringRecordId(mergingTable),
        user: mergingOrders[0].user.id,
        created_at: new Date(),
      };

      const mergedOrder = await db.create(Tables.orders, orderData);
      const mergedOrderId = mergedOrder[0].id.toString();
      const newItems: OrderMerge['new_items'] = {
        [mergedOrderId]: [...items]
      };

      for (const item of items) {
        await db.merge(item, {
          order: mergedOrder[0].id
        });
      }

      // create merge entry
      const mergePayload = {
        created_at: new Date(),
        created_by: toRecordId(app.user.id),
        new_order: mergedOrder[0].id,
        old_orders: mergingOrders.map(item => item.id),
        old_items: oldItems,
        new_items: newItems,
      };

      await db.create(Tables.order_merge, mergePayload)

      postOrderTracking({
        module: "Merge orders",
        page: app?.page,
        orderId: mergedOrder[0].id,
        payload: {
          source_orders: mergingOrders.map((item) => item.id.toString()),
          table: mergingTable,
        },
        user: app?.user,
      });

      toast.success(t('merge.success', {invoiceNumber: mergedOrder[0].invoice_number}));

      // reset to default
      setMerging(false);
      setMergingTable(undefined);
      setMergingOrders([]);

    } catch (error) {
      console.error('Error creating merging orders:', error);
      toast.error(t('merge.failed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Layout containerClassName="overflow-hidden">
      <div className="flex gap-5 p-3 flex-col">
        <div className="h-[60px] flex-0 rounded-xl bg-white flex items-center px-3 gap-3">
          <div className="min-w-[200px]">
            <ReactSelect
              options={[OrderStatus["In Progress"], OrderStatus.Paid, OrderStatus.Cancelled, OrderStatus.Spilt, OrderStatus.Merged].map(item => ({
                label: translateOrderStatus(t, item),
                value: item
              }))}
              isMulti
              placeholder={t('filters.status')}
              value={selectedOrderFilters.statuses}
              onChange={(value: LabelValue[]) => updateOrderFilter('statuses', value)}
            />
          </div>
          <div className="min-w-[200px]">
            <ReactSelect
              options={orderTypes?.data.map(item => ({
                label: item.name,
                value: item.id
              }))}
              isMulti
              placeholder={t('filters.orderTypes')}
              value={selectedOrderFilters.orderTypes}
              onChange={(value: LabelValue[]) => updateOrderFilter('orderTypes', value)}
            />
          </div>
          <div className="min-w-[200px]">
            <ReactSelect
              options={floors?.data?.map(item => ({
                label: item.name,
                value: item.id
              }))}
              isMulti
              placeholder={t('filters.floors')}
              value={selectedOrderFilters.floors}
              onChange={(value: LabelValue[]) => updateOrderFilter('floors', value)}
            />
          </div>
          <div className="min-w-[200px]">
            <ReactSelect
              options={users?.data?.map(item => ({
                label: item.first_name + ' ' + item.last_name,
                value: item.id
              }))}
              isMulti
              placeholder={t('filters.users')}
              value={selectedOrderFilters.users}
              onChange={(value: LabelValue[]) => updateOrderFilter('users', value)}
            />
          </div>
          <div>
            <DatePicker value={date} onChange={setDate} maxValue={today(getLocalTimeZone())} isClearable/>
          </div>
          <div className="input-group flex-1 justify-end">
            <Button icon={faTableColumns} variant="primary" onClick={() => setView('column')}
                    active={view === 'column'}>
              {t('view.blocks')}
            </Button>
            <Button icon={faBars} variant="primary" onClick={() => setView('row')} active={view === 'row'}>
              {t('view.table')}
            </Button>
          </div>
        </div>
        {view === 'column' && (
          <ScrollContainer className="h-[calc(100vh_-_190px)]">
            <div className="flex-1 rounded-xl flex gap-3 flex-row">
              {orders.map(item => (
                <div className="w-[400px] flex-shrink-0" key={item.id}>
                  <OrderBox
                    order={item}
                    merging={merging}
                    mergingOrders={mergingOrders}
                    onMergeSelect={(order, status) => {
                      if (status) {
                        setMerging(true);

                        setMergingOrders(prev => [
                          ...prev,
                          order
                        ]);
                      } else {
                        setMergingOrders(prev => prev.filter(order => order.id.toString() !== item.id.toString()));
                      }
                    }}
                    onAction={fetchOrders}
                  />
                </div>
              ))}
            </div>
          </ScrollContainer>
        )}

        {view === 'row' && (
          <ScrollContainer className="max-h-[calc(100vh_-_190px)]">
            <div className="flex-1 rounded-xl flex flex-col">
              {orders.map(item => (
                <OrderRow order={item} key={item.id}/>
              ))}
            </div>
          </ScrollContainer>
        )}

        <div className="h-[60px] flex-0 rounded-xl bg-white flex items-center px-3 gap-3">
          {merging && (
            <div className="flex gap-5">
              <Dropdown
                label={<><FontAwesomeIcon icon={faChair} className="mr-3"/> {t('merge.chooseTable')}{selectedTable ? ` (${selectedTable.name}${selectedTable.number})` : ''}</>}
                btnSize="lg"
                className="flex-1 h-[300px] overflow-auto"
                onAction={(key) => {
                  setMergingTable(key.toString());
                }}
              >
                {tables?.data?.map(item => (
                  <DropdownItem isActive={item.id.toString() === mergingTable} id={item.id.toString()}
                                key={item.id.toString()} className="min-w-[200px]">
                    {item.name + '' + item.number}
                  </DropdownItem>
                ))}
              </Dropdown>

              <Button
                variant="success"
                size="lg"
                disabled={mergingOrders.length <= 1 || isSaving}
                onClick={confirmMerge}
                isLoading={isSaving}
              >
                {mergingOrders.length <= 1 ? t('merge.selectTwoOrMore') : t('merge.confirmMerging', {count: mergingOrders.length})}
              </Button>

              <Button flat size="lg" variant="danger" onClick={() => {
                setMerging(false);
                setMergingOrders([]);
              }}>
                {t('merge.cancelMerging')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
