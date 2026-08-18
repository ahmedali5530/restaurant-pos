import {useMemo, useState} from "react";
import {Dish} from "@/api/model/dish.ts";
import {Tables} from "@/api/db/tables.ts";
import {Button} from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {DishForm} from "@/components/settings/dishes/dish.form.tsx";
import {faPencil, faPhotoFilm, faPlus, faEye} from "@fortawesome/free-solid-svg-icons";
import {createColumnHelper, RowSelectionState} from "@tanstack/react-table";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {createDishImportConfig} from "@/components/settings/dishes/dish.import.config.ts";
import {createDishIngredientsImportConfig} from "@/components/settings/dishes/dish-ingredients.import.config.ts";
import {createDishModifiersImportConfig} from "@/components/settings/dishes/dish-modifiers.import.config.ts";
import {useDB} from "@/api/db/db.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {DishView} from "@/components/settings/dishes/dish.view.tsx";
import {DishBulkForm} from "@/components/settings/dishes/dish.bulk.form.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";

export const AdminDishes = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const db = useDB();
  const { protectAction } = useSecurity();

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

  const smartImportConfig = useMemo(
    () => createDishImportConfig({db, t}),
    [db, t]
  );
  const ingredientsImportConfig = useMemo(
    () => createDishIngredientsImportConfig({db, t}),
    [db, t]
  );
  const modifiersImportConfig = useMemo(
    () => createDishModifiersImportConfig({db, t}),
    [db, t]
  );

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
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'admin.dishes.update',
                  description: getAccessRuleChildLabel('admin.dishes.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.dish', { name: info.row.original.name })}
              onConfirm={() => protectAction(() => deleteItem(info.row.original.id), {
                module: 'admin.dishes.delete',
                description: getAccessRuleChildLabel('admin.dishes.delete'),
              })}
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
            protectAction(() => setImportModal(true), {
              module: 'admin.dishes.import',
              description: getAccessRuleChildLabel('admin.dishes.import'),
            });
          }}><span className="mr-2"><AiSparklesIcon /></span>{t('buttons.smartImportDishes')}</Button>,
          <Button variant="primary" onClick={() => {
            protectAction(() => setIngredientsImportModal(true), {
              module: 'admin.dishes.import',
              description: getAccessRuleChildLabel('admin.dishes.import'),
            });
          }}><span className="mr-2"><AiSparklesIcon /></span>{t('buttons.smartImportIngredients')}</Button>,
          <Button variant="primary" onClick={() => {
            protectAction(() => setModifierGroupsImportModal(true), {
              module: 'admin.dishes.import',
              description: getAccessRuleChildLabel('admin.dishes.import'),
            });
          }}><span className="mr-2"><AiSparklesIcon /></span>{t('buttons.smartImportModifierGroups')}</Button>,
          <Button variant="primary" onClick={() => {
            protectAction(() => {
              setData(undefined);
              setFormModal(true);
            }, {
              module: 'admin.dishes.create',
              description: getAccessRuleChildLabel('admin.dishes.create'),
            });
          }} icon={faPlus} data-testid="admin-add-dishes">{t('buttons.dish')}</Button>
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
            protectAction(() => {
              setBulkEdit((prev) => ({
                ...prev,
                state: true,
              }));
            }, {
              module: 'admin.dishes.update',
              description: getAccessRuleChildLabel('admin.dishes.update'),
            });
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
        <DataImportModal
          isOpen
          onClose={() => setImportModal(false)}
          config={smartImportConfig}
          title={t('forms.smartImportDishesTitle')}
          enableImportModes
          defaultMatchFields={['number']}
          onExport={async () => {
            const [dishes] = await db.query(
              `SELECT * FROM ${Tables.dishes} WHERE deleted_at = none FETCH categories, tax`
            );
            return (dishes as Dish[]).map((d) => ({
              name: d.name ?? '',
              number: d.number ?? '',
              priority: String(d.priority ?? ''),
              price: String(d.price ?? ''),
              cost: String(d.cost ?? ''),
              categories: (d.categories ?? []).map((c) => c.name).join('|'),
              tax: d.tax?.name ?? '',
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

      {ingredientsImportModal && (
        <DataImportModal
          isOpen
          onClose={() => setIngredientsImportModal(false)}
          config={ingredientsImportConfig}
          title={t('forms.smartImportIngredientsTitle', {defaultValue: t('forms.importIngredientsTitle')})}
          enableImportModes
          defaultMatchFields={['dish_number', 'ingredient']}
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
        <DataImportModal
          isOpen
          onClose={() => setModifierGroupsImportModal(false)}
          config={modifiersImportConfig}
          title={t('forms.smartImportModifierGroupsTitle', {defaultValue: t('forms.importModifierGroupsTitle')})}
          enableImportModes
          defaultMatchFields={['dish_number', 'modifier_group']}
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
