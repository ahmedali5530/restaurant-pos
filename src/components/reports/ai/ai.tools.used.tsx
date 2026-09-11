import {useState} from "react";
import {useTranslation} from "react-i18next";
import type {AiReportAgentResult} from "@/lib/ai/agent.ts";

interface AiToolsUsedProps {
  toolsUsed: AiReportAgentResult["toolsUsed"];
}

export const AiToolsUsed = ({toolsUsed}: AiToolsUsedProps) => {
  const {t} = useTranslation("reports");
  const [open, setOpen] = useState(false);

  if (!toolsUsed.length) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-surface print:hidden">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground"
      >
        <span>{t("filters.aiDataUsed", {count: toolsUsed.length})}</span>
        <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul className="border-t border-border px-4 py-3 space-y-2">
          {toolsUsed.map((tool, index) => (
            <li key={`${tool.name}-${index}`} className="text-sm text-muted">
              <span className="font-medium text-foreground">{tool.name}</span>
              {Object.keys(tool.args).length > 0 && (
                <pre className="mt-1 overflow-x-auto rounded bg-surface-elevated p-2 text-xs text-muted">
                  {JSON.stringify(tool.args, null, 2)}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
