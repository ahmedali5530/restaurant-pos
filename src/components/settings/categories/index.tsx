import {useState} from "react";
import {Tables} from "@/api/db/tables.ts";
import {Category} from "@/api/model/category.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {createColumnHelper, RowSelectionState} from "@tanstack/react-table";
import {Button} from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCheck, faPencil, faPlus, faTimes, faUpload} from "@fortawesome/free-solid-svg-icons";
import {TableComponent} from "@/components/common/table/table.tsx";
import {CategoryForm} from "@/components/settings/categories/category.form.tsx";
import {CategoryBulkForm} from "@/components/settings/categories/category.bulk.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {truthy} from "@/lib/utils.ts";
import {CsvUploadModal} from "@/components/common/table/csv.uploader.tsx";
import {Checkbox} from "@/components/common/input/checkbox";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {
  assertCsvMatchValues,
  buildMatchConditions,
  findCsvImportMatches,
  writeCsvImportRow,
} from "@/utils/csv-import.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";

export const AdminCategories = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Category>>(Tables.categories, ['deleted_at = none']);
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<Category>();
  const [formModal, setFormModal] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkEdit, setBulkEdit] = useState({
    state: false,
    data: [] as Category[]
  });

  const columnHelper = createColumnHelper<Category>();

  const columns: any = [
    {
      id: 'select-col',
      header: ({table}) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()} //or getToggleAllPageRowsSelectedHandler
        />
      ),
      cell: ({row}) => (
        <Checkbox
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    },
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("show_in_menu", {
      header: t('columns.showInMenu'),
      cell: info => info.getValue() ? <FontAwesomeIcon icon={faCheck} className="text-success-500"/> :
        <FontAwesomeIcon icon={faTimes} className="text-danger-500"/>
    }),
    columnHelper.accessor("priority", {
      header: t('columns.priority')
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-3 items-center">
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              onClick={() => {
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'admin.categories.update',
                  description: getAccessRuleChildLabel('admin.categories.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
            <div className="separator"></div>
            <DeleteConfirm message={t('delete.category', { name: info.row.original.name })} onConfirm={() => protectAction(async () => {
              await executeSettingsDelete({
                db,
                id: info.row.original.id,
                entityLabel: t('entities.category'),
                usageChecks: [
                  {
                    query: `SELECT count() AS count FROM ${Tables.dishes} WHERE categories ?= $idRecord AND deleted_at = none GROUP ALL`
                  }
                ],
                onAfter: async () => {
                  loadHook.fetchData();
                }
              });
            }, {
              module: 'admin.categories.delete',
              description: getAccessRuleChildLabel('admin.categories.delete'),
            })}/>
          </div>
        );
      },
    }),
  ];

  const [importModal, setImportModal] = useState(false);

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button variant="primary" onClick={() => {
            protectAction(() => setImportModal(true), {
              module: 'admin.categories.import',
              description: getAccessRuleChildLabel('admin.categories.import'),
            });
          }} icon={faUpload}>{t('buttons.importCategories')}</Button>,
          <Button variant="primary" onClick={() => {
            protectAction(() => {
              setData(undefined);
              setFormModal(true);
            }, {
              module: 'admin.categories.create',
              description: getAccessRuleChildLabel('admin.categories.create'),
            });
          }} icon={faPlus}>{t('buttons.category')}</Button>
        ]}
        enableSelection
        rowSelection={rowSelection}
        onRowSelectionChange={(selectionState, selectedRows) => {
          setRowSelection(selectionState);
          setBulkEdit((prev) => ({
            ...prev,
            data: selectedRows as Category[],
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
              module: 'admin.categories.update',
              description: getAccessRuleChildLabel('admin.categories.update'),
            });
          }} icon={faPencil}>{t('buttons.bulkEdit')}</Button>
        ]}
      />

      {importModal && (
        <CsvUploadModal
          isOpen={true}
          onClose={() => setImportModal(false)}
          enableImportModes
          defaultMatchFields={['name']}
          fields={[{
            name: 'name',
            label: t('columns.name')
          }, {
            name: 'show_in_menu',
            label: t('columns.showInMenu')
          }, {
            name: 'priority',
            label: t('columns.priority')
          }]}
          onImportRow={async (rowData, { mode, matchFields }) => {
            const dishData: any = {
              name: rowData.name,
              show_in_menu: truthy(rowData.show_in_menu),
              priority: Number(rowData.priority),
            };

            assertCsvMatchValues(rowData, matchFields, (field) =>
              t('common:csvImport.emptyMatchValue', { field })
            );

            const conditions = buildMatchConditions(rowData, matchFields, (field, value) => {
              if (field === 'priority') {
                return { column: 'priority', value: Number(value) };
              }
              if (field === 'show_in_menu') {
                return { column: 'show_in_menu', value: truthy(value) };
              }
              return { column: field, value };
            });

            const existing = mode === 'create'
              ? []
              : await findCsvImportMatches(db, Tables.categories, conditions);

            await writeCsvImportRow(db, {
              mode,
              table: Tables.categories,
              existing,
              payload: dishData,
              notFoundMessage: t('common:csvImport.recordNotFound'),
              multipleMatchesMessage: t('common:csvImport.multipleMatches'),
            });
          }}
          onExport={async () => {
            const [categories] = await db.query(
              `SELECT * FROM ${Tables.categories} WHERE deleted_at = none`
            );
            return (categories as Category[]).map((row) => ({
              name: row.name ?? '',
              show_in_menu: row.show_in_menu ? 'true' : 'false',
              priority: String(row.priority ?? ''),
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

      {formModal && (
        <CategoryForm
          open={formModal}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {bulkEdit.state && (
        <CategoryBulkForm
          open={bulkEdit.state}
          data={bulkEdit.data}
          onClose={() => {
            setBulkEdit({
              state: false,
              data: []
            });
            setRowSelection({});
            loadHook.fetchData();
          }}
        />
      )}
    </>
  )
}
