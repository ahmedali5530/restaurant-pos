import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventorySupplier} from "@/api/model/inventory_supplier.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {SupplierForm} from "@/components/inventory/suppliers/form.tsx";

export const InventorySuppliers = () => {
  const { t } = useTranslation('inventory');
  const loadHook = useApi<SettingsData<InventorySupplier>>(Tables.inventory_suppliers, [], [], 0, 10, []);

  const [data, setData] = useState<InventorySupplier>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<InventorySupplier>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("address", {
      header: t('columns.address'),
    }),
    columnHelper.accessor("phone", {
      header: t('columns.phone')
    }),
    columnHelper.accessor("email", {
      header: t('columns.email')
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <Button
            variant="primary"
            onClick={() => {
              setData(info.row.original);
              setFormModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPencil}/>
          </Button>
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
            key="supplier-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Supplier
          </Button>
        ]}
      />

      {formModal && (
        <SupplierForm
          open={true}
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
