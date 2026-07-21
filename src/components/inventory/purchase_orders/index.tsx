import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryPurchaseOrder, PurchaseOrderStatus} from "@/api/model/inventory_purchase_order.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus, faPrint} from "@fortawesome/free-solid-svg-icons";
import {InventoryPurchaseOrderForm} from "@/components/inventory/purchase_orders/form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {InventoryPurchaseOrderViewModal} from "@/components/inventory/purchase_orders/view.modal.tsx";
import {InventoryDocumentPrintModal} from "@/components/inventory/common/document.print.modal.tsx";
import {InventoryInvoiceDoc, mapPurchaseOrderToInvoice} from "@/lib/inventory/invoice.mapper.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {formatDateTime} from "@/lib/datetime.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";

export const InventoryPurchaseOrders = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const loadHook = useApi<SettingsData<InventoryPurchaseOrder>>(
    Tables.inventory_purchase_orders,
    [],
    ["created_at DESC"],
    0,
    10,
    ["supplier", "items", "items.item", "items.supplier", "items.store"]
  );
  const db = useDB();
  const { protectAction } = useSecurity();

  const [data, setData] = useState<InventoryPurchaseOrder>();
  const [formModal, setFormModal] = useState(false);
  const [viewOrder, setViewOrder] = useState<InventoryPurchaseOrder | null>(null);
  const [viewModal, setViewModal] = useState(false);
  const [printDoc, setPrintDoc] = useState<InventoryInvoiceDoc | null>(null);

  const columnHelper = createColumnHelper<InventoryPurchaseOrder>();

  const columns: any = [
    columnHelper.accessor("po_number", {
      header: t('columns.poNumber')
    }),
    columnHelper.accessor("status", {
      header: t('columns.status'),
    }),
    columnHelper.accessor(row => row.supplier?.name ?? "", {
      id: "supplier",
      header: t('columns.suppliers')
    }),
    columnHelper.accessor("created_at", {
      header: t('columns.createdAt'),
      cell: info => info.getValue() ? formatDateTime(info.getValue() as any) : ""
    }),
    columnHelper.accessor("items", {
      header: t('tabs.items'),
      cell: info => (
        <div className="flex flex-wrap gap-2">
          {info.getValue()?.slice(0, 5).map((item, index) => (
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
          <div className="flex gap-3">
            <IconTooltipButton label={t('common:actions.view')}
              variant="secondary"
             
              onClick={() => {
                setViewOrder(row);
                setViewModal(true);
              }}
            >
              <FontAwesomeIcon icon={faFile}/>
            </IconTooltipButton>
            <IconTooltipButton label={t('print.printReceipt')}
              variant="secondary"
             
             
              onClick={() => setPrintDoc(mapPurchaseOrderToInvoice(row))}
            >
              <FontAwesomeIcon icon={faPrint}/>
            </IconTooltipButton>
            {row.status === PurchaseOrderStatus.pending && (
              <>
                <IconTooltipButton
                  label={t('common:actions.edit')}
                  variant="primary"
                  onClick={() => {
                    protectAction(() => {
                      setData(row);
                      setFormModal(true);
                    }, {
                      module: 'Edit Purchase Orders',
                      description: t('security.editPurchaseOrders'),
                    });
                  }}
                >
                  <FontAwesomeIcon icon={faPencil}/>
                </IconTooltipButton>

                <DeleteConfirm
                  message={`Do you want to delete purchase order# ${row.po_number}`}
                  onConfirm={() =>
                    protectAction(async () => {
                      await db.delete(row.id);
                      await db.query(
                        `DELETE FROM ${Tables.inventory_purchase_order_items} WHERE purchase_order = $id`,
                        {id: row.id},
                      );
                      loadHook.fetchData();
                    }, {
                      module: 'Delete Purchase Orders',
                      description: t('security.deletePurchaseOrders'),
                    })
                  }
                />
              </>
            )}

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
            key="purchase-order-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Purchase order
          </Button>
        ]}
      />

      {formModal && (
        <InventoryPurchaseOrderForm
          open={true}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {viewModal && (
        <InventoryPurchaseOrderViewModal
          open={viewModal}
          order={viewOrder}
          onClose={() => {
            setViewModal(false);
            setViewOrder(null);
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

