import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryIssueReturn} from "@/api/model/inventory_issue_return.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus, faPrint} from "@fortawesome/free-solid-svg-icons";
import {InventoryIssueReturnForm} from "@/components/inventory/issue_returns/form.tsx";
import {InventoryIssueReturnViewModal} from "@/components/inventory/issue_returns/view.modal.tsx";
import {InventoryDocumentPrintModal} from "@/components/inventory/common/document.print.modal.tsx";
import {InventoryInvoiceDoc, mapIssueReturnToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {formatDateTime} from "@/lib/datetime.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";

export const InventoryIssueReturns = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const db = useDB();
  const { protectAction } = useSecurity();
  const loadHook = useApi<SettingsData<InventoryIssueReturn>>(
    Tables.inventory_issue_returns,
    [],
    ["created_at DESC"],
    0,
    10,
    ["issuance", "issuance.items", "issuance.items.item", "issuance.items.store", "issued_to", "kitchen", "created_by", "items", "items.item", "items.issued_item", "items.issued_item.store", "items.store"]
  );

  const [data, setData] = useState<InventoryIssueReturn>();
  const [formModal, setFormModal] = useState(false);
  const [viewIssueReturn, setViewIssueReturn] = useState<InventoryIssueReturn | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<InventoryInvoiceDoc | null>(null);

  const columnHelper = createColumnHelper<InventoryIssueReturn>();

  const columns: any = [
    columnHelper.accessor(row => row.issuance?.invoice_number ?? "", {
      id: "invoice_number",
      header: t('columns.returnNumber')
    }),
    columnHelper.accessor(row => row.issuance?.invoice_number ?? "", {
      id: "issuance",
      header: t('columns.issuance')
    }),
    columnHelper.accessor("created_at", {
      header: t('columns.createdAt'),
      cell: info => info.getValue() ? formatDateTime(info.getValue() as any) : ""
    }),
    columnHelper.accessor('issued_to', {
      id: "issued_to",
      header: t('columns.issuedTo'),
      cell: info => `${info.getValue()?.first_name} ${info.getValue()?.last_name}`
    }),
    columnHelper.accessor(row => row.kitchen?.name ?? "", {
      id: "kitchen",
      header: t('columns.kitchen')
    }),
    columnHelper.accessor("items", {
      header: t('tabs.items'),
      cell: info => (
        <div className="flex flex-wrap gap-2">
          {info.getValue()?.slice(0, 5)?.map((item, index) => (
            <span key={item.id ?? index} className="tag">
              {item.item?.name}-{item.item?.code} × {item.quantity}
            </span>
          ))}
        </div>
      )
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex gap-2">
            <IconTooltipButton label={t('common:actions.view')}
              variant="secondary"
             
              onClick={() => {
                setViewIssueReturn(row);
                setViewModalOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faFile}/>
            </IconTooltipButton>
            <IconTooltipButton label={t('print.printReceipt')}
              variant="secondary"
             
             
              onClick={() => setPrintDoc(mapIssueReturnToInvoice(row))}
            >
              <FontAwesomeIcon icon={faPrint}/>
            </IconTooltipButton>
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              onClick={() => {
                protectAction(() => {
                  setData(row);
                  setFormModal(true);
                }, {
                  module: 'Edit Issue Returns',
                  description: t('security.editIssueReturns'),
                });
              }}
            >
              <FontAwesomeIcon icon={faPencil}/>
            </IconTooltipButton>
            <DeleteConfirm
              message={`Do you want to delete issue return #${row.invoice_number}?`}
              onConfirm={() =>
                protectAction(async () => {
                  await db.delete(row.id);
                  await db.query(
                    `DELETE FROM ${Tables.inventory_issue_return_items} WHERE issue_return = $id`,
                    {id: row.id},
                  );
                  loadHook.fetchData();
                }, {
                  module: 'Delete Issue Returns',
                  description: t('security.deleteIssueReturns'),
                })
              }
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
            key="issue-return-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Issue return
          </Button>
        ]}
      />

      {formModal && (
        <InventoryIssueReturnForm
          open={true}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {viewModalOpen && (
        <InventoryIssueReturnViewModal
          open={viewModalOpen}
          issueReturn={viewIssueReturn}
          onClose={() => {
            setViewModalOpen(false);
            setViewIssueReturn(null);
          }}
        />
      )}

      <InventoryDocumentPrintModal
        open={!!printDoc}
        doc={printDoc}
        onClose={() => setPrintDoc(null)}
      />
    </>
  );
};

