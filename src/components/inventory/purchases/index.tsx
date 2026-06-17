import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faFile, faPencil, faPlus, faUpload} from "@fortawesome/free-solid-svg-icons";
import {InventoryPurchaseForm} from "@/components/inventory/purchases/form.tsx";
import {InventoryPurchaseUpload} from "@/components/inventory/purchases/upload.tsx";
import {InventoryPurchaseViewModal} from "@/components/inventory/purchases/view.modal.tsx";
import { toJsDate } from "@/lib/datetime.ts";

export const InventoryPurchases = () => {
  const { t } = useTranslation('inventory');
  const loadHook = useApi<SettingsData<InventoryPurchase>>(
    Tables.inventory_purchases,
    [],
    ["created_at DESC"],
    0,
    10,
    ["supplier", "purchase_order", "items", "items.item", "items.supplier", "items.store", "created_by"]
  );

  const [data, setData] = useState<InventoryPurchase>();
  const [formModal, setFormModal] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [viewPurchase, setViewPurchase] = useState<InventoryPurchase | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);

  const columnHelper = createColumnHelper<InventoryPurchase>();

  const columns: any = [
    columnHelper.accessor("invoice_number", {
      header: t('columns.invoiceNumber')
    }),
    columnHelper.accessor(row => row.supplier?.name ?? "", {
      id: "supplier",
      header: t('columns.suppliers')
    }),
    columnHelper.accessor(row => row.purchase_order?.po_number ?? "", {
      id: "purchase_order",
      header: t('columns.poNumber')
    }),
    columnHelper.accessor("created_at", {
      header: t('columns.createdAt'),
      cell: info => info.getValue() ? toJsDate(info.getValue() as any).toLocaleString() : ""
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
          <div className="flex gap-2">
            <Button
              variant="secondary"
              iconButton
              onClick={() => {
                setViewPurchase(row);
                setViewModalOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faFile}/>
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setData(row);
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
            key="purchase-create"
            variant="primary"
            onClick={() => {
              setFormModal(true);
            }}
            icon={faPlus}
          >
            Purchase
          </Button>
        ]}
      />

      {formModal && (
        <InventoryPurchaseForm
          open={true}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {uploadModal && (
        <InventoryPurchaseUpload
          onClose={() => {
            setUploadModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}

      {viewModalOpen && (
        <InventoryPurchaseViewModal
          open={viewModalOpen}
          purchase={viewPurchase}
          onClose={() => {
            setViewModalOpen(false);
            setViewPurchase(null);
          }}
        />
      )}
    </>
  );
};

