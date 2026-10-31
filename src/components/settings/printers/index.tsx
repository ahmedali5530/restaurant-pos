import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus, faPrint } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Printer } from "@/api/model/printer.ts";
import { PrinterForm } from "@/components/settings/printers/printer.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";
import {dispatchPrintDetailed} from "@/lib/print.service.ts";
import {toast} from "sonner";

type TestPrintOutcome = {
  ok: boolean
  message: string
}

function formatPrinterAddress(printer: Printer): string {
  const type = String(printer.type || '').toLowerCase();
  if (type === 'usb') {
    return [
      printer.vid ? `VID ${printer.vid}` : '',
      printer.pid ? `PID ${printer.pid}` : '',
    ].filter(Boolean).join(' / ');
  }
  const host = String(printer.ip_address || '').trim();
  const port = printer.port != null && Number(printer.port) !== 0 ? String(printer.port) : '';
  if (host && port) return `${host}:${port}`;
  return host || port;
}

export const AdminPrinters = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<Printer>>(Tables.printers, ['deleted_at = none'], ['priority asc']);
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<Printer>();
  const [formModal, setFormModal] = useState(false);
  const [testingIds, setTestingIds] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestPrintOutcome>>({});

  const sendTestPrint = async (printer: Printer) => {
    const id = String(printer.id);
    const address = formatPrinterAddress(printer);
    const addressSuffix = address ? ` (${address})` : '';
    setTestingIds((prev) => ({...prev, [id]: true}));
    setTestResults((prev) => {
      const next = {...prev};
      delete next[id];
      return next;
    });
    try {
      const result = await dispatchPrintDetailed(db, 'test', {
        printerName: printer.name,
        printerType: printer.type,
        address,
        lines: {
          title: t('printers.slip.title'),
          name: t('printers.slip.name'),
          type: t('printers.slip.type'),
          address: t('printers.slip.address'),
          ok: t('printers.slip.ok'),
        },
      }, {
        printers: [printer],
        copies: 1,
      });
      const message = result.ok
        ? t('printers.testPrintOk', {name: printer.name, address: addressSuffix})
        : t('printers.testPrintError', {
          name: printer.name,
          address: addressSuffix,
          error: result.error || t('printers.testPrintUnknownError'),
        });
      setTestResults((prev) => ({...prev, [id]: {ok: result.ok, message}}));
      if (result.ok) {
        toast.success(message, {duration: 8000});
      } else {
        toast.error(message, {duration: 20000});
      }
    } finally {
      setTestingIds((prev) => {
        const next = {...prev};
        delete next[id];
        return next;
      });
    }
  };

  const columnHelper = createColumnHelper<Printer>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name')
    }),
    columnHelper.accessor("type", {
      header: t('columns.type')
    }),
    columnHelper.accessor("ip_address", {
      header: t('columns.path')
    }),
    columnHelper.accessor("port", {
      header: t('columns.port')
    }),
    // columnHelper.accessor("priority", {
    //   header: t('columns.priority')
    // }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const printerId = String(info.row.original.id);
        const testing = !!testingIds[printerId];
        const outcome = testResults[printerId];
        return (
          <div className="flex flex-col gap-1 items-start">
          <div className="flex gap-3 items-center">
            <IconTooltipButton
              label={t('printers.testPrint')}
              variant="info"
              isLoading={testing}
              data-testid="admin-test-printer"
              onClick={() => {
                protectAction(() => {
                  void sendTestPrint(info.row.original);
                }, {
                  module: 'admin.printers',
                  description: t('printers.testPrintAccess', {name: info.row.original.name}),
                });
              }}
            >{testing ? null : <FontAwesomeIcon icon={faPrint}/>}</IconTooltipButton>
            <div className="separator"></div>
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              onClick={() => {
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'admin.printers.update',
                  description: getAccessRuleChildLabel('admin.printers.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.printer', { name: info.row.original.name })}
              onConfirm={() => protectAction(() => deleteItem(info.row.original.id), {
                module: 'admin.printers.delete',
                description: getAccessRuleChildLabel('admin.printers.delete'),
              })}
            />
          </div>
          {outcome && (
            <p
              className={`text-xs max-w-md whitespace-pre-wrap break-words ${outcome.ok ? 'text-success-700' : 'text-danger-700'}`}
              data-testid="admin-test-printer-result"
            >{outcome.message}</p>
          )}
          </div>
        );
      },
    }),
  ];

  const deleteItem = async (id: string) => {
    await executeSettingsDelete({
      db,
      id,
      entityLabel: t('entities.printer'),
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.kitchens} WHERE printers ?= $idRecord GROUP ALL`
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
            protectAction(() => {
              setData(undefined);
              setFormModal(true);
            }, {
              module: 'admin.printers.create',
              description: getAccessRuleChildLabel('admin.printers.create'),
            });
          }} icon={faPlus} data-testid="admin-add-printers">{t('buttons.printer')}</Button>
        ]}
      />

      {formModal && (
        <PrinterForm
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
