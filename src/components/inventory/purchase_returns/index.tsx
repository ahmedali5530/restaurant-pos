import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryPurchaseReturn} from "@/api/model/inventory_purchase_return.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus, faPrint} from "@fortawesome/free-solid-svg-icons";
import {InventoryPurchaseReturnForm} from "@/components/inventory/purchase_returns/form.tsx";
import {InventoryPurchaseReturnViewModal} from "@/components/inventory/purchase_returns/view.modal.tsx";
import {InventoryDocumentPrintModal} from "@/components/inventory/common/document.print.modal.tsx";
import {InventoryInvoiceDoc, mapPurchaseReturnToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import { toJsDate } from "@/lib/datetime.ts";

export const InventoryPurchaseReturns = () => {
  const { t } = useTranslation('inventory');
  const db = useDB();
  const { protectAction } = useSecurity();
  const loadHook = useApi<SettingsData<InventoryPurchaseReturn>>(
    Tables.inventory_purchase_returns,
    [],
    ["created_at DESC"],
    0,
    10,
    ["purchase", "purchase.supplier", "purchase.items", "purchase.items.item", "items", "items.item", "items.purchase_item", "items.purchase_item.location", "items.purchase_item.store", "items.purchase_item.supplier", "items.location", "items.store", "items.supplier", "created_by"]
  );

  const [data, setData] = useState<InventoryPurchaseReturn>();
  const [formModal, setFormModal] = useState(false);
  const [viewReturn, setViewReturn] = useState<InventoryPurchaseReturn | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<InventoryInvoiceDoc | null>(null);

  const columnHelper = createColumnHelper<InventoryPurchaseReturn>();

  const columns: any = [
    columnHelper.accessor("invoice_number", {
      header: t('columns.invoiceNumber')
    }),
    columnHelper.accessor(row => row.purchase?.invoice_number ?? "", {
      id: "purchase",
      header: t('columns.purchaseInvoice')
    }),
    columnHelper.accessor("created_at", {
      header: t('columns.createdAt'),
      cell: info => info.getValue() ? toJsDate(info.getValue() as any).toLocaleString() : ""
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
            <Button
              variant="secondary"
              iconButton
              onClick={() => {
                setViewReturn(row);
                setViewModalOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faFile}/>
            </Button>
            <Button
              variant="secondary"
              iconButton
              title={t('print.printReceipt')}
              onClick={() => setPrintDoc(mapPurchaseReturnToInvoice(row))}
            >
              <FontAwesomeIcon icon={faPrint}/>
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                protectAction(() => {
                  setData(row);
                  setFormModal(true);
                }, {
                  module: 'Edit Purchase Returns',
                  description: t('security.editPurchaseReturns'),
                });
              }}
            >
              <FontAwesomeIcon icon={faPencil}/>
            </Button>
            <DeleteConfirm
              message={`Do you want to delete purchase return #${row.invoice_number}?`}
              onConfirm={() =>
                protectAction(async () => {
                  await db.delete(row.id);
                  await db.query(
                    `DELETE FROM ${Tables.inventory_purchase_return_items} WHERE purchase_return = $id`,
                    {id: row.id},
                  );
                  loadHook.fetchData();
                }, {
                  module: 'Delete Purchase Returns',
                  description: t('security.deletePurchaseReturns'),
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
            key="purchase-return-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Purchase return
          </Button>
        ]}
      />

      {formModal && (
        <InventoryPurchaseReturnForm
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
        <InventoryPurchaseReturnViewModal
          open={viewModalOpen}
          purchaseReturn={viewReturn}
          onClose={() => {
            setViewModalOpen(false);
            setViewReturn(null);
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

