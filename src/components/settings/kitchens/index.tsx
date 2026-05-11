import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Kitchen } from "@/api/model/kitchen.ts";
import { KitchenForm } from "@/components/settings/kitchens/kitchen.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminKitchens = () => {
  const loadHook = useApi<SettingsData<Kitchen>>(Tables.kitchens, ['deleted_at = none'], ['priority asc'], 0, 10, ['items', 'printers']);
  const db = useDB();

  const [data, setData] = useState<Kitchen>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Kitchen>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: 'Name'
    }),
    columnHelper.accessor("printers", {
      header: 'Printers',
      cell: info => info.getValue()?.map(item => <span className="tag" key={item.id}>{item.name}</span>)
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
            <DeleteConfirm
              message={`Delete kitchen ${info.row.original.name}`}
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
      entityLabel: 'Kitchen',
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.order_items_kitchen} WHERE kitchen = $idRecord GROUP ALL`
        }
      ],
      onAfter: async () => {
        loadHook.fetchData();
      }
    });
  };

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button variant="primary" onClick={() => {
            setFormModal(true);
          }} icon={faPlus}> Kitchen</Button>
        ]}
      />

      {formModal && (
        <KitchenForm
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
