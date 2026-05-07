import {useEffect, useMemo, useRef, useState} from "react";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order} from "@/api/model/order.ts";
import {OrderItem, OrderItemModifier, OrderItemModifierItem} from "@/api/model/order_item.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faMinus} from "@fortawesome/free-solid-svg-icons";
import {getOrderFilteredItems} from "@/lib/order.ts";

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

interface ReportFilters {
  startDate?: string;
  endDate?: string;
  orderTakerIds: string[];
  orderTypeIds: string[];
  categoryIds: string[];
  dishIds: string[];
}

const parseFilters = (): ReportFilters => {
  const params = new URLSearchParams(window.location.search);
  const parseMulti = (name: string) => {
    const list = [
      ...params.getAll(`${name}[]`),
      ...params.getAll(name),
    ].filter(Boolean);
    return list as string[];
  };

  return {
    startDate: params.get('start') || params.get('start') || undefined,
    endDate: params.get('end') || params.get('end') || undefined,
    orderTakerIds: parseMulti('order_takers'),
    orderTypeIds: parseMulti('order_types'),
    categoryIds: parseMulti('categories'),
    dishIds: parseMulti('dishes'),
  };
};

const recordToString = (value: any): string => {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value?.id) {
    return typeof value.id === 'string' ? value.id : value.id.toString();
  }
  return String(value);
};

interface DishMetrics {
  dishId: string;
  dishName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  serviceCharges: number;
  total: number;
  totalCollected: number; // includes payment from modifiers
  baseDishTotal: number; // base dish total without modifiers
  hasModifiers: boolean;
  modifiers: ModifierMetrics[];
}

interface ModifierMetrics {
  modifierId: string;
  modifierName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  serviceCharges: number;
  total: number;
  ratio: number; // ratio of modifier to dish
  mealPrice: number; // meal price (dish price + modifier price)
}

export const ProductSummaryReport = () => {
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDishes, setExpandedDishes] = useState<Set<string>>(new Set());

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate
    ? `${filters.startDate} to ${filters.endDate}`
    : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const conditions: string[] = [];
      const params: Record<string, any> = {};

      // Date range filter
      if (filters.startDate) {
        conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
        params.startDate = filters.startDate;
      }

      if (filters.endDate) {
        conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
        params.endDate = filters.endDate;
      }

      // Order takers filter
      if (filters.orderTakerIds.length > 0) {
        const userIdConditions = filters.orderTakerIds.map((id, index) => {
          const paramName = `user${index}`;
          params[paramName] = id;
          return `user = $${paramName}`;
        });
        conditions.push(`(${userIdConditions.join(' OR ')})`);
      }

      // Order types filter
      if (filters.orderTypeIds.length > 0) {
        const orderTypeConditions = filters.orderTypeIds.map((id, index) => {
          const paramName = `orderType${index}`;
          params[paramName] = id;
          return `order_type = $${paramName}`;
        });
        conditions.push(`(${orderTypeConditions.join(' OR ')})`);
      }

      const ordersQuery = `
          SELECT * FROM ${Tables.orders}
          ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
          FETCH user, order_type, items, items.item, items.item.categories, items.modifiers, items.modifiers.selectedModifiers, items.modifiers.selectedModifiers.dish
        `;

      const ordersResult: any = await queryRef.current(ordersQuery, params);
      setOrders((ordersResult?.[0] ?? []) as Order[]);
    } catch (err) {
      console.error("Failed to load product summary report", err);
      setError(err instanceof Error ? err.message : "Unable to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filters.startDate, filters.endDate, filters.orderTakerIds.join(','), filters.orderTypeIds.join(',')]);

  // Filter orders by category and dish
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Check if order has items matching category filter
      if (filters.categoryIds.length > 0) {
        const hasMatchingCategory = order.items?.some(item => {
          const itemCategories = item.item?.categories || [];
          if (Array.isArray(itemCategories)) {
            return itemCategories.some((cat: any) => {
              const catId = recordToString(cat?.id ?? cat);
              return catId && filters.categoryIds.includes(catId);
            });
          }
          return false;
        });
        if (!hasMatchingCategory) {
          return false;
        }
      }

      // Check if order has items matching dish filter
      if (filters.dishIds.length > 0) {
        const hasMatchingDish = order.items?.some(item => {
          const itemId = recordToString(item.item?.id);
          return itemId && filters.dishIds.includes(itemId);
        });
        if (!hasMatchingDish) {
          return false;
        }
      }

      return true;
    });
  }, [orders, filters.categoryIds, filters.dishIds]);

  // Get filtered order items
  const getFilteredItems = (order: Order) => {

    return getOrderFilteredItems(order).filter(item => {
      // Filter by category
      if (filters.categoryIds.length > 0) {
        const itemCategories = item.item?.categories || [];
        const hasMatchingCategory = Array.isArray(itemCategories)
          ? itemCategories.some((cat: any) => {
              const catId = recordToString(cat?.id ?? cat);
              return catId && filters.categoryIds.includes(catId);
            })
          : false;
        if (!hasMatchingCategory) {
          return false;
        }
      }

      // Filter by dish
      if (filters.dishIds.length > 0) {
        const itemId = recordToString(item.item?.id);
        if (!itemId || !filters.dishIds.includes(itemId)) {
          return false;
        }
      }

      return true;
    }) || [];
  };

  // Calculate metrics grouped by dish
  const dishMetrics = useMemo(() => {
    const dishMap = new Map<string, DishMetrics>();

    filteredOrders.forEach(order => {
      const filteredItems = getFilteredItems(order);

      filteredItems.forEach(item => {
        if (!item.item) return;

        const dishId = recordToString(item.item.id);
        const dishName = item.item.name || 'Unknown';
        const quantity = safeNumber(item.quantity);
        // Base dish price without modifiers
        const baseDishPrice = safeNumber(item.price || 0) * quantity;
        // Total item price including modifiers
        const itemPrice = safeNumber(calculateOrderItemPrice(item));
        const unitPrice = quantity > 0 && !isNaN(itemPrice) ? itemPrice / quantity : 0;
        const discount = safeNumber(item.discount || 0);
        const tax = safeNumber(item.tax || 0);
        const serviceCharges = safeNumber(item.service_charges || 0);
        const total = safeNumber(itemPrice + tax + serviceCharges - discount);
        
        // Calculate modifier totals
        let modifierTotal = 0;
        const modifierMetricsList: ModifierMetrics[] = [];

        if (item.modifiers && Array.isArray(item.modifiers)) {
          item.modifiers.forEach((modifierGroup: OrderItemModifier) => {
            if (modifierGroup.selectedModifiers && Array.isArray(modifierGroup.selectedModifiers)) {
              modifierGroup.selectedModifiers.forEach((selectedModifier: OrderItemModifierItem & { selectedGroups?: OrderItemModifier[] }) => {
                if (selectedModifier.dish) {
                  const modQuantity = safeNumber(selectedModifier.quantity || 1);
                  const modPrice = safeNumber(selectedModifier.price || 0);
                  const modUnitPrice = modQuantity > 0 && !isNaN(modPrice) ? modPrice / modQuantity : safeNumber(modPrice);
                  const modDiscount = 0; // Modifiers typically don't have separate discounts
                  const modTax = 0; // Modifiers typically don't have separate tax
                  const modServiceCharges = 0; // Modifiers typically don't have separate service charges
                  const modTotal = safeNumber(modPrice);
                  
                  // Calculate ratio: modifier price / base dish price (without modifiers)
                  const ratio = baseDishPrice > 0 && !isNaN(modPrice) && !isNaN(baseDishPrice) ? safeNumber(modPrice / baseDishPrice) : 0;
                  // Meal price: base dish price + modifier price
                  const mealPrice = safeNumber(baseDishPrice + modPrice);

                  modifierTotal += modPrice;

                  modifierMetricsList.push({
                    modifierId: recordToString(selectedModifier.dish.id),
                    modifierName: selectedModifier.dish.name || 'Unknown',
                    quantity: modQuantity,
                    unitPrice: modUnitPrice,
                    discount: modDiscount,
                    tax: modTax,
                    serviceCharges: modServiceCharges,
                    total: modTotal,
                    ratio,
                    mealPrice,
                  });
                }
              });
            }
          });
        }

        const totalCollected = total + modifierTotal;

        const existing = dishMap.get(dishId) || {
          dishId,
          dishName,
          quantity: 0,
          unitPrice: 0,
          discount: 0,
          tax: 0,
          serviceCharges: 0,
          total: 0,
          totalCollected: 0,
          baseDishTotal: 0,
          hasModifiers: false,
          modifiers: [],
        };

        existing.quantity += quantity;
        existing.discount += discount;
        existing.tax += tax;
        existing.serviceCharges += serviceCharges;
        existing.total += total;
        existing.totalCollected += totalCollected;
        // Track base dish total (without modifiers)
        const baseDishTotalForItem = baseDishPrice + tax + serviceCharges - discount;
        existing.baseDishTotal += baseDishTotalForItem;
        existing.hasModifiers = existing.hasModifiers || modifierMetricsList.length > 0;
        
        // Aggregate modifier metrics
        modifierMetricsList.forEach(modMetric => {
          const existingMod = existing.modifiers.find(m => m.modifierId === modMetric.modifierId);
          if (existingMod) {
            existingMod.quantity += modMetric.quantity;
            existingMod.total += modMetric.total;
          } else {
            existing.modifiers.push(modMetric);
          }
        });

        dishMap.set(dishId, existing);
      });
    });

    // Calculate average unit price and finalize modifier ratios/meal prices
    Array.from(dishMap.values()).forEach(metrics => {
      // Ensure unit price is calculated safely
      if (metrics.quantity > 0 && !isNaN(metrics.total)) {
        metrics.unitPrice = metrics.total / metrics.quantity;
      } else {
        metrics.unitPrice = 0;
      }
      
      // Ensure all numeric values are valid
      metrics.quantity = safeNumber(metrics.quantity);
      metrics.discount = safeNumber(metrics.discount);
      metrics.tax = safeNumber(metrics.tax);
      metrics.serviceCharges = safeNumber(metrics.serviceCharges);
      metrics.total = safeNumber(metrics.total);
      metrics.totalCollected = safeNumber(metrics.totalCollected);
      metrics.baseDishTotal = safeNumber(metrics.baseDishTotal);
      
      // Recalculate modifier ratios and meal prices based on aggregated values
      metrics.modifiers.forEach(mod => {
        mod.quantity = safeNumber(mod.quantity);
        mod.unitPrice = safeNumber(mod.unitPrice);
        mod.discount = safeNumber(mod.discount);
        mod.tax = safeNumber(mod.tax);
        mod.serviceCharges = safeNumber(mod.serviceCharges);
        mod.total = safeNumber(mod.total);
        mod.ratio = metrics.baseDishTotal > 0 ? safeNumber(mod.total / metrics.baseDishTotal) : 0;
        mod.mealPrice = safeNumber(metrics.baseDishTotal + mod.total);
      });
    });

    return Array.from(dishMap.values()).sort((a, b) => a.dishName.localeCompare(b.dishName));
  }, [filteredOrders, filters.categoryIds, filters.dishIds]);

  const toggleExpand = (dishId: string) => {
    setExpandedDishes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dishId)) {
        newSet.delete(dishId);
      } else {
        newSet.add(dishId);
      }
      return newSet;
    });
  };

  // Calculate grand totals
  const grandTotals = useMemo(() => {
    return dishMetrics.reduce((totals, dish) => ({
      quantity: totals.quantity + dish.quantity,
      unitPrice: 0, // Will calculate after
      discount: totals.discount + dish.discount,
      tax: totals.tax + dish.tax,
      serviceCharges: totals.serviceCharges + dish.serviceCharges,
      total: totals.total + dish.total,
      totalCollected: totals.totalCollected + dish.totalCollected,
    }), {
      quantity: 0,
      unitPrice: 0,
      discount: 0,
      tax: 0,
      serviceCharges: 0,
      total: 0,
      totalCollected: 0,
    });
  }, [dishMetrics]);

  if (loading) {
    return (
      <ReportsLayout title="Product Summary" subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">Loading product summary report…</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title="Product Summary" subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">Failed to load report: {error}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout
      onRefresh={fetchData}
      title="Product Summary" subtitle={subtitle}>
      <div className="alert alert-warning">This report doesn't include taxes, discounts, service charges, extras and tips</div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 border border-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="py-3 pl-6 pr-3 text-left text-xs font-semibold text-neutral-700"></th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-700">Dish</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Quantity</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Unit Price</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Discount</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Tax</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Service Charges</th>
              <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-700">Total</th>
              <th className="py-3 pr-6 text-right text-xs font-semibold text-neutral-700">Total Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {dishMetrics.map((dish) => (
              <>
                <tr key={dish.dishId} className="hover:bg-neutral-50">
                  <td className="py-3 pl-6 pr-3 text-center">
                    {dish.hasModifiers && (
                      <button
                        onClick={() => toggleExpand(dish.dishId)}
                        className="text-neutral-600 hover:text-neutral-900"
                      >
                        <FontAwesomeIcon icon={expandedDishes.has(dish.dishId) ? faMinus : faPlus} />
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-3 text-sm font-medium text-neutral-900">{dish.dishName}</td>
                  <td className="py-3 px-3 text-sm text-right text-neutral-700">{formatNumber(dish.quantity)}</td>
                  <td className="py-3 px-3 text-sm text-right text-neutral-700">{isNaN(dish.unitPrice) ? withCurrency(0) : withCurrency(dish.unitPrice)}</td>
                  <td className="py-3 px-3 text-sm text-right text-neutral-700">{isNaN(dish.discount) ? withCurrency(0) : withCurrency(dish.discount)}</td>
                  <td className="py-3 px-3 text-sm text-right text-neutral-700">{isNaN(dish.tax) ? withCurrency(0) : withCurrency(dish.tax)}</td>
                  <td className="py-3 px-3 text-sm text-right text-neutral-700">{isNaN(dish.serviceCharges) ? withCurrency(0) : withCurrency(dish.serviceCharges)}</td>
                  <td className="py-3 px-3 text-sm text-right text-neutral-700">{isNaN(dish.total) ? withCurrency(0) : withCurrency(dish.total)}</td>
                  <td className="py-3 pr-6 text-sm text-right font-semibold text-neutral-900">{isNaN(dish.totalCollected) ? withCurrency(0) : withCurrency(dish.totalCollected)}</td>
                </tr>
                {expandedDishes.has(dish.dishId) && dish.modifiers.length > 0 && (
                  <tr>
                    <td></td>
                    <td colSpan={8} className="py-0 px-0">
                      <div className="px-6 py-3 bg-neutral-50">
                        <div className="text-xs font-semibold text-neutral-700 mb-2">Modifiers:</div>
                        <table className="w-full border border-neutral-200 rounded">
                          <thead className="bg-neutral-100">
                            <tr>
                              <th className="py-2 px-3 text-left text-xs font-semibold text-neutral-700">Modifier</th>
                              <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Quantity</th>
                              <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Unit Price</th>
                              <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Discount</th>
                              <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Tax</th>
                              <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Service Charges</th>
                              <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Total</th>
                              <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Ratio</th>
                              <th className="py-2 px-3 text-right text-xs font-semibold text-neutral-700">Meal Price</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-neutral-200">
                            {dish.modifiers.map((modifier) => (
                              <tr key={`${dish.dishId}-${modifier.modifierId}`} className="hover:bg-neutral-50">
                                <td className="py-2 px-3 text-sm text-neutral-600">{modifier.modifierName}</td>
                                <td className="py-2 px-3 text-sm text-right text-neutral-600">{formatNumber(modifier.quantity)}</td>
                                <td className="py-2 px-3 text-sm text-right text-neutral-600">{isNaN(modifier.unitPrice) ? withCurrency(0) : withCurrency(modifier.unitPrice)}</td>
                                <td className="py-2 px-3 text-sm text-right text-neutral-600">{isNaN(modifier.discount) ? withCurrency(0) : withCurrency(modifier.discount)}</td>
                                <td className="py-2 px-3 text-sm text-right text-neutral-600">{isNaN(modifier.tax) ? withCurrency(0) : withCurrency(modifier.tax)}</td>
                                <td className="py-2 px-3 text-sm text-right text-neutral-600">{isNaN(modifier.serviceCharges) ? withCurrency(0) : withCurrency(modifier.serviceCharges)}</td>
                                <td className="py-2 px-3 text-sm text-right text-neutral-600">{isNaN(modifier.total) ? withCurrency(0) : withCurrency(modifier.total)}</td>
                                <td className="py-2 px-3 text-sm text-right text-neutral-600">{isNaN(modifier.ratio) ? '0%' : formatNumber(modifier.ratio * 100) + '%'}</td>
                                <td className="py-2 px-3 text-sm text-right text-neutral-600">{isNaN(modifier.mealPrice) ? withCurrency(0) : withCurrency(modifier.mealPrice)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {dishMetrics.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-sm text-neutral-500">
                  No data available for the selected filters
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-neutral-50 font-semibold">
            <tr>
              <td className="py-3 pl-6 pr-3"></td>
              <td className="py-3 px-3 text-sm text-neutral-900">Totals</td>
              <td className="py-3 px-3 text-sm text-right text-neutral-900">{formatNumber(grandTotals.quantity)}</td>
              <td className="py-3 px-3 text-sm text-right text-neutral-900">
                {grandTotals.quantity > 0 ? withCurrency(grandTotals.total / grandTotals.quantity) : withCurrency(0)}
              </td>
              <td className="py-3 px-3 text-sm text-right text-neutral-900">{withCurrency(grandTotals.discount)}</td>
              <td className="py-3 px-3 text-sm text-right text-neutral-900">{withCurrency(grandTotals.tax)}</td>
              <td className="py-3 px-3 text-sm text-right text-neutral-900">{withCurrency(grandTotals.serviceCharges)}</td>
              <td className="py-3 px-3 text-sm text-right text-neutral-900">{withCurrency(grandTotals.total)}</td>
              <td className="py-3 pr-6 text-sm text-right text-neutral-900">{withCurrency(grandTotals.totalCollected)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </ReportsLayout>
  );
}