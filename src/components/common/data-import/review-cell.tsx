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

function buildReferenceOptions(
  ref: ResolvedReference | null,
  field: ImportField,
  createLabel: (name: string) => string
): Array<{label: string; value: string}> {
  const list = ref?.candidates ?? [];
  const base = list.map((c) => ({label: c.label, value: c.value}));
  if (ref?.id && !base.some((o) => o.value === ref.id)) {
    base.unshift({label: ref.label, value: ref.id});
  }
  if (field.lookup?.strategy === "create" && ref?.label && !ref.id) {
    base.unshift({
      label: createLabel(ref.label),
      value: `__create__:${ref.label}`,
    });
  }
  return base;
}

export const DataImportReviewCell = ({field, record, onChange}: Props) => {
  const {t} = useTranslation("common");
  const issues = issuesForField(record, field.name);
  const hasError = issues.some((i) => i.severity === "error");
  const hasWarning = !hasError && issues.some((i) => i.severity === "warning");
  const title = issues.map((i) => i.message).join("; ") || undefined;

  const cellClass = cn(
    "min-w-[8rem]",
    hasError && "ring-2 ring-danger/60 rounded",
    hasWarning && "ring-2 ring-warning/60 rounded"
  );

  if (field.type === "reference") {
    const ref = (record.values[field.name] as ResolvedReference | null) ?? null;
    const options = buildReferenceOptions(ref, field, (name) =>
      t("dataImport.createReference", {name})
    );
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
    for (const r of refs) {
      for (const c of r.candidates ?? []) {
        optionMap.set(c.value, {label: c.label, value: c.value});
      }
      if (r.id) {
        optionMap.set(r.id, {label: r.label, value: r.id});
      }
      if (!r.id && r.label) {
        const value =
          field.lookup?.strategy === "create"
            ? `__create__:${r.label}`
            : `__label__:${r.label}`;
        optionMap.set(value, {
          label:
            field.lookup?.strategy === "create"
              ? t("dataImport.createReference", {name: r.label})
              : r.label,
          value,
        });
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
        <div>
          <ReactSelect
            isMulti
            options={options}
            value={selected}
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
            menuPortalTarget={document.body}
            className="text-sm"
          />
        </div>
        {refs.some((r) => r.label && !r.id && !r.create) &&
          field.lookup?.strategy === "create" && (
            <button
              type="button"
              className="text-xs text-primary mt-1 underline"
              onClick={() =>
                onChange(
                  refs.map((r) =>
                    r.id || r.create ? r : {...r, create: true}
                  )
                )
              }
            >
              {t("dataImport.createAllUnresolved")}
            </button>
          )}
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
            menuPortalTarget={document.body}
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
};
