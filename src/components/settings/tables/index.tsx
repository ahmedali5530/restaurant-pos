import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper, RowSelectionState } from "@tanstack/react-table";
import { Table } from "@/api/model/table.ts";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {faCheck, faLock, faPencil, faPlus, faUpload} from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { TableForm } from "@/components/settings/tables/table.form.tsx";
import { TableBulkForm } from "@/components/settings/tables/table.bulk.form.tsx";
import { useDB } from "@/api/db/db.ts";
import {toRecordId, truthy} from "@/lib/utils.ts";
import {CsvUploadModal} from "@/components/common/table/csv.uploader.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminTables = () => {
  const loadHook = useApi<SettingsData<Table>>(Tables.tables, ['deleted_at = none'], [], 0, 10, ['floor', 'categories', 'payment_types', 'order_types']);
  const db = useDB();

  const [data, setData] = useState<Table>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkEdit, setBulkEdit] = useState({
    state: false,
    data: [] as Table[]
  });

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
      header: 'Name'
    }),
    columnHelper.accessor("number", {
      header: 'Number'
    }),
    columnHelper.accessor("ask_for_covers", {
      header: 'Ask for number of covers',
      cell: info => info.getValue() ? <FontAwesomeIcon icon={faCheck} className="text-success-500" /> : null,
      enableColumnFilter: false
    }),
    columnHelper.accessor("floor", {
      header: 'Floor',
      cell: info => info.getValue()?.name
    }),
    columnHelper.accessor('payment_types', {
      header: 'Payment types',
      cell: info => <div className="flex gap-2 flex-wrap">
        {info.getValue()?.map((item, index) => (
          <span className="tag" key={`${item.id}-${index}`}>{item.name}</span>
        ))}
      </div>,
      enableColumnFilter: false,
      enableSorting: false
    }),
    columnHelper.accessor('order_types', {
      header: 'Order types',
      cell: info => <div className="flex gap-2 flex-wrap">
        {info.getValue()?.map((item, index) => (
          <span className="tag" key={`${item.id}-${index}`}>{item.name}</span>
        ))}
      </div>,
      enableColumnFilter: false,
      enableSorting: false
    }),
    columnHelper.accessor("priority", {
      header: 'Priority'
    }),
    columnHelper.accessor("is_locked", {
      header: 'Locked',
      cell: info => info.getValue() ? <FontAwesomeIcon icon={faLock} title="Click to unlock it" className="text-danger-500 cursor-pointer" onClick={() => releaseTable(info.row.original.id)} /> : null,
      enableColumnFilter: false,
      enableSorting: false
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-3 items-center">
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={`Delete table ${info.row.original.name}${info.row.original.number}`}
              onConfirm={() => deleteItem(info.row.original.id)}
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
      entityLabel: 'Table',
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
            setImportModal(true);
          }} icon={faUpload}> Import tables</Button>,
          <Button variant="primary" onClick={() => {
            setFormModal(true);
          }} icon={faPlus}> Table</Button>
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
            setBulkEdit((prev) => ({
              ...prev,
              state: true,
            }));
          }} icon={faPencil}> Bulk Edit</Button>
        ]}
      />

      {importModal && (
        <CsvUploadModal
          isOpen={true}
          onClose={() => setImportModal(false)}
          fields={[{
            name: 'name',
            label: 'Name'
          },{
            name: 'number',
            label: 'Number'
          },{
            name: 'ask_for_covers',
            label: 'Ask for number of covers'
          },{
            name: 'background',
            label: 'Background color'
          },{
            name: 'color',
            label: 'Font color'
          },{
            name: 'floor',
            label: 'Floor'
          },{
            name: 'priority',
            label: 'Priority'
          },{
            name: 'categories',
            label: 'Categories'
          },{
            name: 'order_types',
            label: 'Order types'
          },{
            name: 'payment_types',
            label: 'Payment types'
          }]}
          onCreateRow={async (rowData) => {
            try{
              const [floor] = await db.query(`SELECT id from ${Tables.floors} where name = $name and deleted_at = none`, {
                name: rowData.floor
              });
              if(floor.length === 0){
                throw new Error('Floor not found');
              }

              const [categories] = await db.query(`SELECT id from ${Tables.categories} where name IN $names and deleted_at = none`, {
                names: rowData.categories.split('|')
              });

              if(categories.length !== rowData?.categories?.split('|')?.filter(item => item !== '')?.length){
                throw new Error('Categories are invalid');
              }

              const [order_types] = await db.query(`SELECT id from ${Tables.order_types} where name IN $names and deleted_at = none`, {
                names: rowData.order_types.split('|')
              });

              if(order_types.length !== rowData?.order_types?.split('|')?.filter(item => item !== '')?.length){
                throw new Error('Order types are invalid');
              }

              const [payment_types] = await db.query(`SELECT id from ${Tables.payment_types} where name IN $names and deleted_at = none`, {
                names: rowData.payment_types.split('|')
              });

              if(payment_types.length !== rowData?.payment_types?.split('|')?.filter(item => item !== '')?.length){
                throw new Error('Payment types are invalid');
              }

              const dishData: any = {
                name: rowData.name,
                number: rowData.number,
                ask_for_covers: truthy(rowData.ask_for_covers),
                background: rowData.background,
                color: rowData.color,
                priority: Number(rowData.priority),
                floor: floor[0].id,
                categories: categories.map(item => toRecordId(item.id)),
                order_types: order_types.map(item => toRecordId(item.id)),
                payment_types: payment_types.map(item => toRecordId(item.id)),
              };

              await db.insert(Tables.tables, dishData);

            }catch(e){
              throw new Error(e)
            }
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
