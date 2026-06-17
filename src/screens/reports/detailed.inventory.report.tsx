import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryPurchaseItem} from "@/api/model/inventory_purchase.ts";
import {InventoryPurchaseReturnItem} from "@/api/model/inventory_purchase_return.ts";
import {InventoryIssueItem} from "@/api/model/inventory_issue.ts";
import {InventoryIssueReturnItem} from "@/api/model/inventory_issue_return.ts";
import {InventoryWasteItem} from "@/api/model/inventory_waste.ts";
import {formatNumber} from "@/lib/utils.ts";
import { toJsDate, toLuxonDateTime } from "@/lib/datetime.ts";

type InventoryTransaction = {
  date: string;
  item: string;
  itemCode?: string;
  itemId: string;
  category: string;
  quantity: number;
  unit: string;
  type: string;
  user: string;
  comments?: string;
  balance: number;
};

type ItemBalance = {
  itemId: string;
  itemName: string;
  itemCode?: string;
  category: string;
  unit: string;
  balance: number;
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  const items = params.getAll("items[]").filter(item => item && item.trim() !== "");
  const types = params.getAll("types[]").filter(type => type && type.trim() !== "");
  return {startDate, endDate, itemIds: items, types};
};

export const DetailedInventoryReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [itemBalances, setItemBalances] = useState<ItemBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const conditions: string[] = [];
        const params: Record<string, string> = {};

        if (filters.startDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") >= $startDate`);
          params.startDate = filters.startDate;
        }

        if (filters.endDate) {
          conditions.push(`time::format(created_at, "${import.meta.env.VITE_DB_DATABASE_FORMAT}") <= $endDate`);
          params.endDate = filters.endDate;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Query parent records first, then get their items
        // Fetch purchases and their items
        const purchaseQuery = `
          SELECT * FROM ${Tables.inventory_purchases}
          ${whereClause}
          ORDER BY created_at ASC
          FETCH items, items.item, items.item.category, created_by
        `;

        // Fetch purchase returns and their items
        const purchaseReturnQuery = `
          SELECT * FROM ${Tables.inventory_purchase_returns}
          ${whereClause}
          ORDER BY created_at ASC
          FETCH items, items.item, items.item.category, created_by
        `;

        // Fetch issues and their items
        const issueQuery = `
          SELECT * FROM ${Tables.inventory_issues}
          ${whereClause}
          ORDER BY created_at ASC
          FETCH items, items.item, items.item.category, created_by
        `;

        // Fetch issue returns and their items
        const issueReturnQuery = `
          SELECT * FROM ${Tables.inventory_issue_returns}
          ${whereClause}
          ORDER BY created_at ASC
          FETCH items, items.item, items.item.category, created_by
        `;

        // Fetch wastes and their items
        const wasteQuery = `
          SELECT * FROM ${Tables.inventory_wastes}
          ${whereClause}
          ORDER BY created_at ASC
          FETCH items, items.item, items.item.category, created_by
        `;

        const [purchaseResult, purchaseReturnResult, issueResult, issueReturnResult, wasteResult] = await Promise.all([
          queryRef.current(purchaseQuery, params),
          queryRef.current(purchaseReturnQuery, params),
          queryRef.current(issueQuery, params),
          queryRef.current(issueReturnQuery, params),
          queryRef.current(wasteQuery, params),
        ]);

        console.log(purchaseResult, purchaseReturnResult, issueResult);

        // SurrealDB returns ActionResult[] - handle both result[0] and result[0].result structures
        const purchases = (purchaseResult?.[0]?.result ?? purchaseResult?.[0] ?? []) as any[];
        const purchaseReturns = (purchaseReturnResult?.[0]?.result ?? purchaseReturnResult?.[0] ?? []) as any[];
        const issues = (issueResult?.[0]?.result ?? issueResult?.[0] ?? []) as any[];
        const issueReturns = (issueReturnResult?.[0]?.result ?? issueReturnResult?.[0] ?? []) as any[];
        const wastes = (wasteResult?.[0]?.result ?? wasteResult?.[0] ?? []) as any[];

        if (import.meta.env.DEV) {
          console.log('Detailed Inventory Report - Purchases:', purchases.length, 'Returns:', purchaseReturns.length, 'Issues:', issues.length, 'Issue Returns:', issueReturns.length, 'Wastes:', wastes.length);
        }

        const allTransactions: InventoryTransaction[] = [];

        // Process purchase items
        purchases.forEach((purchase: any) => {
          const items = purchase.items || [];
          items.forEach((item: any) => {
            const itemId = typeof item.item?.id === "string" 
              ? item.item.id 
              : item.item?.id?.toString?.() ?? String(item.item?.id ?? "");
            allTransactions.push({
              date: purchase.created_at || "",
              item: item.item?.name || "",
              itemCode: item.item?.code,
              itemId: itemId,
              category: item.item?.category?.name || "",
              quantity: item.quantity || 0,
              unit: item.item?.uom || "",
              type: "Purchase",
              user: purchase.created_by?.name || "",
              comments: item.comments || purchase.purchase_comments || purchase.comments || undefined,
              balance: 0, // Will be calculated later
            });
          });
        });

        // Process purchase return items
        purchaseReturns.forEach((purchaseReturn: any) => {
          const items = purchaseReturn.items || [];
          items.forEach((item: any) => {
            const itemId = typeof item.item?.id === "string" 
              ? item.item.id 
              : item.item?.id?.toString?.() ?? String(item.item?.id ?? "");
            allTransactions.push({
              date: purchaseReturn.created_at || "",
              item: item.item?.name || "",
              itemCode: item.item?.code,
              itemId: itemId,
              category: item.item?.category?.name || "",
              quantity: item.quantity || 0,
              unit: item.item?.uom || "",
              type: "Return",
              user: purchaseReturn.created_by?.name || "",
              comments: item.comments || purchaseReturn.comments || undefined,
              balance: 0, // Will be calculated later
            });
          });
        });

        // Process issue items
        issues.forEach((issue: any) => {
          const items = issue.items || [];
          items.forEach((item: any) => {
            const itemId = typeof item.item?.id === "string" 
              ? item.item.id 
              : item.item?.id?.toString?.() ?? String(item.item?.id ?? "");
            allTransactions.push({
              date: issue.created_at || "",
              item: item.item?.name || "",
              itemCode: item.item?.code,
              itemId: itemId,
              category: item.item?.category?.name || "",
              quantity: item.quantity || 0,
              unit: item.item?.uom || "",
              type: "Issue",
              user: issue.created_by?.name || "",
              comments: item.comments || issue.comments || undefined,
              balance: 0, // Will be calculated later
            });
          });
        });

        // Process issue return items
        issueReturns.forEach((issueReturn: any) => {
          const items = issueReturn.items || [];
          items.forEach((item: any) => {
            const itemId = typeof item.item?.id === "string" 
              ? item.item.id 
              : item.item?.id?.toString?.() ?? String(item.item?.id ?? "");
            allTransactions.push({
              date: issueReturn.created_at || "",
              item: item.item?.name || "",
              itemCode: item.item?.code,
              itemId: itemId,
              category: item.item?.category?.name || "",
              quantity: item.quantity || 0,
              unit: item.item?.uom || "",
              type: "Issue Return",
              user: issueReturn.created_by?.name || "",
              comments: item.comments || issueReturn.comments || undefined,
              balance: 0, // Will be calculated later
            });
          });
        });

        // Process waste items
        wastes.forEach((waste: any) => {
          const items = waste.items || [];
          items.forEach((item: any) => {
            const itemId = typeof item.item?.id === "string" 
              ? item.item.id 
              : item.item?.id?.toString?.() ?? String(item.item?.id ?? "");
            allTransactions.push({
              date: waste.created_at || "",
              item: item.item?.name || "",
              itemCode: item.item?.code,
              itemId: itemId,
              category: item.item?.category?.name || "",
              quantity: item.quantity || 0,
              unit: item.item?.uom || "",
              type: "Waste",
              user: waste.created_by?.name || "",
              comments: item.comments || waste.comments || undefined,
              balance: 0, // Will be calculated later
            });
          });
        });

        // Filter by selected items if provided
        let filteredTransactions = allTransactions;
        if (filters.itemIds.length > 0) {
          // Normalize item IDs for comparison - handle both full record IDs and just the ID part
          const normalizeId = (id: string): string => {
            const parts = id.split(':');
            return parts.length > 1 ? parts[parts.length - 1] : id;
          };
          
          const normalizedFilterIds = new Set(filters.itemIds.map(normalizeId));
          
          filteredTransactions = filteredTransactions.filter(transaction => {
            const normalizedItemId = normalizeId(transaction.itemId);
            return normalizedFilterIds.has(normalizedItemId) || normalizedFilterIds.has(transaction.itemId);
          });
        }

        // Filter by selected types if provided
        if (filters.types.length > 0) {
          filteredTransactions = filteredTransactions.filter(transaction => 
            filters.types.includes(transaction.type)
          );
        }

        // Sort by date ascending
        filteredTransactions.sort((a, b) => {
          const dateA = toJsDate(a.date).getTime();
          const dateB = toJsDate(b.date).getTime();
          if (dateA !== dateB) {
            return dateA - dateB;
          }
          // If same date, sort by item name for consistency
          return a.item.localeCompare(b.item);
        });

        // Calculate accumulated balance for each item
        // Balance formula: + purchases - issue + issue return - waste - purchase return
        const itemBalances = new Map<string, number>();
        const itemDetails = new Map<string, { name: string; code?: string; category: string; unit: string }>();
        
        const transactionsWithBalance = filteredTransactions.map(transaction => {
          const currentBalance = itemBalances.get(transaction.itemId) || 0;
          let balanceChange = 0;
          
          // Store item details for balance table
          if (!itemDetails.has(transaction.itemId)) {
            itemDetails.set(transaction.itemId, {
              name: transaction.item,
              code: transaction.itemCode,
              category: transaction.category,
              unit: transaction.unit,
            });
          }
          
          switch (transaction.type) {
            case "Purchase":
              balanceChange = transaction.quantity;
              break;
            case "Issue":
              balanceChange = -transaction.quantity;
              break;
            case "Issue Return":
              balanceChange = transaction.quantity;
              break;
            case "Waste":
              balanceChange = -transaction.quantity;
              break;
            case "Return": // Purchase Return
              balanceChange = -transaction.quantity;
              break;
            default:
              balanceChange = 0;
          }
          
          const newBalance = currentBalance + balanceChange;
          itemBalances.set(transaction.itemId, newBalance);
          
          return {
            ...transaction,
            balance: newBalance,
          };
        });

        // Create balance summary for separate table
        const balanceSummary: ItemBalance[] = Array.from(itemBalances.entries()).map(([itemId, balance]) => {
          const details = itemDetails.get(itemId)!;
          return {
            itemId,
            itemName: details.name,
            itemCode: details.code,
            category: details.category,
            unit: details.unit,
            balance,
          };
        }).sort((a, b) => a.itemName.localeCompare(b.itemName));

        setTransactions(transactionsWithBalance);
        setItemBalances(balanceSummary);
      } catch (err) {
        console.error("Failed to load detailed inventory report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.startDate, filters.endDate, filters.itemIds, filters.types]);

  if (loading) {
    return (
      <ReportsLayout title={t('reports.detailedInventory')} subtitle={subtitle}>
        <div className="py-12 text-center text-neutral-500">{t('loading.inventory')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('reports.detailedInventory')} subtitle={subtitle}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  return (
    <ReportsLayout title={t('reports.detailedInventory')} subtitle={subtitle}>
      <div className="space-y-8">
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
            <tr>
              <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-neutral-700">
                Date
              </th>
              <th scope="col" className="py-3.5 px-3 text-left text-sm font-semibold text-neutral-700">
                Item
              </th>
              <th scope="col" className="py-3.5 px-3 text-left text-sm font-semibold text-neutral-700">
                Category
              </th>
              <th scope="col" className="py-3.5 px-3 text-right text-sm font-semibold text-neutral-700">
                Quantity
              </th>
              <th scope="col" className="py-3.5 px-3 text-left text-sm font-semibold text-neutral-700">
                Type
              </th>
              <th scope="col" className="py-3.5 px-3 text-left text-sm font-semibold text-neutral-700">
                User
              </th>
              <th scope="col" className="py-3.5 pl-3 pr-6 text-left text-sm font-semibold text-neutral-700">
                Comments
              </th>
            </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
            {transactions.length > 0 ? (
              transactions.map((transaction, index) => (
                <tr key={`${transaction.date}-${transaction.item}-${transaction.type}-${index}`}>
                  <td className="py-4 pl-6 pr-3 text-sm text-neutral-700">
                    {transaction.date ? toLuxonDateTime(transaction.date).toFormat(import.meta.env.VITE_DATE_FORMAT) : ""}
                  </td>
                  <td className="py-4 px-3 text-sm font-medium text-neutral-800">
                    {transaction.item}{transaction.itemCode ? ` (${transaction.itemCode})` : ""}
                  </td>
                  <td className="py-4 px-3 text-sm text-neutral-700">
                    {transaction.category}
                  </td>
                  <td className="py-4 px-3 text-sm text-right text-neutral-700">
                    {formatNumber(transaction.quantity)} {transaction.unit}
                  </td>
                  <td className="py-4 px-3 text-sm text-neutral-700">
                    {transaction.type}
                  </td>
                  <td className="py-4 px-3 text-sm text-neutral-700">
                    {transaction.user}
                  </td>
                  <td className="py-4 pl-3 pr-6 text-sm text-neutral-700">
                    {transaction.comments || "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-neutral-500">
                  No inventory transactions found for the selected period.
                </td>
              </tr>
            )}
            </tbody>
          </table>
        </div>

        {itemBalances.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-neutral-200">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
              <tr>
                <th scope="col" className="py-3.5 pl-6 pr-3 text-left text-sm font-semibold text-neutral-700">
                  Item
                </th>
                <th scope="col" className="py-3.5 px-3 text-left text-sm font-semibold text-neutral-700">
                  Category
                </th>
                <th scope="col" className="py-3.5 px-3 text-right text-sm font-semibold text-neutral-700">
                  Balance
                </th>
              </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
              {itemBalances.map((itemBalance) => (
                <tr key={itemBalance.itemId}>
                  <td className="py-4 pl-6 pr-3 text-sm font-medium text-neutral-800">
                    {itemBalance.itemName}{itemBalance.itemCode ? ` (${itemBalance.itemCode})` : ""}
                  </td>
                  <td className="py-4 px-3 text-sm text-neutral-700">
                    {itemBalance.category}
                  </td>
                  <td className="py-4 px-3 text-sm text-right text-neutral-700 font-medium">
                    {formatNumber(itemBalance.balance)} {itemBalance.unit}
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ReportsLayout>
  );
};

