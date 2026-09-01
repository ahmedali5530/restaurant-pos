import {useCallback, useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faFileExport, faUpload} from "@fortawesome/free-solid-svg-icons";
import * as XLSX from "xlsx";
import {Button} from "@/components/common/input/button.tsx";
import {cn} from "@/lib/utils.ts";
import {
  clipboardHasContent,
  resolveClipboardPaste,
} from "@/lib/data-import/extract/clipboard.ts";
import {IMPORT_ACCEPT} from "@/lib/data-import/extract/detect.ts";
import type {ImportField} from "@/lib/data-import/types.ts";
import {formatFileSize, MAX_IMPORT_UPLOAD_BYTES} from "@/utils/files.ts";

type Props = {
  disabled?: boolean;
  fields: ImportField[];
  onFile: (file: File) => void;
  onExport?: () => Promise<Record<string, string>[]> | Record<string, string>[];
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export const DataImportUploadStep = ({
  disabled,
  fields,
  onFile,
  onExport,
}: Props) => {
  const {t} = useTranslation("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      onFile(file);
    },
    [onFile]
  );

  const handlePasteEvent = useCallback(
    (event: ClipboardEvent) => {
      if (disabled) return;
      if (isEditableTarget(event.target)) return;

      const file = resolveClipboardPaste(event);
      if (file) {
        event.preventDefault();
        setActionError(null);
        onFile(file);
        return;
      }

      if (clipboardHasContent(event)) {
        event.preventDefault();
        setActionError(t("dataImport.pasteUnsupported"));
      }
    },
    [disabled, onFile, t]
  );

  useEffect(() => {
    if (disabled) return;
    const onWindowPaste = (event: ClipboardEvent) => {
      handlePasteEvent(event);
    };
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, [disabled, handlePasteEvent]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([fields.map((f) => f.label)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "template.csv");
  };

  const handleExport = async () => {
    if (!onExport) return;
    setActionError(null);
    setIsExporting(true);
    try {
      const exportRows = await onExport();
      const labels = fields.map((f) => f.label);
      const dataRows = (exportRows ?? []).map((row) =>
        fields.map((field) => row[field.name] ?? "")
      );
      const ws = XLSX.utils.aoa_to_sheet([labels, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Export");
      XLSX.writeFile(wb, "export.csv");
    } catch (err: any) {
      setActionError(err?.message || String(err) || "Failed to export.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          flat
          icon={faDownload}
          disabled={disabled || isExporting}
          onClick={downloadTemplate}
        >
          {t("actions.downloadTemplate")}
        </Button>
        {onExport && (
          <Button
            type="button"
            flat
            icon={faFileExport}
            disabled={disabled || isExporting}
            isLoading={isExporting}
            onClick={() => void handleExport()}
          >
            {t("actions.export")}
          </Button>
        )}
      </div>

      {actionError && (
        <div className="alert alert-danger text-sm" role="alert">
          {actionError}
        </div>
      )}

      <div
        ref={dropzoneRef}
        tabIndex={0}
        role="button"
        className={cn(
          "rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center transition-colors outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
          dragging && "border-primary bg-primary/5",
          disabled && "opacity-60 pointer-events-none"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onPaste={(e) => {
          handlePasteEvent(e.nativeEvent);
        }}
      >
        <FontAwesomeIcon icon={faUpload} className="text-2xl text-neutral-500 mb-3" />
        <p className="text-neutral-800 font-medium mb-1">
          {t("dataImport.dropOrBrowse")}
        </p>
        <p className="text-sm text-neutral-500 mb-2">
          {t("dataImport.acceptedTypes")}
        </p>
        <p className="text-sm text-neutral-500 mb-4">
          {t("dataImport.pasteHint")}
        </p>
        <p className="text-xs text-neutral-400 mb-4">
          {t("dataImport.maxSize", {max: formatFileSize(MAX_IMPORT_UPLOAD_BYTES)})}
        </p>
        <label className="btn btn-primary inline-flex cursor-pointer">
          {t("dataImport.chooseFile")}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={IMPORT_ACCEPT}
            disabled={disabled}
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
};
