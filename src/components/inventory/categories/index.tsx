import {useMemo, useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryCategory} from "@/api/model/inventory_category.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faPlus} from "@fortawesome/free-solid-svg-icons";
import {InventoryCategoryForm} from "@/components/inventory/categories/form.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {createInventoryCategoryImportConfig} from "@/components/inventory/categories/inventory-category.import.config.ts";
import {useDB} from "@/api/db/db.ts";

export const InventoryCategories = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const db = useDB();
  const loadHook = useApi<SettingsData<InventoryCategory>>(Tables.inventory_categories, [], [], 0, 10, []);

  const [data, setData] = useState<InventoryCategory>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const smartImportConfig = useMemo(
    () => createInventoryCategoryImportConfig({db, t}),
    [db, t]
  );

  const columnHelper = createColumnHelper<InventoryCategory>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("priority", {
      header: t('columns.priority'),
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
            key="category-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Category
          </Button>,
          <Button
            key="category-import"
            variant="primary"
            onClick={() => setImportModal(true)}
          >
            <span className="mr-2"><AiSparklesIcon /></span>
            {t('common:actions.smartImport', {defaultValue: 'AI Import'})}
          </Button>
        ]}
      />

      {formModal && (
        <InventoryCategoryForm
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
          title={t('forms.smartImportItemCategoriesTitle', {defaultValue: 'AI Import item categories'})}
          enableImportModes
          defaultMatchFields={['name']}
          onExport={async () => {
            const [rows] = await db.query(`SELECT * FROM ${Tables.inventory_categories}`);
            return (rows as InventoryCategory[]).map((row) => ({
              name: row.name ?? '',
              priority: String(row.priority ?? 0),
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}
    </>
  );
};

