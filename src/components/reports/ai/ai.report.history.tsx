import {useEffect, useState} from "react";
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

  useEffect(() => {
    const refresh = () => setHistory(loadHistory());
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  if (!history.length) {
    return null;
  }

  const handleToggle = () => {
    setOpen(prev => {
      if (!prev) {
        setHistory(loadHistory());
      }
      return !prev;
    });
  };

  const handleRemove = (prompt: string) => {
    removeFromHistory(prompt);
    setHistory(loadHistory());
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 print:hidden w-full">
      <button
        type="button"
        onClick={handleToggle}
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
                className="flex-1 text-left text-sm text-neutral-700 hover:text-primary-600 p-2 rounded-full border border-neutral-100"
              >
                {entry.prompt}
              </button>
              <button
                type="button"
                onClick={() => handleRemove(entry.prompt)}
                className="btn btn-flat btn-danger btn-square"
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
