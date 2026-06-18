import {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {StockTransfer} from "@/api/model/stock_transfer.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {getStockTransfer, inferTransferType} from "@/lib/inventory/stock_transfer.service.ts";
import {toJsDate, toLuxonDateTime} from "@/lib/datetime.ts";
import classNames from "classnames";

interface Props {
  open: boolean;
  transfer: StockTransfer | null;
  onClose: () => void;
}

const toRecordIdString = (id: unknown): string => {
  if (!id) return "";
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null && "toString" in id) {
    return (id as {toString(): string}).toString();
  }
  return String(id);
};

export const StockTransferViewModal = ({open, transfer, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [viewTransfer, setViewTransfer] = useState<StockTransfer | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !transfer?.id) {
        setViewTransfer(null);
        return;
      }

      setLoading(true);
      try {
        const result = await getStockTransfer(db, toRecordIdString(transfer.id));
        setViewTransfer(result);
      } catch (error) {
        console.error("Failed to load stock transfer details", error);
        setViewTransfer(null);
      } finally {
        setLoading(false);
      }
    };

    void fetchDetails();
  }, [open, transfer?.id]);

  if (!open) {
    return null;
  }

  const type = viewTransfer ? inferTransferType(viewTransfer) : "kitchen";

  return (
    <Modal
      title={t("stockTransfer.viewTitle")}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-neutral-300 border-t-primary-500" />
        </div>
      )}

      {!loading && viewTransfer && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={classNames(
                    "tag",
                    type === "kitchen"
                      ? "bg-info-100 text-info-800"
                      : "bg-neutral-100 text-neutral-800"
                  )}
                >
                  {type === "kitchen"
                    ? t("stockTransfer.typeKitchen")
                    : t("stockTransfer.typeStore")}
                </span>
                <div className="text-lg font-semibold">{t("stockTransfer.viewTitle")}</div>
              </div>
              <div className="text-xs text-neutral-500">
                {viewTransfer.created_at
                  ? toLuxonDateTime(viewTransfer.created_at).toFormat(import.meta.env.VITE_DATE_FORMAT)
                  : "—"}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-neutral-700">
              <div>
                <div className="text-neutral-500 text-xs uppercase">
                  {type === "kitchen"
                    ? t("stockTransfer.fromKitchen")
                    : t("stockTransfer.fromStore")}
                </div>
                <div>
                  {type === "kitchen"
                    ? viewTransfer.from_kitchen?.name ?? "—"
                    : viewTransfer.from_store?.name ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">
                  {type === "kitchen"
                    ? t("stockTransfer.toKitchen")
                    : t("stockTransfer.toStore")}
                </div>
                <div>
                  {type === "kitchen"
                    ? viewTransfer.to_kitchen?.name ?? "—"
                    : viewTransfer.to_store?.name ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">
                  {t("columns.createdBy")}
                </div>
                <div>
                  {viewTransfer.created_by?.first_name} {viewTransfer.created_by?.last_name}
                </div>
              </div>
              {viewTransfer.notes && (
                <div className="col-span-full">
                  <div className="text-neutral-500 text-xs uppercase">
                    {t("stockTransfer.notes")}
                  </div>
                  <div>{viewTransfer.notes}</div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
            <div className="text-sm font-semibold text-neutral-800 mb-3">
              {t("tabs.items")}
            </div>
            {viewTransfer.items && viewTransfer.items.length > 0 ? (
              <div className="max-h-64 overflow-auto divide-y divide-neutral-200">
                {viewTransfer.items.map((line) => (
                  <div key={line.id} className="py-2 flex flex-wrap gap-2 text-sm">
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-medium">
                        {line.item?.name ?? "Item"}
                        {line.item?.code ? ` (${line.item.code})` : ""}
                      </div>
                      {line.item?.uom && (
                        <div className="text-xs text-neutral-500">{line.item.uom}</div>
                      )}
                    </div>
                    <div className="w-24 text-right">
                      <div className="text-neutral-700">
                        {t("forms.quantity")}: {line.quantity}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                {t("stockTransfer.noItems")}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
