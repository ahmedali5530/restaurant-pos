import {memo, useMemo} from "react";
import {useTranslation} from "react-i18next";
import {Input} from "@/components/common/input/input.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {cn} from "@/lib/utils.ts";
import type {
  ImportField,
  ImportIssue,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";

type Props = {
  field: ImportField;
  record: ImportRecord;
  onChange: (value: any) => void;
};

function issuesForField(record: ImportRecord, fieldName: string): ImportIssue[] {
  return record.issues.filter((i) => i.field === fieldName);
}

function fieldIssuesSignature(record: ImportRecord, fieldName: string): string {
  return issuesForField(record, fieldName)
    .map((i) => `${i.code}:${i.severity}:${i.message}`)
    .join("|");
}

function buildReferenceOptions(
  ref: ResolvedReference | null,
  field: ImportField,
  createLabel: (name: string) => string
): Array<{label: string; value: string}> {
  const optionMap = new Map<string, {label: string; value: string}>();
  for (const c of field.candidates ?? []) {
    optionMap.set(c.value, {label: c.label, value: c.value});
  }
  for (const c of ref?.candidates ?? []) {
    optionMap.set(c.value, {label: c.label, value: c.value});
  }
  if (ref?.id && !optionMap.has(ref.id)) {
    optionMap.set(ref.id, {label: ref.label, value: ref.id});
  }
  const base = Array.from(optionMap.values());
  if (field.lookup?.strategy === "create" && ref?.label && !ref.id) {
    base.unshift({
      label: createLabel(ref.label),
      value: `__create__:${ref.label}`,
    });
  }
  return base;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

function importSelectStyles(hasError: boolean, hasWarning: boolean) {
  if (!hasError && !hasWarning) return undefined;
  const borderColor = hasError ? "rgb(244 63 94)" : "rgb(245 158 11)";
  const focusRing = hasError ? "0 0 0 2px rgb(254 202 202)" : "0 0 0 2px rgb(253 230 138)";
  return {
    control: (base: any, state: any) => ({
      ...base,
      minHeight: state.selectProps.size === "lg" ? "48px" : "40px",
      borderColor,
      borderWidth: 2,
      ":hover": {borderColor},
      boxShadow: state.isFocused ? focusRing : "none",
    }),
  };
}

export const DataImportReviewCell = memo(function DataImportReviewCell({
  field,
  record,
  onChange,
}: Props) {
  const {t} = useTranslation("common");
  const issues = issuesForField(record, field.name);
  const hasError = issues.some((i) => i.severity === "error");
  const hasWarning = !hasError && issues.some((i) => i.severity === "warning");
  const title = issues.map((i) => i.message).join("; ") || undefined;

  const cellClass = cn(
    "min-w-0 max-h-10 overflow-hidden rounded",
    hasError && "ring-2 ring-inset ring-danger",
    hasWarning && "ring-2 ring-inset ring-warning"
  );
  const selectStyles = importSelectStyles(hasError, hasWarning);

  const refValue =
    field.type === "reference"
      ? ((record.values[field.name] as ResolvedReference | null) ?? null)
      : null;
  const referenceOptions = useMemo(
    () =>
      field.type === "reference"
        ? buildReferenceOptions(refValue, field, (name) =>
            t("dataImport.createReference", {name})
          )
        : [],
    [field, refValue, t]
  );

  if (field.type === "reference") {
    const ref = refValue;
    const options = referenceOptions;
    const selected =
      ref?.id
        ? options.find((o) => o.value === ref.id) ?? {
            label: ref.label,
            value: ref.id,
          }
        : ref?.create
          ? options.find((o) => o.value === `__create__:${ref.label}`) ?? null
          : null;

    return (
      <div className={cellClass} title={title}>
        <div>
          <ReactSelect
            options={options}
            value={selected}
            placeholder={ref?.label || t("dataImport.selectReference")}
            onChange={(opt: any) => {
              if (!opt) {
                onChange(null);
                return;
              }
              const val = String(opt.value);
              if (val.startsWith("__create__:")) {
                onChange({
                  label: val.slice("__create__:".length),
                  create: true,
                });
                return;
              }
              onChange({label: opt.label, id: val});
            }}
            isClearable
            styles={selectStyles}
            menuPortalTarget={document.body}
            className="text-sm"
          />
        </div>
      </div>
    );
  }

  if (field.type === "reference[]") {
    const refs = (record.values[field.name] as ResolvedReference[]) || [];
    const optionMap = new Map<string, {label: string; value: string}>();
    if (field.lookup?.strategy === "create") {
      for (const r of refs) {
        if (!r.id && r.label) {
          optionMap.set(`__create__:${r.label}`, {
            label: t("dataImport.createReference", {name: r.label}),
            value: `__create__:${r.label}`,
          });
        }
      }
    }
    for (const c of field.candidates ?? []) {
      optionMap.set(c.value, {label: c.label, value: c.value});
    }
    for (const r of refs) {
      for (const c of r.candidates ?? []) {
        optionMap.set(c.value, {label: c.label, value: c.value});
      }
      if (r.id) {
        optionMap.set(r.id, {label: r.label, value: r.id});
      }
    }
    const options = Array.from(optionMap.values());

    const selected = refs
      .map((r) => {
        if (r.id) return {label: r.label, value: r.id};
        if (r.create) {
          return {
            label: t("dataImport.createReference", {name: r.label}),
            value: `__create__:${r.label}`,
          };
        }
        return null;
      })
      .filter(Boolean) as Array<{label: string; value: string}>;

    return (
      <div className={cellClass} title={title}>
        <div className="flex items-center gap-1 min-w-0">
          <div className="flex-1 min-w-0">
            <ReactSelect
              isMulti
              options={options}
              value={selected}
              placeholder={
                refs.find((r) => r.label && !r.id)?.label ||
                t("dataImport.selectReference")
              }
              onChange={(opts: any) => {
                const next: ResolvedReference[] = (opts || []).map((o: any) => {
                  const val = String(o.value);
                  if (val.startsWith("__create__:")) {
                    return {label: val.slice("__create__:".length), create: true};
                  }
                  if (val.startsWith("__label__:")) {
                    return {label: val.slice("__label__:".length)};
                  }
                  return {label: o.label, id: val};
                });
                onChange(next);
              }}
              styles={selectStyles}
              menuPortalTarget={document.body}
              className="text-sm"
            />
          </div>
          {refs.some((r) => r.label && !r.id && !r.create) &&
            field.lookup?.strategy === "create" && (
              <button
                type="button"
                className="shrink-0 text-xs text-primary underline whitespace-nowrap"
                title={t("dataImport.createAllUnresolved")}
                onClick={() =>
                  onChange(
                    refs.map((r) =>
                      r.id || r.create ? r : {...r, create: true}
                    )
                  )
                }
              >
                +
              </button>
            )}
        </div>
      </div>
    );
  }

  if (field.type === "boolean") {
    const value = record.values[field.name];
    return (
      <div className={cellClass} title={title}>
        <div>
          <ReactSelect
            options={[
              {label: t("dataImport.yes"), value: "true"},
              {label: t("dataImport.no"), value: "false"},
              {label: "—", value: ""},
            ]}
            value={
              value === true
                ? {label: t("dataImport.yes"), value: "true"}
                : value === false
                  ? {label: t("dataImport.no"), value: "false"}
                  : {label: "—", value: ""}
            }
            onChange={(opt: any) => {
              if (!opt?.value) onChange(null);
              else onChange(opt.value === "true");
            }}
            styles={selectStyles}
            menuPortalTarget={document.body}
          />
        </div>
      </div>
    );
  }

  if (field.allowedValues?.length) {
    const raw = record.values[field.name];
    const current =
      raw === null || raw === undefined || raw === "" ? "" : String(raw);
    const options = field.allowedValues.map((value) => ({
      value,
      label: t(`dataImport.enumValues.${field.name}.${value}`, {
        defaultValue: value.replace(/_/g, " "),
      }),
    }));
    const selected = options.find(
      (o) => o.value.toLowerCase() === current.toLowerCase()
    );

    return (
      <div className={cellClass} title={title}>
        <div>
          <ReactSelect
            options={options}
            value={selected ?? (current ? {label: current, value: current} : null)}
            placeholder={t("dataImport.selectValue", {defaultValue: "Select…"})}
            onChange={(opt: any) => {
              onChange(opt?.value ? String(opt.value) : null);
            }}
            isClearable={!field.required}
            styles={selectStyles}
            menuPortalTarget={document.body}
            className="text-sm"
          />
        </div>
      </div>
    );
  }

  const raw = record.values[field.name];
  const display = raw === null || raw === undefined ? "" : String(raw);

  return (
    <div className={cellClass} title={title}>
      <div>
        <Input
          type={field.type === "number" ? "number" : "text"}
          value={display}
          hasError={hasError}
          onChange={(e) => {
            const v = e.target.value;
            if (field.type === "number") {
              if (v.trim() === "") {
                onChange(null);
                return;
              }
              const n = Number(v);
              onChange(Number.isFinite(n) ? n : v);
              return;
            }
            onChange(v);
          }}
          className="!min-h-0 h-9 text-sm"
        />
      </div>
    </div>
  );
}, (prev, next) => {
  const fieldName = prev.field.name;
  if (prev.field !== next.field) return false;
  if (prev.record.skipped !== next.record.skipped) return false;
  if (!valuesEqual(prev.record.values[fieldName], next.record.values[fieldName])) {
    return false;
  }
  return fieldIssuesSignature(prev.record, fieldName) === fieldIssuesSignature(next.record, fieldName);
});
