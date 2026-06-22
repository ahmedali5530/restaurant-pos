import {Order as OrderModel, OrderStatus} from "@/api/model/order.ts";
import React, {CSSProperties, useMemo, useState} from "react";
import {useAtom} from "jotai";
import {useDB} from "@/api/db/db.ts";
import {appPage, closingEnforcementAtom} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {OrderPayment} from "@/components/orders/order.payment.tsx";
import ScrollContainer from "react-indiana-drag-scroll";
import {OrderHeader} from "@/components/orders/order.header.tsx";
import {OrderTimes} from "@/components/orders/order.times.tsx";
import {
  faChair,
  faCodeBranch,
  faCreditCard,
  faEllipsisV,
  faMoneyBillTransfer,
  faObjectGroup,
  faPrint
} from "@fortawesome/free-solid-svg-icons";
import {OrderItemName} from "@/components/common/order/order.item.tsx";
import {Dropdown, DropdownItem, DropdownSeparator} from "@/components/common/react-aria/dropdown.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {dispatchPrint} from "@/lib/print.service";
import {PRINT_TYPE} from "@/lib/print.registry.tsx";
import {OrderTotals} from "@/components/orders/order.totals.tsx";
import {SplitBySeats} from "@/components/orders/split/split.seats.tsx";
import {SplitItems} from "@/components/orders/split/split.items.tsx";
import {SplitAmount} from "@/components/orders/split/split.amount.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {OrderCancelModal} from "@/components/orders/order.cancel.modal.tsx";
import {OrderRefundModal} from "@/components/orders/order.refund.modal.tsx";
import {getOrderFilteredItems} from "@/lib/order.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables";
import {Tax} from "@/api/model/tax.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {useTranslation} from "react-i18next";

interface Props {
  order: OrderModel
  onMergeSelect?: (order: OrderModel, add: boolean) => void
  mergingOrders: OrderModel[]
  merging: boolean
  onAction?: () => void;
}

export const OrderBox = ({
  order, onMergeSelect, mergingOrders, merging, onAction
}: Props) => {
  const {t} = useTranslation('orders');
  const db = useDB();
  const [page] = useAtom(appPage);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const mutationsBlocked = enforcement.orderMutationsBlocked;
  const [payment, setPayment] = useState(false);

  const [splitBySeats, setSplitBySeats] = useState(false);
  const [splitByManually, setSplitByManually] = useState(false);
  const [splitByAmount, setSplitByAmount] = useState(false);
  const [cancelOrderOpen, setCancelOrderOpen] = useState(false);
  const [refundOrderOpen, setRefundOrderOpen] = useState(false);

  const hasSeats = useMemo(() => {
    const items = getOrderFilteredItems(order).filter((item) => item.seat !== undefined);
    return items.length > 1
  }, [order]);

  const mergingOrderIds = useMemo(() => {
    return mergingOrders.map(item => item.id.toString());
  }, [mergingOrders]);

  const {
    data: taxes
  } = useApi<SettingsData<Tax>>(Tables.taxes, ['deleted_at = none']);

  const printTempBill = () => {
    void dispatchPrint(db, PRINT_TYPE.presale_bill, {order, taxes: taxes?.data}, {userId: page?.user?.id});
  }

  const {protectAction} = useSecurity();

  const [{menuConfig: {showTotalInOrderCard, showModifierPriceInOrderCard, showModifiersInOrderCard, showQuantityInOrderCard, showPriceInOrderCard, showGroupsInOrderCard}}] = useAtom(appPage);

  return (
    <>
      <div className="rounded-xl p-3 bg-white gap-5 flex flex-col shadow select-none">
        <OrderHeader order={order}/>
        <OrderTimes order={order}/>
        <div className="separator h-[2px]" style={{'--size': '10px', '--space': '5px'} as CSSProperties}></div>
        <ScrollContainer>
          <div className="overflow-auto max-h-[400px]">
            {getOrderFilteredItems(order).map((item, index) => (
              <OrderItemName
                item={item}
                showQuantity={showQuantityInOrderCard}
                showPrice={showPriceInOrderCard}
                showModifierPrice={showModifierPriceInOrderCard}
                key={index}
                showTotal={showTotalInOrderCard}
                showGroups={showGroupsInOrderCard}
                showModifiers={showModifiersInOrderCard}
              />
            ))}
          </div>
        </ScrollContainer>
        <div className="separator h-[2px]" style={{'--size': '10px', '--space': '5px'} as CSSProperties}></div>
        <OrderTotals order={order} />
        <div className="flex gap-5">
          {merging && (order.status === OrderStatus['In Progress']) ? (
            <>
              <Checkbox onChange={() => {
                if (mergingOrderIds.includes(order.id.toString())) {
                  onMergeSelect(order, false);
                } else {
                  onMergeSelect(order, true);
                }

              }} checked={mergingOrderIds.includes(order.id.toString())} label={t('actions.selectToMerge')}/>
            </>
          ) : (
            <>
              <Dropdown
                label={<><FontAwesomeIcon icon={faEllipsisV} className="mr-3"/> </>}
                btnSize="lg"
                btnFlat={true}
                className="flex-1"
                onAction={(key) => {
                  if (key === 'temp_bill') {
                    protectAction(() => {
                      printTempBill();
                    }, {
                      module: 'Print temp bill',
                      description: 'Print temp bill',
                      payload: {
                        order: order.id.toString()
                      }
                    });
                  }

                  if (key === 'final_bill') {
                    protectAction(() => {
                      void dispatchPrint(db, PRINT_TYPE.final_bill, {order, duplicate: true}, {userId: page?.user?.id});
                    }, {
                      module: 'Print final copy',
                      description: 'Print final copy',
                      payload: {
                        order: order.id.toString()
                      }
                    });
                  }

                  if (key === 'split_by_seats' && hasSeats) {
                    protectAction(() => {
                      setSplitBySeats(true)
                    }, {
                      module: 'Split by seats',
                      description: 'Split by seats',
                      payload: {
                        order: order.id.toString()
                      }
                    });
                  }

                  if (key === 'split_by_items') {
                    protectAction(() => {
                      setSplitByManually(true);
                    }, {
                      module: 'Split by items',
                      description: 'Split by items',
                      payload: {
                        order: order.id.toString()
                      }
                    });
                  }

                  if (key === 'split_by_amount') {
                    protectAction(() => {
                      setSplitByAmount(true);
                    }, {
                      module: 'Split by amount',
                      description: 'Split by amount',
                      payload: {
                        order: order.id.toString()
                      }
                    });
                  }

                  if (key === 'cancel') {
                    protectAction(() => {
                      setCancelOrderOpen(true);
                    }, {
                      module: 'Cancel order',
                      description: 'Cancel order',
                      payload: {
                        order: order.id.toString()
                      }
                    });

                    return;
                  }

                  if (key === 'merge') {
                    protectAction(() => {
                      onMergeSelect(order, true);
                    }, {
                      module: 'Merge orders',
                      description: 'Merge orders',
                      payload: {
                        order: order.id.toString()
                      }
                    });
                  }

                  if (key === 'refund') {
                    protectAction(() => {
                      setRefundOrderOpen(true);
                    }, {
                      module: 'Refund order',
                      description: 'Refund order',
                      payload: {
                        order: order.id.toString()
                      }
                    });

                    return;
                  }
                }}
              >
                {order.status === OrderStatus["In Progress"] && (
                  <>
                    <DropdownItem isDisabled={mutationsBlocked} id="cancel" key="cancel"
                                  className="min-w-[50px] bg-danger-100 text-danger-500">
                      <FontAwesomeIcon icon={faMoneyBillTransfer}/> {t('actions.cancelOrder')}
                    </DropdownItem>
                    <DropdownSeparator/>
                    <DropdownItem isDisabled={mutationsBlocked || hasSeats !== true} id="split_by_seats"
                                  key="split_by_seats" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faChair}/> {t('actions.splitBySeats')}
                    </DropdownItem>
                    <DropdownItem isDisabled={mutationsBlocked} id="split_by_items" key="split_by_items"
                                  className="min-w-[50px]">
                      <FontAwesomeIcon icon={faCodeBranch}/> {t('actions.splitByItems')}
                    </DropdownItem>
                    <DropdownItem isDisabled={mutationsBlocked} id="split_by_amount" key="split_by_amount"
                                  className="min-w-[50px]">
                      <FontAwesomeIcon icon={faCodeBranch}/> {t('actions.splitByAmount')}
                    </DropdownItem>
                    <DropdownSeparator/>
                    <DropdownItem isDisabled={mutationsBlocked} id="merge" key="merge" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faObjectGroup}/> {t('actions.mergeOrders')}
                    </DropdownItem>
                  </>
                )}

                {order.status === OrderStatus["Paid"] && (
                  <>
                    <DropdownItem id="refund" key="refund" className="min-w-[50px] bg-danger-100 text-danger-500">
                      <FontAwesomeIcon icon={faMoneyBillTransfer}/> {t('actions.refund')}
                    </DropdownItem>
                    <DropdownSeparator/>
                    <DropdownItem id="final_bill" key="final_bill" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faPrint}/> {t('actions.printFinalBillCopy')}
                    </DropdownItem>
                  </>
                )}
              </Dropdown>
              {order.status === OrderStatus["In Progress"] && (
                <>
                  <Button onClick={() => {
                    protectAction(() => {
                      printTempBill();
                    }, {
                      module: 'Print temp bill',
                      description: 'Print temp bill',
                      payload: {
                        order: order.id.toString()
                      }
                    });
                  }} variant="primary" flat size="lg" className="flex-1" icon={faPrint}></Button>
                  <Button variant="warning" filled size="lg" className="flex-1" onClick={() => setPayment(true)}
                          icon={faCreditCard}>
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {payment && (
        <OrderPayment order={order} onClose={() => {
          setPayment(false);
          onAction && onAction();
        }}/>
      )}

      {splitBySeats && (
        <SplitBySeats order={order} onClose={() => {
          setSplitBySeats(false);
          onAction && onAction();
        }}/>
      )}

      {splitByManually && (
        <SplitItems order={order} onClose={() => {
          setSplitByManually(false);
          onAction && onAction();
        }}/>
      )}

      {splitByAmount && (
        <SplitAmount order={order} onClose={() => {
          setSplitByAmount(false);
          onAction && onAction();
        }}/>
      )}

      {cancelOrderOpen && (
        <OrderCancelModal
          order={order}
          open={cancelOrderOpen}
          onClose={() => {
            setCancelOrderOpen(false);
            onAction && onAction();
          }}
        />
      )}

      {refundOrderOpen && (
        <OrderRefundModal
          order={order}
          open={refundOrderOpen}
          onClose={() => {
            setRefundOrderOpen(false)
            onAction && onAction();
          }}
        />
      )}
    </>
  );
}
