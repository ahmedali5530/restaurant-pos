import type {ReactNode} from "react";
import {useTranslation} from "react-i18next";
import {
  partitionByBranchId,
  type BranchPartition,
} from "@/api/reports/shared/branch-scope.ts";

interface BranchBreakdownProps<T extends {branch_id?: unknown}> {
  rows: T[];
  labels: Map<string, string>;
  branchOrder?: string[];
  /** When false, render a single combined section with no headings. */
  enabled: boolean;
  renderSection: (section: {
    key: string;
    label: string | null;
    rows: T[];
    isTotal: boolean;
  }) => ReactNode;
}

/**
 * Combined: one call to renderSection with all rows.
 * By branch: one section per branch, then a Total section with all rows
 * (aggregates/rates should be recomputed from the full set, not averaged).
 */
export function BranchBreakdown<T extends {branch_id?: unknown}>({
  rows,
  labels,
  branchOrder,
  enabled,
  renderSection,
}: BranchBreakdownProps<T>) {
  const {t} = useTranslation("reports");

  if (!enabled) {
    return (
      <>
        {renderSection({
          key: "combined",
          label: null,
          rows,
          isTotal: false,
        })}
      </>
    );
  }

  const parts: BranchPartition<T>[] = partitionByBranchId(
    rows,
    labels,
    branchOrder,
  );

  return (
    <>
      {parts.map((part) => (
        <div key={part.branchId} className="mb-8" data-branch-section={part.branchId}>
          <h2 className="text-lg font-semibold mb-3 text-foreground">
            {part.label}
          </h2>
          {renderSection({
            key: part.branchId,
            label: part.label,
            rows: part.rows,
            isTotal: false,
          })}
        </div>
      ))}
      {parts.length > 1 && (
        <div className="mb-8" data-branch-section="total">
          <h2 className="text-lg font-semibold mb-3 text-foreground">
            {t("labels.branchTotal")}
          </h2>
          {renderSection({
            key: "total",
            label: t("labels.branchTotal"),
            rows,
            isTotal: true,
          })}
        </div>
      )}
    </>
  );
}
