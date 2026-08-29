import {memo, useCallback, useEffect, useMemo, useRef, useState, startTransition} from "react";
import {useTranslation} from "react-i18next";
import {useVirtualizer} from "@tanstack/react-virtual";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {Button} from "@/components/common/input/button.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {Radio} from "@/components/common/input/radio.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {KeyboardGrid, KeyboardGridCell} from "@/components/common/table/keyboard.grid.tsx";
import {DataImportReviewCell} from "@/components/common/data-import/review-cell.tsx";
import {nextImportClientId} from "@/lib/data-import/normalize.ts";
import {canConfirmImport, validateRecord} from "@/lib/data-import/validate.ts";
import {cn} from "@/lib/utils.ts";
import type {CsvImportMode} from "@/utils/csv-import.ts";
import type {ImportConfiguration, ImportField, ImportRecord} from "@/lib/data-import/types.ts";
import type {RecordsUpdater} from "@/hooks/useDataImport.ts";

const ROW_HEIGHT = 53;
const VIRTUAL_OVERSCAN = 8;

type RecordValidityFilter = "all" | "valid" | "invalid";

function recordHasBlockingError(record: ImportRecord): boolean {
  return !record.skipped && record.issues.some((i) => i.severity === "error");
}

function recordIsValid(record: ImportRecord): boolean {
  return !record.skipped && !record.issues.some((i) => i.severity === "error");
}

type Props = {
  config: ImportConfiguration;
  records: ImportRecord[];
  onChange: (records: RecordsUpdater) => void;
  onRevalidate: () => Promise<ImportRecord[]>;
  onConfirm: () => void;
  onBack: () => void;
  confirming?: boolean;
  enableImportModes?: boolean;
  importMode: CsvImportMode;
  onImportModeChange: (mode: CsvImportMode) => void;
  matchFields: string[];
  onMatchFieldsChange: (fields: string[]) => void;
};

function emptyRecord(config: ImportConfiguration): ImportRecord {
  const values: Record<string, any> = {};
  for (const field of config.fields) {
    if (field.type === "reference[]") values[field.name] = [];
    else if (field.defaultValue !== undefined) values[field.name] = field.defaultValue;
    else values[field.name] = null;
  }
  const record: ImportRecord = {
    clientId: nextImportClientId(),
    values,
    issues: [],
  };
  record.issues = validateRecord(config, record);
  return record;
}

function applyFieldValue(
  config: ImportConfiguration,
  record: ImportRecord,
  fieldName: string,
  value: any
): ImportRecord {
  const field = config.fields.find((f) => f.name === fieldName);
  let nextValue = value;
  if (field?.transform) {
    try {
      nextValue = field.transform(value, {...record.values, [fieldName]: value});
    } catch {
      nextValue = value;
    }
  }

  const issues = record.issues.filter(
    (i) =>
      i.field !== fieldName &&
      i.code !== "required" &&
      i.code !== "unresolved_reference" &&
      i.code !== "ambiguous_reference" &&
      i.code !== "auto_corrected" &&
      i.code !== "invalid_type"
  );

  if (
    field?.transform &&
    value !== null &&
    value !== undefined &&
    value !== "" &&
    nextValue !== null &&
    nextValue !== undefined &&
    nextValue !== "" &&
    String(value).trim() !== String(nextValue).trim()
  ) {
    issues.push({
      field: fieldName,
      code: "auto_corrected",
      severity: "warning",
      message: `Matched "${String(value).trim()}" → "${String(nextValue).trim()}"`,
    });
  }

  const updated: ImportRecord = {
    ...record,
    values: {...record.values, [fieldName]: nextValue},
    issues,
  };
  updated.issues = validateRecord(config, updated);
  return updated;
}

type ReviewRowProps = {
  record: ImportRecord;
  rowIndex: number;
  fields: ImportField[];
  removeLabel: string;
  onSkipChange: (rowIndex: number, skipped: boolean) => void;
  onFieldChange: (rowIndex: number, fieldName: string, value: any) => void;
  onRemove: (rowIndex: number) => void;
};

const ImportReviewRow = memo(function ImportReviewRow({
  record,
  rowIndex,
  fields,
  removeLabel,
  onSkipChange,
  onFieldChange,
  onRemove,
}: ReviewRowProps) {
  const hasError =
    !record.skipped && record.issues.some((i) => i.severity === "error");

  return (
    <tr
      className={cn(record.skipped && "opacity-50", hasError && "bg-danger/5")}
      style={{height: ROW_HEIGHT, maxHeight: ROW_HEIGHT}}
    >
      <td className="text-neutral-400 align-middle !py-1.5">{rowIndex + 1}</td>
      <td className="align-middle !py-1.5">
        <div>
          <Checkbox
            checked={!!record.skipped}
            onChange={(e) =>
              onSkipChange(rowIndex, Boolean((e.target as HTMLInputElement).checked))
            }
          />
        </div>
      </td>
      {fields.map((field, colIndex) => (
        <KeyboardGridCell
          key={field.name}
          row={rowIndex}
          col={colIndex}
          as="td"
          className="align-middle !py-1.5 overflow-hidden"
        >
          <DataImportReviewCell
            field={field}
            record={record}
            onChange={(value) => onFieldChange(rowIndex, field.name, value)}
          />
        </KeyboardGridCell>
      ))}
      <td className="align-middle !py-1.5">
        <button
          type="button"
          className="text-danger p-2"
          title={removeLabel}
          onClick={() => onRemove(rowIndex)}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </td>
    </tr>
  );
});

export const DataImportReviewGrid = ({
  config,
  records,
  onChange,
  onRevalidate,
  onConfirm,
  onBack,
  confirming,
  enableImportModes = false,
  importMode,
  onImportModeChange,
  matchFields,
  onMatchFieldsChange,
}: Props) => {
  const {t} = useTranslation("common");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [validityFilter, setValidityFilter] = useState<RecordValidityFilter>("all");

  const canImport = useMemo(() => canConfirmImport(records), [records]);
  const needsMatchFields = enableImportModes && importMode !== "create";
  const matchFieldsReady = !needsMatchFields || matchFields.length > 0;

  const matchOptions = useMemo(
    () => config.fields.map((f) => ({label: f.label, value: f.name})),
    [config.fields]
  );
  const matchValue = useMemo(
    () => matchOptions.filter((o) => matchFields.includes(o.value)),
    [matchOptions, matchFields]
  );

  const errorCount = useMemo(
    () => records.filter((r) => recordHasBlockingError(r)).length,
    [records]
  );

  const validCount = useMemo(
    () => records.filter((r) => recordIsValid(r)).length,
    [records]
  );

  const filteredRows = useMemo(() => {
    const entries: Array<{record: ImportRecord; sourceIndex: number}> = [];
    records.forEach((record, sourceIndex) => {
      if (validityFilter === "all") {
        entries.push({record, sourceIndex});
        return;
      }
      if (validityFilter === "invalid" && recordHasBlockingError(record)) {
        entries.push({record, sourceIndex});
        return;
      }
      if (validityFilter === "valid" && recordIsValid(record)) {
        entries.push({record, sourceIndex});
      }
    });
    return entries;
  }, [records, validityFilter]);

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: VIRTUAL_OVERSCAN,
    getItemKey: (index) => filteredRows[index]?.record.clientId ?? index,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({top: 0});
  }, [validityFilter]);

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  const colSpan = config.fields.length + 3;

  const patchRecordAt = useCallback(
    (index: number, patch: (record: ImportRecord) => ImportRecord) => {
      onChange((prev) => {
        const current = prev[index];
        if (!current) return prev;
        const updated = patch(current);
        if (updated === current) return prev;
        const next = prev.slice();
        next[index] = updated;
        return next;
      });
    },
    [onChange]
  );

  const updateAt = useCallback(
    (index: number, patch: Partial<ImportRecord>) => {
      patchRecordAt(index, (record) => {
        const updated: ImportRecord = {
          ...record,
          ...patch,
          values: patch.values ? {...record.values, ...patch.values} : record.values,
        };
        updated.issues = validateRecord(config, updated);
        return updated;
      });
    },
    [config, patchRecordAt]
  );

  const setFieldValue = useCallback(
    (index: number, fieldName: string, value: any) => {
      startTransition(() => {
        patchRecordAt(index, (record) => applyFieldValue(config, record, fieldName, value));
      });
    },
    [config, patchRecordAt]
  );

  const onSkipChange = useCallback(
    (index: number, skipped: boolean) => {
      updateAt(index, {skipped});
    },
    [updateAt]
  );

  const onRemove = useCallback(
    (index: number) => {
      onChange((prev) => prev.filter((_, i) => i !== index));
    },
    [onChange]
  );

  const addRow = useCallback(() => {
    onChange((prev) => [...prev, emptyRecord(config)]);
  }, [config, onChange]);

  const confirmLabel = useMemo(() => {
    if (!enableImportModes) return t("dataImport.confirmImport");
    if (importMode === "update") return t("csvImport.updating").replace(/\.\.\.$/, "");
    if (importMode === "upsert") return t("csvImport.upsert");
    return t("dataImport.confirmImport");
  }, [enableImportModes, importMode, t]);

  const removeLabel = t("dataImport.removeRow");

  return (
    <div className="flex flex-col gap-3">
      {enableImportModes && (
        <div className="rounded-xl border border-neutral-200 p-3 flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t("csvImport.importMode")}</h3>
          <div className="flex flex-wrap gap-4">
            <div>
              <Radio
                name="dataImportMode"
                label={t("actions.create")}
                checked={importMode === "create"}
                onChange={() => onImportModeChange("create")}
                disabled={confirming}
              />
            </div>
            <div>
              <Radio
                name="dataImportMode"
                label={t("actions.update")}
                checked={importMode === "update"}
                onChange={() => onImportModeChange("update")}
                disabled={confirming}
              />
            </div>
            <div>
              <Radio
                name="dataImportMode"
                label={t("csvImport.upsert")}
                checked={importMode === "upsert"}
                onChange={() => onImportModeChange("upsert")}
                disabled={confirming}
              />
            </div>
          </div>
          {needsMatchFields && (
            <div>
              <label className="text-sm font-medium mb-1 block">
                {t("csvImport.matchColumns")}
              </label>
              <div>
                <ReactSelect
                  isMulti
                  options={matchOptions}
                  value={matchValue}
                  placeholder={t("csvImport.matchColumnsPlaceholder")}
                  onChange={(opts: any) => {
                    onMatchFieldsChange((opts || []).map((o: any) => String(o.value)));
                  }}
                  menuPortalTarget={document.body}
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">
          {t("dataImport.reviewHelp", {count: records.length})}
          {errorCount > 0 && (
            <span className="text-danger ml-2">
              {t("dataImport.blockingErrors", {count: errorCount})}
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => void onRevalidate()} flat>
            {t("dataImport.revalidate")}
          </Button>
          <Button type="button" size="sm" icon={faPlus} onClick={addRow} flat>
            {t("dataImport.addRow")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-neutral-600 mr-1">
          {t("dataImport.filterLabel")}
        </span>
        <Button
          type="button"
          size="sm"
          flat
          filled={validityFilter === "all"}
          active={validityFilter === "all"}
          onClick={() => setValidityFilter("all")}
        >
          {t("dataImport.filterAll", {count: records.length})}
        </Button>
        <Button
          type="button"
          size="sm"
          flat
          variant="danger"
          filled={validityFilter === "invalid"}
          active={validityFilter === "invalid"}
          onClick={() => setValidityFilter("invalid")}
        >
          {t("dataImport.filterInvalid", {count: errorCount})}
        </Button>
        <Button
          type="button"
          size="sm"
          flat
          variant="success"
          filled={validityFilter === "valid"}
          active={validityFilter === "valid"}
          onClick={() => setValidityFilter("valid")}
        >
          {t("dataImport.filterValid", {count: validCount})}
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto max-h-[55vh] rounded-xl border border-neutral-200 [overflow-anchor:none]"
        style={{overflowAnchor: "none"}}
      >
        <KeyboardGrid className="w-full">
          <table className="table table-sm w-full min-w-max text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="w-10">#</th>
                <th className="w-16">{t("dataImport.skip")}</th>
                {config.fields.map((field) => (
                  <th key={field.name} className="min-w-[8rem]">
                    {field.label}
                    {field.required ? <span className="text-danger ml-0.5">*</span> : null}
                  </th>
                ))}
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="text-center text-neutral-500 py-8">
                    {t("dataImport.noRecords")}
                  </td>
                </tr>
              )}
              {records.length > 0 && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={colSpan} className="text-center text-neutral-500 py-8">
                    {t("dataImport.noMatchingFilter")}
                  </td>
                </tr>
              )}
              {filteredRows.length > 0 && paddingTop > 0 && (
                <tr aria-hidden className="pointer-events-none">
                  <td colSpan={colSpan} className="!p-0 border-0">
                    <div style={{height: paddingTop}} />
                  </td>
                </tr>
              )}
              {virtualItems.map((virtualRow) => {
                const entry = filteredRows[virtualRow.index];
                if (!entry) return null;
                return (
                  <ImportReviewRow
                    key={entry.record.clientId}
                    record={entry.record}
                    rowIndex={entry.sourceIndex}
                    fields={config.fields}
                    removeLabel={removeLabel}
                    onSkipChange={onSkipChange}
                    onFieldChange={setFieldValue}
                    onRemove={onRemove}
                  />
                );
              })}
              {filteredRows.length > 0 && paddingBottom > 0 && (
                <tr aria-hidden className="pointer-events-none">
                  <td colSpan={colSpan} className="!p-0 border-0">
                    <div style={{height: paddingBottom}} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </KeyboardGrid>
      </div>

      <div className="flex justify-between gap-2">
        <Button type="button" onClick={onBack} flat disabled={confirming}>
          {t("dataImport.back")}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!canImport || !matchFieldsReady || confirming}
          isLoading={confirming}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
};
