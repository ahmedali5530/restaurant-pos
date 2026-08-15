import {useEffect, useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {DataImportUploadStep} from "@/components/common/data-import/upload-step.tsx";
import {DataImportMappingStep} from "@/components/common/data-import/mapping-step.tsx";
import {DataImportReviewGrid} from "@/components/common/data-import/review-grid.tsx";
import {DataImportSummary} from "@/components/common/data-import/import-summary.tsx";
import {useDataImport} from "@/hooks/useDataImport.ts";
import {autoMapColumns} from "@/lib/data-import/extract/structured.ts";
import type {ImportConfiguration} from "@/lib/data-import/types.ts";
import type {CsvImportMode} from "@/utils/csv-import.ts";
import {AiQuotaError} from "@/lib/openai.service.ts";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  config: ImportConfiguration;
  title?: string;
  onDone?: () => void;
  enableImportModes?: boolean;
  defaultMatchFields?: string[];
  onExport?: () => Promise<Record<string, string>[]> | Record<string, string>[];
};

export const DataImportModal = ({
  isOpen,
  onClose,
  config,
  title,
  onDone,
  enableImportModes = false,
  defaultMatchFields,
  onExport,
}: Props) => {
  const {t} = useTranslation("common");
  const importer = useDataImport({config});
  const [sheetIndex, setSheetIndex] = useState(0);
  const [importMode, setImportMode] = useState<CsvImportMode>(
    config.defaultMode ?? "create"
  );
  const [matchFields, setMatchFields] = useState<string[]>(
    defaultMatchFields ?? config.matchFields ?? []
  );

  useEffect(() => {
    if (!isOpen) {
      importer.reset();
      setSheetIndex(0);
      setImportMode(config.defaultMode ?? "create");
      setMatchFields(defaultMatchFields ?? config.matchFields ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when closed
  }, [isOpen]);

  useEffect(() => {
    if (importer.step === "mapping" && importer.structured) {
      setSheetIndex(importer.structured.sheetIndex ?? 0);
    }
  }, [importer.step, importer.structured]);

  const heading = title || t("dataImport.title", {entity: config.entityLabel});

  const progressLabel = useMemo(() => {
    if (!importer.progress) return null;
    const {current, total, message, stage} = importer.progress;
    if (message) return message;
    if (stage === "import") {
      return t("dataImport.importingProgress", {current, total});
    }
    return t("dataImport.progress", {current, total});
  }, [importer.progress, t]);

  const handleClose = () => {
    importer.cancel();
    importer.reset();
    onClose();
  };

  const displayError = importer.error;

  const structuredForMapping = importer.structured
    ? {...importer.structured, sheetIndex}
    : null;

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title={heading}
      size="xl"
      shouldCloseOnOverlayClick={false}
    >
      <div className="flex flex-col gap-4 min-h-[20rem]">
        {displayError && (
          <div className="alert alert-danger text-sm" role="alert">
            {displayError}
          </div>
        )}

        {importer.step === "upload" && (
          <DataImportUploadStep
            fields={config.fields}
            onExport={onExport}
            onFile={(file) => {
              void importer.startWithFile(file).catch((err) => {
                if (err instanceof AiQuotaError) {
                  importer.setError(err.message);
                }
              });
            }}
          />
        )}

        {importer.step === "mapping" && structuredForMapping && (
          <DataImportMappingStep
            fields={config.fields}
            structured={structuredForMapping}
            mapping={importer.mapping}
            onChangeMapping={importer.setMapping}
            onChangeSheet={(idx) => {
              setSheetIndex(idx);
              const sheet = importer.structured?.sheets[idx];
              if (sheet) {
                importer.setMapping(
                  autoMapColumns(
                    sheet.headers,
                    config.fields.map((f) => ({
                      name: f.name,
                      label: f.label,
                      aliases: f.aliases,
                    }))
                  )
                );
              }
            }}
            onBack={() => importer.reset()}
            onConfirm={() => {
              void importer.confirmMapping(importer.mapping, sheetIndex);
            }}
          />
        )}

        {(importer.step === "extracting" || importer.step === "importing") && (
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <div className="h-10 w-10 rounded-full border-4 border-neutral-200 border-t-primary animate-spin" />
            <p className="text-neutral-700">{progressLabel}</p>
            <Button type="button" flat onClick={() => importer.cancel()}>
              {t("dataImport.cancel")}
            </Button>
          </div>
        )}

        {importer.step === "review" && (
          <DataImportReviewGrid
            config={config}
            records={importer.records}
            onChange={importer.updateRecords}
            onRevalidate={async () => importer.revalidate()}
            enableImportModes={enableImportModes}
            importMode={importMode}
            onImportModeChange={setImportMode}
            matchFields={matchFields}
            onMatchFieldsChange={setMatchFields}
            onConfirm={() => {
              if (enableImportModes && importMode !== "create" && matchFields.length === 0) {
                importer.setError(t("csvImport.selectMatchColumns"));
                return;
              }
              void importer.confirmImport({
                mode: enableImportModes ? importMode : (config.defaultMode ?? "create"),
                matchFields: importMode === "create" ? [] : matchFields,
              });
            }}
            onBack={() => importer.reset()}
            confirming={false}
          />
        )}

        {importer.step === "summary" && importer.summary && (
          <DataImportSummary
            summary={importer.summary}
            onClose={() => {
              onDone?.();
              handleClose();
            }}
            onImportMore={() => {
              onDone?.();
              importer.reset();
            }}
          />
        )}
      </div>
    </Modal>
  );
};
