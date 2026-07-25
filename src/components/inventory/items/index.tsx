import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus, faUpload} from "@fortawesome/free-solid-svg-icons";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {InventoryItemForm} from "@/components/inventory/items/form.tsx";
import {CsvUploadModal} from "@/components/common/table/csv.uploader.tsx";
import {useDB} from "@/api/db/db.ts";
import {getReorderLevelForStore} from "@/utils/inventory.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";

export const InventoryItems = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const loadHook = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 10, ['category', 'suppliers', 'locations', 'stores']);
  const db = useDB();

  const [data, setData] = useState<InventoryItem>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

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
          }} icon={faUpload}> Import</Button>
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
        <CsvUploadModal
          isOpen={true}
          onClose={() => {
            setImportModal(false);
            loadHook.fetchData();
          }}
          enableImportModes
          defaultMatchFields={['code']}
          fields={[{
            name: 'name',
            label: t('columns.name')
          }, {
            name: 'code',
            label: t('columns.code')
          }, {
            name: 'category',
            label: t('columns.category')
          }, {
            name: 'uom',
            label: t('columns.uom')
          }, {
            name: 'base_quantity',
            label: t('columns.baseQuantity')
          }, {
            name: 'price',
            label: t('columns.price')
          }, {
            name: 'average_price',
            label: t('columns.avgPrice')
          }, {
            name: 'locations',
            label: t('tabs.locations')
          }, {
            name: 'suppliers',
            label: t('tabs.suppliers')
          }, {
            name: 'item_types',
            label: t('itemType.label')
          }, {
            name: 'reorder_levels',
            label: t('columns.reorderLevels')
          }]}
          onImportRow={async (data, { mode, matchFields }) => {
              const [category] = await db.query(`select * from ${Tables.inventory_categories} where name = $name`, {
                name: data.category
              });

              if(category.length === 0){
                throw new Error(`Invalid category "${data.category}"`);
              }

              const locationNames = (data.locations || data.stores || '').split(',').filter(Boolean);
              const locations: Array<{id: string; name: string}> = [];
              for(const locationName of locationNames){
                const [dbLocation] = await db.query(`select * from ${Tables.inventory_locations} where name = $name`, {
                  name: locationName.trim()
                });

                if(dbLocation.length === 0){
                  throw new Error(`Invalid location "${locationName}"`);
                }

                locations.push({id: dbLocation[0].id, name: dbLocation[0].name});
              }

              const suppliers = [];
              for(const supplier of data.suppliers.split(',')){
                const [dbSupplier] = await db.query(`select * from ${Tables.inventory_suppliers} where name = $name`, {
                  name: supplier.trim()
                });

                if(dbSupplier.length === 0){
                  throw new Error(`Invalid supplier "${supplier}"`);
                }

                suppliers.push(dbSupplier[0].id);
              }

              const reorderLevels: Record<string, number> = {};
              if (data.reorder_levels?.trim()) {
                for (const entry of data.reorder_levels.split(',')) {
                  const [locationName, levelStr] = entry.split(':').map(part => part.trim());
                  if (!locationName || !levelStr) {
                    throw new Error(`Invalid reorder level entry "${entry.trim()}"`);
                  }
                  const location = locations.find(item => item.name === locationName);
                  if (!location) {
                    throw new Error(`Invalid location in reorder levels "${locationName}"`);
                  }
                  const level = Number(levelStr);
                  if (!Number.isFinite(level) || level <= 0) {
                    throw new Error(`Invalid reorder level for "${locationName}"`);
                  }
                  reorderLevels[location.id] = level;
                }
              }

              const payload: any = {
                name: data.name,
                code: data.code,
                uom: data.uom,
                category: category[0].id,
                base_quantity: Number(data.base_quantity),
                suppliers: suppliers,
                locations: locations.map(location => location.id),
                price: Number(data.price),
                average_price: Number(data.average_price),
                reorder_levels: reorderLevels,
              };

              assertCsvMatchValues(data, matchFields, (field) =>
                t('common:csvImport.emptyMatchValue', { field })
              );

              const unsupported = ['category', 'locations', 'suppliers', 'item_types', 'reorder_levels'];
              const conditions = buildMatchConditions(data, matchFields, (field, value) => {
                if (unsupported.includes(field)) {
                  throw new Error(t('common:csvImport.unsupportedMatchField', { field }));
                }
                if (field === 'base_quantity' || field === 'price' || field === 'average_price') {
                  return { column: field, value: Number(value) };
                }
                return { column: field, value };
              });

              const existing = mode === 'create'
                ? []
                : await findCsvImportMatches(db, Tables.inventory_items, conditions, { softDelete: false });

              await writeCsvImportRow(db, {
                mode,
                table: Tables.inventory_items,
                existing,
                payload,
                useCreate: true,
                notFoundMessage: t('common:csvImport.recordNotFound'),
                multipleMatchesMessage: t('common:csvImport.multipleMatches'),
              });
          }}
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
        />
      )}
    </>
  );
}