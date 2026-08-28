/**
 * In-memory line list for document-shaped import configs (purchases, issues, etc.)
 * that normally expect form callbacks (append / update / getLines).
 *
 * Phase 6 spike: use this adapter when wiring headless document write tools.
 * The adapter satisfies the callback interface while keeping lines in memory
 * until a future headless commit path persists the full document.
 */
export type DocumentLineAdapter<TLine = Record<string, unknown>> = {
  append: (line: TLine) => void;
  update: (index: number, line: TLine) => void;
  getLines: () => TLine[];
  clear: () => void;
};

export function createDocumentLineAdapter<TLine = Record<string, unknown>>(): DocumentLineAdapter<TLine> {
  const lines: TLine[] = [];

  return {
    append: (line: TLine) => {
      lines.push(line);
    },
    update: (index: number, line: TLine) => {
      if (index < 0 || index >= lines.length) {
        throw new Error(`Line index out of range: ${index}`);
      }
      lines[index] = line;
    },
    getLines: () => [...lines],
    clear: () => {
      lines.length = 0;
    },
  };
}
