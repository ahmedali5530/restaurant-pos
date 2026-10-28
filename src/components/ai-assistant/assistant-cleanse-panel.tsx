import {useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPaperclip, faSpinner, faTimes} from "@fortawesome/free-solid-svg-icons";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {
  listPermittedImportCleanseDomains,
  suggestImportCleanseDomainId,
  type ImportCleanseDomain,
} from "@/lib/ai/import-cleanse-registry.ts";
import {cleanseImportFile} from "@/lib/data-import/cleanse.ts";
import {
  buildCleanseSummaryMarkdown,
  downloadImportCsv,
  recordsToImportCsv,
} from "@/lib/data-import/records-to-csv.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";

export type CleanseResultPayload = {
  summaryMarkdown: string;
  csv: string;
  downloadName: string;
  domainId: string;
  domainLabel: string;
};

type Props = {
  db: ImportDbLike;
  allowedModules: string[];
  pathname: string;
  disabled?: boolean;
  onCleansed: (result: CleanseResultPayload) => void;
  onError: (message: string) => void;
};

export function AssistantCleansePanel({
  db,
  allowedModules,
  pathname,
  disabled,
  onCleansed,
  onError,
}: Props) {
  const {t} = useTranslation(["common"]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [domainId, setDomainId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const domains = useMemo(
    () => listPermittedImportCleanseDomains(allowedModules),
    [allowedModules],
  );

  const domainOptions = useMemo(
    () =>
      domains.map((entry: ImportCleanseDomain) => ({
        value: entry.id,
        label: t(entry.labelKey, {defaultValue: entry.labelDefault}),
      })),
    [domains, t],
  );

  const selectedDomain = domains.find(d => d.id === domainId) ?? null;

  const onPickFile = (next: File | null) => {
    setFile(next);
    if (next && !domainId) {
      const suggested = suggestImportCleanseDomainId(pathname, domains);
      if (suggested) {
        setDomainId(suggested);
      } else if (domains[0]) {
        setDomainId(domains[0].id);
      }
    }
  };

  const runCleanse = async () => {
    if (!file || !selectedDomain || busy || disabled) {
      return;
    }
    setBusy(true);
    onError("");
    try {
      const config = selectedDomain.createConfig({db, t});
      const result = await cleanseImportFile(config, file);
      const csv = recordsToImportCsv(config, result.records);
      const domainLabel = t(selectedDomain.labelKey, {defaultValue: selectedDomain.labelDefault});
      const summaryMarkdown = buildCleanseSummaryMarkdown(
        domainLabel,
        result.issuesSummary,
        {mappingAutoAccepted: result.mappingAutoAccepted, fileName: file.name},
      );
      const base = file.name.replace(/\.(csv|xlsx|xls)$/i, "");
      onCleansed({
        summaryMarkdown,
        csv,
        downloadName: `${base}-corrected.csv`,
        domainId: selectedDomain.id,
        domainLabel,
      });
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!domains.length) {
    return null;
  }

  return (
    <div className="space-y-2 border-t border-border px-2 py-2">
      <div className="text-xs font-medium text-muted">
        {t("aiAssistant.cleanseTitle", {defaultValue: "Cleanse import file"})}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          disabled={disabled || busy}
          onChange={event => {
            const next = event.target.files?.[0] ?? null;
            onPickFile(next);
          }}
        />
        <Button
          type="button"
          flat
          size="sm"
          icon={faPaperclip}
          disabled={disabled || busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {t("aiAssistant.attachFile", {defaultValue: "Attach CSV/Excel"})}
        </Button>
        {file && (
          <span className="inline-flex max-w-[12rem] items-center gap-1 truncate text-xs text-foreground">
            <span className="truncate">{file.name}</span>
            <button
              type="button"
              className="text-muted hover:text-danger"
              aria-label={t("common:close")}
              disabled={busy}
              onClick={() => {
                setFile(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </span>
        )}
      </div>
      {file && (
        <>
          <div>
            <ReactSelect
              options={domainOptions}
              value={domainOptions.find(opt => opt.value === domainId) ?? null}
              onChange={(opt: any) => {
                setDomainId(opt?.value ?? "");
              }}
              isDisabled={disabled || busy}
              placeholder={t("aiAssistant.cleanseDomain", {defaultValue: "Import domain"})}
            />
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="primary"
              filled
              size="sm"
              disabled={disabled || busy || !domainId}
              onClick={() => void runCleanse()}
            >
              {busy ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                t("aiAssistant.cleanseRun", {defaultValue: "Cleanse & prepare CSV"})
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function downloadCleanseCsv(csv: string, fileName: string) {
  downloadImportCsv(csv, fileName);
}
