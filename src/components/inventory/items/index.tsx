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

export const InventoryItems = () => {
  const { t } = useTranslation('inventory');
  const loadHook = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 10, ['category', 'suppliers', 'stores']);
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
    columnHelper.accessor("stores", {
      header: t('tabs.stores'),
      cell: info => (
        <div className="flex flex-wrap gap-2">
          {info.getValue()?.map((store, index) => (
            <span className="tag" key={store.id ?? index}>{store.name}</span>
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
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></Button>
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
            name: 'stores',
            label: t('tabs.stores')
          }, {
            name: 'suppliers',
            label: t('tabs.suppliers')
          }]}
          onCreateRow={async (data) => {
            try{
              const [category] = await db.query(`select * from ${Tables.inventory_categories} where name = $name`, {
                name: data.category
              });

              if(category.length === 0){
                throw new Error(`Invalid category "${data.category}"`);
              }

              const stores = [];
              for(const store of data.stores.split(',')){
                const [dbStore] = await db.query(`select * from ${Tables.inventory_stores} where name = $name`, {
                  name: store.trim()
                });

                if(dbStore.length === 0){
                  throw new Error(`Invalid store "${store}"`);
                }

                stores.push(dbStore[0].id);
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

              await db.create(Tables.inventory_items, {
                name: data.name,
                code: data.code,
                uom: data.uom,
                category: category[0].id,
                base_quantity: Number(data.base_quantity),
                suppliers: suppliers,
                stores: stores,
                price: Number(data.price),
                average_price: Number(data.average_price)
              });

            }catch(e){
              throw e;
            }
          }}
        />
      )}
    </>
  );
}