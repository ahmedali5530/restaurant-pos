import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createColumnHelper } from "@tanstack/react-table";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { InventoryAdjustment } from "@/api/model/inventory_adjustment.ts";
import { TableComponent } from "@/components/common/table/table.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faPencil, faPlus, faUpload, faBan } from "@fortawesome/free-solid-svg-icons";
import { InventoryAdjustmentForm } from "@/components/inventory/adjustments/form.tsx";
import { InventoryDocumentStatusBadge } from "@/components/inventory/common/document.status.badge.tsx";
import { DeleteConfirm } from "@/components/common/table/delete.confirm.tsx";
import { useDB } from "@/api/db/db.ts";
import { useSecurity } from "@/hooks/useSecurity.ts";
import {formatDateTime} from "@/lib/datetime.ts";
import { canDelete, canEdit, canPost, canVoid } from "@/lib/inventory/lifecycle.ts";
import {
  approveDocument,
  postDocument,
  voidDocument,
} from "@/lib/inventory/posting.service.ts";
import { useIntegrationManager } from "@/providers/integration.provider.tsx";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { toast } from "sonner";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { adjustmentListTotal } from "@/lib/inventory/document.list.total.ts";
import { withCurrency } from "@/lib/utils.ts";

export const InventoryAdjustments = () => {
  const { t } = useTranslation(["inventory", 'common']);
  const db = useDB();
  const { protectAction } = useSecurity();
  const { manager } = useIntegrationManager();
  const [state] = useAtom(appPage);
  const loadHook = useApi<SettingsData<InventoryAdjustment>>(
    Tables.inventory_adjustments,
    [],
    ["created_at DESC"],
    0,
    10,
    ["location", "store", "items", "items.item", "items.location", "items.store", "created_by"]
  );

  const [data, setData] = useState<InventoryAdjustment>();
  const [formModal, setFormModal] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const userId = state?.user?.id ? recordIdToString(state.user.id) : undefined;

  const columnHelper = createColumnHelper<InventoryAdjustment>();

  const columns: any = [
    columnHelper.accessor("invoice_number", {
      header: t("columns.invoiceNumber"),
    }),
    columnHelper.accessor("reason", {
      header: t("columns.reason"),
      cell: (info) => {
        const reason = String(info.getValue() ?? "");
        return t(`adjustment.reasons.${reason}`, {
          defaultValue: reason.replace(/_/g, " "),
        });
      },
    }),
    columnHelper.accessor("status", {
      header: t("columns.status"),
      cell: (info) => <InventoryDocumentStatusBadge status={info.getValue()} />,
    }),
    columnHelper.accessor("created_at", {
      header: t("columns.createdAt"),
      cell: (info) =>
        info.getValue() ? formatDateTime(info.getValue() as any) : "",
    }),
    columnHelper.accessor("items", {
      header: t("tabs.items"),
      cell: (info) => (
        <div className="flex flex-wrap gap-2">
          {info.getValue()?.slice(0, 5).map((item, index) => (
            <span key={item.id ?? index} className="tag">
              {item.item?.name} × {item.quantity_change}
            </span>
          ))}
        </div>
      ),
    }),
    columnHelper.accessor((row) => adjustmentListTotal(row.items), {
      id: "total",
      header: t("columns.total"),
      cell: (info) => withCurrency(info.getValue()),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t("columns.actions"),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const row = info.row.original;
        const editable = canEdit(row.status);
        const deletable = canDelete(row.status);
        const postable = canPost(row.status);
        const voidable = canVoid(row.status);
        const busy = actionLoadingId === String(row.id);

        return (
          <div className="flex gap-2 flex-wrap">
            {postable && (
              <IconTooltipButton label={t('common:actions.upload')}
                variant="success"
               
                disabled={busy}
                onClick={() =>
                  protectAction(
                    async () => {
                      try {
                        setActionLoadingId(String(row.id));
                        const result = await postDocument({
                          db,
                          documentType: "adjustment",
                          documentId: String(row.id),
                          userId,
                          integrationManager: manager,
                        });
                        toast.success(
                          result.skipped
                            ? result.reason || t("adjustment.alreadyPosted")
                            : t("adjustment.posted", {
                                count: result.ledgerEntryCount,
                              })
                        );
                        loadHook.fetchData();
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : String(error)
                        );
                      } finally {
                        setActionLoadingId(null);
                      }
                    },
                    {
                      module: "Edit Adjustments",
                      description: t("security.postAdjustments"),
                    }
                  )
                }
              >
                <FontAwesomeIcon icon={faUpload} />
              </IconTooltipButton>
            )}
            {editable && row.status === "draft" && (
              <IconTooltipButton label={t('common:actions.approve')}
                variant="secondary"
               
                disabled={busy}
                onClick={() =>
                  protectAction(
                    async () => {
                      try {
                        setActionLoadingId(String(row.id));
                        await approveDocument(
                          db,
                          "adjustment",
                          String(row.id),
                          userId
                        );
                        toast.success(t("adjustment.approved"));
                        loadHook.fetchData();
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : String(error)
                        );
                      } finally {
                        setActionLoadingId(null);
                      }
                    },
                    {
                      module: "Edit Adjustments",
                      description: t("security.approveAdjustments"),
                    }
                  )
                }
              >
                <FontAwesomeIcon icon={faCheck} />
              </IconTooltipButton>
            )}
            {voidable && (
              <IconTooltipButton label={t('common:actions.void')}
                variant="danger"
               
                disabled={busy}
                onClick={() =>
                  protectAction(
                    async () => {
                      try {
                        setActionLoadingId(String(row.id));
                        const result = await voidDocument({
                          db,
                          documentType: "adjustment",
                          documentId: String(row.id),
                          userId,
                          integrationManager: manager,
                        });
                        toast.success(
                          result.skipped
                            ? result.reason || t("adjustment.alreadyVoided")
                            : t("adjustment.voided", {
                                count: result.ledgerEntryCount,
                              })
                        );
                        loadHook.fetchData();
                      } catch (error) {
                        toast.error(
                          error instanceof Error ? error.message : String(error)
                        );
                      } finally {
                        setActionLoadingId(null);
                      }
                    },
                    {
                      module: "Edit Adjustments",
                      description: t("security.voidAdjustments"),
                    }
                  )
                }
              >
                <FontAwesomeIcon icon={faBan} />
              </IconTooltipButton>
            )}
            {editable && (
              <Button
                variant="primary"
                onClick={() => {
                  protectAction(
                    () => {
                      setData(row);
                      setFormModal(true);
                    },
                    {
                      module: "Edit Adjustments",
                      description: t("security.editAdjustments"),
                    }
                  );
                }}
              >
                <FontAwesomeIcon icon={faPencil} />
              </Button>
            )}
            {deletable && (
              <DeleteConfirm
                message={t("adjustment.deleteConfirm", {
                  number: row.invoice_number,
                })}
                onConfirm={() =>
                  protectAction(
                    async () => {
                      await db.delete(row.id);
                      await db.query(
                        `DELETE FROM ${Tables.inventory_adjustment_items} WHERE adjustment = $id`,
                        { id: row.id }
                      );
                      loadHook.fetchData();
                    },
                    {
                      module: "Delete Adjustments",
                      description: t("security.deleteAdjustments"),
                    }
                  )
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
            key="adjustment-create"
            variant="primary"
            onClick={() => setFormModal(true)}
            icon={faPlus}
          >
            {t("buttons.adjustment")}
          </Button>,
        ]}
      />
      {formModal && (
        <InventoryAdjustmentForm
          open={true}
          data={data}
          onClose={() => {
            setFormModal(false);
            setData(undefined);
            loadHook.fetchData();
          }}
        />
      )}
    </>
  );
};
