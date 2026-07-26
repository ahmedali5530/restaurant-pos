import ScrollContainer from "react-indiana-drag-scroll";
import {Button} from "@/components/common/input/button.tsx";
import {cn, DENOMINATION_COINS, DENOMINATION_NOTES, toRecordId, withCurrency} from "@/lib/utils.ts";
import {faClose, faPrint} from "@fortawesome/free-solid-svg-icons";
import * as React from "react";
import {useEffect, useMemo, useState} from "react";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {PaymentType} from "@/api/model/payment_type.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order, OrderStatus} from "@/api/model/order.ts";
import {useDB} from "@/api/db/db.ts";
import {Table} from "@/api/model/table.ts";
import {Tax} from "@/api/model/tax.ts";
import {Discount, DiscountType} from "@/api/model/discount.ts";
import {Coupon} from "@/api/model/coupon.ts";
import {OrderPayment} from "@/api/model/order_payment.ts";
import {nanoid} from "nanoid";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useAtom} from "jotai";
import {appAlert, appPage} from "@/store/jotai.ts";
import {dispatchPrint} from "@/lib/print.service.ts";
import {PRINT_TYPE} from "@/lib/print.registry.tsx";
import {StringRecordId} from "surrealdb";
import {calculateChangeDue} from "@/lib/cart.ts";
import {syncOrderTaxes} from "@/lib/order-tax.service.ts";
import {syncOrderPayments} from "@/lib/order-payment-sync.ts";
import {
  isRemotePaymentType,
  RemotePaymentPendingSlot,
  RemotePaymentProvider,
  useRemotePayment,
} from "@/components/orders/payment/remote";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {nowSurrealDateTime} from "@/lib/datetime.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {computeScopedDiscount} from "@/lib/discount-engine/calculator.ts";
import {orderItemToEvaluable} from "@/lib/discount-engine/context.ts";
import {getOrderFilteredItems} from "@/lib/order.ts";
import {useTranslation} from "react-i18next";
import {useIntegrationManager} from "@/providers/integration.provider.tsx";
import { hasTempPrint, requestBillPrint } from "@/lib/order-print.ts";
import {
  fiscalShouldBlockBeforePaid,
  loadOrderForFiscal,
  runFiscalSettlementForOrder,
} from "@/integrations/providers/fiscal/settlement.ts";
import { publishSaleCompleted } from "@/integrations/accounting/events/publish.ts";
import {toast} from "sonner";

interface Props {
  order: Order
  total: number
  resolvePayable: (taxOverride?: Tax | null) => number
  onComplete: () => void

  extras: Record<string, number>

  setTax?: (tax?: Tax) => void;
  tax?: Tax
  taxAmount?: number

  discountAmount?: number
  onPaymentTypeDiscount?: (discount: Discount, amount: number) => void

  tip: number
  tipType?: DiscountType
  tipAmount: number

  payments: OrderPayment[]
  setPayments: (paymentType: OrderPayment[] | ((prev: OrderPayment[]) => OrderPayment[])) => void;

  itemsTotal: number

  setServiceChargeAmount: (amt: number) => void
  serviceChargeAmount: number
  serviceCharge: number
  serviceChargeType: DiscountType

  notes: string
  coupon?: Coupon
  couponAmount?: number
}

type ContentProps = Props & {
  selectedAmount: string
  setSelectedAmount: React.Dispatch<React.SetStateAction<string>>
};

export const OrderPaymentReceiving = (props: Props) => {
  const [page] = useAtom(appPage);
  const [selectedAmount, setSelectedAmount] = useState("");

  return (
    <RemotePaymentProvider
      order={props.order}
      setPayments={props.setPayments}
      page={page?.page}
      user={page?.user}
      onRemotePaymentStarted={() => setSelectedAmount("")}
    >
      <OrderPaymentReceivingContent
        {...props}
        selectedAmount={selectedAmount}
        setSelectedAmount={setSelectedAmount}
      />
    </RemotePaymentProvider>
  );
};

const OrderPaymentReceivingContent = ({
  total,
  resolvePayable,
  order,
  onComplete,
  extras,
  setTax,
  tax,
  taxAmount,
  discountAmount,
  onPaymentTypeDiscount,
  tipType,
  tip,
  tipAmount,
  payments,
  setPayments,
  itemsTotal: _itemsTotal,
  serviceChargeAmount,
  serviceCharge,
  serviceChargeType,
  notes,
  coupon,
  couponAmount,
  selectedAmount,
  setSelectedAmount,
}: ContentProps) => {
  const {t} = useTranslation('payment');
  const remote = useRemotePayment();
  const db = useDB();
  const {protectAction} = useSecurity();
  const { manager: integrationManager } = useIntegrationManager();
  const [page] = useAtom(appPage);
  const [tempPrinted, setTempPrinted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hasTempPrint(db, order.id.toString()).then((v) => {
      if (!cancelled) setTempPrinted(v);
    });
    return () => {
      cancelled = true;
    };
  }, [db, order.id]);

  const [, setAlert] = useAtom(appAlert);

  const {
    data: allPaymentTypes
  } = useApi<SettingsData<PaymentType>>(Tables.payment_types, ['deleted_at = none'], ['priority asc'], 0, 99999, ['tax', 'discounts']);

  const tableId = order?.table?.id?.toString();

  const {
    data: table
  } = useApi<SettingsData<Table>>(tableId, ['deleted_at = none'], [], 0, 1, ['payment_types', 'payment_types.tax', 'payment_types.discounts'], {enabled: !!tableId});

  const paymentTypes: PaymentType[] = useMemo(() => {
    if (table?.data?.[0]?.payment_types && table?.data?.[0]?.payment_types?.length > 0) {
      return table?.data?.[0]?.payment_types;
    }

    return allPaymentTypes?.data;
  }, [table, allPaymentTypes]);

  // const [paymentType, setPaymentType] = useState<string>();
  const [mode, setMode] = useState<'quick' | 'button'>('quick');

  const quickAmounts = [...DENOMINATION_COINS, ...DENOMINATION_NOTES];
  const keyboardKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0];

  const [closing, setClosing] = useState(false);

  const isTaxObject = (value: unknown): value is Tax => {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as Tax).rate === 'number' &&
      typeof (value as Tax).name === 'string'
    );
  }

  const getPaymentTypeTax = (paymentType?: PaymentType): Tax | undefined => {
    return isTaxObject(paymentType?.tax) ? paymentType?.tax : undefined;
  }

  const closeOrder = async () => {
    setClosing(true);

    try {
      const blockBeforePaid = await fiscalShouldBlockBeforePaid(integrationManager, db);
      let fiscalOrderSnapshot: Order | undefined;

      if (blockBeforePaid) {
        fiscalOrderSnapshot = await loadOrderForFiscal(db, String(order.id));
        if (fiscalOrderSnapshot) {
          const preResult = await runFiscalSettlementForOrder(
            integrationManager,
            db,
            {
              ...fiscalOrderSnapshot,
              tax: tax ?? fiscalOrderSnapshot.tax,
              tax_amount: taxAmount ?? fiscalOrderSnapshot.tax_amount,
              discount_amount: discountAmount ?? fiscalOrderSnapshot.discount_amount,
              tip,
              tip_amount: tipAmount,
              tip_type: tipType,
              service_charge: serviceCharge,
              service_charge_amount: serviceChargeAmount,
              service_charge_type: serviceChargeType,
              payments: payments.length > 0 ? payments : fiscalOrderSnapshot.payments,
            }
          );
          if (preResult.blocked) {
            toast.error(preResult.blockedError ?? 'Fiscal submission failed');
            return;
          }
          if (Object.values(preResult.resultsByProvider).some((row) => row.status === 'failed')) {
            toast.warning('Some fiscal providers failed; check Integrations queue');
          }
        }
      }

      // Sync payments incrementally — reuse existing order_payment rows when present
      const {paymentIds: orderPayments, payments: syncedPayments} = await syncOrderPayments(
        db,
        payments,
        order?.payments,
        total,
      );
      setPayments(syncedPayments);

      const extraOptions = [];
      for (const extra of Object.keys(extras)) {
        const record = await db.create(Tables.order_extras, {
          name: extra,
          value: extras[extra]
        });

        extraOptions.push(record[0].id);
      }

      const resolvedDiscountAmount = discountAmount ?? order.discount_amount ?? 0;
      const resolvedDiscountId = order.discount?.id;

      let orderCouponId: string | null = order?.coupon?.id
        ? String(order.coupon.id)
        : null;
      const hasCoupon = coupon && couponAmount && couponAmount > 0;

      if (hasCoupon) {
        if (order?.coupon?.id) {
          await db.merge(order.coupon.id, {
            coupon: coupon.id,
            discount: couponAmount,
          });
          orderCouponId = String(order.coupon.id);
        } else {
          const [created] = await db.create(Tables.order_coupons, {
            coupon: coupon.id,
            discount: couponAmount,
            created_at: nowSurrealDateTime(),
          });
          orderCouponId = (created as unknown as { id?: string })?.id?.toString?.() ?? String((created as unknown as {
            id: string
          }).id);
        }
      }

      const mergePayload: Record<string, unknown> = {
        status: OrderStatus.Paid,
        payments: orderPayments,
        extras: extraOptions,
        tax: tax?.id ? toRecordId(tax.id) : null,
        tax_amount: taxAmount,
        discount_amount: resolvedDiscountAmount,
        tip: tip,
        tip_amount: tipAmount,
        tip_type: tipType,
        service_charge: serviceCharge,
        service_charge_amount: serviceChargeAmount,
        service_charge_type: serviceChargeType,
        cashier: new StringRecordId(page?.user?.id.toString()),
        notes: notes,
        completed_at: nowSurrealDateTime(),
      };

      if (resolvedDiscountId) {
        mergePayload.discount = toRecordId(resolvedDiscountId);
      }

      if (orderCouponId) {
        mergePayload.coupon = orderCouponId;
      }

      await db.merge(order.id, mergePayload);
      await syncOrderTaxes(db, order, tax ?? order.tax ?? null);

      if (hasCoupon) {
        await db.create(Tables.coupon_redemptions, {
          coupon: coupon.id,
          user: page?.user?.id ? new StringRecordId(page.user.id.toString()) : null,
          order: order.id,
          discount_amount: couponAmount,
          redeemed_at: nowSurrealDateTime(),
        });
      }

      if (!blockBeforePaid) {
        const settledOrder = await loadOrderForFiscal(db, String(order.id));
        if (settledOrder) {
          const fiscalResult = await runFiscalSettlementForOrder(
            integrationManager,
            db,
            settledOrder
          );
          if (Object.values(fiscalResult.resultsByProvider).some((row) => row.status === 'failed')) {
            toast.warning('Some fiscal providers failed; check Integrations queue');
          }
        }
      }

      const saleOrder = await loadOrderForFiscal(db, String(order.id));
      if (saleOrder && integrationManager) {
        try {
          await publishSaleCompleted(integrationManager, saleOrder);
        } catch (publishError) {
          console.warn('Failed publishing SaleCompleted event', publishError);
        }
      }

      postOrderTracking({
        module: "orders.complete_payment",
        page: page?.page,
        orderId: order.id,
        payload: {
          payment_count: payments.length,
          coupon: coupon?.id?.toString(),
          total,
        },
        user: page?.user,
      });

      onComplete();
    } catch (e) {
      throw e;
    } finally {
      setClosing(false);
    }
  }

  // Track auto-applied discount originating from a payment type
  const [autoDiscountMeta, setAutoDiscountMeta] = useState<{
    paymentTypeId?: string
    discountId?: string
  }>();

  useEffect(() => {
    if (paymentTypes?.length > 0 && payments.length === 0) {
      // setPayments([{
      //   id: nanoid(),
      //   payment_type: paymentTypes[0],
      //   payable: total,
      //   amount: total
      // }]);
    }

    if (payments.length > 0) {
      // find largest tax and apply it
      const paymentsWithTaxes = payments.filter(item => !!getPaymentTypeTax(item.payment_type));
      let tax: Tax | undefined;
      if (paymentsWithTaxes.length > 0) {
        paymentsWithTaxes.forEach(pt => {
          const paymentTax = getPaymentTypeTax(pt.payment_type);
          if (!paymentTax) {
            return;
          }

          if (!tax) {
            tax = paymentTax;
          }

          if (tax.rate < paymentTax.rate) {
            tax = paymentTax;
          }
        });

        if (tax) {
          setTax && setTax(tax);
        }
      }
    }
  }, [setTax, paymentTypes, payments]);

  const tendered = useMemo(() => {
    return payments.reduce((prev, item) => prev + item.amount, 0)
  }, [payments])

  const changeDue = useMemo(() => {
    return calculateChangeDue(tendered, total);
  }, [total, tendered]);

  const addPayment = async (amount: string | number, paymentType: PaymentType, payable: number) => {
    if (amount.toString().length === 0) {
      return;
    }

    if (isRemotePaymentType(paymentType)) {
      await remote.startRemotePayment(amount, paymentType, payable);
      return;
    }

    // Compute change due relative to this payable (may include tax for selected payment type)
    const localChangeDue = tendered - payable;

    if (paymentType.type === 'Card' && localChangeDue >= 0) {
      setAlert(prev => ({
        ...prev,
        opened: true,
        type: 'error',
        message: t('receiving.cannotAddCard')
      }));

      return;
    }

    if (paymentType.type === 'Card' && Number(amount) > Number(-1 * localChangeDue)) {
      setAlert(prev => ({
        ...prev,
        opened: true,
        type: 'warning',
        message: t('receiving.exactCardAmount')
      }));

      amount = -1 * localChangeDue;
    }

    setPayments(prev => [
      ...prev,
      {
        payment_type: paymentType,
        amount: Number(amount),
        payable: payable,
        id: nanoid()
      }
    ])
    setSelectedAmount('');
  }

  const getHighestTaxObject = (candidate?: Tax): Tax | undefined => {
    const existingTaxes = payments
      .map(p => getPaymentTypeTax(p.payment_type))
      .filter((paymentTax): paymentTax is Tax => !!paymentTax);
    let highest: Tax | undefined = existingTaxes.length > 0
      ? existingTaxes.reduce((acc, t) => (acc.rate >= t.rate ? acc : t))
      : undefined;
    if (candidate) {
      if (!highest || candidate.rate >= highest.rate) {
        highest = candidate;
      }
    }
    return highest;
  }

  const applyPaymentTypeTaxAndDiscount = (paymentType: PaymentType): number => {
    const candidateTax = getPaymentTypeTax(paymentType);
    const hasTax = !!candidateTax;
    const highestTax = hasTax ? getHighestTaxObject(candidateTax) : getHighestTaxObject(undefined);
    if (hasTax) {
      setTax && setTax(highestTax);
    }
    applyPaymentTypeDiscountIfAny(paymentType);
    return resolvePayable(hasTax ? highestTax : undefined);
  }

  const selectBestDiscount = (discounts?: Discount[]): Discount | undefined => {
    if (!discounts || discounts.length === 0) {
      return undefined;
    }
    // Prefer lowest priority value if provided, fallback to first
    const withPriority = discounts.filter(d => (d as any).priority !== undefined) as (Discount & {
      priority: number
    })[];
    if (withPriority.length > 0) {
      return withPriority.sort((a, b) => a.priority - b.priority)[0];
    }
    return discounts[0];
  }

  const computeDiscountAmountFor = (d?: Discount): number | undefined => {
    if (!d) {
      return undefined;
    }
    const items = getOrderFilteredItems(order).map(orderItemToEvaluable);
    const computed = computeScopedDiscount(d, items);
    return computed.appliedAmount;
  }

  const clearAutoDiscountIfNeeded = (newPaymentTypeId?: string) => {
    if (autoDiscountMeta?.paymentTypeId && autoDiscountMeta.paymentTypeId !== newPaymentTypeId) {
      setAutoDiscountMeta(undefined);
    }
  }

  const applyPaymentTypeDiscountIfAny = (paymentType: PaymentType): number | undefined => {
    clearAutoDiscountIfNeeded(paymentType.id.toString());
    const d = selectBestDiscount(paymentType.discounts);
    const amount = computeDiscountAmountFor(d);
    if (d && amount !== undefined) {
      onPaymentTypeDiscount?.(d, amount);
      setAutoDiscountMeta({paymentTypeId: paymentType.id.toString(), discountId: d.id.toString()});
    } else {
      if (autoDiscountMeta) {
        setAutoDiscountMeta(undefined);
      }
    }
    return amount;
  }

  const {
    data: allTaxes
  } = useApi<SettingsData<Tax>>(Tables.taxes, ['deleted_at = none'])

  return (
    <div className="grid grid-cols-2 gap-5 h-[calc(100vh_-_120px)]">
      <div className="bg-white rounded-xl h-full">
        <div className="mb-3 text-5xl p-5 text-center ">
          {withCurrency(tendered)}
        </div>
        <div className={
          cn(
            "mb-3 text-3xl p-5 text-center",
            changeDue < 0 && 'text-danger-700',
            changeDue > 0 && 'text-success-700'
          )
        }>
          {changeDue < 0 ? t('receiving.remaining') : t('receiving.change')}: <span className="">{withCurrency(changeDue)}</span>
        </div>
        <div className="relative">
          <ScrollContainer className="gap-3 flex overflow-x-auto mb-5">
          <span
            className="btn btn-primary w-[100px] lg"
            onClick={() => {
              if (!paymentTypes || paymentTypes.length === 0) {
                return;
              }
              const pt = paymentTypes[0];
              const payable = applyPaymentTypeTaxAndDiscount(pt);
              void addPayment(payable, pt, payable);
              setMode('quick');
            }}
          >{withCurrency(total)}</span>
            {quickAmounts.reverse().map(item => (
              <span
                key={item}
                className="btn btn-primary w-[100px] lg"
                onClick={() => {
                  if (!paymentTypes || paymentTypes.length === 0) {
                    return;
                  }
                  const pt = paymentTypes[0];
                  const payable = applyPaymentTypeTaxAndDiscount(pt);
                  void addPayment(item, pt, payable);
                  setMode('quick');
                }}
              >{withCurrency(item)}</span>
            ))}
          </ScrollContainer>
          {/*{!isCash && <div className="payment-disabled absolute w-full z-10 top-0 bg-neutral-100/50 h-[48px]"></div>}*/}
        </div>

        <ScrollContainer className="gap-5 flex overflow-x-auto mb-5">
          {paymentTypes?.map(item => (
            <Button
              className="min-w-[150px]"
              variant="primary"
              key={item.id}
              onClick={() => {
                const payable = applyPaymentTypeTaxAndDiscount(item);

                if (selectedAmount.trim().length > 0) {
                  void addPayment(selectedAmount, item, payable)
                } else if (changeDue < 0) {
                  const remaining = payable - tendered;
                  const amt = remaining.toString();
                  setSelectedAmount(amt);
                  void addPayment(amt, item, payable)
                } else {
                  // Nothing typed and no remaining due – do nothing (card will be blocked inside addPayment)
                }
              }}
              size="lg"
            >
              {item.name}
            </Button>
          ))}
        </ScrollContainer>

        <div className="flex justify-center items-center mb-3 text-xl h-[28px]">
          {selectedAmount.trim().length > 0 && selectedAmount}
        </div>

        <div className="flex">
          <div className="flex-1">
            <div className="grid grid-cols-3 gap-3 mb-3">
              {keyboardKeys.map(item => (
                <Button key={item} size="xl" flat variant="primary" onClick={() => {
                  if (mode === 'button') {
                    setSelectedAmount((prev: string) => {
                      return prev + item.toString()
                    });
                  } else {
                    setSelectedAmount(item.toString());
                  }

                  setMode('button');
                }}>
                  {item}
                </Button>
              ))}
              <Button size="xl" flat variant="primary" onClick={() => {
                setSelectedAmount('')
              }}>
                C
              </Button>
            </div>
            <div className="flex gap-5">
              <span title={tempPrinted ? t('receiving.tempAlreadyPrinted') : undefined} className="flex-1 flex">
                <Button
                  variant={tempPrinted ? "warning" : "primary"}
                  className="flex-1"
                  flat
                  icon={faPrint}
                  size="lg"
                  onClick={() => {
                    void requestBillPrint({
                      db,
                      protectAction,
                      orderId: order.id.toString(),
                      printType: 'temp',
                      printModule: 'orders.print_temp',
                      description: 'Print temp bill',
                      payload: { order: order.id.toString() },
                      userId: page?.user?.id?.toString?.() ?? page?.user?.id,
                      doPrint: () => dispatchPrint(db, PRINT_TYPE.presale_bill, {
                        order,
                        taxes: allTaxes?.data
                      }, {userId: page?.user?.id}),
                      onPrinted: () => setTempPrinted(true),
                    });
                  }}
                >{t('receiving.tempBill')}</Button>
              </span>
              <Button
                variant="success"
                className="flex-1"
                filled
                size="lg"
                onClick={async () => {
                  await protectAction(async () => await closeOrder(), {
                    module: 'orders.complete',
                    description: 'Complete order',
                    payload: {
                      order: order.id.toString()
                    }
                  });
                }}
                disabled={changeDue < 0 || closing || remote.isProcessing}
                flat
              >{t('receiving.complete')}</Button>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-3 bg-white rounded-xl h-full">
        <RemotePaymentPendingSlot/>
        {payments.map(payment => (
          <div
            className="flex justify-between text-lg cursor-pointer"
            key={payment.id}
            onClick={() => {
              setPayments(prev => prev.filter(item => item.id !== payment.id))
            }}
          >
            <strong className="flex gap-3 justify-center items-center">
              <FontAwesomeIcon icon={faClose}
                               className="text-danger-500 p-2 px-3 rounded border border-danger-500"/>
              {payment.payment_type.name}
            </strong>
            <span>{withCurrency(payment.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
