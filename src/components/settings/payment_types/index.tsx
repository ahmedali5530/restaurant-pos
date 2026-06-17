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
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminPaymentTypes = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<PaymentType>>(Tables.payment_types, ['deleted_at = none'], ['priority asc'], 0, 10, ['tax', 'discounts', 'gateway_config']);
  const db = useDB();

  const [data, setData] = useState<PaymentType>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<PaymentType>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("type", {
      header: t('columns.type')
    }),
    columnHelper.accessor("gateway", {
      header: t('columns.gateway'),
      cell: info => info.getValue() ? <div className="flex flex-wrap gap-2"><span className="tag">{info.getValue()}</span></div> : <span>-</span>
    }),
    columnHelper.accessor("gateway_mode", {
      header: t('columns.mode'),
      cell: info => info.getValue() ? <div className="flex gap-2 flex-wrap"><span className="tag">{info.getValue()}</span></div> : <span>-</span>
    }),
    columnHelper.accessor("tax", {
      header: t('columns.tax'),
      cell: info => info.getValue() && <div className="flex gap-2 flex-wrap"><span className="tag">{info.getValue()?.name} {info.getValue()?.rate}%</span></div>
    }),
    columnHelper.accessor("discounts", {
      header: t('columns.discounts'),
      cell: info => <div className="flex gap-2 flex-wrap">
        {info.getValue()?.map((item, index) => (
          <span className="tag" key={`${item.id}-${index}`}>{item.name}</span>
        ))}
      </div>,
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
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.paymentType', { name: info.row.original.name })}
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
      entityLabel: t('entities.paymentType'),
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
          }} icon={faPlus}>{t('buttons.paymentType')}</Button>
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
