import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {useDB} from "@/api/db/db.ts";
import {useDatabase} from "@/hooks/useDatabase.ts";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {AiExamplePrompts} from "@/components/reports/ai/ai.example.prompts.tsx";
import {AiFormatSelector} from "@/components/reports/ai/ai.format.selector.tsx";
import {AiReportCharts} from "@/components/reports/ai/ai.report.charts.tsx";
import {AiReportHistory} from "@/components/reports/ai/ai.report.history.tsx";
import {runAiReportAgent, type AiReportAgentResult} from "@/lib/ai/agent.ts";
import {AI_EXAMPLE_PROMPTS} from "@/lib/ai/example.prompts.ts";
import {createStableDbClient} from "@/lib/ai/db.client.ts";
import {
  type AiReportFormat,
  type AiReportHistoryEntry,
  loadAiReportFormat,
  loadAiReportPrompt,
  loadPromptFromUrl,
  saveAiReportFormat,
  saveAiReportPrompt,
  saveToHistory,
} from "@/lib/ai.report.storage.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";

const markdownComponents = {
  h1: ({children}: {children?: React.ReactNode}) => (
    <h1 className="text-2xl font-bold text-gray-900 mb-4 mt-6 first:mt-0">{children}</h1>
  ),
  h2: ({children}: {children?: React.ReactNode}) => (
    <h2 className="text-xl font-semibold text-gray-800 mb-3 mt-5 first:mt-0">{children}</h2>
  ),
  h3: ({children}: {children?: React.ReactNode}) => (
    <h3 className="text-lg font-semibold text-gray-800 mb-2 mt-4 first:mt-0">{children}</h3>
  ),
  p: ({children}: {children?: React.ReactNode}) => (
    <p className="mb-3 text-gray-800 leading-relaxed last:mb-0">{children}</p>
  ),
  ul: ({children}: {children?: React.ReactNode}) => (
    <ul className="mb-3 list-disc pl-6 text-gray-800 space-y-1">{children}</ul>
  ),
  ol: ({children}: {children?: React.ReactNode}) => (
    <ol className="mb-3 list-decimal pl-6 text-gray-800 space-y-1">{children}</ol>
  ),
  li: ({children}: {children?: React.ReactNode}) => (
    <li className="leading-relaxed">{children}</li>
  ),
  strong: ({children}: {children?: React.ReactNode}) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  code: ({children, className}: {children?: React.ReactNode; className?: string}) => {
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
  pre: ({children}: {children?: React.ReactNode}) => (
    <pre className="mb-3 overflow-x-auto">{children}</pre>
  ),
  table: ({children}: {children?: React.ReactNode}) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-neutral-200">
      <table className="min-w-full border-collapse bg-white text-sm">{children}</table>
    </div>
  ),
  thead: ({children}: {children?: React.ReactNode}) => (
    <thead className="bg-neutral-50">{children}</thead>
  ),
  tbody: ({children}: {children?: React.ReactNode}) => (
    <tbody className="divide-y divide-neutral-100 bg-white">{children}</tbody>
  ),
  tr: ({children}: {children?: React.ReactNode}) => (
    <tr className="divide-x divide-neutral-100">{children}</tr>
  ),
  th: ({children}: {children?: React.ReactNode}) => (
    <th className="px-4 py-3 text-left text-sm font-semibold text-neutral-700 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({children}: {children?: React.ReactNode}) => (
    <td className="px-4 py-3 text-sm text-neutral-800 align-top">{children}</td>
  ),
  blockquote: ({children}: {children?: React.ReactNode}) => (
    <blockquote className="mb-3 border-l-4 border-primary-300 pl-4 text-gray-600 italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-gray-200"/>,
};

type ConversationEntry = {role: "user" | "assistant"; content: string};

export const AiReport = () => {
  const {t} = useTranslation("reports");
  const db = useDB();
  const queryRef = useRef(db.query);
  const [{user}] = useAtom(appPage);
  const {isConnected} = useDatabase();

  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<AiReportFormat>(() => loadAiReportFormat());
  const [response, setResponse] = useState("");
  const [charts, setCharts] = useState<AiReportAgentResult["charts"]>([]);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTool, setLoadingTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const stableDb = useMemo(() => createStableDbClient((...args) => queryRef.current(...args)), []);

  const allowedModules = useMemo(() => {
    const roles = user?.user_role?.roles ?? user?.role?.roles ?? [];
    return Array.isArray(roles) ? roles as string[] : [];
  }, [user?.user_role?.roles, user?.role?.roles]);

  useEffect(() => {
    queryRef.current = db.query;
  });

  const applyResult = useCallback((result: AiReportAgentResult, userPrompt: string) => {
    setResponse(result.answer);
    setCharts(result.charts);
    setConversation(prev => [
      ...prev,
      {role: "user" as const, content: userPrompt},
      {role: "assistant" as const, content: result.answer},
    ].slice(-10));
    saveToHistory(userPrompt, format);
  }, [format]);

  const runPrompt = useCallback(async (
    nextPrompt: string,
    nextFormat: AiReportFormat = format,
    options: {appendConversation?: boolean} = {},
  ) => {
    const trimmedPrompt = nextPrompt.trim();
    if (!trimmedPrompt) {
      setError(t("filters.aiPromptEmpty"));
      return;
    }

    try {
      setLoading(true);
      setLoadingTool(null);
      setError(null);
      setHasRun(true);
      saveAiReportPrompt(trimmedPrompt);
      saveAiReportFormat(nextFormat);

      const historyForAgent = options.appendConversation !== false && conversation.length > 0
        ? conversation.slice(-6)
        : undefined;

      const result = await runAiReportAgent(stableDb, trimmedPrompt, {
        format: nextFormat,
        allowedModules,
        conversationHistory: historyForAgent,
        onToolStart: setLoadingTool,
      });
      applyResult(result, trimmedPrompt);
    } catch (err) {
      setResponse("");
      setCharts([]);
      setError(err instanceof Error ? err.message : t("filters.aiRunFailed"));
    } finally {
      setLoading(false);
      setLoadingTool(null);
    }
  }, [allowedModules, applyResult, conversation, format, stableDb, t]);

  const handleFormatChange = (nextFormat: AiReportFormat) => {
    setFormat(nextFormat);
    saveAiReportFormat(nextFormat);
  };

  useEffect(() => {
    const urlState = loadPromptFromUrl();
    const storedPrompt = urlState.prompt || loadAiReportPrompt();
    const storedFormat = urlState.format || loadAiReportFormat();

    if (!storedPrompt) {
      return;
    }

    setPrompt(storedPrompt);
    setFormat(storedFormat);

    if (!isConnected) {
      return;
    }

    const runStoredPrompt = async () => {
      try {
        setLoading(true);
        setError(null);
        setHasRun(true);
        const result = await runAiReportAgent(stableDb, storedPrompt, {
          format: storedFormat,
          allowedModules,
          onToolStart: setLoadingTool,
        });
        applyResult(result, storedPrompt);
      } catch (err) {
        setResponse("");
        setError(err instanceof Error ? err.message : t("filters.aiRunFailed"));
      } finally {
        setLoading(false);
        setLoadingTool(null);
      }
    };

    void runStoredPrompt();
  }, [isConnected]);

  const handleHistorySelect = (entry: AiReportHistoryEntry) => {
    setPrompt(entry.prompt);
    setFormat(entry.format);
    void runPrompt(entry.prompt, entry.format, {appendConversation: false});
  };

  const loadingMessage = loadingTool
    ? t("filters.aiFetching", {tool: loadingTool})
    : t("filters.aiRunning");

  return (
    <ReportsLayout
      title={t("titles.aiReport")}
      subtitle={hasRun ? t("titles.aiGeneratedSubtitle") : undefined}
    >
      <div className="flex flex-col gap-6">
        <div className="print:hidden">
          <label className="text-sm text-gray-600 w-full block">
            {t("filters.prompt")}
            <Textarea
              className="mt-1 min-h-32 w-full"
              placeholder={t("filters.aiPrompt")}
              value={prompt}
              onChange={event => setPrompt(event.currentTarget.value)}
              enableKeyboard={false}
            />
          </label>

          <div className="mt-3">
            <AiExamplePrompts
              disabled={loading}
              onSelect={selected => {
                setPrompt(selected);
                const isChartPrompt = AI_EXAMPLE_PROMPTS.some(
                  p => p.prompt === selected && p.category === "charts",
                );
                const nextFormat: AiReportFormat = isChartPrompt ? "chart" : format;
                if (isChartPrompt) {
                  setFormat("chart");
                  saveAiReportFormat("chart");
                }
                void runPrompt(selected, nextFormat, {appendConversation: true});
              }}
            />
          </div>

          <div className="mt-3">
            <AiFormatSelector format={format} onChange={handleFormatChange}/>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              filled
              isLoading={loading}
              disabled={loading || !prompt.trim()}
              onClick={() => void runPrompt(prompt, format, {appendConversation: true})}
            >
              {t("filters.run")}
            </Button>
          </div>

          <div className="mt-3">
            <AiReportHistory onSelect={handleHistorySelect}/>
          </div>
        </div>

        {loading && (
          <div className="text-gray-600">{loadingMessage}</div>
        )}

        {error && (
          <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-danger-700">
            {error}
          </div>
        )}

        {(response || charts.length > 0) && (
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">{t("filters.aiResponse")}</h2>
            {charts.length > 0 && (
              <div className="mb-4">
                <AiReportCharts charts={charts}/>
              </div>
            )}
            {response && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-gray-800">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {response}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
    </ReportsLayout>
  );
};
