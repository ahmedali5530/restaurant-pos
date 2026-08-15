import {useCallback, useMemo} from "react";
import {useTranslation} from "react-i18next";
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
import type {ImportConfiguration, ImportRecord} from "@/lib/data-import/types.ts";

type Props = {
  config: ImportConfiguration;
  records: ImportRecord[];
  onChange: (records: ImportRecord[]) => void;
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
  const canImport = canConfirmImport(records);
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

  const updateAt = useCallback(
    (index: number, patch: Partial<ImportRecord>) => {
      const next = records.map((r, i) => {
        if (i !== index) return r;
        const updated = {...r, ...patch, values: {...r.values, ...(patch.values || {})}};
        if (patch.values) {
          updated.values = {...r.values, ...patch.values};
        }
        updated.issues = validateRecord(config, updated);
        return updated;
      });
      onChange(next);
    },
    [config, onChange, records]
  );

  const setFieldValue = useCallback(
    (index: number, fieldName: string, value: any) => {
      const record = records[index];
      if (!record) return;
      const updated: ImportRecord = {
        ...record,
        values: {...record.values, [fieldName]: value},
        issues: record.issues.filter(
          (i) =>
            i.field !== fieldName &&
            i.code !== "required" &&
            i.code !== "unresolved_reference" &&
            i.code !== "ambiguous_reference" &&
            i.code !== "invalid_type"
        ),
      };
      updated.issues = validateRecord(config, updated);
      const next = [...records];
      next[index] = updated;
      onChange(next);
    },
    [config, onChange, records]
  );

  const addRow = () => {
    onChange([...records, emptyRecord(config)]);
  };

  const removeRow = (index: number) => {
    onChange(records.filter((_, i) => i !== index));
  };

  const errorCount = records.filter(
    (r) => !r.skipped && r.issues.some((i) => i.severity === "error")
  ).length;

  const confirmLabel = useMemo(() => {
    if (!enableImportModes) return t("dataImport.confirmImport");
    if (importMode === "update") return t("csvImport.updating").replace(/\.\.\.$/, "");
    if (importMode === "upsert") return t("csvImport.upsert");
    return t("dataImport.confirmImport");
  }, [enableImportModes, importMode, t]);

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

      <div className="overflow-auto max-h-[55vh] rounded-xl border border-neutral-200">
        <KeyboardGrid className="w-full">
          <table className="table w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-white z-10">
              <tr>
                <th className="w-10">#</th>
                <th className="w-16">{t("dataImport.skip")}</th>
                {config.fields.map((field) => (
                  <th key={field.name}>
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
                  <td
                    colSpan={config.fields.length + 3}
                    className="text-center text-neutral-500 py-8"
                  >
                    {t("dataImport.noRecords")}
                  </td>
                </tr>
              )}
              {records.map((record, rowIndex) => {
                const hasError =
                  !record.skipped &&
                  record.issues.some((i) => i.severity === "error");
                return (
                  <tr
                    key={record.clientId}
                    className={cn(
                      record.skipped && "opacity-50",
                      hasError && "bg-danger/5"
                    )}
                  >
                    <td className="text-neutral-400">{rowIndex + 1}</td>
                    <td>
                      <div>
                        <Checkbox
                          checked={!!record.skipped}
                          onChange={(e) =>
                            updateAt(rowIndex, {
                              skipped: Boolean(
                                (e.target as HTMLInputElement).checked
                              ),
                            })
                          }
                        />
                      </div>
                    </td>
                    {config.fields.map((field, colIndex) => (
                      <KeyboardGridCell
                        key={field.name}
                        row={rowIndex}
                        col={colIndex}
                        as="td"
                      >
                        <DataImportReviewCell
                          field={field}
                          record={record}
                          onChange={(value) =>
                            setFieldValue(rowIndex, field.name, value)
                          }
                        />
                      </KeyboardGridCell>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="text-danger p-2"
                        title={t("dataImport.removeRow")}
                        onClick={() => removeRow(rowIndex)}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                );
              })}
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
