export const isLocalAiReportCompactMode = (): boolean => {
  const override = import.meta.env.VITE_AI_REPORT_COMPACT as string | undefined;
  if (override === "false") {
    return false;
  }
  if (override === "true") {
    return true;
  }

  const url = (import.meta.env.VITE_OPENAI_PROXY_URL || import.meta.env.VITE_OPENAI_API_URL || "") as string;
  return /localhost|127\.0\.0\.1/.test(url);
};
