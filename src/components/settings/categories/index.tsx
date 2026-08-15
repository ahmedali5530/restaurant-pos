import {useMemo, useState} from "react";
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
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {createCategoryImportConfig} from "@/components/settings/categories/category.import.config.ts";
import {Checkbox} from "@/components/common/input/checkbox";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
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
  const [importModal, setImportModal] = useState(false);

  const smartImportConfig = useMemo(
    () => createCategoryImportConfig({db, t}),
    [db, t]
  );

  const columnHelper = createColumnHelper<Category>();

  const columns: any = [
    {
      id: 'select-col',
      header: ({table}) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
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
          }} icon={faUpload}>{t('buttons.smartImport')}</Button>,
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
        <DataImportModal
          isOpen
          onClose={() => setImportModal(false)}
          config={smartImportConfig}
          title={t('forms.smartImportCategoriesTitle')}
          enableImportModes
          defaultMatchFields={['name']}
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
