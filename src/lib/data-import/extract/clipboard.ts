/**
 * Clipboard helpers for Smart Import paste (files, images, Excel/Sheets TSV).
 */

const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

function extForMime(mime: string): string {
  if (IMAGE_EXT[mime]) return IMAGE_EXT[mime];
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("spreadsheet") || mime.includes("excel")) return "xlsx";
  if (mime.includes("csv")) return "csv";
  return "bin";
}

/**
 * Prefer clipboardData.files; else first file/image item from clipboardData.items.
 */
export function getClipboardFile(event: ClipboardEvent): File | null {
  const data = event.clipboardData;
  if (!data) return null;

  if (data.files && data.files.length > 0) {
    return data.files[0];
  }

  const items = data.items;
  if (!items) return null;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    const blob = item.getAsFile();
    if (!blob) continue;
    const type = blob.type || item.type || "application/octet-stream";
    if (blob instanceof File && blob.name) {
      return blob;
    }
    const ext = extForMime(type);
    return new File([blob], `clipboard.${ext}`, {type});
  }

  return null;
}

function splitTableLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\n$/, ""))
    .filter((l, i, arr) => {
      // Keep empty lines only if not trailing
      if (l.length > 0) return true;
      return i < arr.length - 1 && arr.slice(i + 1).some((x) => x.length > 0);
    });
}

function rowColumnCounts(lines: string[], delimiter: string): number[] {
  return lines.map((line) => line.split(delimiter).length);
}

/**
 * True when text looks like a spreadsheet paste (TSV or multi-column CSV-like).
 */
export function looksLikeTableText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const lines = splitTableLines(trimmed).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;

  if (trimmed.includes("\t")) {
    const counts = rowColumnCounts(lines, "\t");
    const max = Math.max(...counts);
    return max >= 2 && lines.length >= 1;
  }

  // Multiple rows with consistent comma columns (at least 2 cols)
  if (lines.length >= 2) {
    const counts = rowColumnCounts(lines, ",");
    const first = counts[0];
    if (first < 2) return false;
    const consistent = counts.filter((c) => c === first).length >= Math.ceil(lines.length * 0.7);
    return consistent;
  }

  return false;
}

function htmlTableToTsv(html: string): string | null {
  if (typeof DOMParser === "undefined") return null;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (!table) return null;
    const rows: string[][] = [];
    table.querySelectorAll("tr").forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("th, td").forEach((cell) => {
        cells.push((cell.textContent ?? "").replace(/\s+/g, " ").trim());
      });
      if (cells.some((c) => c.length > 0)) {
        rows.push(cells);
      }
    });
    if (rows.length === 0) return null;
    return rows.map((r) => r.join("\t")).join("\n");
  } catch {
    return null;
  }
}

/**
 * Prefer text/plain when tabular; else first HTML table as TSV.
 */
export function getClipboardTableText(event: ClipboardEvent): string | null {
  const data = event.clipboardData;
  if (!data) return null;

  const plain = data.getData("text/plain");
  if (plain && looksLikeTableText(plain)) {
    return plain.trim();
  }

  const html = data.getData("text/html");
  if (html) {
    const tsv = htmlTableToTsv(html);
    if (tsv && looksLikeTableText(tsv)) {
      return tsv;
    }
  }

  return null;
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseTableRows(text: string): string[][] {
  const trimmed = text.trim();
  const lines = splitTableLines(trimmed).filter((l) => l.length > 0);
  const delimiter = trimmed.includes("\t") ? "\t" : ",";
  return lines.map((line) => line.split(delimiter).map((c) => c.trim()));
}

/**
 * Convert TSV/CSV-like clipboard text into a CSV File for the structured pipeline.
 */
export function tableTextToCsvFile(text: string): File {
  const rows = parseTableRows(text);
  const csv = rows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
  return new File([csv], "clipboard-paste.csv", {type: "text/csv"});
}

/**
 * Resolve a paste event to a File: file/image first, then tabular text as CSV.
 */
export function resolveClipboardPaste(event: ClipboardEvent): File | null {
  const file = getClipboardFile(event);
  if (file) return file;

  const table = getClipboardTableText(event);
  if (table) return tableTextToCsvFile(table);

  return null;
}

/** True if clipboard event has any potentially useful payload. */
export function clipboardHasContent(event: ClipboardEvent): boolean {
  const data = event.clipboardData;
  if (!data) return false;
  if (data.files && data.files.length > 0) return true;
  if (data.items && data.items.length > 0) {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].kind === "file") return true;
    }
  }
  const plain = data.getData("text/plain");
  if (plain?.trim()) return true;
  const html = data.getData("text/html");
  if (html?.trim()) return true;
  return false;
}
