export const AI_REPORT_PROMPT_KEY = "posr-ai-report-prompt";
export const AI_REPORT_FORMAT_KEY = "posr-ai-report-format";

export type AiReportFormat = "list" | "table";

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
  return format === "list" ? "list" : "table";
};

export const clearAiReportPrompt = () => {
  sessionStorage.removeItem(AI_REPORT_PROMPT_KEY);
};
