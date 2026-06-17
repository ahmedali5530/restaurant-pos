import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {ResponsiveLine} from "@nivo/line";
import {DateTime} from "luxon";
import {
  ShoppingCart,
  RotateCcw,
  Package,
  ArrowLeftRight,
  Trash2,
  TrendingUp,
  DollarSign,
  Hash
} from "lucide-react";
import {TabList, Tabs} from "react-aria-components";
import {Tab, TabPanel} from "@/components/common/react-aria/tabs.tsx";
import _ from "lodash";

// ==================== Types ====================
type ChartDataPoint = {
  x: string;
  y: number;
};

type InventoryStoreStock = {
  storeName: string;
  items: {
    name: string;
    code: string;
    quantity: number;
    uom: string;
    id: string
  }[];
};

// ==================== Constants ====================
const COLORS = [
  '#0046FE', // primary.500 - purchases
  '#3DE567', // success.500 - issue returns
  '#FFA514', // warning.500 - issues
  '#F43A30', // danger.500 - wastes
  '#30C6E8', // info.500 - purchase returns
];

const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// ==================== Widget Components ====================

const KPIMetricWidget = ({
  title,
  value,
  gradientFrom,
  gradientTo,
  borderColor,
  textColor,
  labelColor,
}: {
  title: string;
  value: string;
  gradientFrom: string;
  gradientTo: string;
  borderColor: string;
  textColor: string;
  labelColor: string;
}) => {
  return (
    <div className={`bg-gradient-to-br ${gradientFrom} to-${gradientTo} p-4 rounded-lg border ${borderColor}`}>
      <p className={`text-sm font-medium ${labelColor} mb-1`}>{title}</p>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
    </div>
  );
};

const OperationsLineChart = ({
  data,
  isLoading
}: {
  data: {id: string; data: ChartDataPoint[]}[];
  isLoading: boolean;
}) => {
  const { t } = useTranslation('reports');
  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-700">{t('labels.inventoryOperationsTrend')}</h2>
          <p className="text-sm text-neutral-500">All operations date by date (Purchases & Issues show value, Returns & Wastes show quantity)</p>
        </div>
      </div>
      <div className="h-[300px] relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              <p className="mt-2 text-sm text-neutral-500">{t('loading.chart')}</p>
            </div>
          </div>
        ) : null}
        {data.length > 0 && data.some(d => d.data.length > 0) ? (
          <ResponsiveLine
            data={data}
            margin={{top: 20, right: 20, bottom: 50, left: 60}}
            xScale={{type: 'point'}}
            yScale={{type: 'linear', min: 0, max: 'auto'}}
            curve="monotoneX"
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickRotation: -45,
              legend: 'Time',
              legendOffset: 40,
              legendPosition: 'middle',
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'Value / Quantity',
              legendOffset: -50,
              legendPosition: 'middle',
              format: (value: any) => {
                const num = Number(value);
                if (num >= 1000) {
                  return `${(num / 1000).toFixed(0)}k`;
                }
                return num.toFixed(0);
              },
            }}
            enableGridX={false}
            enableGridY={true}
            gridYValues={6}
            colors={COLORS}
            lineWidth={3}
            pointSize={8}
            pointColor="#ffffff"
            pointBorderWidth={2}
            pointBorderColor={{from: 'serieColor'}}
            pointLabelYOffset={-12}
            enableArea={true}
            areaOpacity={0.05}
            areaBlendMode="multiply"
            useMesh={true}
            enableSlices="x"
            tooltip={({point}) => {
              const isMonetary = ['Purchases', 'Purchase Returns', 'Issues'].includes(point.seriesId);
              const value = point.data.y || 0;
              const displayValue = isMonetary ? withCurrency(value) : formatNumber(value);
              
              return (
                <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3">
                  <p className="text-sm font-medium text-neutral-900">
                    {DateTime.fromJSDate(point.data.x as unknown as Date).toFormat('MMM dd, yyyy')}
                  </p>
                  <p className="text-sm font-semibold" style={{color: point.seriesColor}}>
                    {point.seriesId}: {displayValue}
                  </p>
                </div>
              );
            }}
            legends={[
              {
                anchor: 'bottom',
                direction: 'row',
                justify: false,
                translateX: 0,
                translateY: 50,
                itemsSpacing: 15,
                itemWidth: 120,
                itemHeight: 14,
                itemTextColor: '#525252',
                itemDirection: 'left-to-right',
                itemOpacity: 1,
                symbolSize: 10,
                symbolShape: 'circle',
              },
            ]}
            theme={{
              axis: {
                ticks: {
                  text: {fill: '#737373', fontSize: 11},
                },
              },
              grid: {
                line: {stroke: '#e5e5e5', strokeWidth: 1},
              },
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-500">
            No inventory operations data
          </div>
        )}
      </div>
    </div>
  );
};

const DataTable = ({
  title,
  icon: Icon,
  color,
  columns,
  data,
  loading,
}: {
  title: string;
  icon: any;
  color: string;
  columns: {key: string; label: string; className?: string}[];
  data: any[];
  loading: boolean;
}) => {
  const { t } = useTranslation('reports');
  const colorMap: Record<string, {bg: string; icon: string; badge: string; badgeText: string}> = {
    primary: {bg: 'bg-primary-100', icon: 'text-primary-600', badge: 'bg-primary-100', badgeText: 'text-primary-500'},
    success: {bg: 'bg-success-100', icon: 'text-success-600', badge: 'bg-success-100', badgeText: 'text-success-500'},
    warning: {bg: 'bg-warning-100', icon: 'text-warning-600', badge: 'bg-warning-100', badgeText: 'text-warning-500'},
    danger: {bg: 'bg-danger-100', icon: 'text-danger-600', badge: 'bg-danger-100', badgeText: 'text-danger-500'},
    info: {bg: 'bg-info-100', icon: 'text-info-600', badge: 'bg-info-100', badgeText: 'text-info-500'},
  };

  const colors = colorMap[color] || colorMap.primary;

  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-3 rounded-full ${colors.bg}`}>
            <Icon className={`w-5 h-5 ${colors.icon}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-700">{title}</h2>
            <p className="text-xs text-neutral-500">{t('labels.latest20Records')}</p>
          </div>
        </div>
        <span className={`${colors.badge} ${colors.badgeText} text-xs font-semibold px-3 py-1.5 rounded-full`}>
          {data.length} records
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              {columns.map(col => (
                <th key={col.key} className={`py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider ${col.className || ''}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center">
                  <div className="flex items-center justify-center">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mr-2"></div>
                    <span className="text-sm text-neutral-500">{t('common:actions.loading')}</span>
                  </div>
                </td>
              </tr>
            ) : data.length > 0 ? data.slice(0, 20).map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                {columns.map(col => (
                  <td key={col.key + idx} className={`py-3 px-3 text-sm text-neutral-700 ${col.className || ''}`}>
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length} className="py-8 text-center text-sm text-neutral-500">
                  No records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== Main Component ====================
export const InventoryDashboardReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);
  const [issueReturns, setIssueReturns] = useState<any[]>([]);
  const [wastes, setWastes] = useState<any[]>([]);
  const [storeStock, setStoreStock] = useState<InventoryStoreStock[]>([]);

  // Parse date range from query strings - same pattern as sales.summary.report.tsx
  const filters = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const startDate = params.get('start') || null;
    const endDate = params.get('end') || null;
    return {startDate, endDate};
  }, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const whereConditions = [];
        const whereParams = {};

        if(filters.startDate){
          whereConditions.push(`time::format(created_at, '${import.meta.env.VITE_DB_DATABASE_FORMAT}') >= $startDate`);
          whereParams['startDate'] = filters.startDate;
        }

        if(filters.endDate){
          whereConditions.push(`time::format(created_at, '${import.meta.env.VITE_DB_DATABASE_FORMAT}') <= $endDate`);
          whereParams['endDate'] = filters.endDate;
        }

        // Fetch all operations in parallel
        const [
          purchasesResult,
          purchaseReturnsResult,
          issuesResult,
          issueReturnsResult,
          wastesResult,
          itemsResult,
          storesResult,
        ] = await Promise.all([
          queryRef.current(`SELECT * FROM ${Tables.inventory_purchases} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} ORDER BY created_at DESC FETCH items, items.item, supplier, store, created_by`, whereParams),
          queryRef.current(`SELECT * FROM ${Tables.inventory_purchase_returns} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} ORDER BY created_at DESC FETCH items, items.item, purchase, store, created_by`, whereParams),
          queryRef.current(`SELECT * FROM ${Tables.inventory_issues} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} ORDER BY created_at DESC FETCH items, items.item, store, created_by`, whereParams),
          queryRef.current(`SELECT * FROM ${Tables.inventory_issue_returns} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} ORDER BY created_at DESC FETCH items, items.item, store, created_by`, whereParams),
          queryRef.current(`SELECT * FROM ${Tables.inventory_wastes} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} ORDER BY created_at DESC FETCH items, items.item, created_by`, whereParams),
          queryRef.current(`SELECT * FROM ${Tables.inventory_items}`),
          queryRef.current(`SELECT * FROM ${Tables.inventory_stores}`),
        ]);

        setPurchases((purchasesResult?.[0] as any[]) || []);
        setPurchaseReturns((purchaseReturnsResult?.[0] as any[]) || []);
        setIssues((issuesResult?.[0] as any[]) || []);
        setIssueReturns((issueReturnsResult?.[0] as any[]) || []);
        setWastes((wastesResult?.[0] as any[]) || []);

        // Process store stock - calculate current quantity per store per item
        // Using the same approach as useStoreInventory but for all items at once
        const items = itemsResult?.[0] || [];
        const stores = storesResult?.[0] || [];

        // Fetch all inventory items directly from the item tables

        const [
          purchaseItemsResult,
          purchaseReturnItemsResult,
          issueItemsResult,
          issueReturnItemsResult,
          wasteItemsResult,
        ] = await Promise.all([
          queryRef.current(`SELECT items.item, items.store, math::sum(math::sum(items.quantity)) AS quantity FROM ${Tables.inventory_purchases} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} group by items.store, items.item fetch items, items.item, items.store`, whereParams),
          queryRef.current(`SELECT items.item, items.store, math::sum(math::sum(items.quantity)) AS quantity FROM ${Tables.inventory_purchase_returns} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} group by items.store, items.item fetch items, items.item, items.store`, whereParams),
          queryRef.current(`SELECT items.item, items.store, math::sum(math::sum(items.quantity)) AS quantity FROM ${Tables.inventory_issues} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} group by items.store, items.item fetch items, items.item, items.store`, whereParams),
          queryRef.current(`SELECT items.item, math::sum(math::sum(items.quantity)) AS quantity FROM ${Tables.inventory_issue_returns} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} group by items.item fetch items, items.item`, whereParams),
          queryRef.current(`SELECT items.item, items.issue_item.store, items.purchase_item.store, math::sum(math::sum(items.quantity)) AS quantity FROM ${Tables.inventory_wastes} ${whereConditions.length > 0 ? `WHERE ${whereConditions.join(' and ')}` : ''} group by items.item, items.issue_item.store, items.purchase_item.store fetch items, items.item, items.issue_item.store, items.purchase_item.store`, whereParams),
        ]);

        const purchaseItems = purchaseItemsResult?.[0] || [];
        const purchaseReturnItems = purchaseReturnItemsResult?.[0] || [];
        const issueItems = issueItemsResult?.[0] || [];
        const issueReturnItems = issueReturnItemsResult?.[0] || [];
        const wasteItems = wasteItemsResult?.[0] || [];

        // Initialize stockMap: storeId -> itemId -> quantity
        const stockMap = new Map<string, Map<string, number>>();
        stores.forEach((store: any) => {
          stockMap.set(store.id.toString(), new Map());
        });

        // Helper to get store ID from item
        const getStoreId = (item: any) => item.store?.id;

        // Helper to add quantity to stock
        const addToStock = (storeId: string, itemId: string, quantity: number) => {
          const storeItemMap = stockMap.get(storeId.toString())!;
          storeItemMap.set(itemId, (storeItemMap.get(itemId) || 0) + quantity);

          stockMap.set(storeId.toString(), storeItemMap);
        };

        // Process purchases (adds to stock)
        purchaseItems.forEach((item: any) => {
          const itemId = item.items.item[0]?.id?.toString();
          const storeId = item.items.store[0]?.id?.toString();

          if (storeId && itemId) {
            addToStock(storeId.toString(), itemId.toString(), safeNumber(item.quantity));
          }
        });

        // Process purchase returns (subtracts from stock)
        purchaseReturnItems.forEach((item: any) => {
          const itemId = item.items.item[0]?.id?.toString();
          const storeId = item.items.store[0]?.id?.toString();

          if (storeId && itemId) {
            addToStock(storeId.toString(), itemId.toString(), -safeNumber(item.quantity));
          }
        });

        // Process issues (subtracts from stock)
        issueItems.forEach((item: any) => {
          const itemId = item.items.item[0]?.id?.toString();
          const storeId = item.items.store[0]?.id?.toString();

          if (storeId && itemId) {
            addToStock(storeId.toString(), itemId.toString(), -safeNumber(item.quantity));
          }
        });

        // Process issue returns (adds back to stock)
        issueReturnItems.forEach((item: any) => {
          const itemId = item.items.item[0]?.id?.toString();
          const storeId = item.items.issued_item?.store[0]?.id?.toString();

          if (storeId && itemId) {
            addToStock(storeId.toString(), itemId.toString(), safeNumber(item.quantity));
          }
        });

        // Process wastes (subtracts from stock)
        wasteItems.forEach((item: any) => {
          const itemId = item.items.item[0]?.id?.toString();
          const storeId = item.items?.issue_item?.store[0]?.id?.toString() || item.items?.purchase_item?.store[0]?.id?.toString();

          if (storeId && itemId) {
            addToStock(storeId.toString(), itemId.toString(), -safeNumber(item.quantity));
          }
        });

        // Build final stock data with item details
        const stockData: InventoryStoreStock[] = stores
          .map((store: any) => {
            const storeId = store.id;
            const storeName = store.name;
            const storeItemMap = stockMap.get(storeId.toString()) || new Map();

            const itemsList = Array.from(storeItemMap.entries())
              // .filter(([_, quantity]) => quantity > 0)
              .map(([itemId, quantity]) => {
                const item = items.find((i: any) => i.id.toString() === itemId.toString());
                console.log(item, items)
                return {
                  id: itemId,
                  name: item?.name || 'Unknown Item',
                  code: item?.code || '-',
                  quantity,
                  uom: item?.uom || '',
                };
              })
              .sort((a, b) => a.name.localeCompare(b.name));

            return {
              storeName,
              items: itemsList,
            };
          })
          // .filter(store => store.items.length > 0);

        setStoreStock(stockData);

      } catch (err) {
        console.error("Failed to load inventory dashboard", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // ==================== Data Processing ====================
  const kpis = useMemo(() => {
    const totalPurchases = purchases.reduce((sum, p) => {
      return sum + p.items.reduce((itemSum: number, item: any) => itemSum + (safeNumber(item.quantity) * safeNumber(item.price)), 0);
    }, 0);

    const totalPurchaseReturns = purchaseReturns.reduce((sum, pr) => {
      return sum + pr.items.reduce((itemSum: number, item: any) => itemSum + (safeNumber(item.quantity) * safeNumber(item.price)), 0);
    }, 0);

    const totalIssues = issues.reduce((sum, i) => {
      return sum + i.items.reduce((itemSum: number, item: any) => itemSum + (safeNumber(item.quantity) * safeNumber(item.price)), 0);
    }, 0);

    const totalIssueReturns = issueReturns.reduce((sum, ir) => {
      return sum + ir.items.reduce((itemSum: number, item: any) => itemSum + safeNumber(item.quantity), 0);
    }, 0);

    const totalWastes = wastes.reduce((sum, w) => {
      return sum + w.items.reduce((itemSum: number, item: any) => itemSum + safeNumber(item.quantity), 0);
    }, 0);

    const totalStockValue = storeStock.reduce((sum, store) => {
      return sum + store.items.reduce((itemSum, item) => itemSum + (item.quantity * 0), 0); // Would need price data
    }, 0);

    return {
      totalPurchases,
      totalPurchaseReturns,
      totalIssues,
      totalIssueReturns,
      totalWastes,
      purchaseCount: purchases.length,
      purchaseReturnCount: purchaseReturns.length,
      issueCount: issues.length,
      issueReturnCount: issueReturns.length,
      wasteCount: wastes.length,
      totalStockValue,
    };
  }, [purchases, purchaseReturns, issues, issueReturns, wastes, storeStock]);

  const chartData = useMemo(() => {
    const allDates = new Set<string>();

    // Aggregate COST values by date for each operation
    const purchasesByDate = new Map<string, number>();
    purchases.forEach(p => {
      const date = DateTime.fromJSDate(p.created_at);
      const key = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
      allDates.add(key);
      const totalValue = p.items.reduce((sum: number, item: any) => {
        return sum + (safeNumber(item.quantity) * safeNumber(item.price));
      }, 0);
      purchasesByDate.set(key, (purchasesByDate.get(key) || 0) + totalValue);
    });

    const purchaseReturnsByDate = new Map<string, number>();
    purchaseReturns.forEach(pr => {
      const date = DateTime.fromJSDate(pr.created_at);
      const key = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
      allDates.add(key);
      const totalValue = pr.items.reduce((sum: number, item: any) => {
        return sum + (safeNumber(item.quantity) * safeNumber(item.price || 0));
      }, 0);
      purchaseReturnsByDate.set(key, (purchaseReturnsByDate.get(key) || 0) + totalValue);
    });

    const issuesByDate = new Map<string, number>();
    issues.forEach(i => {
      const date = DateTime.fromJSDate(i.created_at);
      const key = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
      allDates.add(key);
      const totalValue = i.items.reduce((sum: number, item: any) => {
        return sum + (safeNumber(item.quantity) * safeNumber(item.price));
      }, 0);
      issuesByDate.set(key, (issuesByDate.get(key) || 0) + totalValue);
    });

    const issueReturnsByDate = new Map<string, number>();
    issueReturns.forEach(ir => {
      const date = DateTime.fromJSDate(ir.created_at);
      const key = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
      allDates.add(key);
      const totalValue = ir.items.reduce((sum: number, item: any) => {
        return sum + safeNumber(item.quantity);
      }, 0);
      issueReturnsByDate.set(key, (issueReturnsByDate.get(key) || 0) + totalValue);
    });

    const wastesByDate = new Map<string, number>();
    wastes.forEach(w => {
      const date = DateTime.fromJSDate(w.created_at);
      const key = date.toFormat(import.meta.env.VITE_DATE_FORMAT);
      allDates.add(key);
      const totalValue = w.items.reduce((sum: number, item: any) => {
        return sum + safeNumber(item.quantity);
      }, 0);
      wastesByDate.set(key, (wastesByDate.get(key) || 0) + totalValue);
    });

    const sortedDates = Array.from(allDates).sort();

    return [
      {
        id: 'Purchases',
        color: COLORS[0],
        data: sortedDates.map(x => ({x, y: purchasesByDate.get(x) || 0})),
      },
      {
        id: 'Purchase Returns',
        color: COLORS[4],
        data: sortedDates.map(x => ({x, y: purchaseReturnsByDate.get(x) || 0})),
      },
      {
        id: 'Issues',
        color: COLORS[2],
        data: sortedDates.map(x => ({x, y: issuesByDate.get(x) || 0})),
      },
      {
        id: 'Issue Returns',
        color: COLORS[1],
        data: sortedDates.map(x => ({x, y: issueReturnsByDate.get(x) || 0})),
      },
      {
        id: 'Wastes',
        color: COLORS[3],
        data: sortedDates.map(x => ({x, y: wastesByDate.get(x) || 0})),
      },
    ];
  }, [purchases, purchaseReturns, issues, issueReturns, wastes]);

  const purchasesTableData = useMemo(() => {
    return purchases.slice(0, 20).map(p => ({
      invoice: `#${p.invoice_number || '-'}`,
      date: DateTime.fromJSDate(p.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      supplier: p.supplier?.name || '-',
      store: p.store?.name || '-',
      createdBy: `${p.created_by?.first_name || ''} ${p.created_by?.last_name || ''}`.trim() || '-',
      items: p.items?.length || 0,
      total: withCurrency(p.items.reduce((sum: number, item: any) => sum + (safeNumber(item.quantity) * safeNumber(item.price)), 0)),
    }));
  }, [purchases]);

  const purchaseReturnsTableData = useMemo(() => {
    return purchaseReturns.slice(0, 20).map(pr => ({
      invoice: `#${pr.invoice_number || '-'}`,
      date: DateTime.fromJSDate(pr.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      purchase: pr.purchase ? `#${pr.purchase.invoice_number || '-'}` : '-',
      store: pr.store?.name || '-',
      createdBy: `${pr.created_by?.first_name || ''} ${pr.created_by?.last_name || ''}`.trim() || '-',
      items: pr.items?.length || 0,
      total: withCurrency(pr.items.reduce((sum: number, item: any) => sum + (safeNumber(item.quantity) * safeNumber(item.price)), 0)),
    }));
  }, [purchaseReturns]);

  const issuesTableData = useMemo(() => {
    return issues.slice(0, 20).map(i => ({
      invoice: i.invoice_number ? `#${i.invoice_number}` : '-',
      date: DateTime.fromJSDate(i.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      kitchen: i.kitchen?.name || '-',
      issuedTo: i.issued_to ? `${i.issued_to.first_name || ''} ${i.issued_to.last_name || ''}`.trim() : '-',
      store: i.store?.name || '-',
      createdBy: `${i.created_by?.first_name || ''} ${i.created_by?.last_name || ''}`.trim() || '-',
      items: i.items?.length || 0,
      total: formatNumber(i.items.reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0)),
    }));
  }, [issues]);

  const issueReturnsTableData = useMemo(() => {
    return issueReturns.slice(0, 20).map(ir => ({
      invoice: `#${ir.invoice_number || '-'}`,
      date: DateTime.fromJSDate(ir.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      issuance: ir.issuance?.invoice_number ? `#${ir.issuance.invoice_number}` : '-',
      kitchen: ir.kitchen?.name || '-',
      store: ir.store?.name || '-',
      createdBy: `${ir.created_by?.first_name || ''} ${ir.created_by?.last_name || ''}`.trim() || '-',
      items: ir.items?.length || 0,
      total: formatNumber(ir.items.reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0)),
    }));
  }, [issueReturns]);

  const wastesTableData = useMemo(() => {
    return wastes.slice(0, 20).map(w => ({
      invoice: `#${w.invoice_number || '-'}`,
      date: DateTime.fromJSDate(w.created_at).toFormat(import.meta.env.VITE_DATE_HUMAN_FORMAT),
      purchase: w.purchase?.invoice_number ? `#${w.purchase.invoice_number}` : '-',
      issue: w.issue?.invoice_number ? `#${w.issue.invoice_number}` : '-',
      createdBy: `${w.created_by?.first_name || ''} ${w.created_by?.last_name || ''}`.trim() || '-',
      items: w.items?.length || 0,
      total: formatNumber(w.items.reduce((sum: number, item: any) => sum + safeNumber(item.quantity), 0)),
    }));
  }, [wastes]);

  const reportTitle = useMemo(() => {
    return 'Inventory Dashboard';
  }, []);

  if (error) {
    return (
      <ReportsLayout title={t('reports.inventoryDashboard')}>
        <div className="py-12 text-center text-danger-500">Failed to load dashboard: {error}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('reports.inventoryDashboard')} subtitle={reportTitle}>
      <div className="space-y-5">
        {/* KPI Metrics Grid */}
        <div className="bg-white p-5 rounded-lg shadow">
          <h2 className="text-2xl font-bold mb-4 text-neutral-700">{t('labels.keyMetrics')}</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5 gap-4">
            <KPIMetricWidget
              title="Total Purchases"
              value={withCurrency(kpis.totalPurchases)}
              gradientFrom="from-primary-100"
              gradientTo="primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title="Purchase Returns"
              value={withCurrency(kpis.totalPurchaseReturns)}
              gradientFrom="from-info-100"
              gradientTo="info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
            <KPIMetricWidget
              title="Total Issues"
              value={withCurrency(kpis.totalIssues)}
              gradientFrom="from-warning-100"
              gradientTo="warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
            <KPIMetricWidget
              title="Issue Returns"
              value={formatNumber(kpis.totalIssueReturns)}
              gradientFrom="from-success-100"
              gradientTo="success-200"
              borderColor="border-success-300"
              textColor="text-success-900"
              labelColor="text-success-700"
            />
            <KPIMetricWidget
              title="Wastes"
              value={formatNumber(kpis.totalWastes)}
              gradientFrom="from-danger-100"
              gradientTo="danger-200"
              borderColor="border-danger-300"
              textColor="text-danger-900"
              labelColor="text-danger-700"
            />
          </div>
        </div>

        {/* Operations Chart */}
        <OperationsLineChart data={chartData} isLoading={loading} />

        {/* Stock by Store - Tabular Format with Tabs */}
        <div className="bg-white p-5 rounded-lg shadow-xl border">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-3 rounded-full bg-primary-100">
              <Package className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-neutral-700">{t('labels.currentStockByStore')}</h2>
              <p className="text-xs text-neutral-500">Inventory levels across all stores</p>
            </div>
          </div>
          <Tabs
            className="w-full"
            defaultSelectedKey={storeStock[0]?.storeName || ''}
          >
            <TabList aria-label="Store tabs" className="flex flex-row gap-3 mb-4">
              {storeStock.map(store => (
                <Tab
                  activeClass="bg-neutral-900 text-warning-500"
                  id={store.storeName} key={store.storeName} className="whitespace-nowrap">
                  {store.storeName} ({store.items.length} items)
                </Tab>
              ))}
            </TabList>
            {storeStock.map(store => (
              <TabPanel
                id={store.storeName} key={store.storeName}>
                <div className="">
                  <table className="table">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('columns.itemName')}</th>
                        <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('columns.code')}</th>
                        <th className="py-3 px-3 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('columns.quantity')}</th>
                        <th className="py-3 pr-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('columns.uom')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 bg-white">
                      {store.items.length > 0 ? store.items.map((item) => (
                        <tr key={item.id} className="hover:bg-neutral-50 transition-colors">
                          <td className="py-3 pl-4 pr-3 text-sm font-medium text-neutral-900">{item.name}</td>
                          <td className="py-3 px-3 text-sm text-neutral-600 font-mono">{item.code}</td>
                          <td className="py-3 px-3 text-right text-sm font-semibold text-neutral-900">{formatNumber(item.quantity)}</td>
                          <td className="py-3 pr-4 text-sm text-neutral-600">{item.uom || '-'}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-sm text-neutral-500">
                            No stock data for this store
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </TabPanel>
            ))}
            {storeStock.length === 0 && (
              <div className="py-12 text-center text-sm text-neutral-500">
                No store stock data available
              </div>
            )}
          </Tabs>
        </div>

        {/* Purchase Records */}
        <DataTable
          title="Latest Purchases"
          icon={ShoppingCart}
          color="primary"
          columns={[
            {key: 'invoice', label: t('columns.invoice')},
            {key: 'date', label: t('columns.date')},
            {key: 'supplier', label: t('filters.supplier')},
            {key: 'store', label: t('filters.store')},
            {key: 'createdBy', label: t('columns.createdBy')},
            {key: 'items', label: t('columns.items')},
            {key: 'total', label: t('columns.total'), className: 'text-right font-semibold'},
          ]}
          data={purchasesTableData}
          loading={loading}
        />

        {/* Purchase Returns Records */}
        <DataTable
          title="Latest Purchase Returns"
          icon={RotateCcw}
          color="info"
          columns={[
            {key: 'invoice', label: t('columns.invoice')},
            {key: 'date', label: t('columns.date')},
            {key: 'purchase', label: t('columns.purchase')},
            {key: 'store', label: t('filters.store')},
            {key: 'createdBy', label: t('columns.createdBy')},
            {key: 'items', label: t('columns.items')},
            {key: 'total', label: t('columns.total'), className: 'text-right font-semibold'},
          ]}
          data={purchaseReturnsTableData}
          loading={loading}
        />

        {/* Issues Records */}
        <DataTable
          title="Latest Issues"
          icon={Package}
          color="warning"
          columns={[
            {key: 'invoice', label: t('columns.invoice')},
            {key: 'date', label: t('columns.date')},
            {key: 'kitchen', label: t('filters.kitchen')},
            {key: 'issuedTo', label: t('columns.issuedTo')},
            {key: 'store', label: t('filters.store')},
            {key: 'createdBy', label: t('columns.createdBy')},
            {key: 'items', label: t('columns.items')},
            {key: 'total', label: t('columns.totalQty'), className: 'text-right font-semibold'},
          ]}
          data={issuesTableData}
          loading={loading}
        />

        {/* Issue Returns Records */}
        <DataTable
          title="Latest Issue Returns"
          icon={ArrowLeftRight}
          color="success"
          columns={[
            {key: 'invoice', label: t('columns.invoice')},
            {key: 'date', label: t('columns.date')},
            {key: 'issuance', label: t('columns.issuance')},
            {key: 'kitchen', label: t('filters.kitchen')},
            {key: 'store', label: t('filters.store')},
            {key: 'createdBy', label: t('columns.createdBy')},
            {key: 'items', label: t('columns.items')},
            {key: 'total', label: t('columns.totalQty'), className: 'text-right font-semibold'},
          ]}
          data={issueReturnsTableData}
          loading={loading}
        />

        {/* Wastes Records */}
        <DataTable
          title="Latest Wastes"
          icon={Trash2}
          color="danger"
          columns={[
            {key: 'invoice', label: t('columns.invoice')},
            {key: 'date', label: t('columns.date')},
            {key: 'purchase', label: 'From Purchase'},
            {key: 'issue', label: 'From Issue'},
            {key: 'createdBy', label: t('columns.createdBy')},
            {key: 'items', label: t('columns.items')},
            {key: 'total', label: t('columns.totalQty'), className: 'text-right font-semibold'},
          ]}
          data={wastesTableData}
          loading={loading}
        />
      </div>
    </ReportsLayout>
  );
};
