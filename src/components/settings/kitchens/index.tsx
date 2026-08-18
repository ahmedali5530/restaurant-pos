import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Kitchen } from "@/api/model/kitchen.ts";
import { KitchenForm } from "@/components/settings/kitchens/kitchen.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {createKitchenImportConfig} from "@/components/settings/kitchens/kitchen.import.config.ts";

export const AdminKitchens = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Kitchen>>(Tables.kitchens, ['deleted_at = none'], ['priority asc'], 0, 10, ['items', 'printers']);
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<Kitchen>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const smartImportConfig = useMemo(
    () => createKitchenImportConfig({db, t}),
    [db, t]
  );

  const columnHelper = createColumnHelper<Kitchen>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("printers", {
      header: t('columns.printers'),
      cell: info => info.getValue()?.map(item => <span className="tag" key={item.id}>{item.name}</span>)
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
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              onClick={() => {
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'admin.kitchens.update',
                  description: getAccessRuleChildLabel('admin.kitchens.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.kitchen', { name: info.row.original.name })}
              onConfirm={() => protectAction(() => deleteItem(info.row.original.id), {
                module: 'admin.kitchens.delete',
                description: getAccessRuleChildLabel('admin.kitchens.delete'),
              })}
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
      entityLabel: t('entities.kitchen'),
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.order_items_kitchen} WHERE kitchen = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.workflow_stages} WHERE kitchen = $idRecord GROUP ALL`
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
            protectAction(() => setImportModal(true), {
              module: 'admin.kitchens.import',
              description: getAccessRuleChildLabel('admin.kitchens.import'),
            });
          }}><span className="mr-2"><AiSparklesIcon /></span>{t('buttons.smartImport')}</Button>,
          <Button variant="primary" onClick={() => {
            protectAction(() => {
              setData(undefined);
              setFormModal(true);
            }, {
              module: 'admin.kitchens.create',
              description: getAccessRuleChildLabel('admin.kitchens.create'),
            });
          }} icon={faPlus} data-testid="admin-add-kitchens">{t('buttons.kitchen')}</Button>
        ]}
      />

      {importModal && (
        <DataImportModal
          isOpen
          onClose={() => setImportModal(false)}
          config={smartImportConfig}
          title={t('forms.smartImportKitchensTitle', {defaultValue: 'AI Import kitchens'})}
          enableImportModes
          defaultMatchFields={['name']}
          onExport={async () => {
            const [rows] = await db.query(
              `SELECT * FROM ${Tables.kitchens} WHERE deleted_at = none FETCH items, printers`
            );
            return (rows as Kitchen[]).map((row) => ({
              name: row.name ?? '',
              priority: String(row.priority ?? ''),
              items: (row.items ?? []).map((item) => item.name).join('|'),
              printers: (row.printers ?? []).map((item) => item.name).join('|'),
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

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
