import {useMemo, useState} from "react";
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
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {createSupplierImportConfig} from "@/components/inventory/suppliers/supplier.import.config.ts";
import {useDB} from "@/api/db/db.ts";

export const InventorySuppliers = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const db = useDB();
  const loadHook = useApi<SettingsData<InventorySupplier>>(Tables.inventory_suppliers, [], [], 0, 10, []);

  const [data, setData] = useState<InventorySupplier>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const smartImportConfig = useMemo(
    () => createSupplierImportConfig({db, t}),
    [db, t]
  );

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
          <IconTooltipButton label={t('common:actions.edit')}
            variant="primary"
            onClick={() => {
              setData(info.row.original);
              setFormModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPencil}/>
          </IconTooltipButton>
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
          </Button>,
          <Button
            key="supplier-import"
            variant="primary"
            onClick={() => setImportModal(true)}
          >
            <span className="mr-2"><AiSparklesIcon /></span>
            {t('common:actions.smartImport', {defaultValue: 'AI Import'})}
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

      {importModal && (
        <DataImportModal
          isOpen
          onClose={() => {
            setImportModal(false);
            loadHook.fetchData();
          }}
          config={smartImportConfig}
          title={t('forms.smartImportSuppliersTitle', {defaultValue: 'AI Import suppliers'})}
          enableImportModes
          defaultMatchFields={['name']}
          onExport={async () => {
            const [rows] = await db.query(`SELECT * FROM ${Tables.inventory_suppliers}`);
            return (rows as InventorySupplier[]).map((row) => ({
              name: row.name ?? '',
              address: row.address ?? '',
              phone: row.phone ?? '',
              email: row.email ?? '',
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}
    </>
  );
};
