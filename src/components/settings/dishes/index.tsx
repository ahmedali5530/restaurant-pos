import {useState} from "react";
import {Dish} from "@/api/model/dish.ts";
import {Tables} from "@/api/db/tables.ts";
import {Button} from "@/components/common/input/button.tsx";
import {DishForm} from "@/components/settings/dishes/dish.form.tsx";
import {faPencil, faPhotoFilm, faPlus, faUpload, faEye} from "@fortawesome/free-solid-svg-icons";
import {createColumnHelper, RowSelectionState} from "@tanstack/react-table";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {CsvUploadModal} from "@/components/common/table/csv.uploader.tsx";
import {useDB} from "@/api/db/db.ts";
import {cn, toRecordId} from "@/lib/utils.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {DishView} from "@/components/settings/dishes/dish.view.tsx";
import {DishBulkForm} from "@/components/settings/dishes/dish.bulk.form.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminDishes = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const db = useDB();

  const loadHook = useApi<SettingsData<Dish & { modifiers: [] }>>(
    Tables.dishes, [`deleted_at = none`], [], 0, 10, ['categories', 'items', 'items.item'], {}, [
      '*',
      '(SELECT out.name from menu_item_modifier_group where in = $parent.id) as modifiers',
      '(SELECT name, modifiers[where modifier.id = $parent.id][0].price as price from modifier_group where array::any(modifiers.modifier.id ?? [], $parent.id)) as modifier_items'
    ]
  );

  const [data, setData] = useState<Dish>();
  const [formModal, setFormModal] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [dishImportModal, setImportModal] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkEdit, setBulkEdit] = useState({
    state: false,
    data: [] as Dish[]
  });

  const columnHelper = createColumnHelper<Dish & {
    modifiers: [{ out: { name: string} }],
    modifier_items: [{ name: string, price: number }]
  }>();

  const columns: any = [
    {
      id: 'select-col',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()} //or getToggleAllPageRowsSelectedHandler
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    columnHelper.accessor("dish_photo", {
      header: t('columns.photo'),
      cell: info => {
        if (info.getValue()) {
          return <FontAwesomeIcon icon={faPhotoFilm}/>
        }
      },
      enableColumnFilter: false,
      enableSorting: false,
    }),
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("number", {
      header: t('columns.number'),
    }),
    columnHelper.accessor("priority", {
      header: t('columns.priority')
    }),
    columnHelper.accessor("price", {
      header: t('columns.salePrice')
    }),
    columnHelper.accessor("cost", {
      header: t('columns.costPrice')
    }),
    columnHelper.accessor("categories", {
      header: t('columns.categories'),
      cell: info => <div className="flex gap-2 flex-wrap">
        {info.getValue()?.map((item, index) => (
          <span className="tag" key={`${item.id}-${index}`}>{item.name}</span>
        ))}
      </div>,
    }),
    columnHelper.accessor('id', {
      id: 'modifier_groups',
      header: t('columns.modifierGroups'),
      cell: info => (
        <div className="flex gap-2 flex-wrap">
          {info.row.original.modifiers.map((item, index) => (
            <span className="tag" key={index}>{item.out.name}</span>
          ))}
        </div>
      ),
      enableColumnFilter: false,
      enableSorting: false,
    }),
    columnHelper.accessor('id', {
      id: 'modifier_items',
      header: t('columns.usedAsModifier'),
      cell: info => (
        <div className="flex gap-2 flex-wrap">
          {info.row.original.modifier_items.map((item, index) => (
            <span className="tag" key={index}>{item.name} — {item.price}</span>
          ))}
        </div>
      ),
      enableColumnFilter: false,
      enableSorting: false,
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-3 items-center">
            <Button
              variant="secondary"
              onClick={() => {
                setData(info.row.original);
                setViewModal(true);
              }}
            ><FontAwesomeIcon icon={faEye}/></Button>
            <div className="separator"></div>
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.dish', { name: info.row.original.name })}
              onConfirm={() => deleteItem(info.row.original.id)}
            />
          </div>
        );
      },
    }),
  ];

  const deleteItem = async (id: string) => {
    await executeSettingsDelete({
      db,
      id,
      entityLabel: t('entities.dish'),
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.order_items} WHERE item = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.menu_menu_items} WHERE menu_item = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.modifier_groups} WHERE array::any(modifiers.modifier.id ?? [], $idRecord) GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.kitchens} WHERE items ?= $idRecord GROUP ALL`
        }
      ],
      cleanupQueries: [
        {
          query: `DELETE ${Tables.dishes_recipes} WHERE menu_item = $idRecord`
        },
        {
          query: `DELETE ${Tables.dish_modifier_groups} WHERE in = $idRecord`
        },
        {
          query: `DELETE ${Tables.menu_menu_items} WHERE menu_item = $idRecord`
        }
      ],
      onAfter: async () => {
        loadHook.fetchData();
      }
    });
  }

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button variant="primary" onClick={() => {
            setImportModal(true);
          }} icon={faUpload}>{t('buttons.importDishes')}</Button>,
          <Button variant="primary" onClick={() => {
            setFormModal(true);
          }} icon={faPlus}>{t('buttons.dish')}</Button>
        ]}
        customSearch
        customSearchHandler={(value) => {
          loadHook.resetFilters();

          loadHook.addFilter('string::lowercase(name) contains $name or array::any(categories, |$var|string::lowercase($var.name) contains $name)', 'and');
          loadHook.handleParameterChange({
            name: value
          })
        }}
        enableSelection
        rowSelection={rowSelection}
        onRowSelectionChange={(selectionState, selectedRows) => {
          setRowSelection(selectionState);
          setBulkEdit((prev) => ({
            ...prev,
            data: selectedRows as Dish[],
          }));
        }}
        selectionButtons={[
          <Button variant="primary" onClick={() => {
            setBulkEdit((prev) => ({
              ...prev,
              state: true,
            }));
          }} icon={faPencil}>{t('buttons.bulkEdit')}</Button>
        ]}
      />

      {bulkEdit.state && (
        <DishBulkForm
          open={bulkEdit.state}
          data={bulkEdit.data}
          onClose={() => {
            loadHook.fetchData();
            setRowSelection({});
            setBulkEdit({
              state: false,
              data: [],
            });
          }}
        />
      )}

      {dishImportModal && (
        <CsvUploadModal
          isOpen={true}
          onClose={() => setImportModal(false)}
          fields={[{
            name: 'name',
            label: t('columns.name')
          }, {
            name: 'number',
            label: t('columns.number')
          }, {
            name: 'priority',
            label: t('columns.priority')
          }, {
            name: 'sale_price',
            label: t('columns.salePrice')
          }, {
            name: 'cost_price',
            label: t('columns.costPrice')
          }, {
            name: 'categories',
            label: t('columns.categories')
          }]}
          onCreateRow={async (rowData) => {
            try {
              const [categories] = await db.query(`SELECT id
                                                   from ${Tables.categories}
                                                   where name IN $names and deleted_at = none`, {
                names: rowData.categories.split('|')
              });

              if (categories.length !== rowData?.categories?.split('|')?.filter(item => item !== '')?.length) {
                throw new Error(t('toast:admin.invalidCategories'));
              }

              const dishData: any = {
                name: rowData.name,
                number: rowData.number,
                // position: data.position,
                priority: Number(rowData.priority),
                price: Number(rowData.sale_price),
                cost: Number(rowData.cost_price),
                categories: categories.map(item => toRecordId(item.id))
              };

              await db.insert(Tables.dishes, dishData);

            } catch (e) {
              throw new Error(e)
            }
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

      {formModal && (
        <DishForm
          open={formModal}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {viewModal && data && (
        <DishView
          open={true}
          onClose={() => setViewModal(false)}
          data={data}
        />
      )}

    </>
  )
}
