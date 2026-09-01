/**
 * ReasonCodeSelector — dropdown of structured reason codes for voids/refunds.
 *
 * Replaces the free-text Textarea with a structured dropdown that enables
 * reporting on WHY items are voided/refunded. The free-text field remains
 * as an optional "additional notes" for context.
 *
 * Research finding: "Broken refund/void flows" is a top complaint (COMP-1
 * pain point #8). Toast and Square use structured reason codes that enable
 * reporting. Free-text reasons are impossible to aggregate.
 *
 * Usage: replace the Textarea in refund/cancel modals with this component.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { Textarea } from "@/components/common/input/textarea.tsx";
import {
  getReasonCodes,
  type ReasonCode,
} from "@/lib/reason-codes.ts";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";

interface Props {
  type: "void" | "refund";
  value: string | null;
  onChange: (code: string | null) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
}

export function ReasonCodeSelector({
  type,
  value,
  onChange,
  notes,
  onNotesChange,
}: Props) {
  const { t } = useTranslation(["orders"]);
  const [page] = useAtom(appPage);

  // Check if current user is manager/admin
  const roles: string[] = (page as any)?.user?.user_role?.roles || (page as any)?.user?.roles || [];
  const isManager = roles.some(
    (r: string) => r === "admin" || r === "super_admin" || r === "manager" || r.startsWith("admin.") || r.startsWith("manager.")
  );

  const availableCodes = useMemo(() => getReasonCodes(type, isManager), [type, isManager]);

  const options = useMemo(
    () =>
      availableCodes.map((code: ReasonCode) => ({
        label: t(`orders:${type}Reasons.${code.code}`, { defaultValue: code.defaultValue }),
        value: code.code,
      })),
    [availableCodes, t, type]
  );

  const selectedCode = availableCodes.find((c) => c.code === value);

  return (
    <div className="space-y-3" data-testid={`reason-code-selector-${type}`}>
      {/* Structured reason dropdown */}
      <div>
        <label className="block text-sm font-semibold mb-2">
          {t(`orders:${type}Reasons.label`, { defaultValue: type === "void" ? "Void reason" : "Refund reason" })}
          <span className="text-red-500 ml-1">*</span>
        </label>
        <ReactSelect
          value={options.find((o) => o.value === value) || null}
          onChange={(option: any) => onChange(option?.value || null)}
          options={options}
          placeholder={t(`orders:${type}Reasons.placeholder`, { defaultValue: "Select a reason…" })}
          isClearable={false}
        />
        {selectedCode?.requiresManagerApproval && !isManager && (
          <p className="text-xs text-amber-600 mt-1">
            {t(`orders:${type}Reasons.managerApprovalRequired`, {
              defaultValue: "⚠ This reason requires manager approval",
            })}
          </p>
        )}
      </div>

      {/* Optional additional notes */}
      <div>
        <label className="block text-sm font-semibold mb-2">
          {t(`orders:${type}Reasons.additionalNotes`, { defaultValue: "Additional notes (optional)" })}
        </label>
        <Textarea
          value={notes}
          onChange={(e) => onNotesChange(e.currentTarget.value)}
          rows={2}
          placeholder={t(`orders:${type}Reasons.notesPlaceholder`, {
            defaultValue: "Add context for this " + type,
          })}
          data-testid={`reason-notes-${type}`}
        />
      </div>
    </div>
  );
}
