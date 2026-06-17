import {useMemo, type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {Order, OrderStatus} from '@/api/model/order.ts';
import {formatNumber, withCurrency} from '@/lib/utils.ts';
import {getOrderFilteredItems, getOrderPaymentTotals} from '@/lib/order.ts';
import {calculateOrderItemPrice} from '@/lib/cart.ts';

interface Props {
  orders: Order[];
  date: string;
}

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface ModifierRow {
  name: string;
  depth: number;
  path: string;
  quantity: number;
  price: number
}

interface BreakdownEntry {
  name: string;
  total: number;
}

interface DishMixAggregate {
  name: string;
  modifiers: Record<string, ModifierRow>;
  total: number;
  quantity: number;
}

interface CategoryMixAggregate {
  total: number;
  quantity: number;
  dishes: Record<string, DishMixAggregate>;
}

interface DishMixRow {
  key: string;
  name: string;
  modifiers: ModifierRow[];
  total: number;
  quantity: number;
}

interface CategoryMixRow {
  name: string;
  total: number;
  quantity: number;
  dishes: DishMixRow[];
}

const getModifierRows = (modifiers: any[] = []): ModifierRow[] => {
  const rows: ModifierRow[] = [];

  const walkGroups = (groups: any[] = [], depth = 1, parentPath = '') => {
    groups.forEach(group => {
      (group?.selectedModifiers ?? []).forEach((selected: any) => {
        const modifierName = String(selected?.dish?.name || selected?.name || '').trim();
        if (!modifierName) {
          return;
        }

        const currentPath = parentPath ? `${parentPath}>${modifierName}` : modifierName;
        rows.push({
          name: modifierName,
          depth,
          path: currentPath,
          quantity: 0,
          price: selected.price
        });
        walkGroups(selected?.selectedGroups ?? [], depth + 1, currentPath);
      });
    });
  };

  walkGroups(modifiers);
  return rows;
};

function Row({label, value, hint}: {label: string; value: string; hint?: string}) {
  return (
    <div className="border-b border-neutral-200 py-2 last:border-b-0">
      <div className="flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular-nums font-medium">{value}</span>
      </div>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
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
    <section className="mb-4 rounded-lg border border-neutral-200 bg-white p-3 shadow-sm">
      <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
      {subtitle ? <p className="mb-2 text-xs text-neutral-600">{subtitle}</p> : null}
      <div>{children}</div>
    </section>
  );
}

const sumFilteredItemDiscounts = (order: Order) =>
  safeNumber(
    getOrderFilteredItems(order).reduce((sum, item) => sum + safeNumber(item?.discount), 0),
  );

const getOrderSubtotalDiscount = (order: Order) => {
  const lineDiscounts = sumFilteredItemDiscounts(order);
  const orderDiscount = safeNumber(order.discount_amount);
  if (order.discount) {
    return orderDiscount;
  }
  return Math.max(0, orderDiscount - lineDiscounts);
};

/** Active lines + extras only (no tax, service, tips); voided / refunded / suspended lines excluded. */
function useDailySalesFigures(orders: Order[] | undefined) {
  const {t} = useTranslation('summary');
  return useMemo(() => {
    const list = orders ?? [];
    const paymentTotals = list.map(order => getOrderPaymentTotals(order));

    const exclusiveSales = list.reduce((sum, order) => {
      const items = (getOrderFilteredItems(order) ?? []).reduce(
        (s, item) => s + safeNumber(calculateOrderItemPrice(item)),
        0,
      );
      return sum + items;
    }, 0);

    const totalExtras = list.reduce((sum, order) => {
      const extras = (order.extras ?? []).reduce((s, extra) => s + safeNumber(extra.value), 0);
      return sum + extras;
    }, 0);

    const grossSales = safeNumber(exclusiveSales + totalExtras);

    const itemDiscounts = list.reduce(
      (sum, order) => sum + sumFilteredItemDiscounts(order),
      0,
    );

    const subtotalDiscounts = list.reduce(
      (sum, order) => sum + getOrderSubtotalDiscount(order),
      0,
    );

    const couponDiscounts = list.reduce((sum, order) => sum + safeNumber(order.coupon?.discount), 0);

    const discounts = safeNumber(itemDiscounts + subtotalDiscounts + couponDiscounts);

    const netSales = safeNumber(grossSales - discounts);

    const serviceCharges = list.reduce((sum, order) => sum + safeNumber(order.service_charge_amount), 0);
    const taxCollected = list.reduce((sum, order) => sum + safeNumber(order.tax_amount), 0);

    const amountDue = safeNumber(netSales + serviceCharges + taxCollected);
    const totalRevenue = safeNumber(netSales + serviceCharges + taxCollected);

    const tips = list.reduce((sum, order) => sum + safeNumber(order.tip_amount), 0);

    const grandTotalDue = safeNumber(totalRevenue + tips);

    const amountCollected = paymentTotals.reduce(
      (sum, totals) => sum + safeNumber(totals.amountCollected),
      0,
    );
    const amountCollectedRaw = amountCollected;

    const changeGiven = paymentTotals.reduce((sum, totals) => sum + safeNumber(totals.change), 0);
    const rounding = safeNumber(amountCollected - grandTotalDue);

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

    const paymentTypeMap: Record<string, number> = {};
    paymentTotals.forEach(totals => {
      Object.entries(totals.nonCashBreakdown).forEach(([typeName, amount]) => {
        if (!paymentTypeMap[typeName]) {
          paymentTypeMap[typeName] = 0;
        }
        paymentTypeMap[typeName] += safeNumber(amount);
      });
      if (!paymentTypeMap.Cash) {
        paymentTypeMap.Cash = 0;
      }
      paymentTypeMap.Cash += safeNumber(totals.cashAmount);
    });

    const paymentTypes = Object.entries(paymentTypeMap)
      .map(([name, total]) => ({name, total}))
      .sort((a, b) => b.total - a.total);

    const taxesMap: Record<string, number> = {};
    list.forEach(order => {
      if (!order?.tax) {
        return;
      }
      const key = `${order.tax?.name} ${order.tax?.rate}`;
      if (!taxesMap[key]) {
        taxesMap[key] = 0;
      }
      taxesMap[key] += safeNumber(order?.tax_amount);
    });
    const taxesList: BreakdownEntry[] = Object.entries(taxesMap)
      .map(([name, total]) => ({name, total}))
      .sort((a, b) => b.total - a.total);

    const discountsMap: Record<string, number> = {};
    list.forEach(order => {
      const discountAmount = safeNumber(order.discount_amount);
      if (discountAmount <= 0) {
        return;
      }
      const name = order.discount?.name ?? t('report.orderDiscount');
      if (!discountsMap[name]) {
        discountsMap[name] = 0;
      }
      discountsMap[name] += discountAmount;
    });
    const discountsList: BreakdownEntry[] = Object.entries(discountsMap)
      .map(([name, total]) => ({name, total}))
      .sort((a, b) => b.total - a.total);

    const extrasMap: Record<string, number> = {};
    list.forEach(order => {
      (order?.extras ?? []).forEach(extra => {
        if (!extrasMap[extra.name]) {
          extrasMap[extra.name] = 0;
        }
        extrasMap[extra.name] += safeNumber(extra.value);
      });
    });
    const extrasList: BreakdownEntry[] = Object.entries(extrasMap)
      .map(([name, total]) => ({name, total}))
      .sort((a, b) => b.total - a.total);

    const couponsMap: Record<string, number> = {};
    list.forEach(order => {
      if (!order?.coupon) {
        return;
      }
      const code = order.coupon?.coupon?.code || t('unknown.coupon');
      if (!couponsMap[code]) {
        couponsMap[code] = 0;
      }
      couponsMap[code] += safeNumber(order.coupon.discount);
    });
    const couponsList: BreakdownEntry[] = Object.entries(couponsMap)
      .map(([name, total]) => ({name, total}))
      .sort((a, b) => b.total - a.total);

    const categoryMixMap: Record<string, CategoryMixAggregate> = {};
    list.forEach(order => {
      getOrderFilteredItems(order).forEach(item => {
        const categoryName = String(item?.category || t('report.uncategorized'));
        const dishName = String(item?.item?.name || t('report.unknownItem'));
        const itemTotal = safeNumber(calculateOrderItemPrice(item));
        const itemQuantity = safeNumber(item?.quantity);
        const modifiers = getModifierRows(item?.modifiers ?? []);
        const dishKey = dishName;

        if (!categoryMixMap[categoryName]) {
          categoryMixMap[categoryName] = {
            total: 0,
            quantity: 0,
            dishes: {},
          };
        }
        const category = categoryMixMap[categoryName];

        if (!category.dishes[dishKey]) {
          category.dishes[dishKey] = {
            name: dishName,
            modifiers: {},
            total: 0,
            quantity: 0,
          };
        }

        category.total += itemTotal;
        category.quantity += itemQuantity;
        category.dishes[dishKey].total += itemTotal;
        category.dishes[dishKey].quantity += itemQuantity;
        modifiers.forEach(modifier => {
          if (!category.dishes[dishKey].modifiers[modifier.path]) {
            category.dishes[dishKey].modifiers[modifier.path] = {
              ...modifier,
              quantity: 0,
            };
          }
          category.dishes[dishKey].modifiers[modifier.path].quantity += itemQuantity;
        });
      });
    });

    const categoryMix: CategoryMixRow[] = Object.entries(categoryMixMap)
      .map(([name, category]) => {
        const dishes = Object.entries(category.dishes)
          .map(([key, dish]) => ({
            key,
            ...dish,
            modifiers: Object.values(dish.modifiers).sort((a, b) => a.path.localeCompare(b.path)),
          }))
          .sort((a, b) => b.total - a.total);
        return {
          name,
          total: category.total,
          quantity: category.quantity,
          dishes,
        };
      })
      .sort((a, b) => b.total - a.total);

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
      categoryMix,
    };
  }, [orders, t]);
}

export function DailySalesSummaryReport({orders, date}: Props) {
  const {t} = useTranslation('summary');
  const f = useDailySalesFigures(orders);

  return (
    <div className="mb-6 select-none">
      <div className="mb-3 text-center text-lg font-semibold text-neutral-900">
        {t('report.title', {date})}
      </div>

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
        <div className="border-b border-neutral-300 py-2">
          <div className="flex justify-between gap-3 text-sm font-bold">
            <span>{t('report.rows.totalRevenue')}</span>
            <span className="tabular-nums">{withCurrency(f.totalRevenue)}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">{t('report.hints.totalRevenue')}</p>
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
        <div className="border-b border-neutral-200 py-2">
          <div className="flex justify-between gap-3 text-sm font-bold">
            <span>{t('report.rows.grandTotalDue')}</span>
            <span className="tabular-nums">{withCurrency(f.grandTotalDue)}</span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">{t('report.hints.grandTotalDue')}</p>
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
        <Row label={t('report.rows.covers')} value={formatNumber(f.covers)} hint={t('report.hints.covers')} />
        <Row
          label={t('report.rows.averageCover')}
          value={withCurrency(f.averageCover)}
          hint={t('report.hints.averageCover')}
        />
        <Row
          label={t('report.rows.ordersChecks')}
          value={formatNumber(f.ordersCount)}
          hint={t('report.hints.ordersChecks')}
        />
        <Row
          label={t('report.rows.averageOrderCheck')}
          value={withCurrency(f.averageOrderCheck)}
          hint={t('report.hints.averageOrderCheck')}
        />
      </Section>

      <Section title={t('report.sections.productMix')} subtitle={t('report.subtitles.productMix')}>
        <div className="border-b border-neutral-300 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-600">
          <div className="flex">
            <span className="w-1/2">{t('report.columns.item')}</span>
            <span className="w-1/6 text-right">{t('report.columns.qty')}</span>
            <span className="w-1/6 text-right">{t('report.columns.total')}</span>
            <span className="w-1/6 text-right">{t('report.columns.share')}</span>
          </div>
        </div>
        {f.categoryMix.length === 0 ? (
          <p className="py-3 text-sm text-neutral-500">{t('report.empty.noCategoryData')}</p>
        ) : (
          f.categoryMix.map(category => (
            <div key={category.name}>
              <div className="border-b border-neutral-200 bg-neutral-50 py-2 text-sm font-semibold">
                <div className="flex">
                  <span className="w-1/2">{category.name}</span>
                  <span className="w-1/6 text-right tabular-nums">{formatNumber(category.quantity)}</span>
                  <span className="w-1/6 text-right tabular-nums">{withCurrency(category.total)}</span>
                  <span className="w-1/6 text-right tabular-nums">
                    {formatNumber(f.exclusiveSales > 0 ? (category.total / f.exclusiveSales) * 100 : 0)}%
                  </span>
                </div>
              </div>
              {category.dishes.map(dish => (
                <div key={`${category.name}-${dish.key}`} className="border-b border-neutral-200 py-2 text-sm">
                  <div className="flex">
                    <div className="w-1/2 pr-2">
                      <div className="pl-4">{dish.name}</div>
                      {dish.modifiers.map(modifier => (
                        <div
                          key={`${category.name}-${dish.key}-${modifier.path}`}
                          className="text-xs text-neutral-500 flex"
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

      <Section title={t('report.sections.paymentTypes')} subtitle={t('report.subtitles.paymentTypes')}>
        {f.paymentTypes.length === 0 ? (
          <p className="py-3 text-sm text-neutral-500">{t('report.empty.noPaymentData')}</p>
        ) : (
          f.paymentTypes.map(payment => (
            <div key={payment.name} className="border-b border-neutral-200 py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{payment.name}</span>
                <span className="tabular-nums font-medium">{withCurrency(payment.total)}</span>
                <span className="tabular-nums text-neutral-600">
                  {formatNumber(f.amountDue > 0 ? (payment.total / f.amountDue) * 100 : 0)}%
                </span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.taxesBreakdown')} subtitle={t('report.subtitles.taxesBreakdown')}>
        {f.taxesList.length === 0 ? (
          <p className="py-3 text-sm text-neutral-500">{t('report.empty.noTaxRows')}</p>
        ) : (
          f.taxesList.map(tax => (
            <div key={tax.name} className="border-b border-neutral-200 py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{tax.name}%</span>
                <span className="tabular-nums font-medium">{withCurrency(tax.total)}</span>
                <span className="tabular-nums text-neutral-600">
                  {formatNumber(f.taxCollected > 0 ? (tax.total / f.taxCollected) * 100 : 0)}%
                </span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.discountsBreakdown')} subtitle={t('report.subtitles.discountsBreakdown')}>
        {f.discountsList.length === 0 ? (
          <p className="py-3 text-sm text-neutral-500">{t('report.empty.noDiscountRows')}</p>
        ) : (
          f.discountsList.map(discount => (
            <div key={discount.name} className="border-b border-neutral-200 py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{discount.name}</span>
                <span className="tabular-nums font-medium">{withCurrency(discount.total)}</span>
                <span className="tabular-nums text-neutral-600">
                  {formatNumber(f.discounts > 0 ? (discount.total / f.discounts) * 100 : 0)}%
                </span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.extrasBreakdown')} subtitle={t('report.subtitles.extrasBreakdown')}>
        {f.extrasList.length === 0 ? (
          <p className="py-3 text-sm text-neutral-500">{t('report.empty.noExtras')}</p>
        ) : (
          f.extrasList.map(extra => (
            <div key={extra.name} className="border-b border-neutral-200 py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{extra.name}</span>
                <span className="tabular-nums font-medium">{withCurrency(extra.total)}</span>
                <span className="tabular-nums text-neutral-600">
                  {formatNumber(f.totalExtras > 0 ? (extra.total / f.totalExtras) * 100 : 0)}%
                </span>
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title={t('report.sections.couponsBreakdown')} subtitle={t('report.subtitles.couponsBreakdown')}>
        {f.couponsList.length === 0 ? (
          <p className="py-3 text-sm text-neutral-500">{t('report.empty.noCoupons')}</p>
        ) : (
          f.couponsList.map(coupon => (
            <div key={coupon.name} className="border-b border-neutral-200 py-2 last:border-b-0">
              <div className="flex justify-between gap-3 text-sm">
                <span>{coupon.name}</span>
                <span className="tabular-nums font-medium">{withCurrency(coupon.total)}</span>
              </div>
            </div>
          ))
        )}
      </Section>

      <p className="text-xs leading-relaxed text-neutral-500">
        {t('report.footer')}
      </p>
    </div>
  );
}
