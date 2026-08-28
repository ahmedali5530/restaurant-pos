/**
 * Fixes common model output quirks so remark-gfm can parse tables and lists.
 */
export function normalizeAiMarkdown(content: string): string {
  let text = content.replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  const wholeFence = text.match(/^```(?:markdown|md|text)?\n([\s\S]*?)\n```$/);
  if (wholeFence) {
    text = wholeFence[1].trim();
  }

  // Ensure a blank line before pipe tables (required by GFM when following prose).
  text = text.replace(
    /([^\n|])\n(\|[^\n]+\|\n\|[-:\s|]+\|)/g,
    "$1\n\n$2",
  );

  // Tables that start immediately after a heading need a blank line too.
  text = text.replace(
    /(^#{1,6}[^\n]+)\n(\|[^\n]+\|\n\|[-:\s|]+\|)/gm,
    "$1\n\n$2",
  );

  return text;
}
