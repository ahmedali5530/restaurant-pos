import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {createColumnHelper} from "@tanstack/react-table";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faBan, faCheck, faCodeBranch, faFile, faPencil, faPlus, faPrint, faUpload} from "@fortawesome/free-solid-svg-icons";
import {InventoryPurchaseForm} from "@/components/inventory/purchases/form.tsx";
import {InventoryPurchaseViewModal} from "@/components/inventory/purchases/view.modal.tsx";
import {InventoryDocumentStatusBadge} from "@/components/inventory/common/document.status.badge.tsx";
import {inventoryPrintUrl} from "@/routes/posr.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {formatDateTime} from "@/lib/datetime.ts";
import { canDelete, canEdit, canPost, canVoid } from "@/lib/inventory/lifecycle.ts";
import { approveDocument, postDocument, voidDocument } from "@/lib/inventory/posting.service.ts";
import { createPurchaseRevision } from "@/lib/inventory/revision.service.ts";
import {
  formatDependencyMessage,
  getDependencies,
} from "@/lib/inventory/dependency-validator.ts";
import { useIntegrationManager } from "@/providers/integration.provider.tsx";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { toast } from "sonner";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { purchaseListTotal } from "@/lib/inventory/document.list.total.ts";
import { withCurrency } from "@/lib/utils.ts";

export const InventoryPurchases = () => {
  const { t } = useTranslation(['inventory', 'common']);
  const db = useDB();
  const { protectAction } = useSecurity();
  const { manager } = useIntegrationManager();
  const [state] = useAtom(appPage);
  const loadHook = useApi<SettingsData<InventoryPurchase>>(
    Tables.inventory_purchases,
    [],
    ["created_at DESC"],
    0,
    10,
    ["supplier", "purchase_order", "items", "items.item", "items.supplier", "items.location", "created_by"]
  );

  const [data, setData] = useState<InventoryPurchase>();
  const [formModal, setFormModal] = useState(false);
  const [viewPurchase, setViewPurchase] = useState<InventoryPurchase | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const userId = state?.user?.id ? recordIdToString(state.user.id) : undefined;

  const handleApprove = async (row: InventoryPurchase) => {
    protectAction(async () => {
      try {
        setActionLoadingId(String(row.id));
        await approveDocument(db, "purchase", String(row.id), userId);
        toast.success("Purchase approved");
        loadHook.fetchData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setActionLoadingId(null);
      }
    }, {
      module: 'inventory.purchases.update',
      description: t('security.editPurchases'),
    });
  };

  const handlePost = async (row: InventoryPurchase) => {
    protectAction(async () => {
      try {
        setActionLoadingId(String(row.id));
        const result = await postDocument({
          db,
          documentType: "purchase",
          documentId: String(row.id),
          userId,
          integrationManager: manager,
        });
        if (result.skipped) {
          toast.info(result.reason || "Already posted");
        } else {
          toast.success(`Purchase posted (${result.ledgerEntryCount} ledger entries)`);
        }
        loadHook.fetchData();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setActionLoadingId(null);
      }
    }, {
      module: 'inventory.purchases.update',
      description: t('security.editPurchases'),
    });
  };

  const columnHelper = createColumnHelper<InventoryPurchase>();

  const columns: any = [
    columnHelper.accessor("invoice_number", {
      header: t('columns.invoiceNumber')
    }),
    columnHelper.accessor("status", {
      header: t('columns.status', { defaultValue: 'Status' }),
      cell: (info) => <InventoryDocumentStatusBadge status={info.getValue()} />,
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
    columnHelper.accessor(row => purchaseListTotal(row), {
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
        const editable = canEdit(row.status);
        const deletable = canDelete(row.status);
        const postable = canPost(row.status);
        const voidable = canVoid(row.status) && !row.superseded_by;
        const revisable = canVoid(row.status) && !row.superseded_by;
        const busy = actionLoadingId === String(row.id);

        return (
          <div className="flex gap-2 flex-wrap">
            <IconTooltipButton label={t('common:actions.view')}
              variant="secondary"
             
              onClick={() => {
                setViewPurchase(row);
                setViewModalOpen(true);
              }}
            >
              <FontAwesomeIcon icon={faFile}/>
            </IconTooltipButton>
            <IconTooltipButton label={t('print.printReceipt')}
              variant="secondary"
             
             
              onClick={() => window.open(inventoryPrintUrl("purchase", String(row.id)), "_blank")}
            >
              <FontAwesomeIcon icon={faPrint}/>
            </IconTooltipButton>
            {postable && (
              <IconTooltipButton label={t('common:actions.approve')}
                variant="success"
               
                disabled={busy}
                onClick={() => handlePost(row)}
              >
                <FontAwesomeIcon icon={faUpload}/>
              </IconTooltipButton>
            )}
            {editable && row.status === "draft" && (
              <IconTooltipButton label={t('common:actions.approve')}
                variant="secondary"
               
                disabled={busy}
                onClick={() => handleApprove(row)}
              >
                <FontAwesomeIcon icon={faCheck}/>
              </IconTooltipButton>
            )}
            {revisable && (
              <IconTooltipButton label={t('common:actions.revision')}
                variant="secondary"
               
                disabled={busy}
                onClick={() =>
                  protectAction(async () => {
                    try {
                      setActionLoadingId(String(row.id));
                      const revision = await createPurchaseRevision(db, String(row.id), userId);
                      toast.success(t('document.revisionCreated', { revision: revision.revision }));
                      setData(revision);
                      setFormModal(true);
                      loadHook.fetchData();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : String(error));
                    } finally {
                      setActionLoadingId(null);
                    }
                  }, {
                    module: 'inventory.purchases.update',
                    description: t('security.editPurchases'),
                  })
                }
              >
                <FontAwesomeIcon icon={faCodeBranch}/>
              </IconTooltipButton>
            )}
            {voidable && (
              <IconTooltipButton label={t('common:actions.void')}
                variant="danger"
               
                disabled={busy}
                onClick={() =>
                  protectAction(async () => {
                    try {
                      setActionLoadingId(String(row.id));
                      const result = await voidDocument({
                        db,
                        documentType: "purchase",
                        documentId: String(row.id),
                        userId,
                        integrationManager: manager,
                      });
                      toast.success(
                        result.skipped
                          ? result.reason || t('document.alreadyVoided')
                          : t('document.purchaseVoided', { count: result.ledgerEntryCount })
                      );
                      loadHook.fetchData();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : String(error));
                    } finally {
                      setActionLoadingId(null);
                    }
                  }, {
                    module: 'inventory.purchases.update',
                    description: t('security.editPurchases'),
                  })
                }
              >
                <FontAwesomeIcon icon={faBan}/>
              </IconTooltipButton>
            )}
            {editable && (
              <IconTooltipButton label={t('common:actions.edit')}
                variant="primary"
                onClick={() => {
                  protectAction(() => {
                    setData(row);
                    setFormModal(true);
                  }, {
                    module: 'inventory.purchases.update',
                    description: t('security.editPurchases'),
                  });
                }}
              >
                <FontAwesomeIcon icon={faPencil}/>
              </IconTooltipButton>
            )}
            {deletable && (
              <DeleteConfirm
                message={`Do you want to delete purchase #${row.invoice_number}?`}
                onConfirm={() =>
                  protectAction(async () => {
                    const deps = await getDependencies(db, "purchase", String(row.id));
                    if (deps.length > 0) {
                      toast.error(formatDependencyMessage("purchase", deps));
                      return;
                    }
                    await db.delete(row.id);
                    await db.query(
                      `DELETE FROM ${Tables.inventory_purchase_items} WHERE purchase = $purchase`,
                      {purchase: row.id},
                    );
                    loadHook.fetchData();
                  }, {
                    module: 'inventory.purchases.delete',
                    description: t('security.deletePurchases'),
                  })
                }
              />
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
        defaultSort={[
          {id: 'invoice_number', desc: true}
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
