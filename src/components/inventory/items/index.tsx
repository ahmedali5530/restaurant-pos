import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus, faUpload} from "@fortawesome/free-solid-svg-icons";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {InventoryItemForm} from "@/components/inventory/items/form.tsx";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {createInventoryItemImportConfig} from "@/components/inventory/items/item.import.config.ts";
import {useDB} from "@/api/db/db.ts";
import {getReorderLevelForStore} from "@/utils/inventory.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";

export const InventoryItems = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const loadHook = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 10, ['category', 'suppliers', 'locations', 'stores']);
  const db = useDB();

  const [data, setData] = useState<InventoryItem>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const smartImportConfig = useMemo(
    () => createInventoryItemImportConfig({db, t}),
    [db, t]
  );

  const columnHelper = createColumnHelper<InventoryItem>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("code", {
      header: t('columns.code'),
    }),
    columnHelper.accessor(row => row.category?.name ?? "", {
      id: "category",
      header: t('columns.category')
    }),
    columnHelper.accessor("uom", {
      header: t('columns.uom')
    }),
    columnHelper.accessor("base_quantity", {
      header: t('columns.baseQuantity')
    }),
    columnHelper.accessor("price", {
      header: t('columns.price')
    }),
    columnHelper.accessor("average_price", {
      header: t('columns.averagePrice')
    }),
    columnHelper.accessor("reorder_levels", {
      header: t('columns.reorderLevels'),
      cell: info => {
        const item = info.row.original;
        const locs = item.locations ?? item.stores ?? [];
        const tags = locs
          .map(loc => {
            const level = getReorderLevelForStore(item, loc.id);
            return level > 0 ? `${loc.name}: ${level}` : null;
          })
          .filter(Boolean);

        if (tags.length === 0) {
          return <span className="text-neutral-400">-</span>;
        }

        return (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, index) => (
              <span className="tag" key={index}>{tag}</span>
            ))}
          </div>
        );
      },
    }),
    columnHelper.accessor("item_types", {
      header: t('itemType.label')
    }),
    columnHelper.accessor((row) => row.locations ?? row.stores ?? [], {
      id: "locations",
      header: t('tabs.locations'),
      cell: info => (
        <div className="flex flex-wrap gap-2">
          {info.getValue()?.map((loc, index) => (
            <span className="tag" key={loc.id ?? index}>{loc.name}</span>
          ))}
        </div>
      )
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
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <>
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
          </>
        );
      },
    }),
  ];

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button variant="primary" onClick={() => {
            setFormModal(true);
          }} icon={faPlus}> Item</Button>,
          <Button variant="primary" onClick={() => {
            setImportModal(true);
          }} icon={faUpload}>{t('common:actions.smartImport', {defaultValue: 'Smart Import'})}</Button>
        ]}
      />

      {formModal && (
        <InventoryItemForm
          open={true}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
          data={data}
        />
      )}

      {importModal && (
        <DataImportModal
          isOpen
          onClose={() => {
            setImportModal(false);
            loadHook.fetchData();
          }}
          config={smartImportConfig}
          title={t('forms.smartImportItemsTitle', {defaultValue: 'Smart import items'})}
          enableImportModes
          defaultMatchFields={['code']}
          onExport={async () => {
            const [items] = await db.query(
              `SELECT * FROM ${Tables.inventory_items} FETCH category, suppliers, locations, stores`
            );
            return (items as InventoryItem[]).map((item) => {
              const locs = item.locations ?? item.stores ?? [];
              return {
                name: item.name ?? '',
                code: item.code ?? '',
                category: item.category?.name ?? '',
                uom: item.uom ?? '',
                base_quantity: String(item.base_quantity ?? ''),
                price: String(item.price ?? ''),
                average_price: String(item.average_price ?? ''),
                locations: locs.map((l) => l.name).join(','),
                suppliers: (item.suppliers ?? []).map((s) => s.name).join(','),
                item_types: (item.item_types ?? []).join(','),
                reorder_levels: locs
                  .map((loc) => {
                    const level = getReorderLevelForStore(item, loc.id);
                    return level > 0 ? `${loc.name}:${level}` : null;
                  })
                  .filter(Boolean)
                  .join(','),
              };
            });
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}
    </>
  )
}
