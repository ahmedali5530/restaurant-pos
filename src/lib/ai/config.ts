export const isLocalAiReportCompactMode = (): boolean => {
  // The OpenAI URL now lives server-side (in the `api` service), so it can no
  // longer be sniffed from the client. Compact mode is controlled by an
  // explicit, non-secret flag. Enable it when running a small/local model that
  // benefits from a reduced prompt and tool surface.
  const override = import.meta.env.VITE_AI_REPORT_COMPACT as string | undefined;
  return override === "true";
};
