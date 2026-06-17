import {useCallback, useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {useDB} from "@/api/db/db.ts";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {runAiReportAgent} from "@/lib/ai/agent.ts";
import {
  type AiReportFormat,
  loadAiReportFormat,
  loadAiReportPrompt,
  saveAiReportFormat,
  saveAiReportPrompt,
} from "@/lib/ai.report.storage.ts";
import {faList, faTable} from "@fortawesome/free-solid-svg-icons";

const markdownComponents = {
  h1: ({children}: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-bold text-gray-900 mb-4 mt-6 first:mt-0">{children}</h1>
  ),
  h2: ({children}: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-semibold text-gray-800 mb-3 mt-5 first:mt-0">{children}</h2>
  ),
  h3: ({children}: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-4 first:mt-0">{children}</h3>
  ),
  p: ({children}: { children?: React.ReactNode }) => (
    <p className="mb-3 text-gray-800 leading-relaxed last:mb-0">{children}</p>
  ),
  ul: ({children}: { children?: React.ReactNode }) => (
    <ul className="mb-3 list-disc pl-6 text-gray-800 space-y-1">{children}</ul>
  ),
  ol: ({children}: { children?: React.ReactNode }) => (
    <ol className="mb-3 list-decimal pl-6 text-gray-800 space-y-1">{children}</ol>
  ),
  li: ({children}: { children?: React.ReactNode }) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({children}: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  code: ({children, className}: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded bg-gray-100 p-3 text-sm text-gray-800 my-3">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm text-gray-800">{children}</code>
    );
  },
  pre: ({children}: { children?: React.ReactNode }) => (
    <pre className="mb-3 overflow-x-auto">{children}</pre>
  ),
  table: ({children}: { children?: React.ReactNode }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-neutral-200">
      <table className="min-w-full border-collapse bg-white text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({children}: { children?: React.ReactNode }) => (
    <thead className="bg-neutral-50">{children}</thead>
  ),
  tbody: ({children}: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-neutral-100 bg-white">{children}</tbody>
  ),
  tr: ({children}: { children?: React.ReactNode }) => (
    <tr className="divide-x divide-neutral-100">{children}</tr>
  ),
  th: ({children}: { children?: React.ReactNode }) => (
    <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({children}: { children?: React.ReactNode }) => (
    <td className="px-4 py-3 text-sm text-neutral-800 align-top">{children}</td>
  ),
  blockquote: ({children}: { children?: React.ReactNode }) => (
    <blockquote className="mb-3 border-l-4 border-primary-300 pl-4 text-gray-600 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-gray-200"/>,
};

export const AiReport = () => {
  const { t } = useTranslation('reports');
  const db = useDB();
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<AiReportFormat>(() => loadAiReportFormat());
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const runPrompt = useCallback(async (nextPrompt: string, nextFormat: AiReportFormat = format) => {
    const trimmedPrompt = nextPrompt.trim();
    if (!trimmedPrompt) {
      setError("Prompt cannot be empty.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setHasRun(true);
      saveAiReportPrompt(trimmedPrompt);
      saveAiReportFormat(nextFormat);

      const result = await runAiReportAgent(db, trimmedPrompt, {format: nextFormat});
      setResponse(result.answer);
    } catch (err) {
      setResponse("");
      setError(err instanceof Error ? err.message : "Failed to run AI report.");
    } finally {
      setLoading(false);
    }
  }, [db, format]);

  const handleFormatChange = (nextFormat: AiReportFormat) => {
    setFormat(nextFormat);
    saveAiReportFormat(nextFormat);
  };

  useEffect(() => {
    const storedPrompt = loadAiReportPrompt();
    const storedFormat = loadAiReportFormat();
    if (!storedPrompt) {
      return;
    }

    setPrompt(storedPrompt);
    setFormat(storedFormat);

    const runStoredPrompt = async () => {
      try {
        setLoading(true);
        setError(null);
        setHasRun(true);
        const result = await runAiReportAgent(db, storedPrompt, {format: storedFormat});
        setResponse(result.answer);
      } catch (err) {
        setResponse("");
        setError(err instanceof Error ? err.message : "Failed to run AI report.");
      } finally {
        setLoading(false);
      }
    };

    void runStoredPrompt();
  }, []);

  return (
    <ReportsLayout title="AI Report" subtitle={hasRun ? "Generated from your prompt" : undefined}>
      <div className="flex flex-col gap-6">
        <div className="print:hidden">
          <label className="text-sm text-gray-600 w-full block">
            Prompt
            <Textarea
              className="mt-1 min-h-32 w-full"
              placeholder={t('filters.aiPrompt')}
              value={prompt}
              onChange={(event) => setPrompt(event.currentTarget.value)}
            />
          </label>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-sm text-gray-600">{t('filters.format')}</span>
            <Button
              variant="primary"
              icon={faList}
              active={format === "list"}
              filled={format === "list"}
              onClick={() => handleFormatChange("list")}
            >
              List
            </Button>
            <Button
              variant="primary"
              icon={faTable}
              active={format === "table"}
              filled={format === "table"}
              onClick={() => handleFormatChange("table")}
            >
              Table
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              filled
              isLoading={loading}
              disabled={loading || !prompt.trim()}
              onClick={() => void runPrompt(prompt, format)}
            >
              Run
            </Button>
          </div>
        </div>

        {loading && (
          <div className="text-gray-600">Running AI report...</div>
        )}

        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">
            {error}
          </div>
        )}

        {response && (
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">Response</h2>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-gray-800">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {response}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </ReportsLayout>
  );
};
