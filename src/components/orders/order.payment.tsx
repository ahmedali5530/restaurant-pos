import {Order} from "@/api/model/order.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {OrderHeader} from "@/components/orders/order.header.tsx";
import ScrollContainer from "react-indiana-drag-scroll";
import React, {CSSProperties, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {OrderTimes} from "@/components/orders/order.times.tsx";
import {calculateOrderTotal} from "@/lib/cart.ts";
import {computeOrderPaymentTotals} from "@/lib/order-payment-totals.ts";
import {cn, toRecordId, withCurrency} from "@/lib/utils.ts";
import {OrderPaymentReceiving} from "@/components/orders/payment/order.payment.receiving.tsx";
import {OrderPaymentTax} from "@/components/orders/payment/order.payment.tax.tsx";
import {Tax} from "@/api/model/tax.ts";
import {DiscountType} from "@/api/model/discount.ts";
import {OrderPaymentDiscountEngine} from "@/components/orders/payment/order.payment.discount-engine.tsx";
import type {AppliedDiscountLine} from "@/lib/discount-engine/types.ts";
import {useDiscountCache} from "@/hooks/useDiscountCache.ts";
import {
  loadActiveOrderDiscounts,
  persistOrderDiscounts,
} from "@/lib/discount-engine/service.ts";
import {posStore} from "@/infrastructure/pos-store/pos-store.ts";
import {orderDiscountToAppliedLine} from "@/lib/discount-engine/context.ts";
import {toTargetId} from "@/lib/discount-engine/target-ids.ts";
import {OrderPaymentServiceCharges} from "@/components/orders/payment/order.payment.service_charges.tsx";
import {OrderPaymentTip} from "@/components/orders/payment/order.payment.tip.tsx";
import {faPencil} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {OrderPayment as OrderPaymentModal} from "@/api/model/order_payment.ts";
import {dispatchPrint} from "@/lib/print.service.ts";
import {PRINT_TYPE} from "@/lib/print.registry.tsx";
import {useDB} from "@/api/db/db.ts";
import {OrderPaymentNotes} from "@/components/orders/payment/order.payment.notes.tsx";
import {getOrderFilteredItems} from "@/lib/order.ts";
import {useAtom} from "jotai";
import {appPage, appSettings} from "@/store/jotai.ts";
import {Extra} from "@/api/model/extra.ts";
import {Coupon, WeekDay} from "@/api/model/coupon.ts";
import {isExtraApplicable as extraMatchesContext} from "@/infrastructure/pos-store/catalog.ts";
import {OrderPaymentCoupon} from "@/components/orders/payment/order.payment.coupon.tsx";
import { hasTempPrint, requestBillPrint } from "@/lib/order-print.ts";
import {toast} from "sonner";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {nowSurrealDateTime, toJsDate} from "@/lib/datetime.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {useTranslation} from "react-i18next";
import { getFiscalQrcodesForOrderPrint } from "@/integrations/providers/fiscal/settlement.ts";
import {OrderItemName} from "@/components/common/order/order.item.tsx";

interface Props {
  order: Order
  onClose: () => void
}

enum PaymentOptions {
  Payment = 'Payment',
  Discount = 'Discount',
  Coupon = 'Coupon',
  Tax = 'Tax',
  'Service Charges' = 'Service Charges',
  Tip = 'Tip',
  Notes = 'Notes'
}

export const OrderPayment = ({
  order, onClose
}: Props) => {
  const {t} = useTranslation('payment');
  const db = useDB();
  const {protectAction} = useSecurity();
  useDiscountCache();

  const [page] = useAtom(appPage);
  const [settings] = useAtom(appSettings);

  const itemsTotal = calculateOrderTotal(order);
  const [paymentTypes, setPaymentTypes] = useState<OrderPaymentModal[]>([]);

  const [tax, setTax] = useState<Tax>();
  const [taxAmount, setTaxAmount] = useState<number>(0);

  const [discountLines, setDiscountLines] = useState<AppliedDiscountLine[]>([]);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [orderDiscountIds, setOrderDiscountIds] = useState<string[]>([]);
  const [selectedPaymentTypeId, setSelectedPaymentTypeId] = useState<string | undefined>();
  const saveInFlightRef = useRef(false);
  const savePendingRef = useRef(false);

  const [serviceCharge, setServiceCharge] = useState<number>(0);
  const [serviceChargeAmount, setServiceChargeAmount] = useState<number>(0);
  const [serviceChargeType, setServiceChargeType] = useState<DiscountType>(DiscountType.Percent);

  const [tip, setTip] = useState<number>(0);
  const [tipType, setTipType] = useState<DiscountType>(DiscountType.Percent);
  const [tipAmount, setTipAmount] = useState<number>(0);

  const [notes, setNotes] = useState<string>('');
  const [extraToggles, setExtraToggles] = useState<Record<string, boolean>>({});
  const [isInitialized, setInitialized] = useState(false);

  const [coupon, setCoupon] = useState<Coupon | undefined>();
  const [couponAmount, setCouponAmount] = useState<number>(0);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
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

  const selectedPaymentTypeIds = useMemo(() => {
    return new Set((paymentTypes || []).map(item => item.payment_type?.id?.toString()).filter(Boolean));
  }, [paymentTypes]);

  const isDeliveryOrder = !!order?.delivery;
  const orderTypeId = order?.order_type?.id?.toString();
  const tableId = order?.table?.id?.toString();

  const defaultExtras = useMemo<Record<string, number>>(() => {
    const records = (settings.extras ?? []) as Extra[];
    const mapped: Record<string, number> = {};

    records
      .filter((extra) =>
        extraMatchesContext(extra, {
          paymentTypeIds: selectedPaymentTypeIds,
          orderTypeId,
          tableId,
          isDelivery: isDeliveryOrder,
        }),
      )
      .forEach((item) => {
        mapped[item.name] = Number(item.value || 0);
      });

    return mapped;
  }, [settings.extras, selectedPaymentTypeIds, orderTypeId, tableId, isDeliveryOrder]);

  useEffect(() => {
    setExtraToggles(prev => {
      const next: Record<string, boolean> = {};
      Object.keys(defaultExtras).forEach(extraName => {
        next[extraName] = prev[extraName] ?? true;
      });
      return next;
    });
  }, [defaultExtras]);

  const extras = useMemo<Record<string, number>>(() => {
    const mapped: Record<string, number> = {};
    Object.entries(defaultExtras).forEach(([name, value]) => {
      mapped[name] = (extraToggles[name] ?? true) ? value : 0;
    });
    return mapped;
  }, [defaultExtras, extraToggles]);

  const paymentTotalsParams = useMemo(() => ({
    tax: tax ?? order.tax ?? null,
    discountLines,
    extras,
    serviceCharge,
    serviceChargeType,
    couponAmount,
    tip,
    tipType,
    itemsTotal,
    paymentTypeId: selectedPaymentTypeId,
  }), [tax, order.tax, discountLines, extras, serviceCharge, serviceChargeType, couponAmount, tip, tipType, itemsTotal, selectedPaymentTypeId]);

  const paymentTotals = useMemo(
    () => computeOrderPaymentTotals(order, paymentTotalsParams),
    [order, paymentTotalsParams],
  );

  const cartTotals = useMemo(() => ({
    ...paymentTotals,
    itemsTotal,
    extrasTotal: Object.values(extras).reduce((prev, item) => prev + item, 0),
    couponAmount,
    taxableAmount: 0,
  }), [paymentTotals, itemsTotal, extras, couponAmount]);

  useEffect(() => {
    const autoLines = cartTotals.discountLines.filter(l => l.applicationType === 'automatic');
    const manualLines = discountLines.filter(l => l.applicationType === 'manual');
    const merged = [...autoLines, ...manualLines];
    const total = merged.reduce((s, l) => s + l.appliedAmount, 0);
    if (total !== discountAmount) {
      setDiscountAmount(total);
    }
    setTaxAmount(cartTotals.taxAmount);
  }, [cartTotals, discountLines, discountAmount, tax, order.tax]);

  useEffect(() => {
    if (tipType === DiscountType.Fixed) {
      setTipAmount(tip);
    } else {
      setTipAmount(itemsTotal * tip / 100);
    }
  }, [tip, itemsTotal, tipType]);

  useEffect(() => {
    if (serviceCharge) {
      setServiceChargeAmount(
        serviceChargeType === DiscountType.Percent ?
          itemsTotal * serviceCharge / 100 :
          serviceCharge
      )
    } else {
      setServiceChargeAmount(0);
    }
  }, [serviceCharge, itemsTotal, serviceChargeType]);

  useEffect(() => {
    if (isInitialized) {
      return;
    }

    // In-progress tenders live locally in `draft_payments`; settled rows in `payments`.
    const draftPayments = ((order as any)?.draft_payments as OrderPaymentModal[] | undefined) ?? [];
    const existingPayments = (draftPayments.length > 0 ? draftPayments : (order?.payments ?? []))
      .filter((payment) => payment != null);
    setPaymentTypes(existingPayments);
    setTax(order?.tax);
    setTaxAmount(order?.tax_amount ?? 0);

    const lastPt = existingPayments[existingPayments.length - 1]?.payment_type?.id;
    if (lastPt) {
      setSelectedPaymentTypeId(toTargetId(lastPt));
    }

    void (async () => {
      try {
        const rows = await loadActiveOrderDiscounts(db, order.id);
        if (rows.length > 0) {
          // Seed manuals only — automatic lines are recomputed by cart totals.
          const lines = rows
            .map(orderDiscountToAppliedLine)
            .filter(line => line.applicationType === 'manual');
          setDiscountLines(lines);
          setOrderDiscountIds(rows.map(r => r.id));
          setDiscountAmount(lines.reduce((s, l) => s + l.appliedAmount, 0));
        } else if (order?.discount_amount) {
          setDiscountAmount(order.discount_amount);
          if (order.discount) {
            setDiscountLines([{
              discountId: toTargetId(order.discount.id),
              name: order.discount.name,
              appliedAmount: order.discount_amount,
              appliedRate: order.discount_rate,
              scope: 'cart',
              valueType: 'percent',
              taxTreatment: 'tax_before_discount',
              applicationType: 'manual',
            }]);
          }
        }
      } catch {
        setDiscountAmount(order?.discount_amount ?? 0);
      } finally {
        setInitialized(true);
      }
    })();

    setServiceCharge(Number(order?.service_charge || 0));
    setServiceChargeAmount(order?.service_charge_amount ?? 0);
    setServiceChargeType(order?.service_charge_type === DiscountType.Fixed ? DiscountType.Fixed : DiscountType.Percent);

    setTip(order?.tip ?? 0);
    setTipAmount(order?.tip_amount ?? 0);
    setTipType(order?.tip_type === DiscountType.Fixed ? DiscountType.Fixed : DiscountType.Percent);
    setNotes(order?.notes);

    if (order?.coupon) {
      setCoupon(order.coupon.coupon);
      setCouponAmount(order.coupon.discount ?? 0);
    } else {
      setCoupon(undefined);
      setCouponAmount(0);
    }

    const orderExtraMap = (order?.extras || [])
      .filter(item => item !== undefined)
      .reduce((acc, item) => {
      acc[item.name] = Number(item.value || 0);
      return acc;
    }, {} as Record<string, number>);
    setExtraToggles(prev => {
      const next = {...prev};
      Object.keys(orderExtraMap).forEach(extraName => {
        next[extraName] = orderExtraMap[extraName] > 0;
      });
      return next;
    });
  }, [order, isInitialized]);

  const total = paymentTotals.total;

  const resolvePayable = useCallback((taxOverride?: Tax | null, paymentTypeId?: string) => {
    return computeOrderPaymentTotals(order, {
      ...paymentTotalsParams,
      tax: taxOverride !== undefined ? taxOverride : paymentTotalsParams.tax,
      paymentTypeId: paymentTypeId ?? paymentTotalsParams.paymentTypeId,
    }).total;
  }, [order, paymentTotalsParams]);

  const [mode, setMode] = useState(PaymentOptions.Tax);

  const applyCoupon = async (code: string) => {
    if (!code) {
      return;
    }

    setIsApplyingCoupon(true);
    try {
      const now = nowSurrealDateTime();
      const nowJs = now.toDate();

      const couponRecord = await posStore.findActiveCouponByCode(code);
      if (!couponRecord) {
        toast.error(t('coupon.errors.notFound'));
        return;
      }

      if (couponRecord.coupon_type !== "order") {
        toast.error(t('coupon.errors.unsupportedType'));
        return;
      }

      if (
        couponRecord.min_order_amount !== undefined &&
        couponRecord.min_order_amount !== null &&
        itemsTotal < Number(couponRecord.min_order_amount)
      ) {
        toast.error(t('coupon.errors.belowMinimum'));
        return;
      }

      const dayMap: WeekDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      if (Array.isArray(couponRecord.valid_days) && couponRecord.valid_days.length > 0) {
        const today = dayMap[nowJs.getDay()];
        if (!couponRecord.valid_days.includes(today)) {
          toast.error(t('coupon.errors.notValidToday'));
          return;
        }
      }

      if (couponRecord.start_time || couponRecord.end_time) {
        const [h, m] = nowJs.toTimeString().split(":").map(Number);
        const currentMinutes = h * 60 + m;

        const toMinutesFromField = (value: unknown) => {
          if (!value) return undefined;
          if (typeof value === "string") {
            const [hh, mm] = value.split(":").map(Number);
            if (Number.isNaN(hh) || Number.isNaN(mm)) return undefined;
            return hh * 60 + mm;
          }
          const d = toJsDate(value as any);
          if (Number.isNaN(d.getTime())) return undefined;
          return d.getHours() * 60 + d.getMinutes();
        };

        const startMinutes = toMinutesFromField(couponRecord.start_time);
        const endMinutes = toMinutesFromField(couponRecord.end_time);

        if (
          (startMinutes !== undefined && currentMinutes < startMinutes) ||
          (endMinutes !== undefined && currentMinutes > endMinutes)
        ) {
          toast.error(t('coupon.errors.notValidTime'));
          return;
        }
      }

      if (couponRecord.start_date) {
        const startDate = toJsDate(couponRecord.start_date as any);
        if (nowJs < startDate) {
          toast.error(t('coupon.errors.notActiveYet'));
          return;
        }
      }
      if (couponRecord.end_date) {
        const endDate = toJsDate(couponRecord.end_date as any);
        if (nowJs > endDate) {
          toast.error(t('coupon.errors.expired'));
          return;
        }
      }

      if (
        couponRecord.usage_limit !== undefined &&
        couponRecord.usage_limit !== null
      ) {
        const { global } = await posStore.countCouponRedemptions({
          couponId: String(couponRecord.id),
        });
        if (global >= Number(couponRecord.usage_limit)) {
          toast.error(t('coupon.errors.usageLimitReached'));
          return;
        }
      }

      if (
        couponRecord.usage_limit_per_user !== undefined &&
        couponRecord.usage_limit_per_user !== null &&
        page?.user?.id
      ) {
        const { perUser } = await posStore.countCouponRedemptions({
          couponId: String(couponRecord.id),
          userId: String(page.user.id),
        });
        if (perUser >= Number(couponRecord.usage_limit_per_user)) {
          toast.error(t('coupon.errors.userLimitReached'));
          return;
        }

        if (couponRecord.first_order_only && perUser > 0) {
          toast.error(t('coupon.errors.firstOrderOnly'));
          return;
        }
      }

      if (!couponRecord.stackable && discountAmount > 0) {
        toast.error(t('coupon.errors.notStackable'));
        return;
      }

      let computed: number;
      if (couponRecord.discount_type === "fixed") {
        computed = Number(couponRecord.discount_value || 0);
      } else {
        const percent = Number(couponRecord.discount_value || 0);
        computed = (itemsTotal * percent) / 100;
      }

      if (
        couponRecord.max_discount_amount !== undefined &&
        couponRecord.max_discount_amount !== null
      ) {
        computed = Math.min(computed, Number(couponRecord.max_discount_amount));
      }

      computed = Math.min(computed, itemsTotal);

      if (computed <= 0) {
        toast.error(t('coupon.errors.noDiscount'));
        return;
      }

      setCoupon(couponRecord);
      setCouponAmount(computed);
      toast.success(t('coupon.appliedSuccess'));
    } catch (e) {
      toast.error(e);
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const clearCoupon = () => {
    setCoupon(undefined);
    setCouponAmount(0);
  };

  const print = async () => {
    const o = (await posStore.getOrderHydrated(String(order.id))) as Order | null;
    if (!o) {
      toast.error(t('payment:errors.createOrder'));
      return;
    }
    const qrcodes = await getFiscalQrcodesForOrderPrint(db, order.id).catch(() => []);

    await requestBillPrint({
      db,
      orderId: order.id.toString(),
      printType: 'final',
      printModule: 'orders.print_final',
      description: 'Print final bill',
      userId: page?.user?.id?.toString?.() ?? page?.user?.id,
      skipIfOverLimit: true,
      doPrint: () => dispatchPrint(db, PRINT_TYPE.final_bill, {
        order: o,
        qrcodes,
        qrcode: qrcodes[0]?.value,
      }, {userId: page?.user?.id}),
    });
  }

  const onPayment = (opts?: { settled?: boolean }) => {
    // After settle the order is Paid — do not flush draft/tax again (blocks modal close).
    if (opts?.settled) {
      onClose();
    } else {
      void closeModal();
    }

    setTimeout(() => {
      void print();
    }, 300)
  }

  const saveOrderProgress = useCallback(async () => {
    // Prevent persisting transient default state before first initialization is complete.
    if (!isInitialized) {
      return;
    }

    const orderId = String(order.id);
    const seed = { order, items: order.items };
    const hasCoupon = coupon && couponAmount > 0;
    const allLines = cartTotals.discountLines;
    const extraRows = Object.keys(extras).map((name) => ({
      id: `order_extras:${orderId.split(':')[1]}_${name.replace(/[^a-zA-Z0-9_]/g, '_')}`,
      name,
      value: extras[name],
    }));

    // Local-first: Dexie commit + outbox ops; payment lines stay local until settle.
    await posStore.saveOrderDraft(orderId, {
      draft_payments: paymentTypes,
      tax: tax?.id ? String(tax.id) : null,
      tip: tip,
      tip_amount: tipAmount,
      tip_type: tipType,
      service_charge: serviceCharge,
      service_charge_amount: serviceChargeAmount,
      service_charge_type: serviceChargeType,
      notes: notes,
      extras: extraRows,
      coupon: hasCoupon
        ? { id: order?.coupon?.id ? String(order.coupon.id) : undefined, couponId: String(coupon.id), discount: couponAmount }
        : null,
    }, seed);

    try {
      const rows = await persistOrderDiscounts(db, orderId, allLines, page?.user, orderDiscountIds, seed);
      setOrderDiscountIds(rows.map(r => String(r.id)));
    } catch (e) {
      console.error('Failed to persist order discounts', e);
    }

    // order_tax rows + tax_amount follow the selected order-level tax.
    await posStore.recomputeOrderTaxes(orderId).catch((e) => console.warn('Tax recompute failed', e));

    postOrderTracking({
      module: "orders.update_payment",
      page: page?.page,
      orderId: order.id,
      payload: {
        payment_count: paymentTypes.length,
        extras_count: extraRows.length,
        tax: tax?.id?.toString(),
        discount_count: allLines.length,
        discount: allLines[0]?.discountId,
        coupon: coupon?.id?.toString(),
      },
      user: page?.user,
    });
  }, [
    order,
    paymentTypes,
    total,
    extras,
    tax,
    taxAmount,
    cartTotals,
    discountLines,
    tip,
    tipAmount,
    tipType,
    serviceCharge,
    serviceChargeAmount,
    serviceChargeType,
    notes,
    coupon,
    couponAmount,
    isInitialized,
    page?.page,
    page?.user
  ])

  const saveOrderProgressRef = useRef(saveOrderProgress);
  useEffect(() => {
    saveOrderProgressRef.current = saveOrderProgress;
  }, [saveOrderProgress]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const run = async () => {
      if (saveInFlightRef.current) {
        savePendingRef.current = true;
        return;
      }

      saveInFlightRef.current = true;
      try {
        do {
          savePendingRef.current = false;
          await saveOrderProgressRef.current();
        } while (savePendingRef.current);
      } finally {
        saveInFlightRef.current = false;
      }
    };

    void run();
  }, [saveOrderProgress, isInitialized]);

  const flushOrderProgress = async () => {
    if (!isInitialized) {
      return;
    }

    while (saveInFlightRef.current || savePendingRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    saveInFlightRef.current = true;
    try {
      do {
        savePendingRef.current = false;
        await saveOrderProgressRef.current();
      } while (savePendingRef.current);
    } finally {
      saveInFlightRef.current = false;
    }
  };

  const closeModal = async () => {
    try {
      await flushOrderProgress();
    } catch (error) {
      console.error('Failed to flush order progress on close', error);
    }
    onClose();
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

  return (
    <Modal
      title={t('title', {invoice: order.invoice_number})}
      open={true}
      onClose={closeModal}
      size="full"
    >
      <div className="grid grid-cols-4 gap-5 mb-0 select-none" data-testid="payment-screen">
        <div className="bg-white rounded-xl flex flex-col overflow-auto h-[calc(100vh_-_120px_-_var(--app-toolbar-h))]" data-testid="payment-order-summary">
          <div className="p-3 flex gap-3 flex-col">
            <OrderHeader order={order} tempPrinted={tempPrinted}/>
            <OrderTimes order={order}/>
            <div className="separator h-[2px]" style={{'--size': '10px', '--space': '5px'} as CSSProperties}></div>
            <ScrollContainer className="gap-1 flex flex-col">
              <div className="overflow-ellipsis max-h-[170px]" data-testid="payment-line-items">
                {getOrderFilteredItems(order).map(item => (
                  <OrderItemName
                    key={item.id}
                    item={item}
                    showPrice={showPriceInOrderCard}
                    showModifierPrice={showModifierPriceInOrderCard}
                    showQuantity={showQuantityInOrderCard}
                    showTotal={showTotalInOrderCard}
                    showGroups={showGroupsInOrderCard}
                    showModifiers={showModifiersInOrderCard}
                  />
                  // <div className="flex gap-3 hover:bg-neutral-100" key={item.id}>
                  //   <div className="flex-1 whitespace-break-spaces">{item.item.name}</div>
                  //   <div className="text-right w-[50px] flex-shrink-0">{formatNumber(item.quantity)}</div>
                  //   <div className="text-right w-[80px] flex-shrink-0">{formatNumber(item.price)}</div>
                  //   {showTotalInPaymentCard && (
                  //     <div className="text-right w-[80px] flex-shrink-0">{formatNumber(item.quantity * item.price)}</div>
                  //   )}
                  // </div>
                ))}
              </div>
            </ScrollContainer>
            <div className="separator h-[2px]" style={{'--size': '10px', '--space': '5px'} as CSSProperties}></div>
          </div>
          <div className="flex flex-col font-bold text-lg" data-testid="payment-totals">
            <div className="flex justify-between p-3">
              <div>{t('totals.items', {count: getOrderFilteredItems(order).length})}</div>
              <div className="text-right">{withCurrency(itemsTotal)}</div>
            </div>
            <div
              data-testid="payment-row-tax"
              className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Tax && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions.Tax), {
                module: 'orders.apply_tax',
                description: 'Apply tax',
                payload: {
                  order: order.id.toString()
                }
              });
            }}>
              <div>
                {tax
                  ? t('tabs.taxWithRate', {name: tax.name, rate: tax.rate})
                  : t('tabs.tax')}{' '}
                <FontAwesomeIcon icon={faPencil}/>
              </div>
              <div className="text-right">{withCurrency(taxAmount)}</div>
            </div>

            <div
              data-testid="payment-row-discount"
              className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Discount && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions.Discount), {
                module: 'orders.apply_discount',
                description: 'Apply discount',
                payload: {
                  order: order.id.toString()
                }
              });
            }}>
              <div>
                {t('tabs.discount')}{' '}
                {cartTotals.discountLines.length > 0 && `(${cartTotals.discountLines.length})`}{' '}
                <FontAwesomeIcon icon={faPencil}/>
              </div>
              <div className="text-right">{withCurrency(cartTotals.discountTotal)}</div>
            </div>

            <div
              data-testid="payment-row-coupon"
              className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Coupon && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions.Coupon), {
                module: 'orders.apply_coupon',
                description: 'Apply coupon',
                payload: {
                  order: order.id.toString()
                }
              });
            }}>
              <div>{t('tabs.coupon')} <FontAwesomeIcon icon={faPencil}/></div>
              <div className="text-right">{withCurrency(couponAmount)}</div>
            </div>

            <div
              data-testid="payment-row-service-charges"
              className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions['Service Charges'] && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions['Service Charges']), {
                module: 'orders.apply_service_charges',
                description: 'Apply service charges',
                payload: {
                  order: order.id.toString()
                }
              });
            }}>
              <div>{t('tabs.serviceCharges', {
                value: serviceCharge,
                unit: serviceChargeType === DiscountType.Percent ? '%' : ''
              })}{' '}
                <FontAwesomeIcon icon={faPencil}/></div>
              <div className="text-right">{withCurrency(serviceChargeAmount)}</div>
            </div>

            <div
              data-testid="payment-row-tip"
              className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Tip && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions.Tip), {
                module: 'orders.apply_tips',
                description: 'Apply tips',
                payload: {
                  order: order.id.toString()
                }
              });
            }}>
              <div>{t('tabs.tip', {value: tip, unit: tipType === DiscountType.Percent ? '%' : ''})} <FontAwesomeIcon
                icon={faPencil}/></div>
              <div className="text-right">{withCurrency(tipAmount)}</div>
            </div>

            {Object.keys(extras).map(extra => (
              <div
                className={
                  cn(
                    "flex justify-between p-3 cursor-pointer",
                    extras[extra] === 0 ? 'line-through decoration-2' : ''
                  )
                }
                key={extra}
                data-testid="payment-row-extra"
                onClick={() => {
                  protectAction(() => setExtraToggles(prev => ({
                    ...prev,
                    [extra]: !(prev[extra] ?? true)
                  })), {
                    module: 'orders.change_extras',
                    description: 'Change extras',
                    payload: {
                      order: order.id.toString()
                    }
                  });
                }}
              >
                <div>{extra}</div>
                <div className="text-right">{withCurrency(extras[extra])}</div>
              </div>
            ))}
            <div
              data-testid="payment-row-notes"
              className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Notes && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => setMode(PaymentOptions.Notes)}>
              <div>{t('tabs.notes')} <FontAwesomeIcon icon={faPencil}/></div>
              <div className="text-right">{notes}</div>
            </div>

            <div className="flex justify-between p-3" data-testid="payment-total-row">
              <div className="text-2xl">{t('tabs.total')}</div>
              <div className="text-right text-2xl">{withCurrency(total)}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl flex flex-col p-3 h-[calc(100vh_-_120px_-_var(--app-toolbar-h))]" data-testid="payment-adjust-panel">
          {mode === PaymentOptions.Tax && (
            <OrderPaymentTax tax={tax} setTax={setTax}/>
          )}
          {mode === PaymentOptions.Discount && (
            <OrderPaymentDiscountEngine
              order={order}
              discountLines={discountLines.filter(l => l.applicationType === 'manual')}
              automaticLines={cartTotals.discountLines.filter(l => l.applicationType === 'automatic')}
              onApply={(manualLines) => {
                const autoLines = cartTotals.discountLines.filter(l => l.applicationType === 'automatic');
                setDiscountLines([...autoLines, ...manualLines]);
              }}
            />
          )}
          {mode === PaymentOptions.Coupon && (
            <OrderPaymentCoupon
              coupon={coupon}
              couponAmount={couponAmount}
              isApplying={isApplyingCoupon}
              onApply={applyCoupon}
              onClear={clearCoupon}
            />
          )}
          {mode === PaymentOptions['Service Charges'] && (
            <OrderPaymentServiceCharges
              serviceCharge={serviceCharge}
              setServiceCharge={setServiceCharge}
              setServiceChargeType={setServiceChargeType}
              serviceChargeType={serviceChargeType}
              order={order}
            />
          )}
          {mode === PaymentOptions.Tip && (
            <OrderPaymentTip tip={tip} setTip={setTip} tipType={tipType} setTipType={setTipType}/>
          )}
          {mode === PaymentOptions.Notes && (
            <OrderPaymentNotes setNotes={setNotes} notes={notes}/>
          )}
        </div>
        <div className="flex flex-col bg-neutral-100 rounded-xl col-span-2" data-testid="payment-receiving-column">
          <OrderPaymentReceiving
            order={order}
            total={total}
            resolvePayable={resolvePayable}
            onComplete={onPayment}
            extras={extras}
            setTax={setTax}
            discountAmount={cartTotals.discountTotal}
            onPaymentTypeSelected={(paymentTypeId) => {
              setSelectedPaymentTypeId(toTargetId(paymentTypeId));
            }}
            tax={tax}
            taxAmount={taxAmount}
            tip={tip}
            tipAmount={tipAmount}
            tipType={tipType}
            payments={paymentTypes}
            setPayments={setPaymentTypes}
            itemsTotal={itemsTotal}
            serviceChargeAmount={serviceChargeAmount}
            setServiceChargeAmount={setServiceChargeAmount}
            serviceCharge={serviceCharge}
            serviceChargeType={serviceChargeType}
            notes={notes}
            coupon={coupon}
            couponAmount={couponAmount}
          />
        </div>
      </div>
    </Modal>
  )
}
