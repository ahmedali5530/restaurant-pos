import {Order} from "@/api/model/order.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {OrderHeader} from "@/components/orders/order.header.tsx";
import ScrollContainer from "react-indiana-drag-scroll";
import React, {CSSProperties, useCallback, useEffect, useMemo, useState} from "react";
import {OrderTimes} from "@/components/orders/order.times.tsx";
import {calculateOrderGrandTotal, calculateOrderTotal} from "@/lib/cart.ts";
import {cn, formatNumber, toRecordId, withCurrency} from "@/lib/utils.ts";
import {OrderPaymentReceiving} from "@/components/orders/payment/order.payment.receiving.tsx";
import {OrderPaymentTax} from "@/components/orders/payment/order.payment.tax.tsx";
import {Tax} from "@/api/model/tax.ts";
import {Discount, DiscountType} from "@/api/model/discount.ts";
import {OrderPaymentDiscount} from "@/components/orders/payment/order.payment.discount.tsx";
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
import {appPage} from "@/store/jotai.ts";
import {Tables} from "@/api/db/tables.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Extra} from "@/api/model/extra.ts";
import {Coupon, WeekDay} from "@/api/model/coupon.ts";
import {OrderPaymentCoupon} from "@/components/orders/payment/order.payment.coupon.tsx";
import {toast} from "sonner";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {nowSurrealDateTime, toJsDate} from "@/lib/datetime.ts";
import {postOrderTracking} from "@/lib/tracking.service.ts";
import {useTranslation} from "react-i18next";

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

  const [page] = useAtom(appPage);

  const closeModal = () => {
    onClose();
  }

  const itemsTotal = calculateOrderTotal(order);
  const [paymentTypes, setPaymentTypes] = useState<OrderPaymentModal[]>([]);

  const [tax, setTax] = useState<Tax>();
  const [taxAmount, setTaxAmount] = useState<number>(0);

  const [discount, setDiscount] = useState<Discount>();
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountRate, setDiscountRate] = useState<number>(0);

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

  const {
    data: extrasData,
  } = useApi<SettingsData<Extra>>(Tables.extras, [], ["name asc"], 0, 99999, [
    "payment_types",
    "order_types",
    "tables",
  ]);

  const selectedPaymentTypeIds = useMemo(() => {
    return new Set((paymentTypes || []).map(item => item.payment_type?.id?.toString()).filter(Boolean));
  }, [paymentTypes]);

  const isDeliveryOrder = !!order?.delivery;
  const orderTypeId = order?.order_type?.id?.toString();
  const tableId = order?.table?.id?.toString();

  const isExtraApplicable = useCallback((extra: Extra) => {
    if (extra.apply_to_all) {
      return true;
    }

    const hasPaymentTypeRule = (extra.payment_types?.length || 0) > 0;
    const hasOrderTypeRule = (extra.order_types?.length || 0) > 0;
    const hasTableRule = (extra.tables?.length || 0) > 0;
    const hasDeliveryRule = !!extra.delivery;
    const hasAnyRule = hasPaymentTypeRule || hasOrderTypeRule || hasTableRule || hasDeliveryRule;

    if (!hasAnyRule) {
      return false;
    }
    if (hasDeliveryRule && !isDeliveryOrder) {
      return false;
    }

    if (hasOrderTypeRule) {
      const orderTypeIds = new Set(extra.order_types?.map(item => item.id?.toString()));
      if (!orderTypeId || !orderTypeIds.has(orderTypeId)) {
        return false;
      }
    }

    if (hasTableRule) {
      const tableIds = new Set(extra.tables?.map(item => item.id?.toString()));
      if (!tableId || !tableIds.has(tableId)) {
        return false;
      }
    }

    if (hasPaymentTypeRule) {
      const extraPaymentTypeIds = new Set(extra.payment_types?.map(item => item.id?.toString()));
      const hasMatchingPaymentType = [...selectedPaymentTypeIds].some(id => extraPaymentTypeIds.has(id));
      if (!hasMatchingPaymentType) {
        return false;
      }
    }

    return true;
  }, [isDeliveryOrder, orderTypeId, tableId, selectedPaymentTypeIds]);

  const defaultExtras = useMemo<Record<string, number>>(() => {
    const records = extrasData?.data || [];
    const mapped: Record<string, number> = {};

    records.filter(isExtraApplicable).forEach(item => {
      mapped[item.name] = Number(item.value || 0);
    });

    return mapped;
  }, [extrasData, isExtraApplicable]);

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

  useEffect(() => {
    if (tax) {
      setTaxAmount(itemsTotal * tax.rate / 100)
    } else {
      setTaxAmount(0);
    }
  }, [tax, itemsTotal]);

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

    setPaymentTypes(order?.payments ?? []);
    setTax(order?.tax);
    setTaxAmount(order?.tax_amount ?? 0);

    setDiscount(order?.discount);
    setDiscountAmount(order?.discount_amount ?? 0);
    setDiscountRate(order?.discount_rate ?? 0);

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

    const orderExtraMap = (order?.extras || []).reduce((acc, item) => {
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

    setInitialized(true);
  }, [order, isInitialized]);

  const total = useMemo(() => {
    const extrasTotal = Object.values(extras).reduce((prev, item) => prev + item, 0);
    return calculateOrderGrandTotal({
      itemsTotal,
      extrasTotal,
      taxAmount,
      discountAmount,
      serviceChargeAmount,
      couponAmount,
      tipAmount,
    });
  }, [itemsTotal, taxAmount, discountAmount, serviceChargeAmount, extras, tipAmount, couponAmount]);

  const [mode, setMode] = useState(PaymentOptions.Tax);

  const applyCoupon = async (code: string) => {
    if (!code) {
      return;
    }

    setIsApplyingCoupon(true);
    try {
      const now = nowSurrealDateTime();
      const nowJs = now.toDate();

      const [coupons] = await db.query<Coupon[]>(
        `SELECT *
         FROM ${Tables.coupons}
         WHERE code = $code
           AND is_active = true
           AND deleted_at = none
         ORDER BY priority ASC LIMIT 1`,
        {code}
      );

      const couponRecord = (coupons || [])[0];
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
        const [allRedemptions] = await db.query(
          `SELECT *
           FROM ${Tables.coupon_redemptions}
           WHERE coupon = $couponId`,
          {couponId: couponRecord.id}
        );
        if ((allRedemptions || []).length >= Number(couponRecord.usage_limit)) {
          toast.error(t('coupon.errors.usageLimitReached'));
          return;
        }
      }

      if (
        couponRecord.usage_limit_per_user !== undefined &&
        couponRecord.usage_limit_per_user !== null &&
        page?.user?.id
      ) {
        const [userRedemptions] = await db.query(
          `SELECT *
           FROM ${Tables.coupon_redemptions}
           WHERE coupon = $couponId
             AND user = $userId`,
          {
            couponId: couponRecord.id,
            userId: page.user.id,
          }
        );
        if (
          (userRedemptions || []).length >=
          Number(couponRecord.usage_limit_per_user)
        ) {
          toast.error(t('coupon.errors.userLimitReached'));
          return;
        }

        if (couponRecord.first_order_only && (userRedemptions || []).length > 0) {
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
    // fetch latest order from database
    const [o] = await db.query<[Order]>(`select *
                                         from only ${order.id} fetch items, items.item, item.item.modifiers, table, user, order_type, customer, discount, tax, payments, payments.payment_type, extras, extras.order_extras`);

    void dispatchPrint(db, PRINT_TYPE.final_bill, {
      order: o,
    }, {userId: page?.user?.id});
  }

  const onPayment = () => {
    closeModal();

    setTimeout(() => {
      print();
    }, 300)
  }

  const saveOrderProgress = useCallback(async () => {
    // Prevent persisting transient default state before first initialization is complete.
    if (!isInitialized) {
      return;
    }

    // remove previously attached payments
    for (const payment of order?.payments ?? []) {
      await db.delete(payment.id);
    }

    const orderPayments = [];
    for (const payment of paymentTypes) {
      const [orderPayment] = await db.create(Tables.order_payment, {
        amount: payment.amount,
        payment_type: payment.payment_type.id,
        comments: '',
        payable: payment.payable ?? total,
      });

      orderPayments.push(orderPayment.id);
    }

    // remove previously attached extras from order
    for (const ext of order?.extras ?? []) {
      await db.delete(ext.id);
    }

    const extraOptions = [];
    for (const extra of Object.keys(extras)) {
      const [record] = await db.create(Tables.order_extras, {
        name: extra,
        value: extras[extra]
      });

      extraOptions.push(record.id);
    }

    // Handle order-level coupon persistence
    let orderCouponId: string | null = null;
    const hasCoupon = coupon && couponAmount > 0;

    if (hasCoupon) {
      if (order?.coupon?.id) {
        await db.merge(order.coupon.id, {
          coupon: coupon.id,
          discount: couponAmount,
        });
        orderCouponId = order.coupon.id as any;
      } else {
        const [created] = await db.create(Tables.order_coupons, {
          coupon: coupon.id,
          discount: couponAmount,
          created_at: nowSurrealDateTime(),
        });
        orderCouponId = (created as any)?.id ?? created.id;
      }
    } else if (order?.coupon?.id) {
      // Clear existing coupon if it was removed
      await db.delete(order.coupon.id);
    }

    const resolvedDiscountAmount = discountAmount ?? order.discount_amount ?? 0;
    const resolvedDiscountId = discount?.id ?? order.discount?.id;

    const progressMerge: Record<string, unknown> = {
      payments: orderPayments,
      extras: extraOptions,
      tax: tax ? toRecordId(tax?.id) : null,
      tax_amount: taxAmount,
      discount_amount: resolvedDiscountAmount,
      discount_rate: discountRate,
      tip: tip,
      tip_amount: tipAmount,
      tip_type: tipType,
      service_charge: serviceCharge,
      service_charge_amount: serviceChargeAmount,
      service_charge_type: serviceChargeType,
      notes: notes,
      coupon: orderCouponId,
    };

    if (resolvedDiscountId) {
      progressMerge.discount = toRecordId(resolvedDiscountId);
    }

    await db.merge(order.id, progressMerge);

    postOrderTracking({
      module: "Update order payment details",
      page: page?.page,
      orderId: order.id,
      payload: {
        payment_count: paymentTypes.length,
        extras_count: extraOptions.length,
        tax: tax?.id?.toString(),
        discount: discount?.id?.toString(),
        coupon: coupon?.id?.toString(),
      },
      user: page?.user,
    });
  }, [
    order,
    db,
    paymentTypes,
    total,
    extras,
    tax,
    taxAmount,
    discount,
    discountAmount,
    discountRate,
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

  useEffect(() => {
    saveOrderProgress();
  }, [saveOrderProgress]);

  return (
    <Modal
      title={t('title', {invoice: order.invoice_number})}
      open={true}
      onClose={closeModal}
      size="full"
    >
      <div className="grid grid-cols-4 gap-5 mb-5 select-none">
        <div className="bg-white rounded-xl flex flex-col overflow-auto h-[calc(100vh_-_150px)]">
          <div className="p-3 flex gap-3 flex-col">
            <OrderHeader order={order}/>
            <OrderTimes order={order}/>
            <div className="separator h-[2px]" style={{'--size': '10px', '--space': '5px'} as CSSProperties}></div>
            <ScrollContainer className="gap-1 flex flex-col">
              <div className="overflow-ellipsis max-h-[250px]">
                {getOrderFilteredItems(order).map(item => (
                  <div className="flex gap-3 hover:bg-neutral-100" key={item.id}>
                    <div className="flex-1 whitespace-break-spaces">{item.item.name}</div>
                    <div className="text-right w-[50px] flex-shrink-0">{formatNumber(item.quantity)}</div>
                    <div className="text-right w-[80px] flex-shrink-0">{formatNumber(item.price)}</div>
                  </div>
                ))}
              </div>
            </ScrollContainer>
            <div className="separator h-[2px]" style={{'--size': '10px', '--space': '5px'} as CSSProperties}></div>
          </div>
          <div className="flex flex-col font-bold text-lg">
            <div className="flex justify-between p-3">
              <div>{t('totals.items', {count: getOrderFilteredItems(order).length})}</div>
              <div className="text-right">{withCurrency(itemsTotal)}</div>
            </div>
            <div className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Tax && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions.Tax), {
                module: 'Apply tax',
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

            <div className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Discount && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions.Discount), {
                module: 'Apply discount',
                description: 'Apply discount',
                payload: {
                  order: order.id.toString()
                }
              });
            }}>
              <div>
                {t('tabs.discount')}{' '}
                {discount && (
                  discount.type === DiscountType.Percent ? discountRate + '%' : ''
                )}{' '}
                <FontAwesomeIcon icon={faPencil}/>
              </div>
              <div className="text-right">{withCurrency(discountAmount)}</div>
            </div>

            <div className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Coupon && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions.Coupon), {
                module: 'Apply coupon',
                description: 'Apply coupon',
                payload: {
                  order: order.id.toString()
                }
              });
            }}>
              <div>{t('tabs.coupon')} <FontAwesomeIcon icon={faPencil}/></div>
              <div className="text-right">{withCurrency(couponAmount)}</div>
            </div>

            <div className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions['Service Charges'] && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions['Service Charges']), {
                module: 'Apply service charges',
                description: 'Apply service charges',
                payload: {
                  order: order.id.toString()
                }
              });
            }}>
              <div>{t('tabs.serviceCharges', {value: serviceCharge, unit: serviceChargeType === DiscountType.Percent ? '%' : ''})}{' '}
                <FontAwesomeIcon icon={faPencil}/></div>
              <div className="text-right">{withCurrency(serviceChargeAmount)}</div>
            </div>

            <div className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Tip && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => {
              protectAction(() => setMode(PaymentOptions.Tip), {
                module: 'Apply tips',
                description: 'Apply tips',
                payload: {
                  order: order.id.toString()
                }
              });
            }}>
              <div>{t('tabs.tip', {value: tip, unit: tipType === DiscountType.Percent ? '%' : ''})} <FontAwesomeIcon icon={faPencil}/></div>
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
                onClick={() => {
                  protectAction(() => setExtraToggles(prev => ({
                    ...prev,
                    [extra]: !(prev[extra] ?? true)
                  })), {
                    module: 'Change extras',
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
            <div className={
              cn(
                "flex justify-between p-3 cursor-pointer",
                mode === PaymentOptions.Notes && 'bg-neutral-900 text-warning-500'
              )
            } onClick={() => setMode(PaymentOptions.Notes)}>
              <div>{t('tabs.notes')} <FontAwesomeIcon icon={faPencil}/></div>
              <div className="text-right">{notes}</div>
            </div>

            <div className="flex justify-between p-3">
              <div className="text-2xl">{t('tabs.total')}</div>
              <div className="text-right text-2xl">{withCurrency(total)}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl flex flex-col p-3 h-[calc(100vh_-_150px)]">
          {mode === PaymentOptions.Tax && (
            <OrderPaymentTax tax={tax} setTax={setTax}/>
          )}
          {mode === PaymentOptions.Discount && (
            <OrderPaymentDiscount
              discount={discount} setDiscount={setDiscount}
              discountAmount={discountAmount} setDiscountAmount={setDiscountAmount}
              itemsTotal={itemsTotal}
              setDiscountRate={setDiscountRate}
              discountRate={discountRate}
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
        <div className="flex flex-col bg-neutral-100 rounded-xl col-span-2">
          <OrderPaymentReceiving
            order={order}
            total={total}
            onComplete={onPayment}
            extras={extras}
            setTax={setTax}
            discountAmount={discountAmount}
            discount={discount}
            setDiscount={setDiscount}
            setDiscountAmount={setDiscountAmount}
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
