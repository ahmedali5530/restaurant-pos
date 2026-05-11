import {useState} from "react";
import {Tables} from "@/api/db/tables.ts";
import {Category} from "@/api/model/category.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {createColumnHelper, RowSelectionState} from "@tanstack/react-table";
import {Button} from "@/components/common/input/button.tsx";
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
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminCategories = () => {
  const loadHook = useApi<SettingsData<Category>>(Tables.categories, ['deleted_at = none']);
  const db = useDB();

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
      header: 'Name'
    }),
    columnHelper.accessor("show_in_menu", {
      header: 'Show in menu',
      cell: info => info.getValue() ? <FontAwesomeIcon icon={faCheck} className="text-success-500"/> :
        <FontAwesomeIcon icon={faTimes} className="text-danger-500"/>
    }),
    columnHelper.accessor("priority", {
      header: 'Priority'
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
            <DeleteConfirm message={`Delete category ${info.row.original.name}`} onConfirm={async () => {
              await executeSettingsDelete({
                db,
                id: info.row.original.id,
                entityLabel: 'Category',
                usageChecks: [
                  {
                    query: `SELECT count() AS count FROM ${Tables.dishes} WHERE categories ?= $idRecord AND deleted_at = none GROUP ALL`
                  }
                ],
                onAfter: async () => {
                  loadHook.fetchData();
                }
              });
            }}/>
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
            setImportModal(true);
          }} icon={faUpload}> Import Categories</Button>,
          <Button variant="primary" onClick={() => {
            setFormModal(true);
          }} icon={faPlus}> Category</Button>
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
          }, {
            name: 'show_in_menu',
            label: 'Show in menu'
          }, {
            name: 'priority',
            label: 'Priority'
          }]}
          onCreateRow={async (rowData) => {
            try {
              const dishData: any = {
                name: rowData.name,
                show_in_menu: truthy(rowData.show_in_menu),
                priority: Number(rowData.priority),
              };

              await db.insert(Tables.categories, dishData);

            } catch (e) {
              throw new Error(e)
            }
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
