import {useState} from "react";
import {useTranslation} from "react-i18next";
import type {AiReportHistoryEntry} from "@/lib/ai.report.storage.ts";
import {loadHistory, removeFromHistory} from "@/lib/ai.report.storage.ts";

interface AiReportHistoryProps {
  onSelect: (entry: AiReportHistoryEntry) => void;
}

export const AiReportHistory = ({onSelect}: AiReportHistoryProps) => {
  const {t} = useTranslation("reports");
  const [history, setHistory] = useState(() => loadHistory());
  const [open, setOpen] = useState(false);

  if (!history.length) {
    return null;
  }

  const handleRemove = (prompt: string) => {
    removeFromHistory(prompt);
    setHistory(loadHistory());
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 print:hidden">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-700"
      >
        <span>{t("filters.aiHistory", {count: history.length})}</span>
        <span className="text-neutral-400">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul className="border-t border-neutral-200 px-4 py-3 space-y-2 max-h-48 overflow-y-auto">
          {history.map(entry => (
            <li key={entry.savedAt} className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onSelect(entry)}
                className="flex-1 text-left text-sm text-neutral-700 hover:text-primary-600"
              >
                {entry.prompt}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(entry.prompt)}
                className="text-xs text-neutral-400 hover:text-danger-600"
                aria-label="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
