import {useMemo} from "react";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import type {ColumnMapping, ImportField, StructuredExtractResult} from "@/lib/data-import/types.ts";

type Props = {
  fields: ImportField[];
  structured: StructuredExtractResult;
  mapping: ColumnMapping;
  onChangeMapping: (mapping: ColumnMapping) => void;
  onChangeSheet?: (index: number) => void;
  onConfirm: () => void;
  onBack: () => void;
};

export const DataImportMappingStep = ({
  fields,
  structured,
  mapping,
  onChangeMapping,
  onChangeSheet,
  onConfirm,
  onBack,
}: Props) => {
  const {t} = useTranslation("common");
  const sheet = structured.sheets[structured.sheetIndex] ?? structured.sheets[0];
  const headerOptions = useMemo(
    () => [
      {label: t("dataImport.skipColumn"), value: ""},
      ...(sheet?.headers ?? []).map((h) => ({label: h, value: h})),
    ],
    [sheet?.headers, t]
  );

  const sheetOptions = structured.sheets.map((s, i) => ({
    label: s.name || `Sheet ${i + 1}`,
    value: String(i),
  }));

  const requiredMissing = fields.some(
    (f) => f.required && !f.optional && !mapping[f.name]
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600">{t("dataImport.mappingHelp")}</p>

      {structured.sheets.length > 1 && (
        <div>
          <label className="text-sm font-medium mb-1 block">
            {t("dataImport.sheet")}
          </label>
          <div>
            <ReactSelect
              options={sheetOptions}
              value={sheetOptions.find((o) => o.value === String(structured.sheetIndex)) ?? null}
              onChange={(opt: any) => {
                const idx = Number(opt?.value ?? 0);
                onChangeSheet?.(idx);
              }}
              menuPortalTarget={document.body}
            />
          </div>
        </div>
      )}

      <div className="overflow-auto max-h-[50vh] rounded-lg border border-neutral-200">
        <table className="table w-full text-sm">
          <thead>
            <tr>
              <th>{t("dataImport.targetField")}</th>
              <th>{t("dataImport.sourceColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.name}>
                <td>
                  {field.label}
                  {field.required ? (
                    <span className="text-danger ml-1">*</span>
                  ) : null}
                </td>
                <td>
                  <div>
                    <ReactSelect
                      options={headerOptions}
                      value={
                        headerOptions.find((o) => o.value === (mapping[field.name] ?? "")) ??
                        headerOptions[0]
                      }
                      onChange={(opt: any) => {
                        onChangeMapping({
                          ...mapping,
                          [field.name]: opt?.value ?? "",
                        });
                      }}
                      menuPortalTarget={document.body}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between gap-2">
        <Button type="button" onClick={onBack} flat>
          {t("dataImport.back")}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={requiredMissing}
          onClick={onConfirm}
        >
          {t("dataImport.continue")}
        </Button>
      </div>
    </div>
  );
};
