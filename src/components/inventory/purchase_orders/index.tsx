import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryPurchaseOrder, PurchaseOrderStatus} from "@/api/model/inventory_purchase_order.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCheck, faFile, faPaperPlane, faPencil, faPlus, faPrint, faXmark} from "@fortawesome/free-solid-svg-icons";
import {InventoryPurchaseOrderForm} from "@/components/inventory/purchase_orders/form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {InventoryPurchaseOrderViewModal} from "@/components/inventory/purchase_orders/view.modal.tsx";
import {inventoryPrintUrl} from "@/routes/posr.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {formatDateTime} from "@/lib/datetime.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {
  approvePurchaseOrder,
  rejectPurchaseOrder,
  submitPurchaseOrder,
} from "@/lib/inventory/purchase_order.service.ts";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { toast } from "sonner";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { purchaseOrderListTotal } from "@/lib/inventory/document.list.total.ts";
import { withCurrency } from "@/lib/utils.ts";

export const InventoryPurchaseOrders = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const loadHook = useApi<SettingsData<InventoryPurchaseOrder>>(
    Tables.inventory_purchase_orders,
    [],
    ["created_at DESC"],
    0,
    10,
    ["supplier", "items", "items.item", "items.supplier"]
  );
  const db = useDB();
  const { protectAction } = useSecurity();
  const [state] = useAtom(appPage);
  const userId = state?.user?.id ? recordIdToString(state.user.id) : undefined;

  const [data, setData] = useState<InventoryPurchaseOrder>();
  const [formModal, setFormModal] = useState(false);
  const [viewOrder, setViewOrder] = useState<InventoryPurchaseOrder | null>(null);
  const [viewModal, setViewModal] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const columnHelper = createColumnHelper<InventoryPurchaseOrder>();

  const handleSubmit = (row: InventoryPurchaseOrder) => {
    protectAction(async () => {
      try {
        setActionLoadingId(String(row.id));
        await submitPurchaseOrder(db, String(row.id), userId);
        toast.success(t('purchaseOrder.submitted'));
        loadHook.fetchData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setActionLoadingId(null);
      }
    }, {
      module: 'inventory.purchase_orders.update',
      description: t('security.submitPurchaseOrders'),
    });
  };

  const handleApprove = (row: InventoryPurchaseOrder) => {
    protectAction(async () => {
      try {
        setActionLoadingId(String(row.id));
        await approvePurchaseOrder(db, String(row.id), userId);
        toast.success(t('purchaseOrder.approved'));
        loadHook.fetchData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setActionLoadingId(null);
      }
    }, {
      module: 'inventory.purchase_orders.approve',
      description: t('security.approvePurchaseOrders'),
    });
  };

  const handleReject = (row: InventoryPurchaseOrder) => {
    protectAction(async () => {
      try {
        setActionLoadingId(String(row.id));
        await rejectPurchaseOrder(db, String(row.id), userId);
        toast.success(t('purchaseOrder.rejected'));
        loadHook.fetchData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setActionLoadingId(null);
      }
    }, {
      module: 'inventory.purchase_orders.approve',
      description: t('security.rejectPurchaseOrders'),
    });
  };

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
    columnHelper.accessor(row => purchaseOrderListTotal(row.items), {
      id: "total",
      header: t('columns.total'),
      cell: info => withCurrency(info.getValue()),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        const isDraft = row.status === PurchaseOrderStatus.draft;
        const isPendingApproval = row.status === PurchaseOrderStatus.pendingApproval;
        const busy = actionLoadingId === String(row.id);

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
              onClick={() => window.open(inventoryPrintUrl("purchase-order", String(row.id)), "_blank")}
            >
              <FontAwesomeIcon icon={faPrint}/>
            </IconTooltipButton>
            {isDraft && (
              <>
                <IconTooltipButton
                  label={t('purchaseOrder.submitForApproval')}
                  variant="secondary"
                  disabled={busy}
                  onClick={() => handleSubmit(row)}
                >
                  <FontAwesomeIcon icon={faPaperPlane}/>
                </IconTooltipButton>
                <IconTooltipButton
                  label={t('common:actions.edit')}
                  variant="primary"
                  onClick={() => {
                    protectAction(() => {
                      setData(row);
                      setFormModal(true);
                    }, {
                      module: 'inventory.purchase_orders.update',
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
                      module: 'inventory.purchase_orders.delete',
                      description: t('security.deletePurchaseOrders'),
                    })
                  }
                />
              </>
            )}
            {isPendingApproval && (
              <>
                <IconTooltipButton
                  label={t('common:actions.approve')}
                  variant="success"
                  disabled={busy}
                  onClick={() => handleApprove(row)}
                >
                  <FontAwesomeIcon icon={faCheck}/>
                </IconTooltipButton>
                <DeleteConfirm
                  title={t('common:actions.reject')}
                  message={t('purchaseOrder.rejectConfirm', { number: row.po_number })}
                  onConfirm={() => handleReject(row)}
                >
                  <IconTooltipButton
                    label={t('common:actions.reject')}
                    variant="danger"
                    disabled={busy}
                  >
                    <FontAwesomeIcon icon={faXmark}/>
                  </IconTooltipButton>
                </DeleteConfirm>
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
        defaultSort={[
          {id: 'invoice_number', desc: true}
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
    </>
  );
};
