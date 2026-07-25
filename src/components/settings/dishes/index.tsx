import {useState} from "react";
import {Dish} from "@/api/model/dish.ts";
import {Tables} from "@/api/db/tables.ts";
import {Button} from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {DishForm} from "@/components/settings/dishes/dish.form.tsx";
import {faPencil, faPhotoFilm, faPlus, faUpload, faEye} from "@fortawesome/free-solid-svg-icons";
import {createColumnHelper, RowSelectionState} from "@tanstack/react-table";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {CsvUploadModal} from "@/components/common/table/csv.uploader.tsx";
import {useDB} from "@/api/db/db.ts";
import {toRecordId} from "@/lib/utils.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {DishView} from "@/components/settings/dishes/dish.view.tsx";
import {DishBulkForm} from "@/components/settings/dishes/dish.bulk.form.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {canUseInDishRecipe} from "@/utils/inventoryItemTypes.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";
import {StringRecordId} from "surrealdb";

const parseCsvBool = (value?: string) =>
  ['true', '1', 'yes'].includes((value ?? '').trim().toLowerCase());

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
  const [ingredientsImportModal, setIngredientsImportModal] = useState(false);
  const [modifierGroupsImportModal, setModifierGroupsImportModal] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkEdit, setBulkEdit] = useState({
    state: false,
    data: [] as Dish[]
  });

  const resolveDishByNumber = async (dishNumber: string) => {
    const [dishes] = await db.query(
      `SELECT id, items FROM ${Tables.dishes} WHERE number = $number AND deleted_at = none`,
      {number: dishNumber.trim()}
    );

    if (!dishes?.length) {
      throw new Error(t('toast:admin.invalidDishNumber'));
    }

    return dishes[0];
  };

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
            <IconTooltipButton label={t('common:actions.view')}
              variant="secondary"
              onClick={() => {
                setData(info.row.original);
                setViewModal(true);
              }}
            ><FontAwesomeIcon icon={faEye}/></IconTooltipButton>
            <div className="separator"></div>
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
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
            setIngredientsImportModal(true);
          }} icon={faUpload}>{t('buttons.importIngredients')}</Button>,
          <Button variant="primary" onClick={() => {
            setModifierGroupsImportModal(true);
          }} icon={faUpload}>{t('buttons.importModifierGroups')}</Button>,
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
          title={t('forms.importDishesTitle')}
          enableImportModes
          defaultMatchFields={['number']}
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
          onImportRow={async (rowData, { mode, matchFields }) => {
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
              priority: Number(rowData.priority),
              price: Number(rowData.sale_price),
              cost: Number(rowData.cost_price),
              categories: categories.map(item => toRecordId(item.id))
            };

            assertCsvMatchValues(rowData, matchFields, (field) =>
              t('common:csvImport.emptyMatchValue', { field })
            );

            const conditions = buildMatchConditions(rowData, matchFields, (field, value) => {
              if (field === 'sale_price') {
                return { column: 'price', value: Number(value) };
              }
              if (field === 'cost_price') {
                return { column: 'cost', value: Number(value) };
              }
              if (field === 'priority') {
                return { column: 'priority', value: Number(value) };
              }
              if (field === 'categories') {
                throw new Error(t('common:csvImport.unsupportedMatchField', { field }));
              }
              return { column: field, value };
            });

            const existing = mode === 'create'
              ? []
              : await findCsvImportMatches(db, Tables.dishes, conditions);

            await writeCsvImportRow(db, {
              mode,
              table: Tables.dishes,
              existing,
              payload: dishData,
              notFoundMessage: t('common:csvImport.recordNotFound'),
              multipleMatchesMessage: t('common:csvImport.multipleMatches'),
            });
          }}
          onExport={async () => {
            const [dishes] = await db.query(
              `SELECT * FROM ${Tables.dishes} WHERE deleted_at = none FETCH categories`
            );
            return (dishes as Dish[]).map((d) => ({
              name: d.name ?? '',
              number: d.number ?? '',
              priority: String(d.priority ?? ''),
              sale_price: String(d.price ?? ''),
              cost_price: String(d.cost ?? ''),
              categories: (d.categories ?? []).map((c) => c.name).join('|'),
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

      {ingredientsImportModal && (
        <CsvUploadModal
          isOpen={true}
          onClose={() => setIngredientsImportModal(false)}
          title={t('forms.importIngredientsTitle')}
          fields={[{
            name: 'dish_number',
            label: `${t('buttons.dish')} ${t('columns.number')}`
          }, {
            name: 'ingredient',
            label: t('columns.ingredient')
          }, {
            name: 'quantity',
            label: t('forms.quantity')
          }, {
            name: 'cost',
            label: t('columns.costPrice')
          }, {
            name: 'is_price_locked',
            label: t('columns.isPriceLocked')
          }]}
          onCreateRow={async (rowData) => {
            const dish = await resolveDishByNumber(rowData.dish_number);
            const dishId = toRecordId(dish.id);
            const ingredientKey = rowData.ingredient?.trim();

            if (!ingredientKey) {
              throw new Error(t('toast:admin.invalidIngredient'));
            }

            const [byCode] = await db.query(
              `SELECT id, name, code, price, item_types, item_type FROM ${Tables.inventory_items} WHERE code = $key`,
              {key: ingredientKey}
            );
            let inventoryItem = byCode?.[0];

            if (!inventoryItem) {
              const [byName] = await db.query(
                `SELECT id, name, code, price, item_types, item_type FROM ${Tables.inventory_items} WHERE name = $key`,
                {key: ingredientKey}
              );
              inventoryItem = byName?.[0];
            }

            if (!inventoryItem) {
              throw new Error(t('toast:admin.invalidIngredient'));
            }

            if (!canUseInDishRecipe(inventoryItem)) {
              throw new Error(t('toast:admin.invalidIngredientType'));
            }

            const itemId = toRecordId(inventoryItem.id);
            const [existing] = await db.query(
              `SELECT count() AS count FROM ${Tables.dishes_recipes} WHERE menu_item = $dish AND item = $item GROUP ALL`,
              {dish: dishId, item: itemId}
            );

            if ((existing?.[0]?.count ?? 0) > 0) {
              throw new Error(t('toast:admin.duplicateDishIngredient'));
            }

            const quantity = Number(rowData.quantity);
            if (!Number.isFinite(quantity) || quantity <= 0) {
              throw new Error(t('toast:admin.invalidQuantity'));
            }

            const costValue = rowData.cost?.trim()
              ? Number(rowData.cost)
              : Number(inventoryItem.price ?? 0);
            if (!Number.isFinite(costValue) || costValue < 0) {
              throw new Error(t('toast:admin.invalidCost'));
            }

            const [recipeRecord] = await db.create(Tables.dishes_recipes, {
              menu_item: dishId,
              item: new StringRecordId(itemId.toString()),
              quantity,
              cost: costValue,
              is_price_locked: parseCsvBool(rowData.is_price_locked),
            });

            const existingItems = Array.isArray(dish.items) ? dish.items : [];
            await db.merge(dishId, {
              items: [...existingItems.map((id: any) => toRecordId(id)), toRecordId(recipeRecord.id)],
            });
          }}
          onExport={async () => {
            const [recipes] = await db.query(
              `SELECT *, menu_item.number AS dish_number FROM ${Tables.dishes_recipes} FETCH item, menu_item`
            );
            return ((recipes as any[]) ?? []).map((rec) => ({
              dish_number: String(rec.dish_number ?? rec.menu_item?.number ?? ''),
              ingredient: rec.item?.code || rec.item?.name || '',
              quantity: String(rec.quantity ?? ''),
              cost: String(rec.cost ?? ''),
              is_price_locked: rec.is_price_locked ? 'true' : 'false',
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

      {modifierGroupsImportModal && (
        <CsvUploadModal
          isOpen={true}
          onClose={() => setModifierGroupsImportModal(false)}
          title={t('forms.importModifierGroupsTitle')}
          fields={[{
            name: 'dish_number',
            label: `${t('buttons.dish')} ${t('columns.number')}`
          }, {
            name: 'modifier_group',
            label: t('columns.modifierGroups')
          }, {
            name: 'priority',
            label: t('columns.priority')
          }, {
            name: 'has_required_modifiers',
            label: t('columns.hasRequiredModifiers')
          }, {
            name: 'required_modifiers',
            label: t('forms.requiredModifiers')
          }, {
            name: 'should_auto_open',
            label: t('columns.shouldAutoOpen')
          }, {
            name: 'should_auto_select',
            label: t('columns.shouldAutoSelect')
          }]}
          onCreateRow={async (rowData) => {
            const dish = await resolveDishByNumber(rowData.dish_number);
            const dishId = toRecordId(dish.id);
            const groupName = rowData.modifier_group?.trim();

            if (!groupName) {
              throw new Error(t('toast:admin.invalidModifierGroup'));
            }

            const [groups] = await db.query(
              `SELECT id FROM ${Tables.modifier_groups} WHERE name = $name AND deleted_at = none`,
              {name: groupName}
            );

            if (!groups?.length) {
              throw new Error(t('toast:admin.invalidModifierGroup'));
            }

            const groupId = toRecordId(groups[0].id);
            const [existing] = await db.query(
              `SELECT count() AS count FROM ${Tables.dish_modifier_groups} WHERE in = $dish AND out = $group GROUP ALL`,
              {dish: dishId, group: groupId}
            );

            if ((existing?.[0]?.count ?? 0) > 0) {
              throw new Error(t('toast:admin.duplicateDishModifierGroup'));
            }

            const priority = Number(rowData.priority);
            if (!Number.isFinite(priority)) {
              throw new Error(t('toast:admin.invalidPriority'));
            }

            const hasRequiredModifiers = parseCsvBool(rowData.has_required_modifiers);
            const requiredModifiers = rowData.required_modifiers?.trim()
              ? Number(rowData.required_modifiers)
              : 0;

            if (!Number.isFinite(requiredModifiers) || requiredModifiers < 0) {
              throw new Error(t('toast:admin.invalidRequiredModifiers'));
            }

            await db.query(
              `RELATE $dish->${Tables.dish_modifier_groups}->$group
               SET has_required_modifiers = $has_required_modifiers,
                   should_auto_open = $should_auto_open,
                   required_modifiers = $required_modifiers,
                   should_auto_select = $should_auto_select,
                   priority = $priority`,
              {
                dish: dishId,
                group: groupId,
                has_required_modifiers: hasRequiredModifiers,
                should_auto_open: parseCsvBool(rowData.should_auto_open),
                required_modifiers: requiredModifiers,
                should_auto_select: parseCsvBool(rowData.should_auto_select),
                priority,
              }
            );
          }}
          onExport={async () => {
            const [edges] = await db.query(
              `SELECT *, in.number AS dish_number, out.name AS modifier_group_name
               FROM ${Tables.dish_modifier_groups}
               FETCH in, out`
            );
            return ((edges as any[]) ?? []).map((edge) => ({
              dish_number: String(edge.dish_number ?? edge.in?.number ?? ''),
              modifier_group: edge.modifier_group_name ?? edge.out?.name ?? '',
              priority: String(edge.priority ?? ''),
              has_required_modifiers: edge.has_required_modifiers ? 'true' : 'false',
              required_modifiers: String(edge.required_modifiers ?? 0),
              should_auto_open: edge.should_auto_open ? 'true' : 'false',
              should_auto_select: edge.should_auto_select ? 'true' : 'false',
            }));
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
