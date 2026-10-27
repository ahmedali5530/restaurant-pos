/**
 * Some local / OpenAI-compatible models print tool calls as DSML/XML text
 * instead of returning structured tool_calls. Strip that so it never reaches the UI.
 */

const toolNamePattern = () => /(?:list_|get_|propose_|forecast_|render_|lookup_)\w+/gi;

const LEAKED_MARKUP_RE =
  /DSML|<\/?invoke\b|<\/?tool_call\b|<\/?function_call\b|<\/?calls?\b|tool\s*call|function_call|tool_calls/i;

const stripToolNames = (text: string): string =>
  text.replace(toolNamePattern(), " ");

export const looksLikeLeakedToolMarkup = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (/<\/?\|[^>]*DSML/i.test(trimmed) || /<\/?invoke\b/i.test(trimmed)) {
    return true;
  }
  if (LEAKED_MARKUP_RE.test(trimmed) && toolNamePattern().test(trimmed)) {
    return true;
  }
  // Short dumps that are only tool names / invoke lines (no real prose).
  if (trimmed.length < 280 && toolNamePattern().test(trimmed)) {
    if (/name\s*=|invoke|tool_call|function_call|^\s*\{/.test(trimmed)) {
      return true;
    }
    const withoutTools = stripToolNames(trimmed).replace(/[\s,;|"'=]+/g, "").trim();
    if (!withoutTools) {
      return true;
    }
  }
  return false;
};

/** Remove DSML / invoke / tool_call markup; returns remaining prose (may be empty). */
export const stripLeakedToolMarkup = (text: string): string => {
  return stripToolNames(
    text
      .replace(/<\|[^|>]*\|[^>]*>/g, " ")
      .replace(/<\/?\s*\|?\s*[^>]*DSML[^>]*>/gi, " ")
      .replace(/<\/?\s*invoke\b[^>]*>/gi, " ")
      .replace(/<\/?\s*calls?\b[^>]*>/gi, " ")
      .replace(/<\/?\s*tool_call\b[^>]*>/gi, " ")
      .replace(/<\/?\s*function_call\b[^>]*>/gi, " ")
      .replace(/\binvoke\b/gi, " ")
      .replace(/\bname\s*=\s*["'][\w]+["']/gi, " "),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
};

/**
 * Prefer clean prose. If the whole answer was leaked tool markup, return empty
 * so callers can retry or fall back to a deterministic answer.
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

/** Extract tool names from leaked invoke markup (best-effort). */
export const parseLeakedToolNames = (text: string): string[] => {
  const names = new Set<string>();
  const invokeRe = /invoke\s+name\s*=\s*["']([\w]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = invokeRe.exec(text))) {
    names.add(match[1]);
  }
  const bareRe = toolNamePattern();
  while ((match = bareRe.exec(text))) {
    names.add(match[1]);
  }
  return Array.from(names);
};
