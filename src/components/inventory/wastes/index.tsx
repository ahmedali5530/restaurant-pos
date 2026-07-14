import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryWaste} from "@/api/model/inventory_waste.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus, faPrint} from "@fortawesome/free-solid-svg-icons";
import {InventoryWasteForm} from "@/components/inventory/wastes/form.tsx";
import {useDB} from "@/api/db/db.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {InventoryWasteViewModal} from "@/components/inventory/wastes/view.modal.tsx";
import {InventoryDocumentPrintModal} from "@/components/inventory/common/document.print.modal.tsx";
import {InventoryInvoiceDoc, mapWasteToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import { toJsDate } from "@/lib/datetime.ts";

export const InventoryWastes = () => {
  const { t } = useTranslation('inventory');
  const loadHook = useApi<SettingsData<InventoryWaste>>(
    Tables.inventory_wastes,
    [],
    ["created_at DESC"],
    0,
    10,
    ["purchase", "purchase.items", "purchase.items.item", "issue", "issue.items", "issue.items.item", "items", "items.item", "items.purchase_item", "items.issue_item", "created_by"]
  );
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<InventoryWaste>();
  const [formModal, setFormModal] = useState(false);
  const [viewWaste, setViewWaste] = useState<InventoryWaste | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<InventoryInvoiceDoc | null>(null);

  const columnHelper = createColumnHelper<InventoryWaste>();

  const columns: any = [
    columnHelper.accessor("invoice_number", {
      header: t('columns.invoiceNumber')
    }),
    columnHelper.accessor(row => row.purchase?.invoice_number ?? row.issue?.id ?? "", {
      id: "source",
      header: t('columns.source'),
      cell: info => {
        const waste = info.row.original;
        if (waste.purchase) {
          return `Purchase #${waste.purchase.invoice_number}`;
        }
        if (waste.issue) {
          return `Issue #${waste.issue.id}`;
        }
        return "";
      }
    }),
    columnHelper.accessor("created_at", {
      header: t('columns.createdAt'),
      cell: info => info.getValue() ? toJsDate(info.getValue() as any).toLocaleString() : ""
    }),
    columnHelper.accessor("items", {
      header: t('tabs.items'),
      cell: info => (
        <div className="flex flex-wrap gap-2">
          {info.getValue()?.map((item, index) => (
            <span key={item.id ?? index} className="tag">
              {item.item?.name ?? "Unknown"} × {item.quantity}
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
          <div className="flex gap-3">
            <Button
              variant="secondary"
              iconButton
              onClick={() => {
                setViewWaste(info.row.original);
                setViewModalOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faFile}/>
            </Button>
            <Button
              variant="secondary"
              iconButton
              title={t('print.printReceipt')}
              onClick={() => setPrintDoc(mapWasteToInvoice(info.row.original))}
            >
              <FontAwesomeIcon icon={faPrint}/>
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'Edit Wastes',
                  description: t('security.editWastes'),
                });
              }}
            >
              <FontAwesomeIcon icon={faPencil}/>
            </Button>

            <DeleteConfirm onConfirm={() =>
              protectAction(async () => {
                await db.delete(info.getValue());
                await db.query(`DELETE
                                FROM ${Tables.inventory_waste_items}
                                where waste = $waste`, {
                  waste: info.getValue()
                });

                loadHook.fetchData();
              }, {
                module: 'Delete Wastes',
                description: t('security.deleteWastes'),
              })
            }/>
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
            key="waste-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Waste
          </Button>
        ]}
      />

      {formModal && (
        <InventoryWasteForm
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
        <InventoryWasteViewModal
          open={viewModalOpen}
          waste={viewWaste}
          onClose={() => {
            setViewModalOpen(false);
            setViewWaste(null);
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

