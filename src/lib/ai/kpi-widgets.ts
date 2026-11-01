export type AiKpiTone = "neutral" | "success" | "warning" | "danger" | "info";

export type AiKpiWidget = {
  label: string;
  value: string;
  tone: AiKpiTone;
  hint?: string;
};

const TONES = new Set<AiKpiTone>(["neutral", "success", "warning", "danger", "info"]);

const normalizeTone = (raw: unknown): AiKpiTone => {
  const tone = String(raw ?? "neutral").trim().toLowerCase();
  return TONES.has(tone as AiKpiTone) ? (tone as AiKpiTone) : "neutral";
};

const fromObject = (row: any): AiKpiWidget | null => {
  if (!row || typeof row !== "object") return null;
  const label = String(row.label ?? row.name ?? row.title ?? "").trim();
  const value = String(row.value ?? row.metric ?? row.amount ?? "").trim();
  if (!label || !value) return null;
  const hint = String(row.hint ?? row.note ?? row.delta ?? row.subtitle ?? "").trim();
  return {
    label,
    value,
    tone: normalizeTone(row.tone ?? row.status ?? row.severity),
    ...(hint ? {hint} : {}),
  };
};

/** Pipe lines: Label | Value | tone | optional hint */
const fromPipeLine = (line: string): AiKpiWidget | null => {
  const cells = line.split("|").map((p) => p.trim());
  if (cells.length < 2) return null;
  const [label, value, toneRaw, ...hintParts] = cells;
  if (!label || !value) return null;
  const hint = hintParts.join(" | ").trim();
  return {
    label,
    value,
    tone: normalizeTone(toneRaw),
    ...(hint ? {hint} : {}),
  };
};

/**
 * Parse a ```kpi fenced block into widget specs.
 * Accepts JSON array/object or pipe-delimited rows.
 */
export function parseAiKpiBlock(raw: string): AiKpiWidget[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(fromObject).filter(Boolean) as AiKpiWidget[];
    }
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed.widgets)) {
        return parsed.widgets.map(fromObject).filter(Boolean) as AiKpiWidget[];
      }
      const single = fromObject(parsed);
      return single ? [single] : [];
    }
  } catch {
    // fall through to line format
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("```"))
    .map(fromPipeLine)
    .filter(Boolean) as AiKpiWidget[];
}

export function isKpiLanguage(className?: string): boolean {
  if (!className) return false;
  return /\blanguage-kpi\b/i.test(className) || /\blanguage-widgets\b/i.test(className);
}
