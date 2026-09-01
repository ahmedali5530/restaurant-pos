import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {
  KitchenReconciliationFieldChange,
  KitchenReconciliationRevision,
} from "@/api/model/kitchen_reconciliation_revision.ts";
import {KitchenReconciliationItem} from "@/api/model/kitchen_reconciliation_item.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {normalizeInventoryItemId} from "@/lib/kitchen/reconciliation.service.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {formatNumber} from "@/lib/utils.ts";
import {DateTime} from "luxon";

type Props = {
  revisions: KitchenReconciliationRevision[];
  items?: KitchenReconciliationItem[];
};

const FIELD_LABEL_KEYS: Record<string, string> = {
  physical_count: "kitchenReconciliation.physical",
  waste_qty: "kitchenReconciliation.waste",
  staff_meal_qty: "kitchenReconciliation.staffMeal",
  complimentary_qty: "kitchenReconciliation.complimentary",
  expected_stock: "kitchenReconciliation.expected",
  actual_consumption: "kitchenReconciliation.actualConsumption",
  variance: "kitchenReconciliation.variance",
  _summary: "kitchenReconciliation.revisionSummary",
};

const formatCellValue = (value: unknown): string => {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const userLabel = (rev: KitchenReconciliationRevision): string => {
  if (!rev.changed_by) return "—";
  const name = `${rev.changed_by.first_name ?? ""} ${rev.changed_by.last_name ?? ""}`.trim();
  return name || rev.changed_by.login || "—";
};

export const RevisionHistory = ({revisions, items = []}: Props) => {
  const {t} = useTranslation("inventory");
  const [selected, setSelected] = useState<KitchenReconciliationRevision | null>(null);

  const itemLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of items) {
      const id = normalizeInventoryItemId(line.item?.id ?? line.item);
      if (!id) continue;
      const label = [line.item?.code, line.item?.name].filter(Boolean).join(" — ") || id;
      map.set(id, label);
    }
    return map;
  }, [items]);

  if (revisions.length === 0) return null;

  const changeTypeLabel = (changeType: string) =>
    t(`kitchenReconciliation.changeTypes.${changeType}`, {
      defaultValue: changeType.replace(/_/g, " "),
    });

  const fieldLabel = (field: string) => {
    const key = FIELD_LABEL_KEYS[field];
    return key ? t(key) : field.replace(/_/g, " ");
  };

  const itemLabel = (itemId?: string) => {
    if (!itemId) return "—";
    const normalized = normalizeInventoryItemId(itemId);
    return itemLabels.get(normalized) || itemLabels.get(itemId) || itemId;
  };

  const fieldChanges: KitchenReconciliationFieldChange[] = Array.isArray(selected?.field_changes)
    ? selected.field_changes
    : [];

  return (
    <>
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <h3 className="mb-3 text-lg font-semibold">{t("kitchenReconciliation.revisionHistory")}</h3>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
          {revisions.map((rev) => {
            const changedAt = toJsDate(rev.changed_at);
            const label = DateTime.fromJSDate(changedAt).toLocaleString(DateTime.DATETIME_SHORT);
            return (
              <li key={rev.id}>
                <button
                  type="button"
                  onClick={() => setSelected(rev)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left transition hover:border-neutral-200 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  <span>
                    <span className="font-medium capitalize">{changeTypeLabel(rev.change_type)}</span>
                    {" · "}
                    {userLabel(rev)}
                  </span>
                  <span className="shrink-0 text-neutral-500">{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={
          selected
            ? t("kitchenReconciliation.revisionDetailTitle", {
                revision: selected.revision_number,
                type: changeTypeLabel(selected.change_type),
              })
            : t("kitchenReconciliation.revisionDetail")
        }
        size="lg"
      >
        {selected && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <div className="text-sm text-neutral-500">{t("kitchenReconciliation.changedBy")}</div>
                <div className="font-medium">{userLabel(selected)}</div>
              </div>
              <div>
                <div className="text-sm text-neutral-500">{t("kitchenReconciliation.changedAt")}</div>
                <div className="font-medium">
                  {DateTime.fromJSDate(toJsDate(selected.changed_at)).toLocaleString(
                    DateTime.DATETIME_MED
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm text-neutral-500">{t("kitchenReconciliation.changeType")}</div>
                <div className="font-medium capitalize">{changeTypeLabel(selected.change_type)}</div>
              </div>
            </div>

            {(selected.snapshot_before || selected.snapshot_after) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {selected.snapshot_before && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <div className="mb-2 text-sm font-medium text-neutral-600">
                      {t("kitchenReconciliation.snapshotBefore")}
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-neutral-700">
                      {JSON.stringify(selected.snapshot_before, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.snapshot_after && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                    <div className="mb-2 text-sm font-medium text-neutral-600">
                      {t("kitchenReconciliation.snapshotAfter")}
                    </div>
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-neutral-700">
                      {JSON.stringify(selected.snapshot_after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            <div>
              <h4 className="mb-2 font-semibold">{t("kitchenReconciliation.fieldChanges")}</h4>
              {fieldChanges.length === 0 ? (
                <p className="text-sm text-neutral-500">{t("kitchenReconciliation.noFieldChanges")}</p>
              ) : (
                <div className="max-h-[50vh] overflow-auto rounded-lg border border-neutral-200">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-neutral-50 text-left">
                      <tr>
                        <th className="px-3 py-2">{t("kitchenReconciliation.revisionItem")}</th>
                        <th className="px-3 py-2">{t("kitchenReconciliation.revisionField")}</th>
                        <th className="px-3 py-2">{t("kitchenReconciliation.oldValue")}</th>
                        <th className="px-3 py-2">{t("kitchenReconciliation.newValue")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldChanges.map((change, index) => (
                        <tr key={`${change.item_id ?? ""}-${change.field}-${index}`} className="border-t border-neutral-100">
                          <td className="px-3 py-2">{itemLabel(change.item_id)}</td>
                          <td className="px-3 py-2">{fieldLabel(change.field)}</td>
                          <td className="px-3 py-2 text-neutral-600">{formatCellValue(change.old)}</td>
                          <td className="px-3 py-2 font-medium">{formatCellValue(change.new)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
