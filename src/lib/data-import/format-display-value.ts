import type {ImportField, ResolvedReference} from "@/lib/data-import/types.ts";

type TFunc = (key: string, options?: any) => string;

const formatReference = (ref: ResolvedReference | null | undefined): string => {
  if (!ref?.label) return "—";
  return ref.create ? `${ref.label} (new)` : ref.label;
};

export const formatImportDisplayValue = (
  field: ImportField,
  value: unknown,
  t: TFunc,
): string => {
  if (value === null || value === undefined || value === "") return "—";

  switch (field.type) {
    case "boolean":
      if (value === true) return t("dataImport.yes", {defaultValue: "Yes"});
      if (value === false) return t("dataImport.no", {defaultValue: "No"});
      return "—";

    case "reference":
      return formatReference(value as ResolvedReference | null);

    case "reference[]": {
      if (!Array.isArray(value) || value.length === 0) return "—";
      return value
        .map((ref: ResolvedReference) => {
          if (!ref?.label) return "";
          return ref.create ? `${ref.label} (new)` : ref.label;
        })
        .filter(Boolean)
        .join(", ") || "—";
    }

    case "date":
      if (value instanceof Date) return value.toLocaleDateString();
      return String(value);

    case "number":
      return typeof value === "number" ? String(value) : String(value);

    default:
      return String(value);
  }
};
