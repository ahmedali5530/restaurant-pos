import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { PaymentType } from "@/api/model/payment_type.ts";
import { TableComponent } from "@/components/common/table/table.tsx";
import { PaymentTypeForm } from "@/components/settings/payment_types/payment_type.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {createPaymentTypeImportConfig} from "@/components/settings/payment_types/payment-type.import.config.ts";

export const AdminPaymentTypes = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<PaymentType>>(Tables.payment_types, ['deleted_at = none'], ['priority asc'], 0, 10, ['tax', 'gateway_config']);
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<PaymentType>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const smartImportConfig = useMemo(
    () => createPaymentTypeImportConfig({db, t}),
    [db, t]
  );

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
                  module: 'admin.payment_types.update',
                  description: getAccessRuleChildLabel('admin.payment_types.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.paymentType', { name: info.row.original.name })}
              onConfirm={() => protectAction(() => deleteItem(info.row.original.id), {
                module: 'admin.payment_types.delete',
                description: getAccessRuleChildLabel('admin.payment_types.delete'),
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
            protectAction(() => setImportModal(true), {
              module: 'admin.payment_types.import',
              description: getAccessRuleChildLabel('admin.payment_types.import'),
            });
          }}><span className="mr-2"><AiSparklesIcon /></span>{t('buttons.smartImport')}</Button>,
          <Button variant="primary" onClick={() => {
            protectAction(() => {
              setData(undefined);
              setFormModal(true);
            }, {
              module: 'admin.payment_types.create',
              description: getAccessRuleChildLabel('admin.payment_types.create'),
            });
          }} icon={faPlus} data-testid="admin-add-payment_types">{t('buttons.paymentType')}</Button>
        ]}
      />

      {importModal && (
        <DataImportModal
          isOpen
          onClose={() => setImportModal(false)}
          config={smartImportConfig}
          title={t('forms.smartImportPaymentTypesTitle', {defaultValue: 'AI Import payment types'})}
          enableImportModes
          defaultMatchFields={['name']}
          onExport={async () => {
            const [rows] = await db.query(
              `SELECT * FROM ${Tables.payment_types} WHERE deleted_at = none FETCH tax`
            );
            return (rows as PaymentType[]).map((row) => ({
              name: row.name ?? '',
              priority: String(row.priority ?? 0),
              type: row.type ?? '',
              tax: row.tax?.name ?? '',
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

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
