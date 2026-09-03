import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useMemo, useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Floor } from "@/api/model/floor.ts";
import { FloorForm } from "@/components/settings/floors/floor.form.tsx";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { AdminFloorLayout } from "@/components/settings/floors/layout/layout.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {createFloorImportConfig} from "@/components/settings/floors/floor.import.config.ts";

export const AdminFloors = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Floor>>(Tables.floors, ['deleted_at = none'], [], 0, 10, ['tables']);
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<Floor>();
  const [formModal, setFormModal] = useState(false);
  const [layoutModal, setLayoutModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

  const smartImportConfig = useMemo(
    () => createFloorImportConfig({db, t}),
    [db, t]
  );

  const columnHelper = createColumnHelper<Floor>();
  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
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
              type="button"
              onClick={() => {
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'admin.floors.update',
                  description: getAccessRuleChildLabel('admin.floors.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
            <Button
              variant="warning"
              type="button"
              onClick={() => {
                protectAction(() => {
                  setLayoutModal(true)
                  setData(info.row.original);
                }, {
                  module: 'admin.floors.update',
                  description: getAccessRuleChildLabel('admin.floors.update'),
                });
              }}
            >
              Layout
            </Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.floor', { name: info.row.original.name })}
              onConfirm={() => protectAction(() => deleteItem(info.row.original.id), {
                module: 'admin.floors.delete',
                description: getAccessRuleChildLabel('admin.floors.delete'),
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
      entityLabel: t('entities.floor'),
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.tables} WHERE floor = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.orders} WHERE floor = $idRecord GROUP ALL`
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
              module: 'admin.floors.import',
              description: getAccessRuleChildLabel('admin.floors.import'),
            });
          }}><span className="mr-2"><AiSparklesIcon /></span>{t('buttons.smartImport')}</Button>,
          <Button variant="primary" onClick={() => {
            protectAction(() => {
              setData(undefined);
              setFormModal(true);
            }, {
              module: 'admin.floors.create',
              description: getAccessRuleChildLabel('admin.floors.create'),
            });
          }} icon={faPlus} data-testid="admin-add-floors">{t('buttons.floor')}</Button>
        ]}
      />

      {formModal && (
        <FloorForm
          open={formModal}
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
          onClose={() => setImportModal(false)}
          config={smartImportConfig}
          title={t('forms.smartImportFloorsTitle', {defaultValue: 'AI Import floors'})}
          enableImportModes
          defaultMatchFields={['name']}
          onExport={async () => {
            const [rows] = await db.query(`SELECT * FROM ${Tables.floors} WHERE deleted_at = none`);
            return (rows as Floor[]).map((row) => ({
              name: row.name ?? '',
              priority: String(row.priority ?? 0),
              background: row.background ?? '',
              color: row.color ?? '',
            }));
          }}
          onDone={() => loadHook.fetchData()}
        />
      )}

      {layoutModal && (
        <Modal
          size="full"
          open={layoutModal}
          onClose={() => {
            setData(undefined);
            setLayoutModal(false);
          }}
          title={t('forms.floorLayout', { name: data?.name })}
          shouldCloseOnOverlayClick={false}
        >
          {data && (
            <AdminFloorLayout floor={data} />
          )}
        </Modal>
      )}

    </>
  )
}
