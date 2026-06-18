/**
 * Kitchen reconciliation screen.
 *
 * UI events:
 * - Generate → generateReconciliation(kitchen, businessDate, user)
 * - Grid save draft / CSV import → saveManualInputs(lines, user)
 * - Verify → verifyReconciliation(id, user) with manager gate
 */
import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {toast} from "sonner";
import {faCheck, faPlus, faTrash, faUpload} from "@fortawesome/free-solid-svg-icons";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {appPage} from "@/store/jotai.ts";
import {businessDateFromJsDate} from "@/lib/kitchen/business-date.ts";
import {ManualLineInput} from "@/lib/kitchen/reconciliation.service.ts";
import {useKitchenReconciliation} from "@/hooks/useKitchenReconciliation.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {Button} from "@/components/common/input/button.tsx";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {getToday, calendarDateToDate} from "@/utils/date.ts";
import {DateValue} from "react-aria-components";
import {MissedDaysBanner} from "@/components/inventory/kitchen_reconciliation/missed-days.banner.tsx";
import {ReconciliationGrid} from "@/components/inventory/kitchen_reconciliation/reconciliation.grid.tsx";
import {VariancePanel} from "@/components/inventory/kitchen_reconciliation/variance.panel.tsx";
import {ReconciliationCsvImportModal} from "@/components/inventory/kitchen_reconciliation/csv.import.tsx";
import {RevisionHistory} from "@/components/inventory/kitchen_reconciliation/revision.history.tsx";

type KitchenOption = {
  label: string;
  value: string;
};

const toKitchenOption = (kitchen: Kitchen): KitchenOption => {
  const id = kitchen.id as string | {toString(): string};
  return {
    label: kitchen.name,
    value: typeof id === "string" ? id : id.toString(),
  };
};

export const KitchenReconciliationScreen = () => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [state] = useAtom(appPage);
  const {protectAction} = useSecurity();

  const [businessDate, setBusinessDate] = useState<DateValue | null>(getToday());
  const [selectedKitchen, setSelectedKitchen] = useState<KitchenOption | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);

  const kitchenId = selectedKitchen?.value ?? null;

  const businessDateStr = useMemo(() => {
    const date = calendarDateToDate(businessDate);
    return date ? businessDateFromJsDate(date) : null;
  }, [businessDate]);

  const {data: kitchens, isLoading: loadingKitchens} = useApi<SettingsData<Kitchen>>(
    Tables.kitchens,
    [],
    ["name asc"],
    0,
    9999
  );

  const kitchenOptions = useMemo(
    () => kitchens?.data?.map(toKitchenOption) ?? [],
    [kitchens]
  );

  const {
    reconciliation,
    missedDays,
    revisions,
    windowLabel,
    loading,
    error,
    generate,
    saveLines,
    verify,
    discard,
  } = useKitchenReconciliation(kitchenId, businessDateStr);

  const userId = state?.user?.id;
  const status = reconciliation?.status;
  const isVerified = status === "verified";
  const isMissed = status === "missed";

  const handleGenerate = () => {
    if (!kitchenId || !businessDateStr || !userId) {
      toast.error(t("kitchenReconciliation.selectKitchenAndDate"));
      return;
    }

    protectAction(async () => {
      try {
        await generate(userId);
        toast.success(t("kitchenReconciliation.generated"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    }, {
      module: "Kitchen Reconciliation",
      description: t("kitchenReconciliation.generateAction"),
    });
  };

  const handleSaveDraft = async (lines: ManualLineInput[]) => {
    if (!userId) return;
    try {
      await saveLines(lines, userId);
      toast.success(t("kitchenReconciliation.draftSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const isDraft = status === "draft";
  const hasItems = (reconciliation?.items?.length ?? 0) > 0;

  const handleDiscard = () => {
    if (!userId) return;
    protectAction(async () => {
      try {
        await discard(userId);
        toast.success(t("kitchenReconciliation.discarded"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    }, {
      module: "Kitchen Reconciliation",
      description: t("kitchenReconciliation.discardAction"),
    });
  };

  const handleVerify = () => {
    if (!userId) return;
    protectAction(async () => {
      try {
        await verify(userId);
        toast.success(t("kitchenReconciliation.verified"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    }, {
      module: "Kitchen Reconciliation",
      description: t("kitchenReconciliation.verifyAction"),
    });
  };

  const handleCsvImport = async (rows: Array<Record<string, string>>) => {
    if (!userId) return;

    const lines: ManualLineInput[] = [];

    for (const row of rows) {
      const code = row.item_code?.trim();
      if (!code) continue;

      const [itemRows] = await db.query(
        `SELECT id FROM ${Tables.inventory_items} WHERE code = $code LIMIT 1`,
        {code}
      );
      const item = (itemRows as Array<{id: string}> | undefined)?.[0];
      if (!item?.id) {
        toast.error(t("kitchenReconciliation.unknownItemCode", {code}));
        continue;
      }

      lines.push({
        itemId: String(item.id),
        physicalCount: row.physical_count?.trim() ? Number(row.physical_count) : null,
        wasteQty: Number(row.waste) || 0,
        staffMealQty: Number(row.staff_meal) || 0,
        complimentaryQty: Number(row.complimentary) || 0,
      });
    }

    if (lines.length === 0) return;

    try {
      await saveLines(lines, userId, "csv_import");
      toast.success(t("kitchenReconciliation.csvImported"));
      setCsvOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const statusBadgeClass = {
    draft: "bg-info-100 text-info-800",
    verified: "bg-success-100 text-success-800",
    missed: "bg-warning-100 text-warning-800",
  }[status ?? "draft"] ?? "bg-neutral-100";

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1 max-w-sm">
          <label className="block text-sm mb-1">{t("columns.kitchen")}</label>
          <ReactSelect<KitchenOption>
            value={selectedKitchen}
            onChange={(option) => setSelectedKitchen(option)}
            options={kitchenOptions}
            isLoading={loadingKitchens}
            isClearable
            className="w-full"
            placeholder={t("kitchenReconciliation.selectKitchen")}
          />
        </div>

        <div className="min-w-[180px]">
          <DatePicker
            label={t("kitchenReconciliation.businessDate")}
            value={businessDate}
            onChange={setBusinessDate}
          />
        </div>

        {windowLabel && (
          <div className="text-sm text-neutral-600 pb-2">
            {t("kitchenReconciliation.window")}: {windowLabel}
          </div>
        )}

        <div className="flex gap-2 ml-auto">
          <Button
            variant="primary"
            icon={faPlus}
            onClick={handleGenerate}
            isLoading={loading}
            disabled={!kitchenId || !businessDateStr || isVerified || isDraft}
          >
            {t("kitchenReconciliation.generate")}
          </Button>

          {reconciliation && isDraft && (
            <Button
              variant="danger"
              icon={faTrash}
              onClick={handleDiscard}
              isLoading={loading}
            >
              {t("kitchenReconciliation.discard")}
            </Button>
          )}

          {reconciliation && !isMissed && (
            <Button
              variant="secondary"
              icon={faUpload}
              onClick={() => setCsvOpen(true)}
              disabled={isVerified || !hasItems}
            >
              {t("buttons.import")}
            </Button>
          )}

          {reconciliation && isDraft && (
            <Button
              variant="success"
              icon={faCheck}
              onClick={handleVerify}
              isLoading={loading}
              disabled={!hasItems}
            >
              {t("kitchenReconciliation.verify")}
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-neutral-500 -mt-2">
        {t("kitchenReconciliation.transfersHint")}
      </p>

      {reconciliation && (
        <div className="flex items-center gap-2">
          <span className={`rounded px-2 py-1 text-xs font-medium uppercase ${statusBadgeClass}`}>
            {t(`kitchenReconciliation.status.${status}`)}
          </span>
          <span className="text-sm text-neutral-500">
            {t("kitchenReconciliation.revision")} {reconciliation.revision}
          </span>
        </div>
      )}

      {error && (
        <div className="rounded border border-danger-300 bg-danger-50 px-4 py-2 text-danger-800 text-sm">
          {error}
        </div>
      )}

      <MissedDaysBanner missedDays={missedDays} />

      {reconciliation && hasItems && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px] gap-4">
          <div className="min-w-0">
            <ReconciliationGrid
              items={reconciliation.items}
              status={status}
              readOnly={isVerified}
              saving={loading}
              onSave={handleSaveDraft}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-4 xl:min-w-[350px]">
            <VariancePanel items={reconciliation.items} status={status} />
            <RevisionHistory revisions={revisions} />
          </div>
        </div>
      )}

      {reconciliation && !hasItems && !loading && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-600">
          <p>{t("kitchenReconciliation.noItems")}</p>
          {isDraft && (
            <p className="mt-2 text-sm">{t("kitchenReconciliation.noItemsDiscardHint")}</p>
          )}
        </div>
      )}

      {!reconciliation && kitchenId && businessDateStr && !loading && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-600">
          {t("kitchenReconciliation.noReconciliation")}
        </div>
      )}

      <ReconciliationCsvImportModal
        isOpen={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImportRows={handleCsvImport}
      />
    </div>
  );
};
