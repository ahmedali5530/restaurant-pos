import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { PaymentType } from "@/api/model/payment_type.ts";
import { TableComponent } from "@/components/common/table/table.tsx";
import { PaymentTypeForm } from "@/components/settings/payment_types/payment_type.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminPaymentTypes = () => {
  const loadHook = useApi<SettingsData<PaymentType>>(Tables.payment_types, ['deleted_at = none'], ['priority asc'], 0, 10, ['tax', 'discounts', 'gateway_config']);
  const db = useDB();

  const [data, setData] = useState<PaymentType>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<PaymentType>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: 'Name'
    }),
    columnHelper.accessor("type", {
      header: 'Type'
    }),
    columnHelper.accessor("gateway", {
      header: 'Gateway',
      cell: info => info.getValue() ? <div className="flex flex-wrap gap-2"><span className="tag">{info.getValue()}</span></div> : <span>-</span>
    }),
    columnHelper.accessor("gateway_mode", {
      header: 'Mode',
      cell: info => info.getValue() ? <div className="flex gap-2 flex-wrap"><span className="tag">{info.getValue()}</span></div> : <span>-</span>
    }),
    columnHelper.accessor("tax", {
      header: 'Tax',
      cell: info => info.getValue() && <div className="flex gap-2 flex-wrap"><span className="tag">{info.getValue()?.name} {info.getValue()?.rate}%</span></div>
    }),
    columnHelper.accessor("discounts", {
      header: 'Discounts',
      cell: info => <div className="flex gap-2 flex-wrap">
        {info.getValue()?.map((item, index) => (
          <span className="tag" key={`${item.id}-${index}`}>{item.name}</span>
        ))}
      </div>,
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
              message={`Delete payment type ${info.row.original.name}`}
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
      entityLabel: 'Payment type',
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.tables} WHERE payment_types ?= $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.order_payment} WHERE payment_type = $idRecord GROUP ALL`
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
          }} icon={faPlus}> Payment type</Button>
        ]}
      />

      {formModal && (
        <PaymentTypeForm
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
