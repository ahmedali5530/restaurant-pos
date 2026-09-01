import {isProfileCompactForTask, type AiTask} from "@/lib/openai.service.ts";

/**
 * Compact prompt/tools for small/local models.
 * Prefer the profile's COMPACT flag from the API; VITE_AI_REPORT_COMPACT=true
 * remains a local override.
 */
export const isLocalAiReportCompactMode = (task: AiTask = "reporting"): boolean => {
  const override = import.meta.env.VITE_AI_REPORT_COMPACT as string | undefined;
  if (override === "true") {
    return true;
  }
  if (override === "false") {
    return false;
  }
  return isProfileCompactForTask(task) === true;
};
