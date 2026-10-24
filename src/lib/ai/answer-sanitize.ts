/**
 * Some local / OpenAI-compatible models print tool calls as DSML/XML text
 * instead of returning structured tool_calls. Strip that so it never reaches the UI.
 */

const LEAKED_MARKUP_RE =
  /DSML|<\/?invoke\b|<\/?tool_call\b|<\/?function_call\b|<\/?calls?\b|tool\s*call|function_call/i;

export const looksLikeLeakedToolMarkup = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  return LEAKED_MARKUP_RE.test(trimmed)
    && /(?:list_|get_|propose_|forecast_|render_)/i.test(trimmed);
};

/** Remove DSML / invoke / tool_call markup; returns remaining prose (may be empty). */
export const stripLeakedToolMarkup = (text: string): string => {
  return text
    .replace(/<\|[^|>]*\|[^>]*>/g, " ")
    .replace(/<\/?\s*\|?\s*[^>]*DSML[^>]*>/gi, " ")
    .replace(/<\/?\s*invoke\b[^>]*>/gi, " ")
    .replace(/<\/?\s*calls?\b[^>]*>/gi, " ")
    .replace(/<\/?\s*tool_call\b[^>]*>/gi, " ")
    .replace(/<\/?\s*function_call\b[^>]*>/gi, " ")
    .replace(/\bname\s*=\s*["'][\w]+["']/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

/**
 * Prefer clean prose. If the whole answer was leaked tool markup, return empty
 * so callers can retry instead of showing garbage.
 */
export const sanitizeAssistantAnswer = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  if (!looksLikeLeakedToolMarkup(trimmed)) {
    return trimmed;
  }
  const stripped = stripLeakedToolMarkup(trimmed);
  if (!stripped || looksLikeLeakedToolMarkup(stripped)) {
    return "";
  }
  return stripped;
};
