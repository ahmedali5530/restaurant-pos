import type {RawExtractedRecords} from "@/lib/data-import/types.ts";

/**
 * Strip markdown fences and extract the first JSON object/array from AI text.
 */
export function extractJsonText(raw: string): string {
  let text = raw.trim();
  if (!text) {
    throw new Error("AI returned an empty response.");
  }

  // ```json ... ``` or ``` ... ```
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    text = fence[1].trim();
  }

  // If still has leading prose, find first { or [
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  let start = -1;
  if (objStart >= 0 && arrStart >= 0) {
    start = Math.min(objStart, arrStart);
  } else {
    start = Math.max(objStart, arrStart);
  }
  if (start > 0) {
    text = text.slice(start);
  }

  return text.trim();
}

export function parseJsonFromAi(raw: string): any {
  const jsonText = extractJsonText(raw);
  try {
    return JSON.parse(jsonText);
  } catch {
    throw new Error("AI returned invalid JSON. Please try again or use a clearer file.");
  }
}

/**
 * Parse AI JSON into raw records. Unknown keys are stripped later in normalize.
 * Accepts either { records: [...] } or a bare array.
 */
export function parseExtractionResponse(
  raw: string,
  allowedFields: string[]
): RawExtractedRecords {
  const parsed = parseJsonFromAi(raw);

  let records: any[] = [];
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (parsed && Array.isArray(parsed.records)) {
    records = parsed.records;
  } else if (parsed && typeof parsed === "object") {
    // Single record object
    records = [parsed];
  } else {
    throw new Error("AI response did not contain a records array.");
  }

  const allowed = new Set(allowedFields);
  const cleaned: Array<Record<string, any>> = [];
  const confidence: number[] = [];
  const fieldConfidence: Array<Record<string, number> | undefined> = [];

  for (const row of records) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === "_confidence" || key === "confidence") {
        if (typeof value === "number") {
          // handled below
        }
        continue;
      }
      if (key === "_fieldConfidence" || key === "fieldConfidence") continue;
      if (!allowed.has(key)) continue;
      out[key] = value;
    }
    cleaned.push(out);

    const rowConf =
      typeof row._confidence === "number"
        ? row._confidence
        : typeof row.confidence === "number"
          ? row.confidence
          : undefined;
    confidence.push(rowConf ?? NaN);

    const fc =
      row._fieldConfidence && typeof row._fieldConfidence === "object"
        ? row._fieldConfidence
        : row.fieldConfidence && typeof row.fieldConfidence === "object"
          ? row.fieldConfidence
          : undefined;
    fieldConfidence.push(fc);
  }

  return {
    records: cleaned,
    confidence: confidence.some((c) => Number.isFinite(c)) ? confidence : undefined,
    fieldConfidence: fieldConfidence.some(Boolean) ? fieldConfidence : undefined,
  };
}

/**
 * Parse a graph-shaped AI response and expand it via `onExpandExtracted`.
 */
export function parseGraphExtractionResponse(
  raw: string,
  expand: (parsed: any) => Array<Record<string, any>>
): RawExtractedRecords {
  const parsed = parseJsonFromAi(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI response did not contain a menu graph object.");
  }
  const records = expand(parsed) ?? [];
  return {records: Array.isArray(records) ? records : []};
}
