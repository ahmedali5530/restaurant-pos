/** Explicit changefeed / CDC asks only — keep dormant for normal reports. */
export const CHANGEFEED_TOOL_NAME = "get_table_changefeed";

export const isChangefeedPrompt = (prompt: string): boolean =>
  /get_table_changefeed|changefeed|change\s*feed|show\s+changes|\bcdc\b|mutation\s+history|db\s+mutations?|database\s+changes?|table\s+changes?\s+(?:for|on|since)|what\s+changed\s+(?:in|on)\s+(?:the\s+)?(?:table|order|record)|pull\s+changefeed/i
    .test(prompt);

/**
 * Best-effort table/alias from the user prompt (e.g. "changefeed for menu_item").
 * Returns the raw token; normalizeChangefeedTable resolves aliases.
 */
export const resolveChangefeedTableFromPrompt = (prompt: string): string | null => {
  const patterns = [
    /\b(?:changefeed|change\s*feed|show\s+changes|mutation\s+history|pull\s+changefeed|get_table_changefeed)\s+(?:for|on|of)\s+[`"']?([a-z][a-z0-9_]*)[`"']?/i,
    /\b(?:for|on)\s+(?:table\s+)?[`"']?([a-z][a-z0-9_]*)[`"']?\s+(?:changefeed|change\s*feed|mutations?)\b/i,
    /\b[`"']?([a-z][a-z0-9_]*)[`"']?\s+(?:changefeed|change\s*feed)\b/i,
    /\btable\s+[`"']?([a-z][a-z0-9_]*)[`"']?/i,
  ];
  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match?.[1] && match[1].toLowerCase() !== "table") return match[1];
  }
  return null;
};
