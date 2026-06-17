import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {Tables} from "@/api/db/tables.ts";
import {useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import {TableComponent} from "@/components/common/table/table.tsx";
import {InventoryItemForm} from "@/components/inventory/items/form.tsx";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {StoreInventoryCell} from "@/components/inventory/inventory/store.inventory.cell.tsx";


export const InventorySummary = () => {
  const { t } = useTranslation('inventory');
  const loadHook = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 10, ['category', 'suppliers', 'stores']);
  const {
    data: stores
  } = useApi<SettingsData<InventoryStore>>(Tables.inventory_stores, [], [], 0, 99999);

  const [data, setData] = useState<InventoryItem>();

  const columnHelper = createColumnHelper<InventoryItem>();

  const columns = useMemo(() => {
    const c = [
      columnHelper.accessor("name", {
        header: t('columns.name'),
      }),
      columnHelper.accessor("code", {
        header: t('columns.code'),
      }),
      columnHelper.accessor(row => row.category?.name ?? "", {
        id: "category",
        header: t('columns.category')
      }),
      columnHelper.accessor("suppliers", {
        header: t('tabs.suppliers'),
        cell: info => (
          <div className="flex flex-wrap gap-2">
            {info.getValue()?.map((item, index) => (
              <span className="tag" key={item.id ?? index}>{item.name}</span>
            ))}
          </div>
        )
      })
    ];

    if (stores?.data && stores?.data?.length > 0) {
      // eslint-disable-next-line no-unsafe-optional-chaining
      for (const store of stores?.data) {
        c.push(columnHelper.accessor("id", {
          header: `${store.name} store`,
          id: `store-${store.id}`,
          cell: (info) => {
            return <StoreInventoryCell item={info.row.original} storeId={store.id} />;
          }
        }));
      }
    }

    return c;
  }, [columnHelper, stores?.data])

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        enableRefresh={false}
      />
    </>
  );
}