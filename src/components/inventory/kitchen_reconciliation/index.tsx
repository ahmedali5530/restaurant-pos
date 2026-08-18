/**
 * Kitchen reconciliation screen.
 *
 * UI events:
 * - Generate → generateReconciliation(location, businessDate, user)
 * - Grid save draft / CSV import → saveManualInputs(lines, user)
 * - Verify → verifyReconciliation(id, user) with manager gate
 */
import {useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {toast} from "sonner";
import {faCheck, faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {appPage} from "@/store/jotai.ts";
import {businessDateFromJsDate} from "@/lib/kitchen/business-date.ts";
import {ManualLineInput} from "@/lib/kitchen/reconciliation.service.ts";
import {useKitchenReconciliation} from "@/hooks/useKitchenReconciliation.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {Button} from "@/components/common/input/button.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {getToday, calendarDateToDate} from "@/utils/date.ts";
import {DateValue} from "react-aria-components";
import {MissedDaysBanner} from "@/components/inventory/kitchen_reconciliation/missed-days.banner.tsx";
import {ReconciliationGrid} from "@/components/inventory/kitchen_reconciliation/reconciliation.grid.tsx";
import {VariancePanel} from "@/components/inventory/kitchen_reconciliation/variance.panel.tsx";
import {RevisionHistory} from "@/components/inventory/kitchen_reconciliation/revision.history.tsx";
import {listInventoryLocations, toLocationOptions} from "@/lib/inventory/location.service.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {
  createKitchenReconImportConfig,
  type KitchenReconLine,
} from "@/components/inventory/kitchen_reconciliation/kitchen-recon.import.config.ts";

type LocationOption = {
  label: string;
  value: string;
};

export const KitchenReconciliationScreen = () => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [state] = useAtom(appPage);
  const {protectAction} = useSecurity();

  const [businessDate, setBusinessDate] = useState<DateValue | null>(getToday());
  const [selectedLocation, setSelectedLocation] = useState<LocationOption | null>(null);
  const [locationRows, setLocationRows] = useState<InventoryLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const batchRef = useRef<KitchenReconLine[]>([]);

  const locationId = selectedLocation?.value ?? null;

  const businessDateStr = useMemo(() => {
    const date = calendarDateToDate(businessDate);
    return date ? businessDateFromJsDate(date) : null;
  }, [businessDate]);

  useEffect(() => {
    let cancelled = false;
    setLoadingLocations(true);
    listInventoryLocations(db, {sync: true, activeOnly: true})
      .then((rows) => {
        if (!cancelled) setLocationRows(rows);
      })
      .catch((error) => {
        console.error("Failed to load inventory locations", error);
        if (!cancelled) setLocationRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLocations(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const locationOptions = useMemo(
    () => toLocationOptions(locationRows),
    [locationRows]
  );

  const {
    reconciliation,
    missedDays,
    revisions,
    windowLabel,
    loading,
    statusMessage,
    error,
    generate,
    saveLines,
    verify,
    discard,
  } = useKitchenReconciliation(locationId, businessDateStr);

  const kitchenReconImportConfig = useMemo(
    () =>
      createKitchenReconImportConfig({
        db,
        t,
        collect: (line) => batchRef.current.push(line),
        getExistingItems: () =>
          (reconciliation?.items ?? []).map((line) => ({
            itemId: String(line.item?.id ?? ""),
            itemCode: line.item?.code ?? "",
          })),
      }),
    [db, t, reconciliation?.items]
  );

  const userId = state?.user?.id;
  const status = reconciliation?.status;
  const isVerified = status === "verified";
  const isMissed = status === "missed";
  const isDraft = status === "draft";
  const hasItems = (reconciliation?.items?.length ?? 0) > 0;

  const handleGenerate = () => {
    if (!locationId || !businessDateStr || !userId) {
      toast.error(t("kitchenReconciliation.selectLocationAndDate"));
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
      module: "inventory.kitchen_reconciliation",
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
      module: "inventory.kitchen_reconciliation",
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
      module: "inventory.kitchen_reconciliation",
      description: t("kitchenReconciliation.verifyAction"),
    });
  };

  const handleSmartImportDone = async () => {
    if (!userId) return;
    const lines = batchRef.current.splice(0, batchRef.current.length);
    if (lines.length === 0) {
      setCsvOpen(false);
      return;
    }

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
          <label className="block text-sm mb-1">{t("columns.location")}</label>
          <ReactSelect<LocationOption>
            value={selectedLocation}
            onChange={(option) => setSelectedLocation(option)}
            options={locationOptions}
            isLoading={loadingLocations}
            isClearable
            className="w-full"
            placeholder={t("kitchenReconciliation.selectLocation")}
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
            data-testid="inventory-add-reconciliation"
            onClick={handleGenerate}
            isLoading={loading}
            disabled={!locationId || !businessDateStr || isVerified || isDraft}
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
              onClick={() => setCsvOpen(true)}
              disabled={isVerified || !hasItems}
            >
              <span className="mr-2"><AiSparklesIcon /></span>
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

      {loading && statusMessage && (
        <div className="text-sm text-neutral-500">
          {t(`kitchenReconciliation.progress.${statusMessage}`, {
            defaultValue: t("kitchenReconciliation.generating"),
          })}
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
            <RevisionHistory revisions={revisions} items={reconciliation.items} />
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

      {!reconciliation && locationId && businessDateStr && !loading && (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-8 text-center text-neutral-600">
          {t("kitchenReconciliation.noReconciliation")}
        </div>
      )}

      {csvOpen && (
        <DataImportModal
          isOpen
          onClose={() => {
            batchRef.current = [];
            setCsvOpen(false);
          }}
          config={kitchenReconImportConfig}
          title={t("kitchenReconciliation.smartImportTitle", {
            defaultValue: t("kitchenReconciliation.csvImportTitle", {defaultValue: "AI Import"}),
          })}
          enableImportModes
          defaultMatchFields={["item_code"]}
          onExport={() =>
            (reconciliation?.items ?? []).map((line) => ({
              item_code: line.item?.code ?? "",
              item_name: line.item?.name ?? "",
              physical_count: line.physical_count != null ? String(line.physical_count) : "",
              waste: String(line.waste_qty ?? 0),
              staff_meal: String(line.staff_meal_qty ?? 0),
              complimentary: String(line.complimentary_qty ?? 0),
            }))
          }
          onDone={() => {
            void handleSmartImportDone();
          }}
        />
      )}
    </div>
  );
};
