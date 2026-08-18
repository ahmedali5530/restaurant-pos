import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPencil, faPlus, faTimes } from "@fortawesome/free-solid-svg-icons";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { Extra } from "@/api/model/extra.ts";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { TableComponent } from "@/components/common/table/table.tsx";
import { ExtraForm } from "@/components/settings/extras/extra.form.tsx";
import { DeleteConfirm } from "@/components/common/table/delete.confirm.tsx";
import { useDB } from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import { withCurrency } from "@/lib/utils.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {createExtraImportConfig} from "@/components/settings/extras/extra.import.config.ts";

export const AdminExtras = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Extra>>(Tables.extras, [], ["name asc"], 0, 99999, [
    "payment_types",
    "order_types",
    "tables",
  ]);
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<Extra>();
  const [formModal, setFormModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const smartImportConfig = useMemo(
    () => createExtraImportConfig({db, t}),
    [db, t]
  );

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
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              onClick={() => {
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'admin.extras.update',
                  description: getAccessRuleChildLabel('admin.extras.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil} /></IconTooltipButton>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.extra', { name: info.row.original.name })}
              onConfirm={() => protectAction(async () => {
                await db.delete(info.row.original.id);
                loadHook.fetchData();
              }, {
                module: 'admin.extras.delete',
                description: getAccessRuleChildLabel('admin.extras.delete'),
              })}
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
              protectAction(() => setImportModal(true), {
                module: 'admin.extras.import',
                description: getAccessRuleChildLabel('admin.extras.import'),
              });
            }}
          >
            <span className="mr-2"><AiSparklesIcon /></span>{t('buttons.smartImport')}
          </Button>,
          <Button
            variant="primary"
            data-testid="admin-add-extras"
            onClick={() => {
              protectAction(() => {
                setData(undefined);
                setFormModal(true);
              }, {
                module: 'admin.extras.create',
                description: getAccessRuleChildLabel('admin.extras.create'),
              });
            }}
            icon={faPlus}
          >
            {" "}
            Extra
          </Button>,
        ]}
      />

      {importModal && (
        <DataImportModal
          isOpen
          onClose={() => setImportModal(false)}
          config={smartImportConfig}
          title={t('forms.smartImportExtrasTitle', {defaultValue: 'AI Import extras'})}
          enableImportModes
          defaultMatchFields={['name']}
          onExport={async () => {
            const [rows] = await db.query(
              `SELECT * FROM ${Tables.extras} FETCH payment_types, order_types, tables`
            );
            return (rows as Extra[]).map((row) => ({
              name: row.name ?? '',
              value: String(row.value ?? ''),
              apply_to_all: row.apply_to_all ? 'true' : 'false',
              delivery: row.delivery ? 'true' : 'false',
              payment_types: (row.payment_types ?? []).map((item) => item.name).join('|'),
              order_types: (row.order_types ?? []).map((item) => item.name).join('|'),
              tables: (row.tables ?? []).map((item) => item.name).join('|'),
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

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
