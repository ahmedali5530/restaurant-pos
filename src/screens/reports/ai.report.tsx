import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {useDB} from "@/api/db/db.ts";
import {useDatabase} from "@/hooks/useDatabase.ts";
import {ReportsLayout} from "@/screens/partials/reports.layout.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {AiExamplePrompts} from "@/components/reports/ai/ai.example.prompts.tsx";
import {AiFormatSelector} from "@/components/reports/ai/ai.format.selector.tsx";
import {AiReportCharts} from "@/components/reports/ai/ai.report.charts.tsx";
import {AiMarkdown} from "@/components/reports/ai/ai.markdown.tsx";
import type {DbClient} from "@/api/reports/shared/types.ts";
import {runAiReportAgent, type AiReportAgentResult} from "@/lib/ai/agent.ts";
import type {AiOrderRef} from "@/lib/ai/order-refs.ts";
import {orderReceiptUrl} from "@/routes/posr.ts";
import {AI_EXAMPLE_PROMPTS} from "@/lib/ai/example.prompts.ts";
import {
  type AiReportFormat,
  loadAiReportFormat,
  loadAiReportPrompt,
  loadPromptFromUrl,
  saveAiReportFormat,
  saveAiReportPrompt,
  saveToHistory,
} from "@/lib/ai.report.storage.ts";
import {AiQuotaError, fetchAiUsage, type AiUsageStatus} from "@/lib/openai.service.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {getUserModules} from "@/lib/access.rules.ts";

type ConversationEntry = {role: "user" | "assistant"; content: string};

type AutoRunState = {
  key: string;
  status: "running" | "done";
};

let autoRunState: AutoRunState | null = null;

const buildAutoRunKey = (prompt: string, format: AiReportFormat) =>
  `${prompt}\0${format}\0${window.location.search}`;

const shouldSkipAutoRun = (key: string) =>
  autoRunState?.key === key
  && (autoRunState.status === "running" || autoRunState.status === "done");

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
  const [orderRefs, setOrderRefs] = useState<AiOrderRef[]>([]);
  const [toolsUsed, setToolsUsed] = useState<AiReportAgentResult["toolsUsed"]>([]);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTool, setLoadingTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [usage, setUsage] = useState<AiUsageStatus | null>(null);

  const refreshUsage = useCallback(async () => {
    const next = await fetchAiUsage();
    setUsage(next);
  }, []);

  useEffect(() => {
    queryRef.current = db.query;
  }, [db]);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  const formatQuotaError = useCallback((err: AiQuotaError) => {
    if (err.code === "AI_DISABLED") {
      return t("filters.aiDisabled");
    }
    if (err.code === "AI_DAILY_LIMIT") {
      return t("filters.aiDailyLimitReached");
    }
    if (err.code === "AI_MONTHLY_LIMIT") {
      return t("filters.aiMonthlyLimitReached");
    }
    return err.message;
  }, [t]);

  const usageLabel = useMemo(() => {
    if (!usage || !usage.enabled) {
      return null;
    }
    const parts: string[] = [];
    if (usage.daily.limit !== null) {
      parts.push(t("filters.aiUsageDaily", {used: usage.daily.used, limit: usage.daily.limit}));
    }
    if (usage.monthly.limit !== null) {
      parts.push(t("filters.aiUsageMonthly", {used: usage.monthly.used, limit: usage.monthly.limit}));
    }
    return parts.length ? parts.join(" · ") : null;
  }, [t, usage]);

  const stableDb = useMemo((): DbClient => ({
    query: (sql, params) => queryRef.current(sql, params),
  }), []);

  const allowedModules = useMemo(() => getUserModules(user), [user]);

  const applyResult = useCallback((result: AiReportAgentResult, userPrompt: string) => {
    setResponse(result.answer);
    setCharts(result.charts);
    setOrderRefs(result.orderRefs ?? []);
    setToolsUsed(result.toolsUsed ?? []);
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
      void refreshUsage();
    } catch (err) {
      setResponse("");
      setCharts([]);
      setOrderRefs([]);
      setToolsUsed([]);
      if (err instanceof AiQuotaError) {
        setError(formatQuotaError(err));
        if (err.daily || err.monthly) {
          setUsage({
            enabled: err.code !== "AI_DISABLED",
            daily: err.daily ?? {used: 0, limit: null},
            monthly: err.monthly ?? {used: 0, limit: null},
          });
        } else {
          void refreshUsage();
        }
      } else {
        setError(err instanceof Error ? err.message : t("filters.aiRunFailed"));
        void refreshUsage();
      }
    } finally {
      setLoading(false);
      setLoadingTool(null);
    }
  }, [allowedModules, applyResult, conversation, format, formatQuotaError, refreshUsage, stableDb, t]);

  const runPromptRef = useRef(runPrompt);
  runPromptRef.current = runPrompt;

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

    const autoRunKey = buildAutoRunKey(storedPrompt, storedFormat);
    if (shouldSkipAutoRun(autoRunKey)) {
      return;
    }

    autoRunState = {key: autoRunKey, status: "running"};

    void (async () => {
      try {
        await runPromptRef.current(storedPrompt, storedFormat, {appendConversation: false});
      } finally {
        autoRunState = {key: autoRunKey, status: "done"};
      }
    })();
  }, [isConnected]);

  const receiptHref = useMemo(() => {
    const usedDetail = toolsUsed.some((tool) => tool.name === "get_order_detail");
    const ref = usedDetail ? orderRefs[0] : undefined;
    return ref ? orderReceiptUrl({id: ref.orderId}) : undefined;
  }, [orderRefs, toolsUsed]);

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
              disabled={loading || usage?.enabled === false}
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
              disabled={loading || !prompt.trim() || usage?.enabled === false}
              onClick={() => void runPrompt(prompt, format, {appendConversation: true})}
            >
              {t("filters.run")}
            </Button>
            {usageLabel && (
              <span className="text-sm text-gray-500">{usageLabel}</span>
            )}
            {usage && !usage.enabled && (
              <span className="text-sm text-danger-600">{t("filters.aiDisabled")}</span>
            )}
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
            {receiptHref && (
              <div className="mb-3 print:hidden">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.open(receiptHref, "_blank", "noopener,noreferrer")}
                >
                  {t("filters.viewReceipt")}
                </Button>
              </div>
            )}
            {charts.length > 0 && (
              <div className="mb-4">
                <AiReportCharts charts={charts}/>
              </div>
            )}
            {response && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-gray-800">
                <AiMarkdown orderRefs={orderRefs}>{response}</AiMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
    </ReportsLayout>
  );
};
