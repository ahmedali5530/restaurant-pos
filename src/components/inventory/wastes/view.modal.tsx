import {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import {InventoryWaste} from "@/api/model/inventory_waste.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useDB} from "@/api/db/db.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faFile} from "@fortawesome/free-solid-svg-icons";
import {downloadArrayBuffer} from "@/utils/files.ts";
import {Button} from "@/components/common/input/button.tsx";
import { toJsDate } from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  waste: InventoryWaste | null;
  onClose: () => void;
}

export const InventoryWasteViewModal = ({open, waste, onClose}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();
  const [viewWaste, setViewWaste] = useState<InventoryWaste | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!open || !waste?.id) {
        setViewWaste(null);
        return;
      }

      setLoading(true);
      try {
        const [result] = await db.query<[InventoryWaste]>(
          `SELECT * FROM ONLY ${waste.id} FETCH purchase, purchase.items, purchase.items.item, issue, issue.items, issue.items.item, created_by, items, items.item, documents`
        );
        setViewWaste(result as InventoryWaste);
      } catch (e) {
        console.error("Failed to load waste details", e);
        setViewWaste(null);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [open, waste?.id]);

  if (!open) {
    return null;
  }

  return (
    <Modal
      title={viewWaste ? `Waste #${viewWaste.invoice_number}` : "Waste"}
      open={open}
      onClose={onClose}
      size="xl"
    >
      {loading && (
        <div className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-neutral-300 border-t-primary-500"></div>
        </div>
      )}

      {!loading && viewWaste && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">
                Waste #{viewWaste.invoice_number}
              </div>
              <div className="text-xs text-neutral-500">
                {viewWaste.created_at ? toJsDate(viewWaste.created_at).toLocaleString() : "—"}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm text-neutral-700">
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.source')}</div>
                <div>
                  {viewWaste.purchase
                    ? `Purchase #${viewWaste.purchase.invoice_number}`
                    : viewWaste.issue
                      ? `Issue #${viewWaste.issue.id}`
                      : "—"}
                </div>
              </div>
              <div>
                <div className="text-neutral-500 text-xs uppercase">{t('columns.createdBy')}</div>
                <div>{viewWaste.created_by?.first_name} {viewWaste.created_by?.last_name}</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
            <div className="text-sm font-semibold text-neutral-800 mb-3">
              Items
            </div>
            {viewWaste.items && viewWaste.items.length > 0 ? (
              <div className="max-h-64 overflow-auto divide-y divide-neutral-200">
                {viewWaste.items.map((item) => (
                  <div key={item.id} className="py-2 flex flex-wrap gap-2 text-sm">
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-medium">
                        {item.item?.name ?? "Item"}
                      </div>
                    </div>
                    <div className="w-24 text-right">
                      <div className="text-neutral-700">
                        Qty: {item.quantity}
                      </div>
                    </div>
                    <div className="flex-1 min-w-[120px] text-xs text-neutral-500">
                      {item.comments && <div className="truncate">Note: {item.comments}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                No items found for this waste.
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow border border-neutral-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
                <FontAwesomeIcon icon={faFile}/>
                <span>{t('upload.attachDocuments')}</span>
              </div>
            </div>
            {viewWaste.documents && viewWaste.documents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {viewWaste.documents.map((doc, index) => (
                  <div
                    key={doc.id ?? index}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 rounded-md bg-primary-50 text-primary-600 flex items-center justify-center">
                        <FontAwesomeIcon icon={faFile}/>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-neutral-800 truncate">
                          {doc.name ?? `Document ${index + 1}`}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {doc.mimeType ?? "File"}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        downloadArrayBuffer(
                          doc.content,
                          doc.name ?? `waste-${viewWaste.invoice_number}-${index + 1}`,
                          doc.mimeType ?? "application/octet-stream"
                        )
                      }
                    >
                      <FontAwesomeIcon icon={faDownload} className="mr-1"/>
                      Download
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-neutral-500">
                No documents attached to this waste.
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

