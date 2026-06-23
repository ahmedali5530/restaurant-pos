export const AI_REPORT_PROMPT_KEY = "posr-ai-report-prompt";
export const AI_REPORT_FORMAT_KEY = "posr-ai-report-format";
export const AI_REPORT_HISTORY_KEY = "posr-ai-report-history";

export type AiReportFormat = "list" | "table" | "chart" | "analysis";

export interface AiReportHistoryEntry {
  prompt: string;
  format: AiReportFormat;
  savedAt: string;
}

const VALID_FORMATS: AiReportFormat[] = ["list", "table", "chart", "analysis"];

export const saveAiReportPrompt = (prompt: string) => {
  sessionStorage.setItem(AI_REPORT_PROMPT_KEY, prompt);
};

export const loadAiReportPrompt = () => {
  return sessionStorage.getItem(AI_REPORT_PROMPT_KEY) || "";
};

export const saveAiReportFormat = (format: AiReportFormat) => {
  sessionStorage.setItem(AI_REPORT_FORMAT_KEY, format);
};

export const loadAiReportFormat = (): AiReportFormat => {
  const format = sessionStorage.getItem(AI_REPORT_FORMAT_KEY);
  return VALID_FORMATS.includes(format as AiReportFormat) ? (format as AiReportFormat) : "table";
};

export const clearAiReportPrompt = () => {
  sessionStorage.removeItem(AI_REPORT_PROMPT_KEY);
};

export const loadPromptFromUrl = (): {prompt?: string; format?: AiReportFormat} => {
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get("prompt") || undefined;
  const format = params.get("format") as AiReportFormat | null;
  return {
    prompt: prompt ?? undefined,
    format: format && VALID_FORMATS.includes(format) ? format : undefined,
  };
};

export const saveToHistory = (prompt: string, format: AiReportFormat) => {
  const history = loadHistory();
  const entry: AiReportHistoryEntry = {prompt, format, savedAt: new Date().toISOString()};
  const filtered = history.filter(h => h.prompt !== prompt);
  const next = [entry, ...filtered].slice(0, 20);
  localStorage.setItem(AI_REPORT_HISTORY_KEY, JSON.stringify(next));
};

export const loadHistory = (): AiReportHistoryEntry[] => {
  try {
    const raw = localStorage.getItem(AI_REPORT_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    return JSON.parse(raw) as AiReportHistoryEntry[];
  } catch {
    return [];
  }
};

export const removeFromHistory = (prompt: string) => {
  const next = loadHistory().filter(h => h.prompt !== prompt);
  localStorage.setItem(AI_REPORT_HISTORY_KEY, JSON.stringify(next));
};
