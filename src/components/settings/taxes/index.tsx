import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Tax } from "@/api/model/tax.ts";
import { TaxForm } from "@/components/settings/taxes/tax.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {createTaxImportConfig} from "@/components/settings/taxes/tax.import.config.ts";

export const AdminTaxes = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Tax>>(Tables.taxes, ['deleted_at = none']);
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<Tax>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const smartImportConfig = useMemo(
    () => createTaxImportConfig({db, t}),
    [db, t]
  );

  const columnHelper = createColumnHelper<Tax>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("rate", {
      header: t('columns.ratePercent')
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
                  module: 'admin.taxes.update',
                  description: getAccessRuleChildLabel('admin.taxes.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.tax', { name: info.row.original.name })}
              onConfirm={() => protectAction(() => deleteItem(info.row.original.id.toString()), {
                module: 'admin.taxes.delete',
                description: getAccessRuleChildLabel('admin.taxes.delete'),
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
      entityLabel: t('entities.tax'),
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.payment_types} WHERE tax = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.menu_menu_items} WHERE tax = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.orders} WHERE tax = $idRecord GROUP ALL`
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
              module: 'admin.taxes.import',
              description: getAccessRuleChildLabel('admin.taxes.import'),
            });
          }}><span className="mr-2"><AiSparklesIcon /></span>{t('buttons.smartImport')}</Button>,
          <Button variant="primary" onClick={() => {
            protectAction(() => {
              setData(undefined);
              setFormModal(true);
            }, {
              module: 'admin.taxes.create',
              description: getAccessRuleChildLabel('admin.taxes.create'),
            });
          }} icon={faPlus} data-testid="admin-add-taxes">{t('buttons.tax')}</Button>
        ]}
      />

      {importModal && (
        <DataImportModal
          isOpen
          onClose={() => setImportModal(false)}
          config={smartImportConfig}
          title={t('forms.smartImportTaxesTitle', {defaultValue: 'AI Import taxes'})}
          enableImportModes
          defaultMatchFields={['name']}
          onExport={async () => {
            const [rows] = await db.query(`SELECT * FROM ${Tables.taxes} WHERE deleted_at = none`);
            return (rows as Tax[]).map((row) => ({
              name: row.name ?? '',
              rate: String(row.rate ?? ''),
              priority: String(row.priority ?? 0),
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

      <TaxForm
        open={formModal}
        data={data}
        onClose={() => {
          setFormModal(false);
          setData(undefined);
          loadHook.fetchData();
        }}
      />
    </>
  )
}
