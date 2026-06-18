import {useTranslation} from "react-i18next";
import {KitchenReconciliationRevision} from "@/api/model/kitchen_reconciliation_revision.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {DateTime} from "luxon";

type Props = {
  revisions: KitchenReconciliationRevision[];
};

export const RevisionHistory = ({revisions}: Props) => {
  const {t} = useTranslation("inventory");

  if (revisions.length === 0) return null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="text-lg font-semibold mb-3">{t("kitchenReconciliation.revisionHistory")}</h3>
      <ul className="space-y-2 max-h-48 overflow-y-auto text-sm">
        {revisions.map((rev) => {
          const changedAt = toJsDate(rev.changed_at);
          const label = DateTime.fromJSDate(changedAt).toLocaleString(DateTime.DATETIME_SHORT);
          const userName = rev.changed_by
            ? `${rev.changed_by.first_name ?? ""} ${rev.changed_by.last_name ?? ""}`.trim() || rev.changed_by.login
            : "—";
          return (
            <li key={rev.id} className="flex justify-between border-b border-neutral-100 pb-1">
              <span>
                <span className="font-medium capitalize">{rev.change_type.replace("_", " ")}</span>
                {" · "}
                {userName}
              </span>
              <span className="text-neutral-500">{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
