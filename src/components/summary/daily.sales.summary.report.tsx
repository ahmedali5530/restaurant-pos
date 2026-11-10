import {useMemo, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {Order, OrderStatus} from '@/api/model/order.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';
import {
  aggregateOrderDiscountBreakdown,
  getOrderFilteredItems,
  getOrderPaymentTotalsForOrder,
  getOrderRounding,
  getOrderSettlementFigures,
} from '@/lib/order.ts';
import {calculateOrderItemPrice} from '@/lib/cart.ts';
import {getOrdersTaxBreakdown} from '@/lib/tax-calculator.ts';
import {aggregateDailyCategoryMix} from '@/api/reports/sales/aggregate.ts';

interface Props {
  orders: Order[];
  date: string;
  /** Inclusive wall-clock range label for the query window (cycle or calendar). */
  windowRange?: string | null;
}

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface BreakdownEntry {
  name: string;
  total: number;
  count: number;
}

interface SaleGroupEntry {
  name: string;
  total: number;
  ordersCount: number;
}

function Row({label, value, hint}: {label: string; value: string; hint?: string}) {
  return (
    <div className="border-b border-border py-2 last:border-b-0">
      <div className="flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular-nums font-medium">{value}</span>
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-4 rounded-lg border border-border bg-surface-elevated p-3 shadow-sm">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      {subtitle ? <p className="mb-2 text-xs text-muted">{subtitle}</p> : null}
      <div>{children}</div>
    </section>
  );
}

/** Active lines + extras only (no tax, service, tips); voided / refunded / suspended lines excluded. */
function useDailySalesFigures(orders: Order[] | undefined) {
  const {t} = useTranslation('summary');
  return useMemo(() => {
    const list = orders ?? [];
    const paymentTotals = list.map(order => getOrderPaymentTotalsForOrder(order));
    const settlementFigures = list.map(order => getOrderSettlementFigures(order));

    const exclusiveSales = settlementFigures.reduce((sum, figures) => sum + figures.itemsTotal, 0);

    const totalExtras = settlementFigures.reduce((sum, figures) => sum + figures.extrasTotal, 0);

    const grossSales = safeNumber(exclusiveSales + totalExtras);

    const itemDiscounts = settlementFigures.reduce((sum, figures) => sum + figures.lineDiscounts, 0);

    const subtotalDiscounts = settlementFigures.reduce((sum, figures) => sum + figures.cartDiscount, 0);

    const couponDiscounts = settlementFigures.reduce((sum, figures) => sum + figures.couponDiscount, 0);

    const discounts = safeNumber(itemDiscounts + subtotalDiscounts + couponDiscounts);

    const netSales = settlementFigures.reduce((sum, figures) => sum + figures.netSales, 0);

    const serviceCharges = settlementFigures.reduce((sum, figures) => sum + figures.serviceCharges, 0);
    const taxCollected = settlementFigures.reduce((sum, figures) => sum + figures.tax, 0);

    const amountDue = settlementFigures.reduce((sum, figures) => sum + figures.amountDueBeforeTips, 0);
    const totalRevenue = amountDue;

    const tips = settlementFigures.reduce((sum, figures) => sum + figures.tips, 0);

    const grandTotalDue = settlementFigures.reduce((sum, figures) => sum + figures.grandTotalDue, 0);

    const amountCollected = paymentTotals.reduce(
      (sum, totals) => sum + safeNumber(totals.amountCollected),
      0,
    );
    const amountCollectedRaw = amountCollected;

    const changeGiven = paymentTotals.reduce((sum, totals) => sum + safeNumber(totals.change), 0);
    const rounding = list.reduce((sum, order) => sum + getOrderRounding(order), 0);

    const refunds = list.reduce((sum, order) => {
      if (order.status === OrderStatus.Cancelled) {
        return (
          sum +
          safeNumber(
            order.payments?.reduce((paySum, payment) => {
              const amount = safeNumber(payment?.amount);
              return paySum + Math.abs(Math.min(0, amount));
            }, 0) ?? 0,
          )
        );
      }
      return (
        sum +
        safeNumber(
          order.payments?.reduce((paySum, payment) => {
            const amount = safeNumber(payment?.amount);
            return paySum + (amount < 0 ? Math.abs(amount) : 0);
          }, 0) ?? 0,
        )
      );
    }, 0);

    const voids = list.reduce((sum, order) => {
      const allItems = order.items ?? [];
      const filtered = getOrderFilteredItems(order);
      const voidedItems = allItems.filter(item => !filtered.some(f => f.id === item.id));
      return (
        sum +
        voidedItems.reduce((itemSum, item) => itemSum + safeNumber(calculateOrderItemPrice(item)), 0)
      );
    }, 0);

    const covers = list.reduce((sum, order) => sum + safeNumber(order.covers), 0);
    const ordersCount = list.length;
    const averageCover = covers > 0 ? amountDue / covers : 0;
    const averageOrderCheck = ordersCount > 0 ? amountDue / ordersCount : 0;

    const paymentTypeMap: Record<string, {total: number; count: number}> = {};
    list.forEach((order) => {
      const totals = getOrderPaymentTotalsForOrder(order);
      const bump = (name: string, amount: number, count: number) => {
        if (!paymentTypeMap[name]) paymentTypeMap[name] = {total: 0, count: 0};
        paymentTypeMap[name].total += safeNumber(amount);
        paymentTypeMap[name].count += count;
      };
      Object.entries(totals.nonCashBreakdown).forEach(([typeName, amount]) => {
        bump(typeName, amount, 1);
      });
      if (totals.cashAmount > 0 || (order.payments ?? []).some((p) => String(p?.payment_type?.type || '').toLowerCase() === 'cash')) {
        const cashLines = (order.payments ?? []).filter((p) => {
          const typ = String(p?.payment_type?.type || '').toLowerCase();
          const nam = String(p?.payment_type?.name || '').toLowerCase();
          return typ === 'cash' || nam === 'cash';
        }).length;
        bump('Cash', totals.cashAmount, cashLines || (totals.cashAmount > 0 ? 1 : 0));
      }
    });

    const paymentTypes = Object.entries(paymentTypeMap)
      .map(([name, row]) => ({name, total: row.total, count: row.count}))
      .sort((a, b) => b.total - a.total);

    const taxesMap: Record<string, {total: number; count: number}> = {};
    getOrdersTaxBreakdown(list).forEach(({ name, rate, amount }) => {
      const key = `${name} ${rate}%`;
      if (!taxesMap[key]) taxesMap[key] = {total: 0, count: 0};
      taxesMap[key].total += amount;
      taxesMap[key].count += 1;
    });
    const taxesList: BreakdownEntry[] = Object.entries(taxesMap)
      .map(([name, row]) => ({name, total: row.total, count: row.count}))
      .sort((a, b) => b.total - a.total);

    const discountsList: BreakdownEntry[] = aggregateOrderDiscountBreakdown(list, 'name', t('report.orderDiscount'))
      .map(row => ({
        name: row.rateLabel !== '-' ? `${row.name} (${row.rateLabel})` : row.name,
        total: row.total,
        count: safeNumber(row.quantity) || 1,
      }));

    const extrasMap: Record<string, {total: number; count: number}> = {};
    list.forEach(order => {
      (order?.extras ?? []).forEach(extra => {
        if (!extra?.name) {
          return;
        }
        if (!extrasMap[extra.name]) {
          extrasMap[extra.name] = {total: 0, count: 0};
        }
        extrasMap[extra.name].total += safeNumber(extra?.value);
        extrasMap[extra.name].count += 1;
      });
    });
    const extrasList: BreakdownEntry[] = Object.entries(extrasMap)
      .map(([name, row]) => ({name, total: row.total, count: row.count}))
      .sort((a, b) => b.total - a.total);

    const couponsMap: Record<string, {total: number; count: number}> = {};
    list.forEach(order => {
      if (!order?.coupon) {
        return;
      }
      const code = order.coupon?.coupon?.code || t('unknown.coupon');
      if (!couponsMap[code]) {
        couponsMap[code] = {total: 0, count: 0};
      }
      couponsMap[code].total += safeNumber(order.coupon.discount);
      couponsMap[code].count += 1;
    });
    const couponsList: BreakdownEntry[] = Object.entries(couponsMap)
      .map(([name, row]) => ({name, total: row.total, count: row.count}))
      .sort((a, b) => b.total - a.total);

    const tipsCount = list.filter((order) => safeNumber(order.tip_amount) > 0).length;

    const orderTypeMap: Record<string, SaleGroupEntry> = {};
    const orderTakerMap: Record<string, SaleGroupEntry> = {};
    list.forEach((order, index) => {
      const figures = settlementFigures[index];
      const sale = safeNumber(figures?.amountDueBeforeTips);
      const typeName =
        (order.order_type && typeof order.order_type === 'object' && 'name' in order.order_type
          ? String((order.order_type as {name?: string}).name || '')
          : '') || t('report.unknownOrderType');
      if (!orderTypeMap[typeName]) {
        orderTypeMap[typeName] = {name: typeName, total: 0, ordersCount: 0};
      }
      orderTypeMap[typeName].total += sale;
      orderTypeMap[typeName].ordersCount += 1;

      const user = order.user;
      const takerName =
        user && typeof user === 'object'
          ? [ (user as {first_name?: string}).first_name, (user as {last_name?: string}).last_name ]
              .filter(Boolean)
              .join(' ')
              .trim() ||
            String((user as {login?: string}).login || '') ||
            t('report.unknownTaker')
          : t('report.unknownTaker');
      if (!orderTakerMap[takerName]) {
        orderTakerMap[takerName] = {name: takerName, total: 0, ordersCount: 0};
      }
      orderTakerMap[takerName].total += sale;
      orderTakerMap[takerName].ordersCount += 1;
    });
    const orderTypes = Object.values(orderTypeMap).sort((a, b) => b.total - a.total);
    const orderTakers = Object.values(orderTakerMap).sort((a, b) => b.total - a.total);

    const categoryMix = aggregateDailyCategoryMix(list, {
      uncategorizedLabel: t('report.uncategorized'),
      unknownItemLabel: t('report.unknownItem'),
    });

    return {
      exclusiveSales,
      totalExtras,
      grossSales,
      itemDiscounts,
      subtotalDiscounts,
      couponDiscounts,
      discounts,
      netSales,
      serviceCharges,
      taxCollected,
      amountDue,
      totalRevenue,
      tips,
      grandTotalDue,
      amountCollected,
      amountCollectedRaw,
      changeGiven,
      rounding,
      refunds,
      voids,
      covers,
      ordersCount,
      averageCover,
      averageOrderCheck,
      paymentTypes,
      taxesList,
      discountsList,
      extrasList,
      couponsList,
      tipsCount,
      orderTypes,
      orderTakers,
      categoryMix,
    };
  }, [orders, t]);
}

export function DailySalesSummaryReport({orders, date, windowRange}: Props) {
  const {t} = useTranslation('summary');
  const f = useDailySalesFigures(orders);

  return (
    <div className="mb-6 select-none">
      <div className="mb-3 text-center text-lg font-semibold text-foreground">
        {t('report.title', {date})}
      </div>
      {windowRange ? (
        <p className="mb-3 text-center text-sm text-muted" data-testid="summary-window-range">
          {t('report.windowRange', {range: windowRange})}
        </p>
      ) : null}

      <Section
        title={t('report.sections.salesRevenue')}
      >
        <Row
          label={t('report.rows.exclusiveSales')}
          value={withCurrency(f.exclusiveSales)}
          hint={t('report.hints.exclusiveSales')}
        />
        <Row
          label={t('report.rows.extras')}
          value={withCurrency(f.totalExtras)}
          hint={t('report.hints.extras')}
        />
        <Row
          label={t('report.rows.grossSales')}
          value={withCurrency(f.grossSales)}
          hint={t('report.hints.grossSales')}
        />
        <Row
          label={t('report.rows.itemDiscounts')}
          value={withCurrency(f.itemDiscounts)}
          hint={t('report.hints.itemDiscounts')}
        />
        <Row
          label={t('report.rows.subtotalDiscounts')}
          value={withCurrency(f.subtotalDiscounts)}
          hint={t('report.hints.subtotalDiscounts')}
        />
        <Row
          label={t('report.rows.couponDiscounts')}
          value={withCurrency(f.couponDiscounts)}
          hint={t('report.hints.couponDiscounts')}
        />
        <Row
          label={t('report.rows.discounts')}
          value={withCurrency(f.discounts)}
          hint={t('report.hints.discounts')}
        />
        <Row
          label={t('report.rows.netSales')}
          value={withCurrency(f.netSales)}
          hint={t('report.hints.netSales')}
        />
      </Section>

      <Section
        title={t('report.sections.surchargesTaxes')}
        subtitle={t('report.subtitles.surchargesTaxes')}
      >
        <Row
          label={t('report.rows.serviceCharges')}
          value={withCurrency(f.serviceCharges)}
          hint={t('report.hints.serviceCharges')}
        />
        <Row
          label={t('report.rows.taxes')}
          value={withCurrency(f.taxCollected)}
          hint={t('report.hints.taxes')}
        />
        <div className="border-b border-border py-2">
          <div className="flex justify-between gap-3 text-sm font-bold">
            <span>{t('report.rows.totalRevenue')}</span>
            <span className="tabular-nums">{withCurrency(f.totalRevenue)}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{t('report.hints.totalRevenue')}</p>
        </div>
      </Section>

      <Section title={t('report.sections.settlementCashier')} subtitle={t('report.subtitles.settlementCashier')}>
        <Row
          label={t('report.rows.amountDueBeforeTips')}
          value={withCurrency(f.amountDue)}
          hint={t('report.hints.amountDueBeforeTips')}
        />
        <Row
          label={t('report.rows.tips')}
          value={withCurrency(f.tips)}
          hint={t('report.hints.tips')}
        />
        <div className="border-b border-border py-2">
          <div className="flex justify-between gap-3 text-sm font-bold">
            <span>{t('report.rows.grandTotalDue')}</span>
            <span className="tabular-nums">{withCurrency(f.grandTotalDue)}</span>
          </div>
          <p className="mt-1 text-xs text-muted">{t('report.hints.grandTotalDue')}</p>
        </div>
        <Row
          label={t('report.rows.amountCollected')}
          value={withCurrency(f.amountCollected)}
          hint={t('report.hints.amountCollected')}
        />
        <Row
          label={t('report.rows.rounding')}
          value={withCurrency(f.rounding)}
          hint={t('report.hints.rounding')}
        />
        <Row
          label={t('report.rows.changeVariance')}
          value={withCurrency(f.changeGiven)}
          hint={t('report.hints.changeVariance')}
        />
      </Section>

      <Section title={t('report.sections.operationalControls')} subtitle={t('report.subtitles.operationalControls')}>
        <Row label={t('report.rows.voids')} value={withCurrency(f.voids)} hint={t('report.hints.voids')} />
        <Row label={t('report.rows.refunds')} value={withCurrency(f.refunds)} hint={t('report.hints.refunds')} />
        <Row
          label={t('report.rows.covers')}
          value={`${formatNumber(f.covers)} / ${withCurrency(f.averageCover)}`}
          hint={t('report.hints.coversWithAverage')}
        />
        <Row
          label={t('report.rows.ordersChecks')}
          value={`${formatNumber(f.ordersCount)} / ${withCurrency(f.averageOrderCheck)}`}
          hint={t('report.hints.ordersChecksWithAverage')}
        />
      </Section>

      <Section title={t('report.sections.productMix')} subtitle={t('report.subtitles.productMix')}>
        <div className="border-b border-border py-2 text-xs font-semibold uppercase tracking-wide text-muted">
          <div className="flex">
            <span className="w-1/2">{t('report.columns.item')}</span>
            <span className="w-1/6 text-right">{t('report.columns.qty')}</span>
            <span className="w-1/6 text-right">{t('report.columns.total')}</span>
            <span className="w-1/6 text-right">{t('report.columns.share')}</span>
          </div>
        </div>
        {f.categoryMix.length === 0 ? (
          <p className="py-3 text-sm text-muted">{t('report.empty.noCategoryData')}</p>
        ) : (
          f.categoryMix.map(category => (
            <div key={category.name}>
              <div className="border-b border-border bg-surface py-2 text-sm font-bold">
                <div className="flex">
                  <span className="w-1/2 font-bold">{category.name}</span>
                  <span className="w-1/6 text-right tabular-nums">{formatNumber(category.quantity)}</span>
                  <span className="w-1/6 text-right tabular-nums">{withCurrency(category.total)}</span>
                  <span className="w-1/6 text-right tabular-nums">
                    {formatNumber(f.exclusiveSales > 0 ? (category.total / f.exclusiveSales) * 100 : 0)}%
                  </span>
                </div>
              </div>
              {category.dishes.map(dish => (
                <div key={`${category.name}-${dish.key}`} className="border-b border-border py-2 text-sm">
                  <div className="flex">
                    <div className="w-1/2 pr-2">
                      <div className="pl-4">{dish.name}</div>
                      {dish.modifiers.map(modifier => (
                        <div
                          key={`${category.name}-${dish.key}-${modifier.path}`}
                          className="text-xs text-muted flex"
                        >
                          <div
                            className="w-3/5"
                            style={{paddingLeft: `${modifier.depth + 1}rem`}}
                          >
                            - {modifier.name}
                          </div>
                          <div className="w-1/5">{formatNumber(modifier.quantity)}</div>
                          <div className="w-1/5">{formatNumber(modifier.price)}</div>
                        </div>
                      ))}
                    </div>
                    <span className="w-1/6 text-right tabular-nums">{formatNumber(dish.quantity)}</span>
                    <span className="w-1/6 text-right tabular-nums">{withCurrency(dish.total)}</span>
                    <span className="w-1/6 text-right tabular-nums">
                      {formatNumber(f.exclusiveSales > 0 ? (dish.total / f.exclusiveSales) * 100 : 0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.orderTypes')} subtitle={t('report.subtitles.orderTypes')}>
        {f.orderTypes.length === 0 ? (
          <p className="py-3 text-sm text-muted">{t('report.empty.noOrderTypes')}</p>
        ) : (
          f.orderTypes.map((row) => (
            <div key={row.name} className="border-b border-border py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{row.name}</span>
                <span className="tabular-nums text-muted">{row.ordersCount}</span>
                <span className="tabular-nums font-medium">{withCurrency(row.total)}</span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.orderTakers')} subtitle={t('report.subtitles.orderTakers')}>
        {f.orderTakers.length === 0 ? (
          <p className="py-3 text-sm text-muted">{t('report.empty.noOrderTakers')}</p>
        ) : (
          f.orderTakers.map((row) => (
            <div key={row.name} className="border-b border-border py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{row.name}</span>
                <span className="tabular-nums text-muted">{row.ordersCount}</span>
                <span className="tabular-nums font-medium">{withCurrency(row.total)}</span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.paymentTypes')} subtitle={t('report.subtitles.paymentTypes')}>
        {f.paymentTypes.length === 0 ? (
          <p className="py-3 text-sm text-muted">{t('report.empty.noPaymentData')}</p>
        ) : (
          f.paymentTypes.map(payment => (
            <div key={payment.name} className="border-b border-border py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{payment.name}</span>
                <span className="tabular-nums text-muted">{payment.count}</span>
                <span className="tabular-nums font-medium">{withCurrency(payment.total)}</span>
                <span className="tabular-nums text-muted">
                  {formatNumber(f.grandTotalDue > 0 ? (payment.total / f.grandTotalDue) * 100 : 0)}%
                </span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.taxesBreakdown')} subtitle={t('report.subtitles.taxesBreakdown')}>
        {f.taxesList.length === 0 ? (
          <p className="py-3 text-sm text-muted">{t('report.empty.noTaxRows')}</p>
        ) : (
          f.taxesList.map(tax => (
            <div key={tax.name} className="border-b border-border py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{tax.name}%</span>
                <span className="tabular-nums text-muted">{tax.count}</span>
                <span className="tabular-nums font-medium">{withCurrency(tax.total)}</span>
                <span className="tabular-nums text-muted">
                  {formatNumber(f.taxCollected > 0 ? (tax.total / f.taxCollected) * 100 : 0)}%
                </span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.discountsBreakdown')} subtitle={t('report.subtitles.discountsBreakdown')}>
        {f.discountsList.length === 0 ? (
          <p className="py-3 text-sm text-muted">{t('report.empty.noDiscountRows')}</p>
        ) : (
          f.discountsList.map(discount => (
            <div key={discount.name} className="border-b border-border py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{discount.name}</span>
                <span className="tabular-nums text-muted">{discount.count}</span>
                <span className="tabular-nums font-medium">{withCurrency(discount.total)}</span>
                <span className="tabular-nums text-muted">
                  {formatNumber(f.discounts > 0 ? (discount.total / f.discounts) * 100 : 0)}%
                </span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.tipsBreakdown')} subtitle={t('report.subtitles.tipsBreakdown')}>
        <div className="border-b border-border py-2 last:border-b-0">
          <div className="flex justify-between gap-3 text-sm">
            <span>{t('report.rows.tips')}</span>
            <span className="tabular-nums text-muted">{f.tipsCount}</span>
            <span className="tabular-nums font-medium">{withCurrency(f.tips)}</span>
          </div>
        </div>
      </Section>

      <Section title={t('report.sections.extrasBreakdown')} subtitle={t('report.subtitles.extrasBreakdown')}>
        {f.extrasList.length === 0 ? (
          <p className="py-3 text-sm text-muted">{t('report.empty.noExtras')}</p>
        ) : (
          f.extrasList.map(extra => (
            <div key={extra.name} className="border-b border-border py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{extra.name}</span>
                <span className="tabular-nums text-muted">{extra.count}</span>
                <span className="tabular-nums font-medium">{withCurrency(extra.total)}</span>
                <span className="tabular-nums text-muted">
                  {formatNumber(f.totalExtras > 0 ? (extra.total / f.totalExtras) * 100 : 0)}%
                </span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.couponsBreakdown')} subtitle={t('report.subtitles.couponsBreakdown')}>
        {f.couponsList.length === 0 ? (
          <p className="py-3 text-sm text-muted">{t('report.empty.noCoupons')}</p>
        ) : (
          f.couponsList.map(coupon => (
            <div key={coupon.name} className="border-b border-border py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{coupon.name}</span>
                <span className="tabular-nums text-muted">{coupon.count}</span>
                <span className="tabular-nums font-medium">{withCurrency(coupon.total)}</span>
              </div>
            </div>
          ))
        )}
      </Section>

      <p className="text-xs leading-relaxed text-muted">
        {t('report.footer')}
      </p>
    </div>
  );
}
