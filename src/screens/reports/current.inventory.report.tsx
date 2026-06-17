import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {formatNumber} from "@/lib/utils.ts";
import {StringRecordId} from "surrealdb";

type InventoryBalance = {
  itemId: string;
  itemName: string;
  itemCode?: string;
  category: string;
  storeId: string;
  storeName: string;
  quantity: number;
  unit: string;
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const items = params.getAll("items[]").filter(item => item && item.trim() !== "");
  return {itemIds: items};
};

const toRecordId = (value?: string | { toString(): string }) => {
  if (!value) return undefined;
  const stringValue = typeof value === "string" ? value : value.toString();
  return new StringRecordId(stringValue);
};

const getTotalFromResult = (result: any): number => {
  if (!result || !Array.isArray(result) || result.length === 0) return 0;
  const first = result[0];
  // Handle ActionResult structure: {result: [...]}
  if (first?.result && Array.isArray(first.result)) {
    return Number(first.result[0]?.total ?? 0);
  }
  // Handle direct array structure: [{total: number}]
  if (Array.isArray(first) && first.length > 0) {
    return Number(first[0]?.total ?? 0);
  }
  // Handle direct object with total: {total: number}
  return Number(first?.total ?? 0);
};

export const CurrentInventoryReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const queryRef = useRef(db.query);
  const [balances, setBalances] = useState<InventoryBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all items (or filtered items)
        let itemsQuery = `SELECT * FROM ${Tables.inventory_items} FETCH category`;
        if (filters.itemIds.length > 0) {
          // Build OR conditions for each item ID
          const itemConditions = filters.itemIds.map((_id, index) => {
            const paramName = `itemId${index}`;
            return `id = $${paramName}`;
          }).join(" OR ");
          itemsQuery = `SELECT * FROM ${Tables.inventory_items} WHERE ${itemConditions} FETCH category`;
        }

        // Fetch all stores
        const storesQuery = `SELECT * FROM ${Tables.inventory_stores}`;

        // Build params for items query if filtering
        const itemsParams: Record<string, string> = {};
        if (filters.itemIds.length > 0) {
          filters.itemIds.forEach((id, index) => {
            itemsParams[`itemId${index}`] = id;
          });
        }

        const [itemsResult, storesResult] = await Promise.all([
          queryRef.current(itemsQuery, itemsParams),
          queryRef.current(storesQuery),
        ]);

        // SurrealDB returns ActionResult[] - handle both result[0] and result[0].result structures
        const items = (itemsResult?.[0]?.result ?? itemsResult?.[0] ?? []) as InventoryItem[];
        const stores = (storesResult?.[0]?.result ?? storesResult?.[0] ?? []) as InventoryStore[];

        if (import.meta.env.DEV) {
          console.log('Current Inventory Report - Items:', items.length, 'Stores:', stores.length);
        }

        if (items.length === 0) {
          setBalances([]);
          setLoading(false);
          return;
        }

        if (stores.length === 0) {
          setBalances([]);
          setLoading(false);
          return;
        }

        // Calculate balance for each item-store combination
        const balancePromises: Promise<InventoryBalance>[] = [];

        for (const item of items) {
          for (const store of stores) {
            balancePromises.push(
              (async () => {
                const params = {
                  item: toRecordId(item.id),
                  store: toRecordId(store.id),
                };

                const [
                  purchaseResult,
                  returnResult,
                  issueResult,
                  issueReturnResult,
                  wasteResult,
                ] = await Promise.all([
                  queryRef.current(
                    `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_items} WHERE item = $item AND store = $store GROUP ALL`,
                    params
                  ),
                  queryRef.current(
                    `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_return_items} WHERE item = $item AND purchase_item.store = $store GROUP ALL`,
                    params
                  ),
                  queryRef.current(
                    `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_items} WHERE item = $item AND store = $store GROUP ALL`,
                    params
                  ),
                  queryRef.current(
                    `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_return_items} WHERE item = $item AND store = $store GROUP ALL`,
                    params
                  ),
                  queryRef.current(
                    `SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_waste_items} WHERE item = $item AND purchase_item != null AND purchase_item.store = $store GROUP ALL`,
                    params
                  ),
                ]);

                const purchaseTotal = getTotalFromResult(purchaseResult);
                const returnTotal = getTotalFromResult(returnResult);
                const issueTotal = getTotalFromResult(issueResult);
                const issueReturnTotal = getTotalFromResult(issueReturnResult);
                const wasteTotal = getTotalFromResult(wasteResult);

                const netQuantity = purchaseTotal - returnTotal - issueTotal + issueReturnTotal - wasteTotal;

                return {
                  itemId: item.id,
                  itemName: item.name || "",
                  itemCode: item.code,
                  category: item.category?.name || "",
                  storeId: store.id,
                  storeName: store.name || "",
                  quantity: netQuantity,
                  unit: item.uom || "",
                };
              })()
            );
          }
        }

        const allBalances = await Promise.all(balancePromises);
        
        // Filter out items with zero or negative balance, or show all if needed
        // For now, show all balances including zero
        setBalances(allBalances);
      } catch (err) {
        console.error("Failed to load current inventory report", err);
        setError(err instanceof Error ? err.message : t('errors.unableToLoad'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters.itemIds]);

  if (loading) {
    return (
      <ReportsLayout title={t('reports.currentInventory')}>
        <div className="py-12 text-center text-neutral-500">{t('loading.inventory')}</div>
      </ReportsLayout>
    );
  }

  if (error) {
    return (
      <ReportsLayout title={t('reports.currentInventory')}>
        <div className="py-12 text-center text-red-600">{t('errors.failedToLoad', { error })}</div>
      </ReportsLayout>
    );
  }

  // Sort balances by item name, then store name
  const sortedBalances = [...balances].sort((a, b) => {
    const itemCompare = a.itemName.localeCompare(b.itemName);
    if (itemCompare !== 0) return itemCompare;
    return a.storeName.localeCompare(b.storeName);
  });

  return (
    <ReportsLayout title={t('reports.currentInventory')}>
      <div className="space-y-8">
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
              <th scope="col" className="py-3.5 px-3 text-left text-sm font-semibold text-neutral-700">
                Store
              </th>
              <th scope="col" className="py-3.5 px-3 text-right text-sm font-semibold text-neutral-700">
                Current Balance
              </th>
            </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
            {sortedBalances.length > 0 ? (
              sortedBalances.map((balance, index) => (
                <tr key={`${balance.itemId}-${balance.storeId}-${index}`}>
                  <td className="py-4 pl-6 pr-3 text-sm font-medium text-neutral-800">
                    {balance.itemName}{balance.itemCode ? ` (${balance.itemCode})` : ""}
                  </td>
                  <td className="py-4 px-3 text-sm text-neutral-700">
                    {balance.category}
                  </td>
                  <td className="py-4 px-3 text-sm text-neutral-700">
                    {balance.storeName}
                  </td>
                  <td className="py-4 px-3 text-sm text-right text-neutral-700">
                    {formatNumber(balance.quantity)} {balance.unit}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-neutral-500">
                  No inventory items found.
                </td>
              </tr>
            )}
            </tbody>
          </table>
        </div>
      </div>
    </ReportsLayout>
  );
};

