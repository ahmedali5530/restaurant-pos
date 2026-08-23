import {Order as OrderModel, OrderStatus} from "@/api/model/order.ts";
import React, {CSSProperties, useEffect, useMemo, useState} from "react";
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
import {Tax} from "@/api/model/tax.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {useTranslation} from "react-i18next";
import { getFiscalQrcodesForOrderPrint } from "@/integrations/providers/fiscal/settlement.ts";
import { hasTempPrint, requestBillPrint } from "@/lib/order-print.ts";
import { printDuplicateKotForOrder } from "@/lib/kitchen/print-duplicate-kot.ts";
import {useOrderCardHydrate} from "@/hooks/useOrderCardHydrate.ts";
import {fetchOrderFull} from "@/lib/order-fetch.ts";
import {toast} from "sonner";

interface Props {
  order: OrderModel
  onMergeSelect?: (order: OrderModel, add: boolean) => void
  mergingOrders: OrderModel[]
  merging: boolean
  onAction?: () => void;
  tempPrinted?: boolean;
  taxes?: Tax[];
}

export const OrderBox = ({
  order: snapshot,
  onMergeSelect,
  mergingOrders,
  merging,
  onAction,
  tempPrinted: tempPrintedProp,
  taxes: taxesProp,
}: Props) => {
  const {t} = useTranslation('orders');
  const db = useDB();
  const [page] = useAtom(appPage);
  const [enforcement] = useAtom(closingEnforcementAtom);
  const mutationsBlocked = enforcement.orderMutationsBlocked;
  const {rootRef, displayOrder: order, cardReady, hydrateError, retryHydrate} = useOrderCardHydrate(snapshot);
  const [paymentOrder, setPaymentOrder] = useState<OrderModel | null>(null);
  const [actionOrder, setActionOrder] = useState<OrderModel | null>(null);
  const [isLoadingFull, setIsLoadingFull] = useState(false);

  const [splitBySeats, setSplitBySeats] = useState(false);
  const [splitByManually, setSplitByManually] = useState(false);
  const [splitByAmount, setSplitByAmount] = useState(false);
  const [cancelOrderOpen, setCancelOrderOpen] = useState(false);
  const [refundOrderOpen, setRefundOrderOpen] = useState(false);
  const [tempPrintedLocal, setTempPrintedLocal] = useState(false);

  const tempPrinted = tempPrintedProp ?? tempPrintedLocal;

  useEffect(() => {
    if (tempPrintedProp != null) {
      return;
    }
    let cancelled = false;
    void hasTempPrint(db, snapshot.id.toString()).then((v) => {
      if (!cancelled) setTempPrintedLocal(v);
    });
    return () => {
      cancelled = true;
    };
  }, [db, snapshot.id, tempPrintedProp]);

  const hasSeats = useMemo(() => {
    if (!cardReady) return false;
    const items = getOrderFilteredItems(order).filter((item) => item.seat !== undefined);
    return items.length > 1
  }, [cardReady, order]);

  const mergingOrderIds = useMemo(() => {
    return mergingOrders.map(item => item.id.toString());
  }, [mergingOrders]);

  const taxes = taxesProp;

  const {protectAction} = useSecurity();

  const withFullOrder = async (run: (full: OrderModel) => void | Promise<void>) => {
    setIsLoadingFull(true);
    try {
      const full = await fetchOrderFull(db, snapshot.id);
      if (!full) {
        toast.error(t('loadFailed'));
        return;
      }
      setActionOrder(full);
      await run(full);
    } catch (error) {
      console.error('Failed to load full order', error);
      toast.error(t('loadFailed'));
    } finally {
      setIsLoadingFull(false);
    }
  };

  const printTempBill = () => {
    void withFullOrder((full) => requestBillPrint({
      db,
      protectAction,
      orderId: full.id.toString(),
      printType: 'temp',
      printModule: 'orders.print_temp',
      description: 'Print temp bill',
      payload: { order: full.id.toString() },
      userId: page?.user?.id?.toString?.() ?? page?.user?.id,
      doPrint: () => dispatchPrint(db, PRINT_TYPE.presale_bill, {order: full, taxes}, {userId: page?.user?.id}),
      onPrinted: () => {
        setTempPrintedLocal(true);
        onAction?.();
      },
    }));
  };

  const printFinalCopy = () => {
    void withFullOrder((full) => requestBillPrint({
      db,
      protectAction,
      orderId: full.id.toString(),
      printType: 'final',
      printModule: 'orders.print_final',
      description: 'Print final copy',
      payload: { order: full.id.toString() },
      userId: page?.user?.id?.toString?.() ?? page?.user?.id,
      isDuplicate: true,
      doPrint: async () => {
        const qrcodes = await getFiscalQrcodesForOrderPrint(db, full.id);
        return dispatchPrint(db, PRINT_TYPE.final_bill, {
          order: full,
          duplicate: true,
          qrcodes,
          qrcode: qrcodes[0]?.value,
        }, {userId: page?.user?.id});
      },
    }));
  };

  const printKotCopy = () => {
    void protectAction(() => {
      void withFullOrder((full) => printDuplicateKotForOrder({
        db,
        order: full,
        userId: page?.user?.id,
        title: t("actions.printKotCopy"),
      }).catch((error) => {
        console.error("Order KOT reprint failed", error);
      }));
    }, {
      module: "orders.print_kot",
      description: t("actions.printKotCopy"),
      payload: {
        order: snapshot.id.toString(),
      },
    });
  };

  const [pageState] = useAtom(appPage);
  const {
    showTotalInOrderCard = false,
    showModifierPriceInOrderCard = false,
    showModifiersInOrderCard = false,
    showQuantityInOrderCard = false,
    showPriceInOrderCard = false,
    showGroupsInOrderCard = false,
  } = pageState.menuConfig ?? {};

  const modalOrder = actionOrder ?? order;

  return (
    <>
      <div ref={rootRef} className="rounded-xl p-3 bg-white gap-5 flex flex-col shadow select-none" data-testid="order-card">
        <OrderHeader order={order} tempPrinted={tempPrinted}/>
        <OrderTimes order={order}/>
        <div className="separator h-[2px]" style={{'--size': '10px', '--space': '5px'} as CSSProperties}></div>
        <ScrollContainer>
          <div className="overflow-auto max-h-[400px] min-h-[80px]">
            {!cardReady && (
              <div className="py-6 text-center text-sm text-neutral-500">
                {hydrateError ? (
                  <button type="button" className="underline" onClick={() => void retryHydrate()}>
                    {t('retryLoad')}
                  </button>
                ) : (
                  t('loadingItems')
                )}
              </div>
            )}
            {cardReady && getOrderFilteredItems(order).map((item, index) => (
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
        {cardReady ? (
          <OrderTotals order={order} />
        ) : (
          <div className="h-8 rounded bg-neutral-100 animate-pulse" />
        )}
        <div className="flex gap-5" data-testid="order-card-actions">
          {merging && (order.status === OrderStatus['In Progress']) ? (
            <>
              <Checkbox
                disabled={!cardReady}
                onChange={() => {
                  if (!cardReady) return;
                  if (mergingOrderIds.includes(order.id.toString())) {
                    onMergeSelect?.(order, false);
                  } else {
                    onMergeSelect?.(order, true);
                  }
                }}
                checked={mergingOrderIds.includes(order.id.toString())}
                label={t('actions.selectToMerge')}
              />
            </>
          ) : (
            <>
              <Dropdown
                label={<><FontAwesomeIcon icon={faEllipsisV} className="mr-3"/> </>}
                btnSize="lg"
                btnFlat={true}
                className="flex-1"
                data-testid="order-card-menu"
                onAction={(key) => {
                  if (key === 'temp_bill') {
                    printTempBill();
                  }

                  if (key === 'final_bill') {
                    printFinalCopy();
                  }

                  if (key === 'kot_copy') {
                    printKotCopy();
                  }

                  if (key === 'split_by_seats' && hasSeats) {
                    protectAction(() => {
                      void withFullOrder(() => setSplitBySeats(true));
                    }, {
                      module: 'orders.split_by_seats',
                      description: 'Split by seats',
                      payload: {
                        order: snapshot.id.toString()
                      }
                    });
                  }

                  if (key === 'split_by_items') {
                    protectAction(() => {
                      void withFullOrder(() => setSplitByManually(true));
                    }, {
                      module: 'orders.split_by_items',
                      description: 'Split by items',
                      payload: {
                        order: snapshot.id.toString()
                      }
                    });
                  }

                  if (key === 'split_by_amount') {
                    protectAction(() => {
                      void withFullOrder(() => setSplitByAmount(true));
                    }, {
                      module: 'orders.split_by_amount',
                      description: 'Split by amount',
                      payload: {
                        order: snapshot.id.toString()
                      }
                    });
                  }

                  if (key === 'cancel') {
                    protectAction(() => {
                      void withFullOrder(() => setCancelOrderOpen(true));
                    }, {
                      module: 'orders.cancel',
                      description: 'Cancel order',
                      payload: {
                        order: snapshot.id.toString()
                      }
                    });

                    return;
                  }

                  if (key === 'merge') {
                    protectAction(() => {
                      if (!cardReady) return;
                      onMergeSelect?.(order, true);
                    }, {
                      module: 'orders.merge',
                      description: 'Merge orders',
                      payload: {
                        order: snapshot.id.toString()
                      }
                    });
                  }

                  if (key === 'refund') {
                    protectAction(() => {
                      void withFullOrder(() => setRefundOrderOpen(true));
                    }, {
                      module: 'orders.refund',
                      description: 'Refund order',
                      payload: {
                        order: snapshot.id.toString()
                      }
                    });

                    return;
                  }
                }}
              >
                {order.status === OrderStatus["In Progress"] && (
                  <>
                    <DropdownItem isDisabled={mutationsBlocked || isLoadingFull} id="cancel" key="cancel"
                                  data-testid="order-menu-cancel"
                                  className="min-w-[50px] bg-danger-100 text-danger-500">
                      <FontAwesomeIcon icon={faMoneyBillTransfer}/> {t('actions.cancelOrder')}
                    </DropdownItem>
                    <DropdownSeparator/>
                    <DropdownItem isDisabled={mutationsBlocked || hasSeats !== true || isLoadingFull} id="split_by_seats"
                                  key="split_by_seats" data-testid="order-menu-split_by_seats" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faChair}/> {t('actions.splitBySeats')}
                    </DropdownItem>
                    <DropdownItem isDisabled={mutationsBlocked || isLoadingFull} id="split_by_items" key="split_by_items"
                                  data-testid="order-menu-split_by_items" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faCodeBranch}/> {t('actions.splitByItems')}
                    </DropdownItem>
                    <DropdownItem isDisabled={mutationsBlocked || isLoadingFull} id="split_by_amount" key="split_by_amount"
                                  data-testid="order-menu-split_by_amount" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faCodeBranch}/> {t('actions.splitByAmount')}
                    </DropdownItem>
                    <DropdownSeparator/>
                    <DropdownItem isDisabled={mutationsBlocked || !cardReady} id="merge" key="merge" data-testid="order-menu-merge" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faObjectGroup}/> {t('actions.mergeOrders')}
                    </DropdownItem>
                    <DropdownSeparator/>
                    <DropdownItem isDisabled={isLoadingFull} id="kot_copy" key="kot_copy" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faPrint}/> {t('actions.printKotCopy')}
                    </DropdownItem>
                  </>
                )}

                {order.status === OrderStatus["Paid"] && (
                  <>
                    <DropdownItem isDisabled={isLoadingFull} id="refund" key="refund" data-testid="order-menu-refund" className="min-w-[50px] bg-danger-100 text-danger-500">
                      <FontAwesomeIcon icon={faMoneyBillTransfer}/> {t('actions.refund')}
                    </DropdownItem>
                    <DropdownSeparator/>
                    <DropdownItem isDisabled={isLoadingFull} id="final_bill" key="final_bill" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faPrint}/> {t('actions.printFinalBillCopy')}
                    </DropdownItem>
                    <DropdownItem isDisabled={isLoadingFull} id="kot_copy" key="kot_copy" className="min-w-[50px]">
                      <FontAwesomeIcon icon={faPrint}/> {t('actions.printKotCopy')}
                    </DropdownItem>
                  </>
                )}
              </Dropdown>
              {order.status === OrderStatus["In Progress"] && (
                <>
                  <span title={tempPrinted ? t('print.tempAlreadyPrinted') : undefined} className="flex-1 flex">
                    <Button
                      onClick={printTempBill}
                      variant={tempPrinted ? "warning" : "primary"}
                      flat
                      size="lg"
                      className="flex-1"
                      icon={faPrint}
                      disabled={isLoadingFull}
                      data-testid="order-card-temp-bill"
                    ></Button>
                  </span>
                  <Button
                    variant="warning"
                    filled
                    size="lg"
                    className="flex-1"
                    disabled={isLoadingFull}
                    onClick={() => {
                      void withFullOrder((full) => setPaymentOrder(full));
                    }}
                    icon={faCreditCard}
                    data-testid="order-card-pay"
                  >
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {paymentOrder && (
        <OrderPayment order={paymentOrder} onClose={() => {
          setPaymentOrder(null);
          setActionOrder(null);
          onAction && onAction();
        }}/>
      )}

      {splitBySeats && (
        <SplitBySeats order={modalOrder} onClose={() => {
          setSplitBySeats(false);
          setActionOrder(null);
          onAction && onAction();
        }}/>
      )}

      {splitByManually && (
        <SplitItems order={modalOrder} onClose={() => {
          setSplitByManually(false);
          setActionOrder(null);
          onAction && onAction();
        }}/>
      )}

      {splitByAmount && (
        <SplitAmount order={modalOrder} onClose={() => {
          setSplitByAmount(false);
          setActionOrder(null);
          onAction && onAction();
        }}/>
      )}

      {cancelOrderOpen && (
        <OrderCancelModal
          order={modalOrder}
          open={cancelOrderOpen}
          onClose={() => {
            setCancelOrderOpen(false);
            setActionOrder(null);
            onAction && onAction();
          }}
        />
      )}

      {refundOrderOpen && (
        <OrderRefundModal
          order={modalOrder}
          open={refundOrderOpen}
          onClose={() => {
            setRefundOrderOpen(false)
            setActionOrder(null);
            onAction && onAction();
          }}
        />
      )}
    </>
  );
}
