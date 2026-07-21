import React, {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {cn} from "@/lib/utils.ts";
import * as XLSX from "xlsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faDownload, faExclamationCircle, faFileExport, faUpload} from "@fortawesome/free-solid-svg-icons";
import {Tooltip} from "@/components/common/react-aria/tooltip.tsx";
import {Focusable, TooltipTrigger} from "react-aria-components";

// Very small CSV parser (not perfect, but good for simple CSVs).
// Replace with PapaParse if you want more robust parsing.
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {headers: [], rows: []};
  }

  const splitLine = (line: string) => line.split(",").map((v) => v.trim());

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);

  return {headers, rows};
}

export type CsvFieldConfig = {
  /** Internal field name (used in payload to `onCreateRow`) */
  name: string;
  /** User-friendly label shown in the UI */
  label: string;
  /** Optional: default CSV header name to preselect */
  defaultCsvHeader?: string;
};

type CsvUploadModalProps = {
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Close handler */
  onClose: () => void;

  /** Modal title describing what is being imported */
  title?: string;

  /** Fields you want to create per row (these become object keys) */
  fields: CsvFieldConfig[];

  /**
   * Called once for every row (sequentially).
   * Return a promise that performs the DB create (or any side-effect).
   */
  onCreateRow: (rowData: Record<string, string>) => Promise<void>;

  /** Optional: limit rows shown in preview table */
  previewRowLimit?: number;

  onDone?: (data: { total: number, success: number }) => void;

  /**
   * When provided, shows Export next to Download template.
   * Return rows keyed by field.name; headers use field.label (same as template).
   */
  onExport?: () => Promise<Record<string, string>[]> | Record<string, string>[];
};

export const CsvUploadModal: React.FC<CsvUploadModalProps> = ({
  isOpen,
  onClose,
  title = "Upload records using CSV",
  fields,
  onCreateRow,
  onDone,
  onExport,
}) => {
  const { t } = useTranslation('common');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string | "">>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});

  const hasFile = headers.length > 0;

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setError(null);
    setResultMessage(null);
    setErrors({});

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const {headers: h, rows: r} = parseCsv(text);

      if (h.length === 0) {
        setError("No headers found in CSV.");
        return;
      }

      setFileName(file.name);
      setHeaders(h);
      setRows(r);

      // Initialize mapping (try to match by defaultCsvHeader or label)
      const newMapping: Record<string, string | ""> = {};
      fields.forEach((field) => {
        const preferred =
          field.defaultCsvHeader || field.label || field.name;
        const found =
          h.find((hdr) => hdr.toLowerCase() === preferred.toLowerCase()) ||
          "";
        newMapping[field.name] = found;
      });
      setMapping(newMapping);
    } catch (err: any) {
      console.error(err);
      setError("Failed to read or parse CSV file.");
    }
  };

  const handleChangeMapping = (fieldName: string, csvHeader: string) => {
    setMapping((prev) => ({...prev, [fieldName]: csvHeader}));
  };

  const allRequiredMapped = useMemo(
    () =>
      fields.every(
        (field) =>
          mapping[field.name] && mapping[field.name]!.trim() !== ""
      ),
    [fields, mapping]
  );

  const handleCreate = async () => {
    if (!hasFile) {
      setError("Please upload a CSV file first.");
      return;
    }
    if (!allRequiredMapped) {
      setError("Please map all fields before creating records.");
      return;
    }

    setError('');
    setResultMessage(null);
    setIsProcessing(true);
    setErrors({});

    try {
      const headerIndex: Record<string, number> = {};
      headers.forEach((h, idx) => {
        headerIndex[h] = idx;
      });

      let successCount = 0;
      let failureCount = 0;
      const rowErrors: Record<number, string> = {};

      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const payload: Record<string, string> = {};

        for (const field of fields) {
          const csvHeader = mapping[field.name];
          if (!csvHeader) continue;
          const idx = headerIndex[csvHeader];
          payload[field.name] = row[idx] ?? "";
        }

        try {
          // Sequential create
          await onCreateRow(payload);
          successCount++;
        } catch (err: any) {
          console.error("Row create failed", err, payload);
          failureCount++;
          rowErrors[rowIndex] =
            (err && err.message) || String(err) || "Failed to create this row.";
        }
      }

      setErrors(rowErrors);

      setResultMessage(
        `Processed ${rows.length} rows. Success: ${successCount}.`
      );
      setError(`Failed: ${failureCount}`);

      if (onDone !== undefined) {
        onDone({
          total: rows.length,
          success: successCount
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadTemplate = async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      fields.map(item => item.label)
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");

    // Download file
    XLSX.writeFile(wb, "template.csv");
  }

  const handleExport = async () => {
    if (!onExport) return;
    setError(null);
    setIsExporting(true);
    try {
      const exportRows = await onExport();
      const labels = fields.map((item) => item.label);
      const dataRows = (exportRows ?? []).map((row) =>
        fields.map((field) => row[field.name] ?? "")
      );
      const ws = XLSX.utils.aoa_to_sheet([labels, ...dataRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Export");
      XLSX.writeFile(wb, "export.csv");
    } catch (err: any) {
      console.error(err);
      setError((err && err.message) || String(err) || "Failed to export CSV.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setError(null);
    setResultMessage(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      open={true}
      onClose={handleClose}
      size="xl"
      title={title}
    >
      <div className="space-y-4 px-6 py-4">
        {/* File input */}
        <div className="flex items-center gap-4 mb-5">
          <Button
            className="btn btn-secondary"
            type="button"
            onClick={downloadTemplate}
            variant="secondary"
            icon={faDownload}
            disabled={isProcessing || isExporting}
          >{t('actions.downloadTemplate')}</Button>
          {onExport && (
            <Button
              className="btn btn-secondary"
              type="button"
              onClick={handleExport}
              variant="secondary"
              icon={faFileExport}
              disabled={isProcessing || isExporting}
            >{isExporting ? t('actions.loading') : t('actions.export')}</Button>
          )}
          <label htmlFor="file" className="btn btn-primary gap-3">
            <input
              type="file"
              accept="csv,text/csv"
              className="appearance-none hidden"
              onChange={handleFileChange}
              disabled={isProcessing}
              id="file"
            /><FontAwesomeIcon icon={faUpload}/> Upload CSV file
          </label>
          {fileName && (
            <div className="text-xs text-gray-900 bg-gray-300 p-3">
              Current file: <span className="font-medium">{fileName}</span>
            </div>
          )}
        </div>
        <div className="text-primary-500">Use pipe operator "|" for multiple values. For example "store 1|store 2"
          etc...
        </div>

        {/* Mapping */}
        {hasFile && (
          <div className="rounded border bg-gray-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">
              Column Mapping
            </h3>

            <div className="grid gap-3 md:grid-cols-5">
              {fields.map((field) => (
                <div key={field.name} className="flex flex-col">
                  <span className="text-xs font-medium text-gray-700">
                    {field.label}
                  </span>
                  <select
                    className="input"
                    value={mapping[field.name] ?? ""}
                    onChange={(e) =>
                      handleChangeMapping(field.name, e.target.value)
                    }
                    disabled={isProcessing}
                  >
                    <option value="">-- Not mapped --</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {!allRequiredMapped && (
              <p className="mt-2 text-danger-600">
                Map all fields before creating records.
              </p>
            )}
          </div>
        )}

        {/* Preview table */}
        {hasFile && (
          <div className="max-h-80 overflow-auto rounded border">
            <table className="table table-hover">
              <thead className="bg-gray-100">
              <tr>
                {Object.keys(errors).length > 0 && (
                  <td style={{width: '20px'}}></td>
                )}
                {headers.map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
              </thead>
              <tbody>
              {rows
                // .slice(0, previewRowLimit)
                .map((row, rowIndex) => (
                  <tr
                    key={rowIndex}
                    className={cn(
                      rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50",
                      errors[rowIndex] && 'bg-danger-200'
                    )}
                    title={errors[rowIndex] && errors[rowIndex]}
                  >
                    {Object.keys(errors).length > 0 && (


                      <td>
                        {errors[rowIndex] && (
                          <TooltipTrigger delay={0} closeDelay={0}>
                            <Focusable>
                              <FontAwesomeIcon role="button" icon={faExclamationCircle} className="text-danger-500"/>
                            </Focusable>
                            <Tooltip>
                              {errors[rowIndex]}
                            </Tooltip>
                          </TooltipTrigger>
                        )}
                      </td>
                    )}
                    {headers.map((_, colIndex) => (
                      <td key={colIndex} className="px-3 py-2">
                        {row[colIndex]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Messages */}
        {error && (
          <p className="text-sm text-danger-600">
            {error}
          </p>
        )}
        {resultMessage && (
          <p className="text-sm text-success-600">
            {resultMessage}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-6 py-3">
          <span className="text-gray-500">
            Rows: {rows.length}
          </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={handleCreate}
            disabled={!hasFile || !allRequiredMapped || isProcessing}
          >
            {isProcessing ? "Creating..." : "Create"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};