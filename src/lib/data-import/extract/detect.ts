import type {SourceKind} from "@/lib/data-import/types.ts";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);
const EXCEL_EXT = new Set(["xls", "xlsx"]);
const CSV_EXT = new Set(["csv"]);
const PDF_EXT = new Set(["pdf"]);

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
]);

export function getFileExtension(file: File | {name: string}): string {
  const name = file.name || "";
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

export function detectSourceKind(file: File): SourceKind {
  const ext = getFileExtension(file);
  const mime = (file.type || "").toLowerCase();

  if (CSV_EXT.has(ext) || mime === "text/csv" || mime === "application/csv") {
    return "csv";
  }
  if (
    EXCEL_EXT.has(ext) ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return "excel";
  }
  if (PDF_EXT.has(ext) || mime === "application/pdf") {
    return "pdf";
  }
  if (IMAGE_EXT.has(ext) || IMAGE_MIME.has(mime) || mime.startsWith("image/")) {
    return "image";
  }
  return "unknown";
}

export const IMPORT_ACCEPT =
  ".csv,.xls,.xlsx,.pdf,.jpg,.jpeg,.png,.gif,.webp,image/*,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
