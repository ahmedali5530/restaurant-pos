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
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 print:hidden">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-700"
      >
        <span>{t("filters.aiDataUsed", {count: toolsUsed.length})}</span>
        <span className="text-neutral-400">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <ul className="border-t border-neutral-200 px-4 py-3 space-y-2">
          {toolsUsed.map((tool, index) => (
            <li key={`${tool.name}-${index}`} className="text-sm text-neutral-600">
              <span className="font-medium text-neutral-800">{tool.name}</span>
              {Object.keys(tool.args).length > 0 && (
                <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs text-neutral-600">
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
