import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryIssue} from "@/api/model/inventory_issue.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus, faPrint} from "@fortawesome/free-solid-svg-icons";
import {InventoryIssueForm} from "@/components/inventory/issues/form.tsx";
import {InventoryIssueViewModal} from "@/components/inventory/issues/view.modal.tsx";
import {InventoryDocumentPrintModal} from "@/components/inventory/common/document.print.modal.tsx";
import {InventoryInvoiceDoc, mapIssueToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import { toJsDate } from "@/lib/datetime.ts";

export const InventoryIssues = () => {
  const { t } = useTranslation('inventory');
  const loadHook = useApi<SettingsData<InventoryIssue>>(
    Tables.inventory_issues,
    [],
    ["created_at DESC"],
    0,
    10,
    ["issued_to", "created_by", "kitchen", "items", "items.item", "items.store"]
  );

  const [data, setData] = useState<InventoryIssue>();
  const [formModal, setFormModal] = useState(false);
  const [viewIssue, setViewIssue] = useState<InventoryIssue | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<InventoryInvoiceDoc | null>(null);

  const columnHelper = createColumnHelper<InventoryIssue>();

  const columns: any = [
    columnHelper.accessor("invoice_number", {
      header: t('columns.issueNumber'),
    }),
    columnHelper.accessor("created_at", {
      header: t('columns.createdAt'),
      cell: info => info.getValue() ? toJsDate(info.getValue() as any).toLocaleString() : ""
    }),
    columnHelper.accessor(row => row.created_by?.first_name ?? "", {
      id: "created_by",
      header: t('columns.createdBy')
    }),
    columnHelper.accessor(row => row.issued_to?.first_name ?? "", {
      id: "issued_to",
      header: t('columns.issuedTo')
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
        return (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              iconButton
              onClick={() => {
                setViewIssue(info.row.original);
                setViewModalOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faFile}/>
            </Button>
            <Button
              variant="secondary"
              iconButton
              title={t('print.printReceipt')}
              onClick={() => setPrintDoc(mapIssueToInvoice(info.row.original))}
            >
              <FontAwesomeIcon icon={faPrint}/>
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            >
              <FontAwesomeIcon icon={faPencil}/>
            </Button>
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
            key="issue-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Issue
          </Button>
        ]}
      />

      {formModal && (
        <InventoryIssueForm
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
        <InventoryIssueViewModal
          open={viewModalOpen}
          issue={viewIssue}
          onClose={() => {
            setViewModalOpen(false);
            setViewIssue(null);
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

