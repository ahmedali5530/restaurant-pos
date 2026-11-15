import ScrollContainer from "react-indiana-drag-scroll";
import {Button} from "@/components/common/input/button.tsx";
import {cn, DENOMINATION_COINS, DENOMINATION_NOTES, withCurrency} from "@/lib/utils.ts";
import {faClose, faPrint} from "@fortawesome/free-solid-svg-icons";
import * as React from "react";
import {useEffect, useMemo, useState} from "react";
import {PaymentType} from "@/api/model/payment_type.ts";
import {Order} from "@/api/model/order.ts";
import {useDB} from "@/api/db/db.ts";
import {Tax} from "@/api/model/tax.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {Coupon} from "@/api/model/coupon.ts";
import {OrderPayment} from "@/api/model/order_payment.ts";
import {nanoid} from "nanoid";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useAtom} from "jotai";
import {appAlert, appPage, appSettings} from "@/store/jotai.ts";
import {dispatchPrint} from "@/lib/print.service.ts";
import {PRINT_TYPE} from "@/lib/print.registry.tsx";
import {getDraftPaymentChangeDisplay, isCardPaymentType} from "@/lib/order.ts";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";
import {
  isRemotePaymentType,
  RemotePaymentPendingSlot,
  RemotePaymentProvider,
  useRemotePayment,
} from "@/components/orders/payment/remote";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {useTranslation} from "react-i18next";
import {useIntegrationManager} from "@/providers/integration.provider.tsx";
import { hasTempPrint, requestBillPrint } from "@/lib/order-print.ts";
import { fetchOrderFull } from "@/lib/order-fetch.ts";
import {settlePaidOrder} from "@/lib/order-settle.ts";
import {toast} from "sonner";

interface Props {
  order: Order
  total: number
  resolvePayable: (taxOverride?: Tax | null, paymentTypeId?: string) => number
  onComplete: (opts?: { settled?: boolean }) => void

  extras: Record<string, number>

  setTax?: (tax?: Tax) => void;
  tax?: Tax
  taxAmount?: number

  discountAmount?: number
  /** Notify parent of selected tender so payment-gated discounts can evaluate */
  onPaymentTypeSelected?: (paymentTypeId: string) => void

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
  /** Flush React draft (tax/tip/extras) to Dexie before settle — avoids fast-tender races. */
  flushDraft?: () => Promise<void>
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
  onPaymentTypeSelected,
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
  flushDraft,
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
  const [settings] = useAtom(appSettings);

  const tableId = order?.table?.id?.toString();

  const paymentTypes: PaymentType[] = useMemo(() => {
    if (tableId) {
      const table = settings.tables.find((row) => String(row.id) === tableId);
      if (table?.payment_types && table.payment_types.length > 0) {
        return table.payment_types as PaymentType[];
      }
    }
    return settings.payment_types ?? [];
  }, [settings.tables, settings.payment_types, tableId]);

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
      const orderId = String(order.id);
      const extraRows = Object.keys(extras).map((name) => ({
        id: `order_extras:${orderId.split(':')[1]}_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
        name,
        value: extras[name],
      }));

      const result = await settlePaidOrder({
        db,
        integrationManager,
        order,
        payments: payments
          .filter((payment) => payment?.payment_type?.id && Number(payment.amount) > 0)
          .map((payment) => ({
            id: payment.id ? String(payment.id) : undefined,
            paymentTypeId: String(payment.payment_type.id),
            paymentTypeName: payment.payment_type?.name,
            amount: Number(payment.amount),
            payable: Number(payment.payable ?? total),
            comments: payment.comments ?? null,
          })),
        cashierId: page?.user?.id ? String(page.user.id) : null,
        tax,
        taxId: tax?.id ? String(tax.id) : null,
        taxAmount,
        tip,
        tipAmount,
        tipType,
        serviceCharge,
        serviceChargeAmount,
        serviceChargeType,
        notes,
        discountAmount: discountAmount ?? order.discount_amount ?? 0,
        discountId: order.discount?.id ? String(order.discount.id) : undefined,
        extras: extraRows,
        coupon,
        couponAmount,
        // Payment screen auto-saves draft + taxes — skip redundant work on settle.
        keepTaxes: true,
        skipDraft: true,
        flushDraft,
        trackingPage: page?.page,
        trackingUser: page?.user,
        total,
        t,
      });

      if (!result.ok) {
        return;
      }

      const settledPayments = payments.map((payment) => {
        const row = result.payments.find(
          (p) => p.id === payment.id || p.id === `order_payment:${payment.id}`,
        );
        return row ? {...payment, id: row.id as any} : payment;
      });
      setPayments(settledPayments);

      onComplete({ settled: true });
    } catch (e) {
      if ((e as any)?.code === 'ALREADY_CLOSED') {
        toast.error(t('receiving.alreadyClosed'));
        onComplete({ settled: true });
        return;
      }
      if ((e as any)?.code === 'NOT_OWNER') {
        toast.error(t('receiving.notOwner'));
        return;
      }
      throw e;
    } finally {
      setClosing(false);
    }
  }

  useEffect(() => {
    if (payments.length > 0) {
      // find largest tax and apply it
      const paymentsWithTaxes = payments.filter(item => !!getPaymentTypeTax(item.payment_type));
      let highest: Tax | undefined;
      if (paymentsWithTaxes.length > 0) {
        paymentsWithTaxes.forEach(pt => {
          const paymentTax = getPaymentTypeTax(pt.payment_type);
          if (!paymentTax) {
            return;
          }

          if (!highest) {
            highest = paymentTax;
          }

          if (highest.rate < paymentTax.rate) {
            highest = paymentTax;
          }
        });

        if (highest) {
          setTax && setTax(highest);
        }
      }
    }
  }, [setTax, payments]);

  const tendered = useMemo(() => {
    return payments.reduce((prev, item) => prev + item.amount, 0)
  }, [payments])

  const changeDisplay = useMemo(
    () => getDraftPaymentChangeDisplay(payments, total),
    [payments, total],
  );
  /** Negative = remaining; positive = cash change only (exact tenders never invent change). */
  const changeDue = changeDisplay.displayAmount;

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

    if (isCardPaymentType(paymentType) && localChangeDue >= 0) {
      setAlert(prev => ({
        ...prev,
        opened: true,
        type: 'error',
        message: t('receiving.cannotAddCard')
      }));

      return;
    }

    if (isCardPaymentType(paymentType) && Number(amount) > Number(-1 * localChangeDue)) {
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
    const paymentTypeId = String(paymentType.id);
    onPaymentTypeSelected?.(paymentTypeId);
    const candidateTax = getPaymentTypeTax(paymentType);
    const hasTax = !!candidateTax;
    const highestTax = hasTax ? getHighestTaxObject(candidateTax) : getHighestTaxObject(undefined);
    if (hasTax) {
      setTax && setTax(highestTax);
    }
    return resolvePayable(hasTax ? highestTax : undefined, paymentTypeId);
  }

  const allTaxes = settings.taxes;

  return (
    <div className="grid grid-cols-2 gap-5 h-[calc(100vh_-_120px_-_var(--app-toolbar-h))]" data-testid="payment-receiving">
      <div className="bg-surface-elevated rounded-xl h-full" data-testid="payment-tender-panel">
        <div className="mb-3 text-5xl p-5 text-center " data-testid="payment-tendered">
          {withCurrency(tendered)}
        </div>
        <div
          data-testid="payment-change-due"
          className={
          cn(
            "mb-3 text-3xl p-5 text-center",
            changeDue < 0 && 'text-danger-700',
            changeDue > 0 && 'text-success-700'
          )
        }>
          {changeDisplay.isRemaining ? t('receiving.remaining') : t('receiving.change')}:{' '}
          <span className="">
            {withCurrency(changeDisplay.isRemaining ? changeDisplay.remaining : changeDisplay.change)}
          </span>
        </div>
        <div className="relative">
          <ScrollContainer className="gap-3 flex overflow-x-auto mb-5" data-testid="payment-quick-amounts">
          <span
            className="btn btn-primary w-[100px] lg"
            data-testid="payment-quick-exact"
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
          {/*{!isCash && <div className="payment-disabled absolute w-full z-10 top-0 bg-surface/50 h-[48px]"></div>}*/}
        </div>

        <ScrollContainer className="gap-5 flex overflow-x-auto mb-5" data-testid="payment-types">
          {paymentTypes?.map(item => (
            <Button
              className="min-w-[150px]"
              variant="primary"
              key={item.id}
              data-testid="payment-type"
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

        <div className="flex justify-center items-center mb-3 text-xl h-[28px]" data-testid="payment-amount-entry">
          {selectedAmount.trim().length > 0 && selectedAmount}
        </div>

        <div className="flex">
          <div className="flex-1">
            <div className="grid grid-cols-3 gap-3 mb-3" data-testid="payment-keypad">
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
            <div className="flex gap-5" data-testid="payment-finish-actions">
              <span title={tempPrinted ? t('receiving.tempAlreadyPrinted') : undefined} className="flex-1 flex">
                <Button
                  variant={tempPrinted ? "warning" : "primary"}
                  className="flex-1"
                  flat
                  icon={faPrint}
                  size="lg"
                  data-testid="payment-temp-bill"
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
                      doPrint: async () => {
                        // Flush draft first so payment-type auto-tax is on the order for the bill.
                        if (flushDraft) {
                          await flushDraft().catch(() => undefined);
                        }
                        let full = await fetchOrderFull(db, order.id);
                        if (!full) {
                          throw new Error('Failed to load order for temp bill print');
                        }
                        const taxRef = full.tax != null
                          ? String((full.tax as any)?.id ?? full.tax)
                          : (tax?.id ? String(tax.id) : '');
                        if (taxRef && !(Number(full.tax_amount) > 0)) {
                          await posStore.recomputeOrderTaxes(String(order.id), {
                            extraPatch: { tax: taxRef },
                          }).catch(() => undefined);
                          full = await fetchOrderFull(db, order.id);
                          if (!full) {
                            throw new Error('Failed to load order for temp bill print');
                          }
                        }
                        await dispatchPrint(db, PRINT_TYPE.presale_bill, {
                          order: full,
                          taxes: allTaxes
                        }, {userId: page?.user?.id});
                      },
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
                data-testid="payment-complete"
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
      <div className="flex flex-col gap-2 p-3 bg-surface-elevated rounded-xl h-full" data-testid="payment-lines">
        <RemotePaymentPendingSlot/>
        {payments.map(payment => (
          <div
            className="flex justify-between text-lg cursor-pointer"
            key={payment.id}
            data-testid="payment-line"
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
