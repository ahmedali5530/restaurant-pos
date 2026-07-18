import {useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {formatNumber} from "@/lib/utils.ts";
import {getReorderLevelForStore, isBelowReorderLevel} from "@/utils/inventory.ts";
import {buildRecordInsideCondition} from "@/api/reports/shared/query.ts";
import {recordIdToString, recordToString} from "@/api/reports/shared/records.ts";
import {fetchLedgerNetsByStore} from "@/lib/inventory/ledger.service.ts";

type InventoryBalance = {
  itemId: string;
  itemName: string;
  itemCode?: string;
  category: string;
  locationId: string;
  locationName: string;
  quantity: number;
  unit: string;
  reorderLevel: number;
  belowReorder: boolean;
};

const normalizeKey = (id: unknown): string => {
  const str = recordIdToString(id) || String(id ?? "");
  const colon = str.lastIndexOf(":");
  return colon >= 0 ? str.slice(colon + 1) : str;
};

const parseFilters = () => {
  const params = new URLSearchParams(window.location.search);
  const items = params.getAll("items[]").filter(item => item && item.trim() !== "");
  return {itemIds: items};
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

        let itemsQuery = `SELECT * FROM ${Tables.inventory_items} FETCH category`;
        const itemsParams: Record<string, any> = {};
        if (filters.itemIds.length > 0) {
          const itemFilter = buildRecordInsideCondition('id', filters.itemIds, 'itemIds');
          if (itemFilter.condition) {
            itemsQuery = `SELECT * FROM ${Tables.inventory_items} WHERE ${itemFilter.condition} FETCH category`;
            Object.assign(itemsParams, itemFilter.params);
          }
        }

        const locationsQuery = `SELECT * FROM ${Tables.inventory_locations} WHERE is_active = true`;

        const [itemsResult, locationsResult, ledgerNets] = await Promise.all([
          queryRef.current(itemsQuery, itemsParams),
          queryRef.current(locationsQuery),
          fetchLedgerNetsByStore(db),
        ]);

        const items = (itemsResult?.[0]?.result ?? itemsResult?.[0] ?? []) as InventoryItem[];
        const locations = (locationsResult?.[0]?.result ?? locationsResult?.[0] ?? []) as InventoryLocation[];

        if (import.meta.env.DEV) {
          console.log('Current Inventory Report - Items:', items.length, 'Locations:', locations.length, 'Ledger nets:', ledgerNets.length);
        }

        if (items.length === 0 || locations.length === 0) {
          setBalances([]);
          setLoading(false);
          return;
        }

        const itemByKey = new Map<string, InventoryItem>();
        const allowedItemKeys = new Set<string>();
        for (const item of items) {
          const full = recordToString(item.id);
          itemByKey.set(full, item);
          itemByKey.set(normalizeKey(full), item);
          allowedItemKeys.add(normalizeKey(full));
          allowedItemKeys.add(full);
        }

        const locationByKey = new Map<string, InventoryLocation>();
        for (const location of locations) {
          const full = recordToString(location.id);
          locationByKey.set(full, location);
          locationByKey.set(normalizeKey(full), location);
        }

        const allBalances: InventoryBalance[] = [];
        const seenPairs = new Set<string>();

        for (const row of ledgerNets) {
          const itemKey = normalizeKey(row.itemId);
          if (
            filters.itemIds.length > 0
            && !allowedItemKeys.has(itemKey)
            && !allowedItemKeys.has(row.itemId)
          ) {
            continue;
          }

          const item = itemByKey.get(row.itemId) || itemByKey.get(itemKey);
          if (!item) continue;

          const location =
            locationByKey.get(row.locationId) || locationByKey.get(normalizeKey(row.locationId));
          if (!location) continue;

          const itemId = recordToString(item.id);
          const locationId = recordToString(location.id);
          const pairKey = `${normalizeKey(itemId)}:${normalizeKey(locationId)}`;
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);

          const reorderLevel = getReorderLevelForStore(item, locationId);
          allBalances.push({
            itemId,
            itemName: item.name || "",
            itemCode: item.code,
            category: item.category?.name || "",
            locationId,
            locationName: location.name || "",
            quantity: row.net,
            unit: item.uom || "",
            reorderLevel,
            belowReorder: isBelowReorderLevel(item, locationId, row.net),
          });
        }

        // Zero-stock rows only where reorder is configured and pair is missing
        for (const item of items) {
          const itemId = recordToString(item.id);
          for (const location of locations) {
            const locationId = recordToString(location.id);
            const pairKey = `${normalizeKey(itemId)}:${normalizeKey(locationId)}`;
            if (seenPairs.has(pairKey)) continue;

            const reorderLevel = getReorderLevelForStore(item, locationId);
            if (reorderLevel <= 0) continue;

            seenPairs.add(pairKey);
            allBalances.push({
              itemId,
              itemName: item.name || "",
              itemCode: item.code,
              category: item.category?.name || "",
              locationId,
              locationName: location.name || "",
              quantity: 0,
              unit: item.uom || "",
              reorderLevel,
              belowReorder: true,
            });
          }
        }

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

  // Sort balances by item name, then location name
  const sortedBalances = [...balances].sort((a, b) => {
    const itemCompare = a.itemName.localeCompare(b.itemName);
    if (itemCompare !== 0) return itemCompare;
    return a.locationName.localeCompare(b.locationName);
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
                {t('inventory:columns.location')}
              </th>
              <th scope="col" className="py-3.5 px-3 text-right text-sm font-semibold text-neutral-700">
                Current Balance
              </th>
              <th scope="col" className="py-3.5 px-3 text-right text-sm font-semibold text-neutral-700">
                {t('inventory:columns.reorderLevel')}
              </th>
              <th scope="col" className="py-3.5 px-3 text-center text-sm font-semibold text-neutral-700">
                {t('inventory:status.belowReorder')}
              </th>
            </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
            {sortedBalances.length > 0 ? (
              sortedBalances.map((balance, index) => (
                <tr key={`${balance.itemId}-${balance.locationId}-${index}`}>
                  <td className="py-4 pl-6 pr-3 text-sm font-medium text-neutral-800">
                    {balance.itemName}{balance.itemCode ? ` (${balance.itemCode})` : ""}
                  </td>
                  <td className="py-4 px-3 text-sm text-neutral-700">
                    {balance.category}
                  </td>
                  <td className="py-4 px-3 text-sm text-neutral-700">
                    {balance.locationName}
                  </td>
                  <td className={`py-4 px-3 text-sm text-right ${balance.belowReorder ? 'text-danger-600 font-medium' : 'text-neutral-700'}`}>
                    {formatNumber(balance.quantity)} {balance.unit}
                  </td>
                  <td className="py-4 px-3 text-sm text-right text-neutral-700">
                    {balance.reorderLevel > 0 ? formatNumber(balance.reorderLevel) : '-'}
                  </td>
                  <td className="py-4 px-3 text-sm text-center text-neutral-700">
                    {balance.reorderLevel > 0 ? (balance.belowReorder ? t('common:actions.yes') : t('common:actions.no')) : '-'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-6 text-center text-sm text-neutral-500">
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
