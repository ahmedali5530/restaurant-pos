import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPencil, faPlus, faTimes } from "@fortawesome/free-solid-svg-icons";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { Extra } from "@/api/model/extra.ts";
import { Button } from "@/components/common/input/button.tsx";
import { TableComponent } from "@/components/common/table/table.tsx";
import { ExtraForm } from "@/components/settings/extras/extra.form.tsx";
import { DeleteConfirm } from "@/components/common/table/delete.confirm.tsx";
import { useDB } from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import { withCurrency } from "@/lib/utils.ts";

export const AdminExtras = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Extra>>(Tables.extras, [], ["name asc"], 0, 99999, [
    "payment_types",
    "order_types",
    "tables",
  ]);
  const db = useDB();

  const [data, setData] = useState<Extra>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<Extra>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name'),
    }),
    columnHelper.accessor("value", {
      header: t('columns.value'),
      cell: info => withCurrency(Number(info.getValue() || 0)),
    }),
    columnHelper.accessor("payment_types", {
      header: "Payment types",
      cell: info => info.getValue()?.length || "-",
    }),
    columnHelper.accessor("order_types", {
      header: "Order types",
      cell: info => info.getValue()?.length || "-",
    }),
    columnHelper.accessor("tables", {
      header: t('columns.tables'),
      cell: info => info.getValue()?.length || "-",
    }),
    columnHelper.accessor("delivery", {
      header: t('columns.delivery'),
      cell: info => info.getValue() ? <FontAwesomeIcon icon={faCheck} className="text-success-500" /> : <FontAwesomeIcon icon={faTimes} className="text-danger-500" />,
    }),
    columnHelper.accessor("apply_to_all", {
      header: t('columns.applyToAll'),
      cell: info => info.getValue() ? <FontAwesomeIcon icon={faCheck} className="text-success-500" /> : <FontAwesomeIcon icon={faTimes} className="text-danger-500" />,
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
            >
              <FontAwesomeIcon icon={faPencil} />
            </Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.extra', { name: info.row.original.name })}
              onConfirm={async () => {
                await db.delete(info.row.original.id);
                loadHook.fetchData();
              }}
            />
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
          <Button
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            {" "}
            Extra
          </Button>,
        ]}
      />

      {formModal && (
        <ExtraForm
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
  );
};
