import {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {ProductionBatch} from "@/api/model/production_batch.ts";
import {useDB} from "@/api/db/db.ts";
import {getProductionBatch} from "@/lib/inventory/production.service.ts";
import {recordToString} from "@/api/reports/shared/records.ts";
import {toJsDate} from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  batchId: string | null;
  onClose: () => void;
}

export const ProductionBatchViewModal = ({open, batchId, onClose}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [batch, setBatch] = useState<ProductionBatch | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !batchId) {
      setBatch(null);
      return;
    }
    setLoading(true);
    getProductionBatch(db, batchId)
      .then(setBatch)
      .finally(() => setLoading(false));
  }, [open, batchId, db]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={batch ? `${t("production.batch")} ${batch.batch_number}` : t("production.batch")}
      size="xl"
    >
      {loading && <p>{t("common:loading")}</p>}
      {batch && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><strong>{t("production.recipe")}:</strong> {batch.recipe?.name}</div>
            <div><strong>{t("columns.stores")}:</strong> {batch.store?.name}</div>
            <div><strong>{t("production.producedQty")}:</strong> {batch.produced_qty}</div>
            <div><strong>{t("production.scaleFactor")}:</strong> {batch.scale_factor}</div>
            <div><strong>{t("production.yieldLoss")}:</strong> {batch.yield_loss_percent}%</div>
            <div><strong>{t("production.totalInputCost")}:</strong> {batch.total_input_cost}</div>
            <div><strong>{t("production.totalOutputCost")}:</strong> {batch.total_output_cost}</div>
            <div>
              <strong>{t("columns.createdAt")}:</strong>{" "}
              {toJsDate(batch.created_at).toLocaleString()}
            </div>
          </div>

          {batch.notes && (
            <p className="text-sm"><strong>{t("production.notes")}:</strong> {batch.notes}</p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">{t("production.inputs")}</h4>
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>{t("buttons.item")}</th>
                    <th>{t("forms.quantity")}</th>
                    <th>{t("columns.price")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(batch.inputs ?? []).map((line) => (
                    <tr key={recordToString(line.id)}>
                      <td>{line.item?.name}</td>
                      <td>{line.quantity}</td>
                      <td>{line.total_cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h4 className="font-medium mb-2">{t("production.outputs")}</h4>
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>{t("buttons.item")}</th>
                    <th>{t("forms.quantity")}</th>
                    <th>{t("production.disposition")}</th>
                    <th>{t("production.allocatedCost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(batch.outputs ?? []).map((line) => (
                    <tr key={recordToString(line.id)}>
                      <td>{line.item?.name}</td>
                      <td>{line.quantity}</td>
                      <td>{line.disposition}</td>
                      <td>{line.allocated_cost}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
