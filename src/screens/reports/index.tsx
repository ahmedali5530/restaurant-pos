import {Layout} from "@/screens/partials/layout.tsx";
import {ReactNode, useMemo, useState} from "react";
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

export const Reports = () => {
  const reportCategories = useMemo(() => {
    return {
      // "Audit": {
      //   "Audit": <AuditFilter />
      // },
      "AI": {
        "AI Report": <AiReportFilter />,
      },
      "Dashboard": {
        "Sales dashboard": <SalesDashboardFilter />,
        "Inventory dashboard": <InventoryDashboardFilter />
      },
      "Sales": {
        "Sales Hourly Labour": <SalesHourlyLabourFilter />,
        "Sales Hourly Labour Weekly": <SalesHourlyLabourWeeklyFilter />,
        "Server Sales": <SalesServerFilter />,
        "Sales Summary": <SalesSummaryFilter />,
        "Sales Summary 2": <SalesSummary2Filter />,
        "Sales Weekly": <SalesWeeklyFilter />,
        "Tips": <TipsFilter />,
        "Advanced Sales": <SalesAdvancedFilter />,
        "Delivery Density": <DeliveryDensityFilter />,
        "Discount": <DiscountsFilter />,
        "Tax": <TaxFilter />,
        "Coupon": <CouponFilter />,
        "Voids": <VoidsFilter />,
        // "Tables": <TableSummaryFilter />
      },
      "Orders": {
        "Merge Orders": <MergeOrdersFilter />,
        "Split Orders": <SplitOrdersFilter />,
        "Order Life Cycle": <OrderLifecycleFilter />,
      },
      "Cash closing": {
        "Cash closing": <CashClosingFilter />
      },
      "Operations": {
        "Expense": <ExpenseFilter />,
        "Activity": <ActivityFilter />,
      },
      "Products": {
        "Product Mix Weekly": <ProductMixWeeklyReportFilter/>,
        "Product Mix Summary": <ProductMixSummaryFilter />,
        "Products Hourly": <ProductHourlyFilter />,
        // "Products list": <ProductListFilter />,
      },
      "Inventory": {
        "Current Inventory": <CurrentInventoryFilter />,
        "Detailed Inventory": <DetailedInventoryFilter />,
        "Purchase": <PurchaseFilter />,
        "Purchase Return": <PurchaseReturnFilter />,
        "Issue": <IssueFilter />,
        "Issue Return": <IssueReturnFilter />,
        "Waste": <WasteFilter />,
        "Consumption": <ConsumptionFilter />,
        "Sale vs Inventory": <SaleVsConsumptionFilter />,
      }
    };
  }, []);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [subCategory, setSubCategory] = useState({});
  const [selectedSubCategory, setSelectedSubCategory] = useState('');
  const [filter, setFilter] = useState<ReactNode>();

  const {protectAction} = useSecurity();

  return (
    <Layout containerClassName="p-5">
      <div className="grid grid-cols-9 gap-5">
        <div className="col-span-2">
          <div className="bg-white shadow py-5 rounded-lg">
            <h1 className="text-xl text-gray-600 px-5">Reports</h1>
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
            <h1 className="text-xl text-gray-600 px-5">Sub reports</h1>
            <div className="py-5">
              <ul>
                {Object.keys(subCategory).map((key) => (
                  <li
                    className="border-b py-2 px-5 flex justify-between cursor-pointer hover:bg-gray-100 items-center"
                    onClick={() => {
                      protectAction(() => {
                        setSelectedSubCategory(key);
                        setFilter(subCategory[key]);
                      }, {
                        module: key,
                        description: `Open ${key} report`
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
              ) : 'Report filters'}
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
