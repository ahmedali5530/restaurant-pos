import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {faCheck, faPencil, faPlus, faTimes} from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { OrderType } from "@/api/model/order_type.ts";
import { OrderTypeForm } from "@/components/settings/order_types/order_type.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminOrderTypes = () => {
  const loadHook = useApi<SettingsData<OrderType>>(Tables.order_types, ['deleted_at = none']);
  const db = useDB();

  const [data, setData] = useState<OrderType>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<OrderType>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: 'Name'
    }),
    columnHelper.accessor("allow_service_charges", {
      header: 'Service charges',
      cell: info => info.getValue() ? <FontAwesomeIcon icon={faCheck} className="text-success-500" /> : <FontAwesomeIcon icon={faTimes} className="text-danger-500" />
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
              message={`Delete order type ${info.row.original.name}`}
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
      entityLabel: 'Order type',
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.tables} WHERE order_types ?= $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.orders} WHERE order_type = $idRecord GROUP ALL`
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
          }} icon={faPlus}> Order type</Button>
        ]}
      />

      {formModal && (
        <OrderTypeForm
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
