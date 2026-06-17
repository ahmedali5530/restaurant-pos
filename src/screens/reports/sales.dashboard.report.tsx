import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Order, OrderStatus} from "@/api/model/order.ts";
import {parseDateRangeFromParams} from "@/api/reports/shared/filters.ts";
import {aggregateTopSellingDishes, fetchDashboardOrders, getOrderFigures} from "@/api/reports/sales";
import {Tracking} from "@/api/model/tracking.ts";
import {withCurrency, formatNumber} from "@/lib/utils.ts";
import {calculateOrderItemPrice} from "@/lib/cart.ts";
import {ResponsiveLine} from "@nivo/line";
import {ResponsivePie} from "@nivo/pie";
import {DateTime} from "luxon";
import {
  Package,
  Tag,
  Table as TableIcon,
  UserCheck,
  Truck,
  Clock,
  DollarSign,
  TrendingUp,
  ArrowLeftRight,
  Trash2,
  Hash,
  ShoppingCart
} from "lucide-react";
import {TabList, Tabs} from "react-aria-components";
import {Tab, TabPanel} from "@/components/common/react-aria/tabs.tsx";
import { toJsDate, toLuxonDateTime } from "@/lib/datetime.ts";
import {DAY_PARTS, getDayPartLabel, getDayPartTimeRangeLabel, type DayPartLabel} from "@/utils/dayParts";
import {getOrderFilteredItems, getOrderPaymentTotals} from "@/lib/order.ts";
import {detectBrowser, detectOS, displayValue} from "@/screens/reports/activity.report.tsx";


// ==================== Types ====================
type SalesDataPoint = {
  x: string;
  y: number;
};

type TopItem = {
  name: string;
  quantity: number;
  revenue: number;
};

type CategorySales = {
  id: string;
  label: string;
  value: number;
  color: string;
};

type UserSales = {
  name: string;
  orders: number;
  revenue: number;
};

type TableSales = {
  table: string;
  orders: number;
  revenue: number;
};

type OrderTypeSales = {
  name: string;
  orders: number;
  revenue: number;
};

type PaymentTypeSales = {
  name: string;
  count: number;
  amount: number;
};

type BreakdownDatum = {
  name: string;
  count: number;
  amount: number;
};

type PeriodSalesItem = {
  label: string;
  amount: number;
};

// ==================== Constants ====================
const COLORS = [
  '#0046FE', // primary.500
  '#3DE567', // success.500
  '#FFA514', // warning.500
  '#F43A30', // danger.500
  '#30C6E8', // info.500
  '#6598FE', // primary.300
  '#8AF790', // success.300
  '#FFD472', // warning.300
  '#FB9C82', // danger.300
  '#82F4F8', // info.300
];

const safeNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

// ==================== Widget Components ====================

const KPIMetricWidget = ({
  title,
  value,
  subtitle,
  icon: Icon,
  gradientFrom,
  gradientTo,
  borderColor,
  textColor,
  labelColor,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  gradientFrom: string;
  gradientTo: string;
  borderColor: string;
  textColor: string;
  labelColor: string;
}) => {
  return (
    <div className={`bg-gradient-to-br ${gradientFrom} to-${gradientTo} p-4 rounded-lg border ${borderColor}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-sm font-medium ${labelColor}`}>{title}</p>
        <Icon className={`h-4 w-4 ${labelColor}`} />
      </div>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      {subtitle ? <p className={`text-xs mt-1 ${labelColor}`}>{subtitle}</p> : null}
    </div>
  );
};

const SalesLineChart = ({
  data,
  isLoading
}: {
  data: SalesDataPoint[];
  isLoading: boolean;
}) => {
  const { t } = useTranslation('reports');
  const chartData = useMemo(() => [
    {
      id: 'Sales',
      data,
    },
  ], [data]);

  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-700">Sales Trend</h2>
          <p className="text-sm text-neutral-500">Revenue over time</p>
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
        {data.length > 0 ? (
          <ResponsiveLine
            data={chartData}
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
              format: (value: any) => String(value).substring(0, 10),
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'Revenue',
              legendOffset: -50,
              legendPosition: 'middle',
              format: (value: any) => withCurrency(value).replace(/\.00$/, ''),
            }}
            enableGridX={false}
            enableGridY={true}
            gridYValues={6}
            colors={['#0046FE']}
            lineWidth={3}
            pointSize={12}
            pointColor="#0046FE"
            pointBorderWidth={2}
            pointBorderColor={{from: 'serieColor'}}
            pointLabelYOffset={-12}
            enableArea={true}
            areaOpacity={0.1}
            areaBlendMode="multiply"
            useMesh={true}
            enableSlices="x"
            tooltip={({point}) => (
              <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3">
                <p className="text-sm font-medium text-neutral-900">
                  {DateTime.fromISO(point.data.x || '').toFormat('MMM dd, HH:mm')}
                </p>
                <p className="text-sm text-primary-500 font-semibold">
                  {withCurrency(point.data.y || 0)}
                </p>
              </div>
            )}
            theme={{
              axis: {
                ticks: {
                  text: {fill: '#737373', fontSize: 11},
                },
              },
              grid: {
                line: {stroke: '#e5e5e5', strokeWidth: 1},
              },
              crosshair: {
                line: {stroke: '#0046FE', strokeWidth: 1, strokeDasharray: '4 4'},
              },
              tooltip: {
                container: {
                  background: '#ffffff',
                  borderRadius: '8px',
                },
              },
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-500">
            No sales data for this period
          </div>
        )}
      </div>
    </div>
  );
};

const OrdersPerHourChart = ({
  data,
  isLoading
}: {
  data: SalesDataPoint[];
  isLoading: boolean;
}) => {
  const { t } = useTranslation('reports');
  const chartData = useMemo(() => [
    {
      id: 'Orders',
      data,
    },
  ], [data]);

  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-neutral-700">Orders Per Hour</h2>
          <p className="text-sm text-neutral-500">Order volume by hour</p>
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
        {data.length > 0 ? (
          <ResponsiveLine
            data={chartData}
            margin={{top: 20, right: 20, bottom: 50, left: 60}}
            xScale={{type: 'point'}}
            yScale={{type: 'linear', min: 0, max: 'auto'}}
            curve="monotoneX"
            axisTop={null}
            axisRight={null}
            axisBottom={{
              tickRotation: -45,
              legend: 'Hour',
              legendOffset: 40,
              legendPosition: 'middle',
            }}
            axisLeft={{
              tickSize: 5,
              tickPadding: 5,
              tickRotation: 0,
              legend: 'Orders',
              legendOffset: -50,
              legendPosition: 'middle',
            }}
            enableGridX={false}
            enableGridY={true}
            gridYValues={6}
            colors={['#3DE567']}
            lineWidth={3}
            pointSize={12}
            pointColor="#3DE567"
            pointBorderWidth={2}
            pointBorderColor={{from: 'serieColor'}}
            pointLabelYOffset={-12}
            enableArea={true}
            areaOpacity={0.1}
            areaBlendMode="multiply"
            useMesh={true}
            enableSlices="x"
            tooltip={({point}) => (
              <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3">
                <p className="text-sm font-medium text-neutral-900">
                  Hour: {point.data.x}
                </p>
                <p className="text-sm text-success-500 font-semibold">
                  {formatNumber(point.data.y || 0)} orders
                </p>
              </div>
            )}
            theme={{
              axis: {
                ticks: {
                  text: {fill: '#737373', fontSize: 11},
                }
              },
              grid: {
                line: {stroke: '#e5e5e5', strokeWidth: 1},
              },
              crosshair: {
                line: {stroke: '#3DE567', strokeWidth: 1, strokeDasharray: '4 4'},
              },
              tooltip: {
                container: {
                  background: '#ffffff',
                  borderRadius: '8px',
                },
              }
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-500">
            No orders data
          </div>
        )}
      </div>
    </div>
  );
};

const DayPartsWidget = ({dayParts}: {dayParts: {label: string; orders: number; revenue: number}[]}) => {
  const DAY_PART_COLORS = [
    '#FFA514', // breakfast - warning
    '#3DE567', // lunch - success
    '#0046FE', // dinner - primary
    '#30C6E8', // late night - info
  ];

  const chartData = useMemo(() => [
    {
      id: 'Day Parts',
      data: dayParts.map((part) => ({
        x: part.label,
        y: part.revenue,
      })),
    },
  ], [dayParts]);
  const dayPartSummary = useMemo(
    () => DAY_PARTS.map(part => `${part.label} (${getDayPartTimeRangeLabel(part.label)})`).join(', '),
    [],
  );

  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-3 rounded-full bg-warning-100">
          <Clock className="w-5 h-5 text-warning-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-neutral-700">Sales by Day Part</h2>
          <p className="text-xs text-neutral-500">{dayPartSummary}</p>
        </div>
      </div>
      <div className="h-[250px]">
        {dayParts.length > 0 ? (
          <ResponsivePie
            data={dayParts.map((part, idx) => ({
              id: part.label,
              label: part.label,
              value: part.revenue,
              color: DAY_PART_COLORS[idx % DAY_PART_COLORS.length],
            }))}
            margin={{top: 20, right: 20, bottom: 60, left: 20}}
            innerRadius={0.6}
            padAngle={2}
            cornerRadius={4}
            colors={{datum: 'data.color'}}
            borderWidth={2}
            borderColor={{from: 'color', modifiers: [['darker', 1.2]]}}
            enableArcLabels={false}
            enableArcLinkLabels={false}
            tooltip={({datum}) => {
              const dayPartData = dayParts.find(p => p.label === datum.label);
              return (
                <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{backgroundColor: datum.color}}
                    />
                    <p className="text-sm font-medium text-neutral-900">{datum.label}</p>
                  </div>
                  <p className="text-sm text-neutral-600">
                    {formatNumber(dayPartData?.orders || 0)} orders • {withCurrency(datum.value)}
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
                translateY: 40,
                itemsSpacing: 10,
                itemWidth: 90,
                itemHeight: 14,
                itemTextColor: '#525252',
                itemDirection: 'left-to-right',
                itemOpacity: 1,
                symbolSize: 10,
                symbolShape: 'circle',
              },
            ]}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-500">
            No day part data
          </div>
        )}
      </div>
    </div>
  );
};


const CategoryPieWidget = ({categories}: {categories: CategorySales[]}) => {
  const { t } = useTranslation('reports');
  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-3 rounded-full bg-success-100">
          <Tag className="w-5 h-5 text-success-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-neutral-700">Sales by Category</h2>
          <p className="text-xs text-neutral-500">{t('labels.distribution')}</p>
        </div>
      </div>
      <div className="h-[250px]">
        {categories.length > 0 ? (
          <ResponsivePie
            data={categories}
            margin={{top: 20, right: 20, bottom: 60, left: 20}}
            innerRadius={0.6}
            padAngle={2}
            cornerRadius={4}
            colors={{datum: 'data.color'}}
            borderWidth={2}
            borderColor={{from: 'color', modifiers: [['darker', 1.2]]}}
            enableArcLabels={false}
            enableArcLinkLabels={false}
            tooltip={({datum}) => (
              <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{backgroundColor: datum.color}}
                  />
                  <p className="text-sm font-medium text-neutral-900">{datum.label}</p>
                </div>
                <p className="text-sm text-neutral-600">
                  {formatNumber(datum.value)} items • {withCurrency(datum.value)}
                </p>
              </div>
            )}
            legends={[
              {
                anchor: 'bottom',
                direction: 'row',
                justify: false,
                translateX: 0,
                translateY: 40,
                itemsSpacing: 10,
                itemWidth: 80,
                itemHeight: 14,
                itemTextColor: '#525252',
                itemDirection: 'left-to-right',
                itemOpacity: 1,
                symbolSize: 10,
                symbolShape: 'circle',
              },
            ]}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-neutral-500">
            No category data
          </div>
        )}
      </div>
    </div>
  );
};

const BreakdownTabsWidget = ({
  title,
  subtitle,
  rows,
  icon: Icon,
  colorClass,
  countLabel,
}: {
  title: string;
  subtitle: string;
  rows: BreakdownDatum[];
  icon: any;
  colorClass: {bg: string; text: string};
  countLabel: string;
}) => {
  const { t } = useTranslation('reports');
  const [selectedTab, setSelectedTab] = useState<'chart' | 'table'>('chart');
  const chartRows = rows.slice(0, 8).map((row, idx) => ({
    id: row.name,
    label: row.name,
    value: row.amount,
    color: COLORS[idx % COLORS.length],
  }));

  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-3 rounded-full ${colorClass.bg}`}>
            <Icon className={`w-5 h-5 ${colorClass.text}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-700">{title}</h2>
            <p className="text-xs text-neutral-500">{subtitle}</p>
          </div>
        </div>
      </div>
      <Tabs selectedKey={selectedTab} onSelectionChange={(key) => setSelectedTab(key as 'chart' | 'table')}>
        <TabList aria-label={`${title} tabs`} className="flex flex-row gap-3 mb-4">
          <Tab activeClass="bg-neutral-900 text-warning-500" id="chart" key="chart">{t('labels.chart')}</Tab>
          <Tab activeClass="bg-neutral-900 text-warning-500" id="table" key="table">{t('filters.table')}</Tab>
        </TabList>
        <TabPanel id="chart" key="chart">
          <div className="h-[260px]">
            {chartRows.length > 0 ? (
              <ResponsivePie
                data={chartRows}
                margin={{top: 20, right: 20, bottom: 60, left: 20}}
                innerRadius={0.62}
                padAngle={2}
                cornerRadius={4}
                colors={{datum: 'data.color'}}
                borderWidth={2}
                borderColor={{from: 'color', modifiers: [['darker', 1.2]]}}
                enableArcLabels={false}
                enableArcLinkLabels={false}
                tooltip={({datum}) => (
                  <div className="bg-white border border-neutral-200 rounded-lg shadow-lg p-3">
                    <p className="text-sm font-medium text-neutral-900">{datum.label}</p>
                    <p className="text-xs text-neutral-500">
                      {countLabel}: {formatNumber(rows.find(row => row.name === datum.label)?.count || 0)}
                    </p>
                    <p className="text-sm text-neutral-700">{withCurrency(datum.value)}</p>
                  </div>
                )}
                legends={[
                  {
                    anchor: 'bottom',
                    direction: 'row',
                    justify: false,
                    translateX: 0,
                    translateY: 40,
                    itemsSpacing: 10,
                    itemWidth: 90,
                    itemHeight: 14,
                    itemTextColor: '#525252',
                    itemDirection: 'left-to-right',
                    itemOpacity: 1,
                    symbolSize: 10,
                    symbolShape: 'circle',
                  },
                ]}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-neutral-500">No data available</div>
            )}
          </div>
        </TabPanel>
        <TabPanel id="table" key="table">
          <div className="max-h-[260px] overflow-auto rounded border border-neutral-200">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="py-2 px-3 text-left text-xs font-semibold uppercase text-neutral-600">{t('columns.name')}</th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase text-neutral-600">{countLabel}</th>
                  <th className="py-2 px-3 text-right text-xs font-semibold uppercase text-neutral-600">{t('columns.amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.length > 0 ? rows.map(row => (
                  <tr key={row.name}>
                    <td className="py-2 px-3 text-sm text-neutral-700">{row.name}</td>
                    <td className="py-2 px-3 text-sm text-right text-neutral-600">{formatNumber(row.count)}</td>
                    <td className="py-2 px-3 text-sm text-right font-semibold text-neutral-900">{withCurrency(row.amount)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-sm text-neutral-500">No data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabPanel>
      </Tabs>
    </div>
  );
};

const PeriodComparisonSection = ({periodSales}: {periodSales: PeriodSalesItem[]}) => {
  const { t } = useTranslation('reports');
  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-3 rounded-full bg-info-100">
          <TrendingUp className="w-5 h-5 text-info-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-neutral-700">Period Comparison</h2>
          <p className="text-xs text-neutral-500">{t('labels.databaseSnapshots')}</p>
        </div>
      </div>
      <div className="rounded border border-neutral-200 overflow-hidden">
        {periodSales.map((item, idx) => (
          <div
            key={item.label}
            className={`flex items-center justify-between px-4 py-3 ${
              idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'
            }`}
          >
            <p className="text-sm text-neutral-600">{item.label}</p>
            <p className="text-sm font-semibold text-neutral-900">{withCurrency(item.amount)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

const ActivitySection = () => {
  const { t } = useTranslation('reports');
  const [trackingRows, setTrackingRows] = useState<Tracking[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(true);
  const db = useDB();

  useEffect(() => {
    const loadLatestActivity = async () => {
      try {
        setTrackingLoading(true);
        const [result] = await db.query(`
          SELECT * FROM ${Tables.tracking}
          ORDER BY created_at DESC
          LIMIT 100
        `);
        setTrackingRows((result || []) as Tracking[]);
      } catch (error) {
        console.error("Failed to load latest tracking activity:", error);
        setTrackingRows([]);
      } finally {
        setTrackingLoading(false);
      }
    };

    void loadLatestActivity();
  }, []);

  return (
    <div className="bg-white p-5 shadow-xl xl:col-span-1 rounded-lg border border-neutral-200">
      <h3 className="text-lg font-semibold text-neutral-700">{t('labels.latestActivity')}</h3>
      <p className="text-xs text-neutral-500 mb-3">Top 100 records from tracking</p>
      <div className="max-h-[420px] overflow-y-auto rounded-md border border-neutral-200 bg-white">
        {trackingLoading ? (
          <div className="p-4 text-sm text-neutral-500">{t('loading.latestActivity')}</div>
        ) : trackingRows.length === 0 ? (
          <div className="p-4 text-sm text-neutral-500">No activity found</div>
        ) : (
          
          <table className="table table-xs">
            {trackingRows.map((row) => (
              <tr key={String(row.id)}>
                <td className="text-sm text-neutral-900">{toLuxonDateTime(row.created_at as any).toFormat(import.meta.env.VITE_DATE_FORMAT)}</td>
                <td className="text-sm text-neutral-700">
                  <span className="tag">{String(row.user || "-")}</span>
                </td>
                {/*<td className="text-sm text-neutral-700">{String(row.user_role || "-")}</td>*/}
                <td className="text-sm text-neutral-700">{row.module || "-"}</td>
                {/*<td className="text-sm text-neutral-700">{row.auth_method || "-"}</td>*/}
                <td className="text-sm text-neutral-700">{displayValue(row.manager)}</td>
                {/*<td className="text-sm text-neutral-700">{displayValue(row.manager_role)}</td>*/}
                <td className="text-sm text-neutral-700">
                  <div>{detectBrowser(row.user_agent)}</div>
                  {/*<div className="sm text-neutral-500">{row.resolution || "-"}</div>*/}
                </td>
              </tr>
            ))}
          </table>
        )}
      </div>
    </div>
  );
}

const DeliverySection = ({orders}: {orders: Order[]}) => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const [selectedTab, setSelectedTab] = useState<'map' | 'table'>('map');
  const [mapCenter, setMapCenter] = useState({lat: 0, lng: 0});
  const [mapLoading, setMapLoading] = useState(true);

  // Create custom icon for delivery markers - same as delivery.tsx
  // Load map center from settings - same as delivery.tsx
  useEffect(() => {
    const loadMapCenter = async () => {
      try {
        setMapLoading(true);
        const [r] = await db.query(
          `SELECT * FROM ${Tables.settings} WHERE key = 'map_center' LIMIT 1`
        );

        if (r.length > 0 && r[0].values) {
          setMapCenter({
            lat: r[0].values.lat,
            lng: r[0].values.lng
          });
        }
      } catch (error) {
        console.error("Error loading map center:", error);
      } finally {
        setMapLoading(false);
      }
    };

    loadMapCenter();
  }, []);

  useEffect(() => {
    if(orders.length > 0){
      setMapCenter({
        lat: orders[0].delivery.lat,
        lng: orders[0].delivery.lng,
      });
    }
  }, [orders]);

  const tabs = {
    'map': {
      title: 'Map View',
      component: mapLoading ? (
        <div className="h-[400px] w-full rounded-lg bg-neutral-100 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mb-2"></div>
            <p className="text-sm text-neutral-500">{t('loading.map')}</p>
          </div>
        </div>
      ) : (
        <div className="h-[400px] w-full rounded-lg overflow-hidden">
          {/*<MapContainer
            center={[mapCenter.lat, mapCenter.lng]}
            zoom={11}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {orders.map(order => {
              // Check for location in delivery object first, then customer (same as delivery.tsx)
              const lat = order.delivery?.lat || order.customer?.lat;
              const lng = order.delivery?.lng || order.customer?.lng;
              const address = order.delivery?.address || order.customer?.address;
              const customerName = order.customer?.name || "Walk-in";

              if (!lat || !lng) return null;

              const icon = order.status === 'Paid' ? completedIcon : deliveryIcon;

              return (
                <Marker
                  key={order.id.toString()}
                  position={[Number(lat), Number(lng)]}
                  icon={icon}
                >
                  <Popup>
                    <div className="p-2 min-w-[200px]">
                      <p className="font-bold text-sm mb-1">Order #{order.invoice_number}</p>
                      <p className="text-xs text-gray-600 mb-1">
                        Status: <span className="font-semibold">{order.status}</span>
                      </p>
                      <p className="text-xs text-gray-600 mb-1">
                        Customer: <span className="font-semibold">{customerName}</span>
                      </p>
                      {address && (
                        <p className="text-xs text-gray-600 mb-1">
                          Address: <span className="font-semibold">{address}</span>
                        </p>
                      )}
                      <p className="text-xs text-gray-600">
                        Total: <span className="font-bold text-primary-500">{withCurrency(getOrderPaymentTotals(order).amountCollected)}</span>
                      </p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>*/}
        </div>
      )
    },
    'table': {
      title: 'Table View',
      component: (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Order #</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Customer</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('common:actions.type')}</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('filters.status')}</th>
                <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('common:actions.time')}</th>
                <th className="py-3 pr-4 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('columns.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {orders.length > 0 ? orders.slice(0, 10).map(order => (
                <tr key={order.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="py-3 pl-4 pr-3 text-sm">
                    <span className="font-mono text-sm font-semibold text-primary-500">#{order.invoice_number}</span>
                  </td>
                  <td className="py-3 px-3 text-sm text-neutral-700">
                    {order.customer?.name || 'Walk-in'}
                  </td>
                  <td className="py-3 px-3 text-sm text-neutral-600">
                    {order.order_type?.name || 'Dine-in'}
                  </td>
                  <td className="py-3 px-3 text-sm">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      order.status === 'Pending' ? 'bg-warning-100 text-warning-700' :
                      order.status === 'In Progress' ? 'bg-info-100 text-info-700' :
                      'bg-success-100 text-success-700'
                    }`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-sm text-neutral-600">
                    {toLuxonDateTime(order.created_at).toFormat('HH:mm')}
                  </td>
                  <td className="py-3 pr-4 text-right text-sm font-semibold text-neutral-900">
                    {withCurrency(getOrderPaymentTotals(order).amountCollected)}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-neutral-500">
                    No active delivery orders
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )
    }
  };

  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border col-span-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-3 rounded-full bg-primary-100">
            <Truck className="w-5 h-5 text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-700">Delivery Orders</h2>
            <p className="text-xs text-neutral-500">{t('labels.activeDeliveries')}</p>
          </div>
        </div>
        <span className="bg-primary-100 text-primary-500 text-xs font-semibold px-3 py-1.5 rounded-full">
          {orders.length} active
        </span>
      </div>
      
      <Tabs
        className="w-full"
        selectedKey={selectedTab}
        onSelectionChange={(key: string) => setSelectedTab(key as 'map' | 'table')}
      >
        <TabList aria-label="Delivery tabs" className="flex flex-row gap-3 mb-4">
          <Tab activeClass="bg-neutral-900 text-warning-500" id="map" key="map">{t('labels.mapView')}</Tab>
          <Tab activeClass="bg-neutral-900 text-warning-500" id="table" key="table">{t('labels.tableView')}</Tab>
        </TabList>
        <TabPanel id="map" key="map">
          {tabs.map.component}
        </TabPanel>
        <TabPanel id="table" key="table">
          {tabs.table.component}
        </TabPanel>
      </Tabs>
    </div>
  );
};

const UserSessionsWidget = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const [sessions, setSessions] = useState<{
    user: string;
    role: string;
    shift: string;
    clockIn: string;
    clockOut: string | null;
    duration: string;
    isActive: boolean;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSessions = async () => {
      try {
        setLoading(true);
        // Get all users first
        const usersQuery = `
          SELECT * FROM user
          FETCH user_role, user_shift
        `;
        const usersResult: any = await db.query(usersQuery);
        const users = usersResult?.[0] || [];

        // For each user, get their latest time entry
        const sessionsPromises = users.map(async (user: any) => {
          const entryQuery = `
            SELECT * FROM time_entry
            WHERE user = $userId
            ORDER BY clock_in DESC
            LIMIT 1
          `;
          const entryResult: any = await db.query(entryQuery, {
            userId: user.id
          });
          return {
            user,
            entry: entryResult?.[0]?.[0] || null
          };
        });

        const sessionsResults = await Promise.all(sessionsPromises);

        const sessionsData = sessionsResults
          .filter(({entry}) => entry) // Only users with time entries
          .map(({user, entry}) => {
            const clockIn = toJsDate(entry.clock_in);
            const clockOut = entry.clock_out ? toJsDate(entry.clock_out) : null;
            const durationSeconds = entry.duration_seconds || 0;

            // Format duration
            const hours = Math.floor(durationSeconds / 3600);
            const minutes = Math.floor((durationSeconds % 3600) / 60);
            const duration = clockOut
              ? `${hours}h ${minutes}m`
              : 'Active';

            const firstName = user?.first_name || 'Unknown';
            const lastName = user?.last_name || '';
            const roleName = user?.user_role?.name || 'N/A';
            const shiftName = user?.user_shift?.name || 'No shift';

            return {
              user: `${firstName} ${lastName}`.trim(),
              role: roleName,
              shift: shiftName,
              clockIn: DateTime.fromJSDate(clockIn).toFormat('MMM dd, HH:mm'),
              clockOut: clockOut ? DateTime.fromJSDate(clockOut).toFormat('MMM dd, HH:mm') : null,
              duration,
              isActive: !clockOut,
            };
          });

        setSessions(sessionsData);
      } catch (error) {
        console.error('Failed to load user sessions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, []);

  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-3 rounded-full bg-info-100">
            <UserCheck className="w-5 h-5 text-info-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-neutral-700">User Sessions</h2>
            <p className="text-xs text-neutral-500">{t('labels.latestTimeEntries')}</p>
          </div>
        </div>
        <span className="bg-info-100 text-info-500 text-xs font-semibold px-3 py-1.5 rounded-full">
          {sessions.filter(s => s.isActive).length} active
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('filters.user')}</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Role</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Shift</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Clock In</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">Clock Out</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('columns.duration')}</th>
              <th className="py-3 pr-4 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('filters.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={7} className="py-8 text-center">
                  <div className="flex items-center justify-center">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mr-2"></div>
                    <span className="text-sm text-neutral-500">{t('loading.sessions')}</span>
                  </div>
                </td>
              </tr>
            ) : sessions.length > 0 ? sessions.map((session, idx) => (
              <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                <td className="py-3 pl-4 pr-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center text-sm font-bold">
                      {session.user.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-neutral-900">{session.user}</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-sm text-neutral-600">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-200 text-neutral-700">
                    {session.role}
                  </span>
                </td>
                <td className="py-3 px-3 text-sm text-neutral-600">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">
                    {session.shift}
                  </span>
                </td>
                <td className="py-3 px-3 text-sm text-neutral-700 font-medium">
                  {session.clockIn}
                </td>
                <td className="py-3 px-3 text-sm text-neutral-600">
                  {session.clockOut || '-'}
                </td>
                <td className="py-3 px-3 text-sm">
                  <span className={`font-semibold ${session.isActive ? 'text-success-600' : 'text-neutral-700'}`}>
                    {session.duration}
                  </span>
                </td>
                <td className="py-3 pr-4 text-sm">
                  {session.isActive ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-success-100 text-success-700">
                      <span className="w-2 h-2 bg-success-500 rounded-full mr-1.5 animate-pulse"></span>
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-200 text-neutral-600">
                      Completed
                    </span>
                  )}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-neutral-500">
                  No user sessions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const LatestOrdersTable = ({orders}: {orders: Order[]}) => {
  const { t } = useTranslation('reports');
  return (
    <div className="bg-white p-5 rounded-lg shadow-xl border">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-3 rounded-full bg-neutral-100">
          <Clock className="w-5 h-5 text-neutral-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-neutral-700">{t('labels.latestOrders')}</h2>
          <p className="text-xs text-neutral-500">{t('labels.last10Orders')}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="py-3 pl-4 pr-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('columns.invoice')}</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('metrics.cashier')}</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('common:actions.type')}</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('filters.status')}</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('filters.table')}</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('columns.items')}</th>
              <th className="py-3 px-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('common:actions.time')}</th>
              <th className="py-3 pr-4 text-right text-xs font-semibold text-neutral-600 uppercase tracking-wider">{t('columns.total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 bg-white">
            {orders.length > 0 ? orders.slice(0, 10).map(order => (
              <tr key={order.id} className="hover:bg-neutral-50 transition-colors">
                <td className="py-3 pl-4 pr-3 text-sm">
                  <span className="font-mono text-sm font-semibold text-primary-500">#{order.invoice_number}</span>
                </td>
                <td className="py-3 px-3 text-sm text-neutral-700">
                  <span>
                    {order.cashier?.first_name || 'Unknown'}
                  </span>
                </td>
                <td className="py-3 px-3 text-sm">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-200 text-neutral-700">
                    {order.order_type?.name || 'Dine-in'}
                  </span>
                </td>
                <td>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    order.status === 'Pending' ? 'bg-warning-100 text-warning-700' :
                      order.status === 'In Progress' ? 'bg-info-100 text-info-700' :
                        'bg-success-100 text-success-700'
                  }`}>
                      {order.status}
                    </span>
                </td>
                <td className="py-3 px-3 text-sm text-neutral-600">
                  {order?.table?.name || '-'}{order?.table?.number}
                </td>
                <td className="py-3 px-3 text-sm text-neutral-600">
                  {order.items?.length || 0}
                </td>
                <td className="py-3 px-3 text-sm text-neutral-600">
                  {toLuxonDateTime(order.created_at).toFormat(import.meta.env.VITE_DATE_FORMAT)}
                  <br/>
                  {toLuxonDateTime(order.created_at).toFormat(import.meta.env.VITE_TIME_FORMAT)}
                </td>
                <td className="py-3 pr-4 text-right text-sm font-semibold text-neutral-900">
                  {withCurrency(getOrderPaymentTotals(order).amountCollected)}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-neutral-500">
                  No orders yet
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
export const SalesDashboardReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [orders, setOrders] = useState<Order[]>([]);
  const [periodSales, setPeriodSales] = useState<PeriodSalesItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => {
    const {startDate, endDate} = parseDateRangeFromParams(new URLSearchParams(window.location.search));
    return {startDate: startDate ?? null, endDate: endDate ?? null};
  }, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const fetchedOrders = await fetchDashboardOrders(db, {
          startDate: filters.startDate ?? undefined,
          endDate: filters.endDate ?? undefined,
        });
        setOrders(fetchedOrders);

        const parseFilterDate = (value: string | null, fallback: DateTime) => {
          if (!value) return fallback.startOf('day');
          const iso = DateTime.fromISO(value);
          if (iso.isValid) return iso.startOf('day');
          const custom = DateTime.fromFormat(value, import.meta.env.VITE_DB_DATABASE_FORMAT);
          return custom.isValid ? custom.startOf('day') : fallback.startOf('day');
        };

        const filterStart = parseFilterDate(filters.startDate, DateTime.local().startOf('day'));
        const filterEnd = parseFilterDate(filters.endDate, DateTime.local().endOf('day')).endOf('day');
        const previousDay = filterStart.minus({days: 1});

        const queryTotalForRange = async (start: DateTime | null, end: DateTime | null) => {
          const conditions: string[] = [`status = '${OrderStatus.Paid}'`];
          const rangeParams: Record<string, string> = {};
          if (start) {
            conditions.push(`created_at >= <datetime>$startDate`);
            rangeParams.startDate = start.toISO() ?? '';
          }
          if (end) {
            conditions.push(`created_at <= <datetime>$endDate`);
            rangeParams.endDate = end.toISO() ?? '';
          }
          const rangeQuery = `
            SELECT payments
            FROM ${Tables.orders}
            WHERE ${conditions.join(' AND ')}
            FETCH payments
          `;
          const result: any = await queryRef.current(rangeQuery, rangeParams);
          const periodOrders = (result?.[0] ?? []) as Pick<Order, 'payments'>[];
          return periodOrders.reduce((sum, order) => {
            const orderTotals = getOrderPaymentTotals(order);
            return sum + safeNumber(orderTotals.cashAmount + orderTotals.nonCashAmount);
          }, 0);
        };

        const currentPeriodDays = Math.max(1, Math.round(filterEnd.diff(filterStart, 'days').days) + 1);
        const currentWeekStart = filterEnd.startOf('week');
        const currentWeekEnd = filterEnd.endOf('week');
        const lastWeekStart = currentWeekStart.minus({weeks: 1});
        const lastWeekEnd = currentWeekEnd.minus({weeks: 1});
        const currentMonthStart = filterEnd.startOf('month');
        const currentMonthEnd = filterEnd.endOf('month');
        const lastMonthStart = currentMonthStart.minus({months: 1});
        const lastMonthEnd = currentMonthEnd.minus({months: 1});
        const currentYearStart = filterEnd.startOf('year');
        const currentYearEnd = filterEnd.endOf('year');
        const lastYearStart = currentYearStart.minus({years: 1});
        const lastYearEnd = currentYearEnd.minus({years: 1});

        const [
          thisPeriodLastYear,
          yesterdaySale,
          thisWeekSale,
          lastWeekSale,
          thisMonthSale,
          lastMonthSale,
          thisYearSale,
          lastYearSale,
          allTimeSale,
        ] = await Promise.all([
          queryTotalForRange(filterStart.minus({years: 1}), filterStart.minus({years: 1}).plus({days: currentPeriodDays - 1}).endOf('day')),
          queryTotalForRange(previousDay.startOf('day'), previousDay.endOf('day')),
          queryTotalForRange(currentWeekStart, currentWeekEnd),
          queryTotalForRange(lastWeekStart, lastWeekEnd),
          queryTotalForRange(currentMonthStart, currentMonthEnd),
          queryTotalForRange(lastMonthStart, lastMonthEnd),
          queryTotalForRange(currentYearStart, currentYearEnd),
          queryTotalForRange(lastYearStart, lastYearEnd),
          queryTotalForRange(null, null),
        ]);

        setPeriodSales([
          {label: 'This period last year', amount: thisPeriodLastYear},
          {label: 'Yesterday sale', amount: yesterdaySale},
          {label: 'This week sale', amount: thisWeekSale},
          {label: t('labels.lastWeekSale'), amount: lastWeekSale},
          {label: 'This month sale', amount: thisMonthSale},
          {label: t('labels.lastMonthSale'), amount: lastMonthSale},
          {label: 'This year sale', amount: thisYearSale},
          {label: t('labels.lastYearSale'), amount: lastYearSale},
          {label: t('labels.allTimeSale'), amount: allTimeSale},
        ]);
      } catch (err) {
        console.error("Failed to load sales dashboard", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters]);

  // ==================== Data Processing ====================
  const paidOrders = useMemo(() => orders.filter(order => order.status === OrderStatus.Paid), [orders]);

  const kpis = useMemo(() => {
    const aggregates = paidOrders.reduce((acc, order) => {
      const figures = getOrderFigures(order);
      const coverCount = safeNumber(order.covers);
      const isLateOrder = order.completed_at
        ? toJsDate(order.completed_at).getTime() - toJsDate(order.created_at).getTime() > 30 * 60 * 1000
        : false;

      return {
        grossSale: acc.grossSale + figures.grossSales,
        netSale: acc.netSale + figures.netSales,
        totalRevenue: acc.totalRevenue + figures.totalRevenue,
        grandTotal: acc.grandTotal + figures.grandTotal,
        tax: acc.tax + figures.tax,
        discount: acc.discount + figures.discounts,
        void: acc.void + figures.voidAmount,
        serviceCharge: acc.serviceCharge + figures.serviceCharge,
        totalCover: acc.totalCover + coverCount,
        tips: acc.tips + figures.tips,
        coupon: acc.coupon + figures.couponDiscount,
        refundOrder: acc.refundOrder + (figures.isRefundedOrder ? 1 : 0),
        lateOrders: acc.lateOrders + (isLateOrder ? 1 : 0),
      };
    }, {
      grossSale: 0,
      netSale: 0,
      totalRevenue: 0,
      grandTotal: 0,
      tax: 0,
      discount: 0,
      void: 0,
      serviceCharge: 0,
      totalCover: 0,
      tips: 0,
      coupon: 0,
      refundOrder: 0,
      lateOrders: 0,
    });

    const totalOrder = paidOrders.length;
    const avgOrder = totalOrder > 0 ? aggregates.totalRevenue / totalOrder : 0;
    const avgCover = aggregates.totalCover > 0 ? aggregates.totalRevenue / aggregates.totalCover : 0;

    return {
      ...aggregates,
      totalOrder,
      avgOrder,
      avgCover,
    };
  }, [paidOrders]);

  const salesTrendData = useMemo((): SalesDataPoint[] => {
    const grouped = new Map<string, number>();

    paidOrders.forEach(order => {
      const figures = getOrderFigures(order);
      const date = toLuxonDateTime(order.created_at);
      const key = date.toFormat('yyyy-MM-dd HH:00');

      grouped.set(key, (grouped.get(key) || 0) + figures.totalRevenue);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([x, y]) => ({x, y}));
  }, [paidOrders]);

  const ordersPerHourData = useMemo((): SalesDataPoint[] => {
    const grouped = new Map<string, number>();

    paidOrders.forEach(order => {
      const date = toLuxonDateTime(order.created_at);
      const key = date.toFormat('HH:00');

      grouped.set(key, (grouped.get(key) || 0) + 1);
    });

    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([x, y]) => ({x, y}));
  }, [paidOrders]);

  const dayParts = useMemo(() => {
    const map = new Map<DayPartLabel, {orders: number; revenue: number}>();

    paidOrders.forEach(order => {
      const figures = getOrderFigures(order);
      const dayPart = getDayPartLabel(toJsDate(order.created_at));
      const current = map.get(dayPart) || {orders: 0, revenue: 0};
      current.orders += 1;
      current.revenue += figures.totalRevenue;
      map.set(dayPart, current);
    });

    return DAY_PARTS
      .map(part => ({
        label: part.label,
        orders: map.get(part.label)?.orders ?? 0,
        revenue: map.get(part.label)?.revenue ?? 0,
      }))
      .filter(part => part.orders > 0);
  }, [paidOrders]);

  const topItems = useMemo((): TopItem[] => (
    aggregateTopSellingDishes(paidOrders).map(item => ({
      name: item.name,
      quantity: item.quantity,
      revenue: item.revenue,
    }))
  ), [paidOrders]);

  const categorySales = useMemo((): CategorySales[] => {
    const map = new Map<string, number>();

    paidOrders.forEach(order => {
      getOrderFilteredItems(order).forEach(item => {
        const category = item.item?.categories?.[0]?.name || item.category || 'Other';
        map.set(category, (map.get(category) || 0) + safeNumber(item.quantity));
      });
    });

    return Array.from(map.entries())
      .map(([label, value], idx) => ({
        id: label,
        label,
        value,
        color: COLORS[idx % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [paidOrders]);

  const topUsers = useMemo((): UserSales[] => {
    const map = new Map<string, {orders: number; revenue: number}>();

    paidOrders.forEach(order => {
      const figures = getOrderFigures(order);
      const name = `${order.cashier?.first_name || 'U'} ${order.cashier?.last_name || ''}`.trim() || 'Unknown';
      const current = map.get(name) || {orders: 0, revenue: 0};
      current.orders += 1;
      current.revenue += figures.totalRevenue;
      map.set(name, current);
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({name, ...data}))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidOrders]);

  const topTables = useMemo((): TableSales[] => {
    const map = new Map<string, {orders: number; revenue: number}>();

    paidOrders.forEach(order => {
      const figures = getOrderFigures(order);
      const table = order?.table ? `${order.table?.name}${order.table?.number}` : 'Delivery';
      const current = map.get(table) || {orders: 0, revenue: 0};
      current.orders += 1;
      current.revenue += figures.totalRevenue;
      map.set(table, current);
    });

    return Array.from(map.entries())
      .map(([table, data]) => ({table, ...data}))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidOrders]);

  const orderTypes = useMemo((): OrderTypeSales[] => {
    const map = new Map<string, {orders: number; revenue: number}>();

    paidOrders.forEach(order => {
      const figures = getOrderFigures(order);
      const type = order.order_type?.name || 'Dine-in';
      const current = map.get(type) || {orders: 0, revenue: 0};
      current.orders += 1;
      current.revenue += figures.totalRevenue;
      map.set(type, current);
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({name, ...data}))
      .sort((a, b) => b.revenue - a.revenue);
  }, [paidOrders]);

  const paymentTypes = useMemo((): PaymentTypeSales[] => {
    const map = new Map<string, {count: number; amount: number}>();

    paidOrders.forEach(order => {
      const paymentTotals = getOrderPaymentTotals(order);
      Object.entries(paymentTotals.nonCashBreakdown).forEach(([typeName, amount]) => {
        const current = map.get(typeName) || {count: 0, amount: 0};
        current.count += 1;
        current.amount += amount;
        map.set(typeName, current);
      });
      const cashCurrent = map.get('Cash') || {count: 0, amount: 0};
      cashCurrent.count += 1;
      cashCurrent.amount += paymentTotals.cashAmount;
      map.set('Cash', cashCurrent);
    });

    return Array.from(map.entries())
      .map(([name, data]) => ({name, ...data}))
      .sort((a, b) => b.amount - a.amount);
  }, [paidOrders]);

  const topItemsBreakdown = useMemo<BreakdownDatum[]>(() => (
    topItems.map(item => ({name: item.name, count: item.quantity, amount: item.revenue}))
  ), [topItems]);

  const topUsersBreakdown = useMemo<BreakdownDatum[]>(() => (
    topUsers.map(user => ({name: user.name, count: user.orders, amount: user.revenue}))
  ), [topUsers]);

  const topTablesBreakdown = useMemo<BreakdownDatum[]>(() => (
    topTables.map(table => ({name: table.table, count: table.orders, amount: table.revenue}))
  ), [topTables]);

  const orderTypesBreakdown = useMemo<BreakdownDatum[]>(() => (
    orderTypes.map(type => ({name: type.name, count: type.orders, amount: type.revenue}))
  ), [orderTypes]);

  const paymentTypesBreakdown = useMemo<BreakdownDatum[]>(() => (
    paymentTypes.map(type => ({name: type.name, count: type.count, amount: type.amount}))
  ), [paymentTypes]);

  const deliveryOrders = useMemo(() => {
    return orders.filter(o =>
      o.delivery && o.status !== 'Paid' && o.status !== 'Cancelled'
    ).sort((a, b) =>
      toJsDate(b.created_at).getTime() - toJsDate(a.created_at).getTime()
    );
  }, [orders]);

  const latestOrders = useMemo(() => {
    return [...orders].sort((a, b) =>
      toJsDate(b.created_at).getTime() - toJsDate(a.created_at).getTime()
    );
  }, [orders]);

  const reportTitle = useMemo(() => {
    if (filters.startDate && filters.endDate) {
      return `Sales Dashboard - ${filters.startDate} to ${filters.endDate}`;
    } else if (filters.startDate) {
      return `Sales Dashboard - From ${filters.startDate}`;
    } else if (filters.endDate) {
      return `Sales Dashboard - Until ${filters.endDate}`;
    }
    return 'Sales Dashboard - All Time';
  }, [filters]);

  if (error) {
    return (
      <ReportsLayout title={t('reports.salesDashboard')}>
        <div className="py-12 text-center text-danger-500">Failed to load dashboard: {error}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('reports.salesDashboard')} subtitle={reportTitle}>
      <div className="space-y-5">
        {/* KPI Metrics Grid - Matching clock.tsx style */}
        <div className="rounded-lg shadow-xl border">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 p-5">
            <KPIMetricWidget
              title={t('labels.grossSale')}
              value={withCurrency(kpis.grossSale)}
              icon={DollarSign}
              gradientFrom="from-success-100"
              gradientTo="success-200"
              borderColor="border-success-300"
              textColor="text-success-900"
              labelColor="text-success-700"
            />
            <KPIMetricWidget
              title="Net Sale"
              value={withCurrency(kpis.netSale)}
              icon={TrendingUp}
              gradientFrom="from-primary-100"
              gradientTo="primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title="Total Revenue"
              value={withCurrency(kpis.totalRevenue)}
              icon={ArrowLeftRight}
              gradientFrom="from-info-100"
              gradientTo="info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
            <KPIMetricWidget
              title="Grand Total"
              value={withCurrency(kpis.grandTotal)}
              icon={ShoppingCart}
              gradientFrom="from-primary-100"
              gradientTo="primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title={t('reports.tax')}
              value={withCurrency(kpis.tax)}
              icon={Hash}
              gradientFrom="from-info-100"
              gradientTo="info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
            <KPIMetricWidget
              title={t('reports.discount')}
              value={withCurrency(kpis.discount)}
              icon={Tag}
              gradientFrom="from-warning-100"
              gradientTo="warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
            <KPIMetricWidget
              title={t('columns.void')}
              value={withCurrency(kpis.void)}
              icon={Trash2}
              gradientFrom="from-danger-100"
              gradientTo="danger-200"
              borderColor="border-danger-300"
              textColor="text-danger-900"
              labelColor="text-danger-700"
            />
            <KPIMetricWidget
              title="Service Charge"
              value={withCurrency(kpis.serviceCharge)}
              icon={ArrowLeftRight}
              gradientFrom="from-primary-100"
              gradientTo="primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title="Total Order"
              value={formatNumber(kpis.totalOrder)}
              icon={Package}
              gradientFrom="from-info-100"
              gradientTo="info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
            <KPIMetricWidget
              title="Total Cover"
              value={formatNumber(kpis.totalCover)}
              icon={UserCheck}
              gradientFrom="from-success-100"
              gradientTo="success-200"
              borderColor="border-success-300"
              textColor="text-success-900"
              labelColor="text-success-700"
            />
            <KPIMetricWidget
              title="Avg Order"
              value={withCurrency(kpis.avgOrder)}
              icon={TrendingUp}
              gradientFrom="from-warning-100"
              gradientTo="warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
            <KPIMetricWidget
              title="Avg Cover"
              value={withCurrency(kpis.avgCover)}
              icon={DollarSign}
              gradientFrom="from-success-100"
              gradientTo="success-200"
              borderColor="border-success-300"
              textColor="text-success-900"
              labelColor="text-success-700"
            />
            <KPIMetricWidget
              title="Refund Order"
              value={formatNumber(kpis.refundOrder)}
              icon={ArrowLeftRight}
              gradientFrom="from-info-100"
              gradientTo="info-200"
              borderColor="border-info-300"
              textColor="text-info-900"
              labelColor="text-info-700"
            />
            <KPIMetricWidget
              title="Late Orders"
              value={formatNumber(kpis.lateOrders)}
              icon={Clock}
              gradientFrom="from-warning-100"
              gradientTo="warning-200"
              borderColor="border-warning-300"
              textColor="text-warning-900"
              labelColor="text-warning-700"
            />
            <KPIMetricWidget
              title={t('reports.tips')}
              value={withCurrency(kpis.tips)}
              icon={DollarSign}
              gradientFrom="from-primary-100"
              gradientTo="primary-200"
              borderColor="border-primary-300"
              textColor="text-primary-900"
              labelColor="text-primary-700"
            />
            <KPIMetricWidget
              title={t('reports.coupon')}
              value={withCurrency(kpis.coupon)}
              icon={Tag}
              gradientFrom="from-danger-100"
              gradientTo="danger-200"
              borderColor="border-danger-300"
              textColor="text-danger-900"
              labelColor="text-danger-700"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <DeliverySection orders={deliveryOrders} />
          <ActivitySection />
        </div>

        {/* Sales Chart and Delivery Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <SalesLineChart
              data={salesTrendData}
              isLoading={loading}
            />
          </div>
          <div className="lg:col-span-1">
            <PeriodComparisonSection periodSales={periodSales} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Orders Per Hour Chart */}
          <div className="lg:col-span-2">
            <OrdersPerHourChart
              data={ordersPerHourData}
              isLoading={loading}
            />
          </div>
          <CategoryPieWidget categories={categorySales} />
        </div>

        {/* Top Items and Day Parts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <BreakdownTabsWidget
            title="Top Selling Items"
            subtitle="Exclude deleted/refunded/suspended items"
            rows={topItemsBreakdown}
            icon={Package}
            colorClass={{bg: 'bg-primary-100', text: 'text-primary-600'}}
            countLabel="Quantity"
          />
          <DayPartsWidget dayParts={dayParts} />
        </div>

        {/* Users and Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <BreakdownTabsWidget
            title="Top Cashiers"
            subtitle="By total revenue"
            rows={topUsersBreakdown}
            icon={UserCheck}
            colorClass={{bg: 'bg-info-100', text: 'text-info-600'}}
            countLabel="Orders"
          />
          <BreakdownTabsWidget
            title="Top Tables"
            subtitle="By total revenue"
            rows={topTablesBreakdown}
            icon={TableIcon}
            colorClass={{bg: 'bg-warning-100', text: 'text-warning-600'}}
            countLabel="Orders"
          />
        </div>

        {/* Order Types and Payment Methods */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <BreakdownTabsWidget
            title="Top Order Types"
            subtitle="By total revenue"
            rows={orderTypesBreakdown}
            icon={Package}
            colorClass={{bg: 'bg-primary-100', text: 'text-primary-600'}}
            countLabel="Orders"
          />
          <BreakdownTabsWidget
            title="Payment Methods"
            subtitle="Using getOrderPaymentTotals"
            rows={paymentTypesBreakdown}
            icon={Tag}
            colorClass={{bg: 'bg-success-100', text: 'text-success-600'}}
            countLabel="Transactions"
          />
        </div>

        {/* User Sessions */}
        <UserSessionsWidget />

        {/* Latest Orders */}
        <LatestOrdersTable orders={latestOrders} />
      </div>
    </ReportsLayout>
  );
};
