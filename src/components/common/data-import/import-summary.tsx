import {useTranslation} from "react-i18next";
import {cn} from "@/lib/utils.ts";
import type {ImportSummary} from "@/lib/data-import/types.ts";
import {Button} from "@/components/common/input/button.tsx";

type Props = {
  summary: ImportSummary;
  onClose: () => void;
  onImportMore: () => void;
};

export const DataImportSummary = ({summary, onClose, onImportMore}: Props) => {
  const {t} = useTranslation("common");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard
          label={t("dataImport.summaryTotal")}
          value={summary.total}
        />
        <SummaryCard
          label={t("dataImport.summaryImported")}
          value={summary.imported}
          tone="success"
        />
        <SummaryCard
          label={t("dataImport.summarySkipped")}
          value={summary.skipped}
          tone="warning"
        />
        <SummaryCard
          label={t("dataImport.summaryFailed")}
          value={summary.failed}
          tone="danger"
        />
      </div>

      {summary.errors.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 max-h-48 overflow-auto">
          <p className="font-medium text-danger mb-2">
            {t("dataImport.summaryErrors")}
          </p>
          <ul className="text-sm space-y-1">
            {summary.errors.map((err) => (
              <li key={`${err.index}-${err.message}`}>
                {t("dataImport.rowN", {n: err.index + 1})}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onImportMore} flat>
          {t("dataImport.importMore")}
        </Button>
        <Button type="button" variant="primary" onClick={onClose}>
          {t("dataImport.done")}
        </Button>
      </div>
    </div>
  );
};

const SummaryCard = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning" | "danger";
}) => (
  <div
    className={cn(
      "rounded-xl border border-neutral-200 p-3 text-center",
      tone === "success" && "border-success/40 bg-success/5",
      tone === "warning" && "border-warning/40 bg-warning/5",
      tone === "danger" && "border-danger/40 bg-danger/5"
    )}
  >
    <div className="text-2xl font-semibold">{value}</div>
    <div className="text-xs text-neutral-500 mt-1">{label}</div>
  </div>
);
