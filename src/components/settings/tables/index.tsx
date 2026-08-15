import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useMemo, useState } from "react";
import { createColumnHelper, RowSelectionState } from "@tanstack/react-table";
import { Table } from "@/api/model/table.ts";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {faCheck, faLock, faPencil, faPlus, faUpload} from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { TableForm } from "@/components/settings/tables/table.form.tsx";
import { TableBulkForm } from "@/components/settings/tables/table.bulk.form.tsx";
import { useDB } from "@/api/db/db.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {createTableImportConfig} from "@/components/settings/tables/table.import.config.ts";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";

export const AdminTables = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Table>>(Tables.tables, ['deleted_at = none'], [], 0, 10, ['floor', 'categories', 'payment_types', 'order_types']);
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<Table>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkEdit, setBulkEdit] = useState({
    state: false,
    data: [] as Table[]
  });

  const smartImportConfig = useMemo(
    () => createTableImportConfig({db, t}),
    [db, t]
  );

  const columnHelper = createColumnHelper<Table>();
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
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("number", {
      header: t('columns.number')
    }),
    columnHelper.accessor("ask_for_covers", {
      header: t('columns.askForCovers'),
      cell: info => info.getValue() ? <FontAwesomeIcon icon={faCheck} className="text-success-500" /> : null,
      enableColumnFilter: false
    }),
    columnHelper.accessor("floor", {
      header: t('columns.floor'),
      cell: info => info.getValue()?.name
    }),
    columnHelper.accessor('payment_types', {
      header: t('columns.paymentTypes'),
      cell: info => <div className="flex gap-2 flex-wrap">
        {info.getValue()?.map((item, index) => (
          <span className="tag" key={`${item.id}-${index}`}>{item.name}</span>
        ))}
      </div>,
      enableColumnFilter: false,
      enableSorting: false
    }),
    columnHelper.accessor('order_types', {
      header: t('columns.orderTypes'),
      cell: info => <div className="flex gap-2 flex-wrap">
        {info.getValue()?.map((item, index) => (
          <span className="tag" key={`${item.id}-${index}`}>{item.name}</span>
        ))}
      </div>,
      enableColumnFilter: false,
      enableSorting: false
    }),
    columnHelper.accessor("priority", {
      header: t('columns.priority')
    }),
    columnHelper.accessor("is_locked", {
      header: t('columns.locked'),
      cell: info => info.getValue() ? <FontAwesomeIcon icon={faLock} title={t('columns.clickToUnlock')} className="text-danger-500 cursor-pointer" onClick={() => releaseTable(info.row.original.id)} /> : null,
      enableColumnFilter: false,
      enableSorting: false
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
                  module: 'admin.tables.update',
                  description: getAccessRuleChildLabel('admin.tables.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.table', { name: `${info.row.original.name}${info.row.original.number}` })}
              onConfirm={() => protectAction(() => deleteItem(info.row.original.id), {
                module: 'admin.tables.delete',
                description: getAccessRuleChildLabel('admin.tables.delete'),
              })}
            />
          </div>
        );
      },
    }),
  ];

  const releaseTable = async (id: string) => {
    await db.merge(id, {
      is_locked: false
    });

    loadHook.fetchData();
  }

  const deleteItem = async (id: string) => {
    await executeSettingsDelete({
      db,
      id,
      entityLabel: t('entities.table'),
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.orders} WHERE table = $idRecord GROUP ALL`
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
              module: 'admin.tables.import',
              description: getAccessRuleChildLabel('admin.tables.import'),
            });
          }} icon={faUpload}>{t('buttons.smartImport')}</Button>,
          <Button variant="primary" onClick={() => {
            protectAction(() => {
              setData(undefined);
              setFormModal(true);
            }, {
              module: 'admin.tables.create',
              description: getAccessRuleChildLabel('admin.tables.create'),
            });
          }} icon={faPlus} data-testid="admin-add-tables">{t('buttons.table')}</Button>
        ]}
        enableSelection
        rowSelection={rowSelection}
        onRowSelectionChange={(selectionState, selectedRows) => {
          setRowSelection(selectionState);
          setBulkEdit((prev) => ({
            ...prev,
            data: selectedRows as Table[],
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
              module: 'admin.tables.update',
              description: getAccessRuleChildLabel('admin.tables.update'),
            });
          }} icon={faPencil}>{t('buttons.bulkEdit')}</Button>
        ]}
      />

      {importModal && (
        <DataImportModal
          isOpen
          onClose={() => setImportModal(false)}
          config={smartImportConfig}
          title={t('forms.smartImportTablesTitle')}
          enableImportModes
          defaultMatchFields={['number']}
          onExport={async () => {
            const [tables] = await db.query(
              `SELECT * FROM ${Tables.tables} WHERE deleted_at = none FETCH floor, categories, payment_types, order_types`
            );
            return (tables as Table[]).map((row) => ({
              name: row.name ?? '',
              number: String(row.number ?? ''),
              ask_for_covers: row.ask_for_covers ? 'true' : 'false',
              background: row.background ?? '',
              color: row.color ?? '',
              floor: row.floor?.name ?? '',
              priority: String(row.priority ?? ''),
              categories: (row.categories ?? []).map((c) => c.name).join('|'),
              order_types: (row.order_types ?? []).map((o) => o.name).join('|'),
              payment_types: (row.payment_types ?? []).map((p) => p.name).join('|'),
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

      {bulkEdit.state && (
        <TableBulkForm
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

      {formModal && (
        <TableForm
          open={formModal}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

    </>
  )
}
