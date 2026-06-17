import {Layout} from "@/screens/partials/layout.tsx";
import {ReactNode, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {SalesWeeklyFilter} from "@/components/reports/filters/sales.weekly.filter.tsx";
import {ProductMixWeeklyReportFilter} from "@/components/reports/filters/product.mix.weekly.filter.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCheck, faCheckCircle, faChevronRight} from "@fortawesome/free-solid-svg-icons";
import {AuditFilter} from "@/components/reports/filters/audit.filter.tsx";
import {CashClosingFilter} from "@/components/reports/filters/cash.closing.filter.tsx";
import {DiscountsFilter} from "@/components/reports/filters/discounts.filter.tsx";
import {SalesHourlyLabourFilter} from "@/components/reports/filters/sales.hourly.labour.filter.tsx";
import {SalesHourlyLabourWeeklyFilter} from "@/components/reports/filters/sales.hourly.labour.weekly.filter.tsx";
import {SalesServerFilter} from "@/components/reports/filters/sales.server.filter.tsx";
import {SalesSummaryFilter} from "@/components/reports/filters/sales.summary.filter.tsx";
import {ProductMixSummaryFilter} from "@/components/reports/filters/product.mix.summary.filter.tsx";
import {ProductHourlyFilter} from "@/components/reports/filters/product.hourly.filter.tsx";
import {ProductListFilter} from "@/components/reports/filters/product.list.filter.tsx";
import {VoidsFilter} from "@/components/reports/filters/voids.filter.tsx";
import {TableSummaryFilter} from "@/components/reports/filters/table.summary.filter.tsx";
import {SalesAdvancedFilter} from "@/components/reports/filters/sales.advanced.filter.tsx";
import {SalesSummary2Filter} from "@/components/reports/filters/sales.summary2.filter.tsx";
import {CurrentInventoryFilter} from "@/components/reports/filters/current.inventory.filter.tsx";
import {DetailedInventoryFilter} from "@/components/reports/filters/detailed.inventory.filter.tsx";
import {PurchaseFilter} from "@/components/reports/filters/purchase.filter.tsx";
import {PurchaseReturnFilter} from "@/components/reports/filters/purchase.return.filter.tsx";
import {IssueFilter} from "@/components/reports/filters/issue.filter.tsx";
import {IssueReturnFilter} from "@/components/reports/filters/issue.return.filter.tsx";
import {WasteFilter} from "@/components/reports/filters/waste.filter.tsx";
import {ConsumptionFilter} from "@/components/reports/filters/consumption.filter.tsx";
import {SaleVsConsumptionFilter} from "@/components/reports/filters/sale.vs.consumption.filter.tsx";
import { TipsFilter } from "@/components/reports/filters/tips.filter.tsx";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {SalesDashboardFilter} from "@/components/reports/filters/sales.dashboard.filter.tsx";
import {InventoryDashboardFilter} from "@/components/reports/filters/inventory.dashboard.filter.tsx";
import {DeliveryDensityFilter} from "@/components/reports/filters/delivery.density.filter.tsx";
import {MergeOrdersFilter} from "@/components/reports/filters/merge.orders.filter.tsx";
import {SplitOrdersFilter} from "@/components/reports/filters/split.orders.filter.tsx";
import {TaxFilter} from "@/components/reports/filters/tax.filter.tsx";
import {CouponFilter} from "@/components/reports/filters/coupon.filter.tsx";
import {OrderLifecycleFilter} from "@/components/reports/filters/order.lifecycle.filter.tsx";
import {ExpenseFilter} from "@/components/reports/filters/expense.filter.tsx";
import {ActivityFilter} from "@/components/reports/filters/activity.filter.tsx";
import {AiReportFilter} from "@/components/reports/filters/ai.report.filter.tsx";

type ReportEntry = {
  filter: ReactNode;
  module: string;
};

/** Stable permission codes stored in user roles — not translated labels. */
const REPORT_PERMISSION_MODULES: Record<string, string> = {
  aiReport: 'AI Report',
  salesDashboard: 'Sales dashboard',
  inventoryDashboard: 'Inventory dashboard',
  salesHourlyLabour: 'Sales Hourly Labour',
  salesHourlyLabourWeekly: 'Sales Hourly Labour Weekly',
  serverSales: 'Server Sales',
  salesSummary: 'Sales Summary',
  salesSummary2: 'Sales Summary 2',
  salesWeekly: 'Sales Weekly',
  tips: 'Tips',
  advancedSales: 'Advanced Sales',
  deliveryDensity: 'Delivery Density',
  discount: 'Discount',
  tax: 'Tax',
  coupon: 'Coupon',
  voids: 'Voids',
  mergeOrders: 'Merge Orders',
  splitOrders: 'Split Orders',
  orderLifeCycle: 'Order Life Cycle',
  cashClosing: 'Cash closing',
  expense: 'Expense',
  activity: 'Activity',
  productMixWeekly: 'Product Mix Weekly',
  productMixSummary: 'Product Mix Summary',
  productsHourly: 'Products Hourly',
  currentInventory: 'Current Inventory',
  detailedInventory: 'Detailed Inventory',
  purchase: 'Purchase',
  purchaseReturn: 'Purchase Return',
  issue: 'Issue',
  issueReturn: 'Issue Return',
  waste: 'Waste',
  consumption: 'Consumption',
  saleVsInventory: 'Sale vs Inventory',
};

const buildReportEntries = (
  t: (key: string) => string,
  reports: Array<{ reportKey: string; filter: ReactNode }>,
): Record<string, ReportEntry> =>
  Object.fromEntries(
    reports.map(({ reportKey, filter }) => [
      t(`reports.${reportKey}`),
      { filter, module: REPORT_PERMISSION_MODULES[reportKey] },
    ]),
  );

export const Reports = () => {
  const { t } = useTranslation('reports');
  const reportCategories = useMemo(() => {
    return {
      [t('categories.ai')]: buildReportEntries(t, [
        { reportKey: 'aiReport', filter: <AiReportFilter /> },
      ]),
      [t('categories.dashboard')]: buildReportEntries(t, [
        { reportKey: 'salesDashboard', filter: <SalesDashboardFilter /> },
        { reportKey: 'inventoryDashboard', filter: <InventoryDashboardFilter /> },
      ]),
      [t('categories.sales')]: buildReportEntries(t, [
        { reportKey: 'salesHourlyLabour', filter: <SalesHourlyLabourFilter /> },
        { reportKey: 'salesHourlyLabourWeekly', filter: <SalesHourlyLabourWeeklyFilter /> },
        { reportKey: 'serverSales', filter: <SalesServerFilter /> },
        { reportKey: 'salesSummary', filter: <SalesSummaryFilter /> },
        { reportKey: 'salesSummary2', filter: <SalesSummary2Filter /> },
        { reportKey: 'salesWeekly', filter: <SalesWeeklyFilter /> },
        { reportKey: 'tips', filter: <TipsFilter /> },
        { reportKey: 'advancedSales', filter: <SalesAdvancedFilter /> },
        { reportKey: 'deliveryDensity', filter: <DeliveryDensityFilter /> },
        { reportKey: 'discount', filter: <DiscountsFilter /> },
        { reportKey: 'tax', filter: <TaxFilter /> },
        { reportKey: 'coupon', filter: <CouponFilter /> },
        { reportKey: 'voids', filter: <VoidsFilter /> },
      ]),
      [t('categories.orders')]: buildReportEntries(t, [
        { reportKey: 'mergeOrders', filter: <MergeOrdersFilter /> },
        { reportKey: 'splitOrders', filter: <SplitOrdersFilter /> },
        { reportKey: 'orderLifeCycle', filter: <OrderLifecycleFilter /> },
      ]),
      [t('categories.cashClosing')]: buildReportEntries(t, [
        { reportKey: 'cashClosing', filter: <CashClosingFilter /> },
      ]),
      [t('categories.operations')]: buildReportEntries(t, [
        { reportKey: 'expense', filter: <ExpenseFilter /> },
        { reportKey: 'activity', filter: <ActivityFilter /> },
      ]),
      [t('categories.products')]: buildReportEntries(t, [
        { reportKey: 'productMixWeekly', filter: <ProductMixWeeklyReportFilter /> },
        { reportKey: 'productMixSummary', filter: <ProductMixSummaryFilter /> },
        { reportKey: 'productsHourly', filter: <ProductHourlyFilter /> },
      ]),
      [t('categories.inventory')]: buildReportEntries(t, [
        { reportKey: 'currentInventory', filter: <CurrentInventoryFilter /> },
        { reportKey: 'detailedInventory', filter: <DetailedInventoryFilter /> },
        { reportKey: 'purchase', filter: <PurchaseFilter /> },
        { reportKey: 'purchaseReturn', filter: <PurchaseReturnFilter /> },
        { reportKey: 'issue', filter: <IssueFilter /> },
        { reportKey: 'issueReturn', filter: <IssueReturnFilter /> },
        { reportKey: 'waste', filter: <WasteFilter /> },
        { reportKey: 'consumption', filter: <ConsumptionFilter /> },
        { reportKey: 'saleVsInventory', filter: <SaleVsConsumptionFilter /> },
      ]),
    };
  }, [t]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [subCategory, setSubCategory] = useState<Record<string, ReportEntry>>({});
  const [selectedSubCategory, setSelectedSubCategory] = useState('');
  const [filter, setFilter] = useState<ReactNode>();

  const {protectAction} = useSecurity();

  return (
    <Layout containerClassName="p-5">
      <div className="grid grid-cols-9 gap-5">
        <div className="col-span-2">
          <div className="bg-white shadow py-5 rounded-lg">
            <h1 className="text-xl text-gray-600 px-5">{t('page.title')}</h1>
            <div className="py-5">
              <ul>
                {Object.keys(reportCategories).map((key) => (
                  <li
                    className="border-b py-2 px-5 flex justify-between cursor-pointer hover:bg-gray-100 items-center"
                    onClick={() => {
                      setSelectedCategory(key);
                      setSubCategory(reportCategories[key]);
                    }}
                    key={key}
                  >
                    {key}
                    {selectedCategory === key && (
                      <FontAwesomeIcon icon={faCheckCircle} className="text-success-700" size="lg" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="col-span-2">
          <div className="bg-white shadow py-5 rounded-lg">
            <h1 className="text-xl text-gray-600 px-5">{t('page.subReports')}</h1>
            <div className="py-5">
              <ul>
                {Object.keys(subCategory).map((key) => (
                  <li
                    className="border-b py-2 px-5 flex justify-between cursor-pointer hover:bg-gray-100 items-center"
                    onClick={() => {
                      const entry = subCategory[key];
                      protectAction(() => {
                        setSelectedSubCategory(key);
                        setFilter(entry.filter);
                      }, {
                        module: entry.module,
                        description: t('security.openReport', { report: key })
                      });
                    }}
                    key={key}
                  >
                    {key}
                    {selectedSubCategory === key && (
                      <FontAwesomeIcon icon={faCheckCircle} className="text-success-700" size="lg" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="col-span-5">
          <div className="bg-white shadow p-5 rounded-lg">
            <h1 className="text-xl">
              {selectedCategory && selectedSubCategory ? (
                <span className="text-gray-600">{selectedCategory} <FontAwesomeIcon icon={faChevronRight} size="xs" /> {selectedSubCategory}</span>
              ) : t('page.reportFilters')}
            </h1>
            <div className="py-5">
              {filter && filter}
            </div>
          </div>
        </div>
      </div>

    </Layout>
  );
}
