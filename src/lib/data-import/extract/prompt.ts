import type {ImportConfiguration, ImportField} from "@/lib/data-import/types.ts";

function fieldTypeHint(field: ImportField): string {
  switch (field.type) {
    case "number":
      return "number or null";
    case "boolean":
      return "boolean or null";
    case "date":
      return "ISO date string or null";
    case "reference":
      return "string (name/label) or null";
    case "reference[]":
      return "array of strings (names/labels) or empty array";
    default:
      return "string or null";
  }
}

/**
 * Build a system+user style extraction prompt from an ImportConfiguration.
 * Entity-specific wording must live only in config.extractionInstructions.
 */
export function buildExtractionPrompt(config: ImportConfiguration): string {
  const fieldLines = config.fields.map((f) => {
    const bits = [
      `- ${f.name} (${fieldTypeHint(f)})`,
      f.required ? "[required]" : "[optional]",
      f.label !== f.name ? `label: "${f.label}"` : null,
      f.description ? `— ${f.description}` : null,
    ].filter(Boolean);
    return bits.join(" ");
  });

  return [
    "You are a document data extraction engine.",
    "Extract structured records from the provided document image(s).",
    "Return ONLY valid JSON (no markdown fences) with this shape:",
    '{"records":[ { ...fields } ]}',
    "",
    `Target entity: ${config.entityLabel}`,
    "Fields to extract for each record:",
    ...fieldLines,
    "",
    "Rules:",
    "- Return one object per distinct record found.",
    "- Use null for unknown scalar values; use [] for unknown arrays.",
    "- Do NOT invent values that are not present or clearly implied.",
    "- Do NOT include keys other than the listed field names inside each record.",
    "- Prefer the document's original language for text fields.",
    "- Numbers must be plain JSON numbers without currency symbols.",
    "",
    "Additional instructions:",
    config.extractionInstructions.trim(),
  ].join("\n");
}
