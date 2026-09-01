import {useEffect, useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {formatNumber} from "@/lib/utils.ts";
import { toJsDate, toLuxonDateTime } from "@/lib/datetime.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import {fetchLedgerMovements} from "@/lib/inventory/ledger.service.ts";

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
  locationName?: string;
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

const REFERENCE_TYPE_LABEL: Record<string, string> = {
  purchase: "Purchase",
  purchase_return: "Return",
  issue: "Issue",
  issue_return: "Issue Return",
  waste: "Waste",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  production_input: "Production Out",
  production_output: "Production In",
  buffet_consumption: "Buffet Consumption",
  adjustment: "Adjustment",
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const startDate = params.get("start") || params.get("start");
  const endDate = params.get("end") || params.get("end");
  const items = params.getAll("items[]").filter(item => item && item.trim() !== "");
  const types = params.getAll("types[]").filter(type => type && type.trim() !== "");
  return {startDate, endDate, itemIds: items, types};
};

const normalizeId = (id: string): string => {
  const parts = id.split(":");
  return parts.length > 1 ? parts[parts.length - 1] : id;
};

export const DetailedInventoryReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [itemBalances, setItemBalances] = useState<ItemBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(parseFilters, []);
  const subtitle = filters.startDate && filters.endDate ? `${filters.startDate} to ${filters.endDate}` : undefined;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [movements, itemsResult, locationsResult] = await Promise.all([
          fetchLedgerMovements(db, {
            from: filters.startDate ?? undefined,
            to: filters.endDate ?? undefined,
            excludeReversals: true,
          }),
          db.query(`SELECT id, name, code, uom, category FROM ${Tables.inventory_items} FETCH category`),
          db.query(`SELECT id, name FROM ${Tables.inventory_locations}`),
        ]);

        const items = (itemsResult?.[0] as any[]) || [];
        const locations = (locationsResult?.[0] as any[]) || [];

        const itemByKey = new Map<string, any>();
        items.forEach((item: any) => {
          const full = recordIdToString(item.id) || String(item.id);
          itemByKey.set(full, item);
          itemByKey.set(normalizeId(full), item);
        });

        const locationByKey = new Map<string, any>();
        locations.forEach((location: any) => {
          const full = recordIdToString(location.id) || String(location.id);
          locationByKey.set(full, location);
          locationByKey.set(normalizeId(full), location);
        });

        type Row = InventoryTransaction & { signedChange: number };

        let allTransactions: Row[] = movements.map((row) => {
          const itemKey = recordIdToString(row.inventory_item) || row.inventory_item;
          const locationKey = recordIdToString(row.inventory_location) || row.inventory_location;
          const item = itemByKey.get(itemKey) || itemByKey.get(normalizeId(itemKey));
          const location = locationByKey.get(locationKey) || locationByKey.get(normalizeId(locationKey));
          const type = REFERENCE_TYPE_LABEL[row.reference_type] || row.reference_type;
          const qty = Number(row.quantity_change) || 0;

          return {
            date: row.created_at
              ? String(row.created_at)
              : row.business_date,
            item: item?.name || "",
            itemCode: item?.code,
            itemId: itemKey,
            category: item?.category?.name || "",
            quantity: Math.abs(qty),
            unit: item?.uom || "",
            type,
            user: "",
            locationName: location?.name || "",
            comments: row.notes || row.reference_id || undefined,
            balance: 0,
            signedChange: qty,
          };
        });

        if (filters.itemIds.length > 0) {
          const normalizedFilterIds = new Set(filters.itemIds.map(normalizeId));
          allTransactions = allTransactions.filter((transaction) => {
            const normalizedItemId = normalizeId(transaction.itemId);
            return normalizedFilterIds.has(normalizedItemId) || normalizedFilterIds.has(transaction.itemId);
          });
        }

        if (filters.types.length > 0) {
          allTransactions = allTransactions.filter((transaction) =>
            filters.types.includes(transaction.type)
          );
        }

        allTransactions.sort((a, b) => {
          const dateA = toJsDate(a.date).getTime();
          const dateB = toJsDate(b.date).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return a.item.localeCompare(b.item);
        });

        const balances = new Map<string, number>();
        const itemDetails = new Map<string, { name: string; code?: string; category: string; unit: string }>();

        const transactionsWithBalance = allTransactions.map((transaction) => {
          const currentBalance = balances.get(transaction.itemId) || 0;

          if (!itemDetails.has(transaction.itemId)) {
            itemDetails.set(transaction.itemId, {
              name: transaction.item,
              code: transaction.itemCode,
              category: transaction.category,
              unit: transaction.unit,
            });
          }

          const newBalance = currentBalance + transaction.signedChange;
          balances.set(transaction.itemId, newBalance);

          return {
            date: transaction.date,
            item: transaction.item,
            itemCode: transaction.itemCode,
            itemId: transaction.itemId,
            category: transaction.category,
            quantity: transaction.quantity,
            unit: transaction.unit,
            type: transaction.type,
            user: transaction.user,
            locationName: transaction.locationName,
            comments: transaction.comments,
            balance: newBalance,
          };
        });

        const balanceSummary: ItemBalance[] = Array.from(balances.entries()).map(([itemId, balance]) => {
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
                {t('inventory:columns.location')}
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
                    {transaction.locationName || "—"}
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
                <td colSpan={8} className="py-6 text-center text-sm text-neutral-500">
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
