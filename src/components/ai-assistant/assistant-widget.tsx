import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {useLocation} from "react-router";
import {useAtom} from "jotai";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
  faComments,
  faTimes,
  faSpinner,
  faExpand,
  faCompress,
  faCircleQuestion,
} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {appPage} from "@/store/jotai.ts";
import {useAllowedModules} from "@/hooks/useAllowedModules.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {AiMarkdown} from "@/components/reports/ai/ai.markdown.tsx";
import type {OpenAIChatMessage} from "@/lib/openai.service.ts";
import {SessionAuthError} from "@/lib/session.ts";
import {cn} from "@/lib/utils.ts";
import {
  resumeAiAssistantAgent,
  runAiAssistantAgent,
  type AssistantAgentResult,
  type AssistantDbClient,
} from "@/lib/ai/assistant-agent.ts";
import {commitWriteProposal} from "@/lib/ai/write-executor.ts";
import type {WriteProposal} from "@/lib/ai/tools/write-tools.ts";
import {WriteProposalPreview} from "@/components/ai-assistant/write-proposal-preview.tsx";
import {AssistantExamplesPanel} from "@/components/ai-assistant/assistant-examples-panel.tsx";
import {AI_ASSISTANT_NAME} from "@/lib/ai/assistant-config.ts";
import {isAssistantWidgetPath} from "@/lib/ai/assistant-widget-visibility.ts";
import {LOGIN} from "@/routes/posr.ts";
import {AiQuotaError} from "@/lib/openai.service.ts";
import {
  clearAssistantConversation,
  loadAssistantConversation,
  saveAssistantConversation,
  type AssistantDisplayEntry,
} from "@/lib/ai/assistant-conversation.storage.ts";

const EXPANDED_STORAGE_KEY = "ai-assistant-expanded";
const AUTO_EXPAND_MIN_LENGTH = 800;
const COMPLETION_PULSE_MS = 1400;

type PendingProposal = {
  proposal: WriteProposal;
  toolCallId: string;
};

const loadExpandedPreference = (): boolean => {
  try {
    return localStorage.getItem(EXPANDED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

const shouldAutoExpand = (content: string): boolean =>
  content.includes("|") || content.length > AUTO_EXPAND_MIN_LENGTH;

/**
 * Global floating assistant — mounted once in app.tsx. Uses the same reporting
 * persona and domain-aware prompts as Reports > AI Report (compact when enabled),
 * plus propose_* write tools via assistant-agent.ts. The dedicated AI Report
 * screen remains available during the transition.
 */
export function AiAssistantWidget() {
  const {t} = useTranslation(["admin", "common", "toast"]);
  const location = useLocation();
  const [{user}] = useAtom(appPage);
  const db = useDB() as unknown as AssistantDbClient;

  const visible = useMemo(() => {
    if (!user?.id) return false;
    if (location.pathname === LOGIN) return false;
    return isAssistantWidgetPath(location.pathname);
  }, [user?.id, location.pathname]);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(loadExpandedPreference);
  const [prompt, setPrompt] = useState("");
  const [entries, setEntries] = useState<AssistantDisplayEntry[]>([]);
  const [history, setHistory] = useState<OpenAIChatMessage[]>([]);
  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [completionPulse, setCompletionPulse] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  const assistantName = AI_ASSISTANT_NAME;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wasLoadingRef = useRef(false);
  const completionPulseTimerRef = useRef<number | null>(null);

  const userId = user?.id ? String(user.id) : null;
  const allowedModules = useAllowedModules(user);

  useEffect(() => {
    if (!userId) {
      setEntries([]);
      setHistory([]);
      setHydrated(false);
      return;
    }

    let cancelled = false;
    setHydrated(false);

    void loadAssistantConversation(userId).then(snapshot => {
      if (cancelled) return;
      if (snapshot) {
        setEntries(snapshot.entries);
        setHistory([]);
      } else {
        setEntries([]);
        setHistory([]);
      }
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !hydrated) return;

    const timer = window.setTimeout(() => {
      void saveAssistantConversation(userId, {entries, history: []});
    }, 250);

    return () => window.clearTimeout(timer);
  }, [userId, hydrated, entries]);

  useEffect(() => {
    if (!visible) {
      setOpen(false);
    }
  }, [visible]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, String(expanded));
    } catch {
      // ignore storage errors
    }
  }, [expanded]);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "smooth") => {
    window.requestAnimationFrame(() => {
      const container = scrollContainerRef.current;
      const anchor = messagesEndRef.current;
      if (!container || !anchor) return;

      anchor.scrollIntoView({behavior, block: "end"});
      container.scrollTop = container.scrollHeight;
    });
  }, []);

  const signalCompletion = useCallback(() => {
    setCompletionPulse(true);
    if (completionPulseTimerRef.current !== null) {
      window.clearTimeout(completionPulseTimerRef.current);
    }
    completionPulseTimerRef.current = window.setTimeout(() => {
      setCompletionPulse(false);
      completionPulseTimerRef.current = null;
    }, COMPLETION_PULSE_MS);
    scrollToLatest("smooth");
  }, [scrollToLatest]);

  useEffect(() => {
    return () => {
      if (completionPulseTimerRef.current !== null) {
        window.clearTimeout(completionPulseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    scrollToLatest(entries.length > 0 || loading ? "smooth" : "auto");
  }, [entries, pending, error, loading, scrollToLatest]);

  useEffect(() => {
    if (wasLoadingRef.current && !loading) {
      signalCompletion();
    }
    wasLoadingRef.current = loading;
  }, [loading, signalCompletion]);

  const handleSelectExamplePrompt = useCallback((example: string) => {
    setPrompt(example);
    setShowExamples(false);
  }, []);

  const handleClearConversation = useCallback(() => {
    if (!userId || loading) return;
    if (!entries.length && !history.length) return;
    if (!window.confirm(t("common:aiAssistant.clearConfirm"))) return;

    setEntries([]);
    setHistory([]);
    setPending(null);
    setError(null);
    void clearAssistantConversation(userId);
  }, [entries.length, history.length, loading, t, userId]);

  const applyResult = useCallback((result: AssistantAgentResult) => {
    if (result.type === "answer") {
      setHistory([]);
      if (shouldAutoExpand(result.answer)) {
        setExpanded(true);
      }
      setEntries(prev => [...prev, {role: "assistant", content: result.answer}]);
      setPending(null);
    } else {
      setHistory(result.messages);
      setPending({proposal: result.proposal, toolCallId: result.toolCallId});
      setExpanded(true);
      setEntries(prev => [
        ...prev,
        {
          role: "assistant",
          content: t("common:aiAssistant.reviewPrompt", {
            count: result.proposal.records.length,
            entity: result.proposal.entityLabel.toLowerCase(),
            defaultValue: `I've prepared ${result.proposal.records.length} ${result.proposal.entityLabel.toLowerCase()} change(s) for you to review below.`,
          }),
        },
      ]);
    }
  }, [t]);

  const handleSubmit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    setEntries(prev => [...prev, {role: "user", content: trimmed}]);
    setPrompt("");
    setLoading(true);
    setError(null);

    try {
      const result = await runAiAssistantAgent(db, t, trimmed, {allowedModules});
      applyResult(result);
    } catch (err) {
      if (err instanceof SessionAuthError) {
        setError(t("common:aiAssistant.sessionExpired"));
      } else if (err instanceof AiQuotaError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!pending || loading) return;

    const {proposal, toolCallId} = pending;
    setPending(null);
    setLoading(true);
    setError(null);

    try {
      const summary = await commitWriteProposal(db, t, proposal);
      setEntries(prev => [
        ...prev,
        {
          role: "system",
          content: t("common:aiAssistant.applied", {
            imported: summary.imported,
            failed: summary.failed,
            skipped: summary.skipped,
            defaultValue: `Applied: ${summary.imported} created/updated, ${summary.failed} failed, ${summary.skipped} skipped.`,
          }),
        },
      ]);
      const result = await resumeAiAssistantAgent(
        db, t, history, toolCallId, {confirmed: true, summary}, {allowedModules},
      );
      applyResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      try {
        const result = await resumeAiAssistantAgent(
          db, t, history, toolCallId, {confirmed: false, error: message}, {allowedModules},
        );
        applyResult(result);
      } catch {
        // applied message already shown if commit succeeded; ignore resume failure
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!pending || loading) return;

    const {toolCallId} = pending;
    setPending(null);
    setLoading(true);
    setError(null);

    try {
      const result = await resumeAiAssistantAgent(
        db, t, history, toolCallId,
        {confirmed: false, error: t("common:aiAssistant.cancelled")},
        {allowedModules},
      );
      applyResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmDisabled =
    loading
    || (pending?.proposal.hasBlockingErrors
      && pending.proposal.records.every(r => r.issues.some(i => i.severity === "error")));

  if (!visible) {
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 border-warning-500 bg-neutral-900 text-warning-500 shadow-lg transition-colors hover:bg-neutral-800"
        aria-label={t("common:aiAssistant.open", {name: assistantName})}
      >
        <FontAwesomeIcon icon={faComments} />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-40 flex flex-col rounded-lg border border-neutral-200 bg-white shadow-2xl transition-all duration-200",
        expanded
          ? "h-[min(42rem,85vh)] w-[min(56rem,92vw)]"
          : "h-[32rem] w-96",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2">
        <span className="min-w-0 truncate text-sm font-semibold">
          {t("common:aiAssistant.title", {name: assistantName})}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setShowExamples(prev => !prev)}
            aria-label={t("common:aiAssistant.examplesTitle")}
            title={t("common:aiAssistant.examplesTitle")}
            className={cn(
              "text-neutral-600 hover:text-neutral-900",
              showExamples && "text-warning-600",
            )}
          >
            <FontAwesomeIcon icon={faCircleQuestion} />
          </button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleClearConversation}
            disabled={loading || !hydrated || (!entries.length && !history.length)}
            className="!min-w-0"
            flat
          >
            {t("common:aiAssistant.clear")}
          </Button>
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={expanded ? t("common:aiAssistant.collapse") : t("common:aiAssistant.expand")}
            title={expanded ? t("common:aiAssistant.collapse") : t("common:aiAssistant.expand")}
          >
            <FontAwesomeIcon
              icon={expanded ? faCompress : faExpand}
            />
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("common:close")}>
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
      </div>

      {showExamples && (
        <AssistantExamplesPanel
          onClose={() => setShowExamples(false)}
          onSelectPrompt={handleSelectExamplePrompt}
        />
      )}

      <div ref={scrollContainerRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-2 scroll-smooth">
        {entries.map((entry, i) => {
          const isLatestCompletion =
            completionPulse
            && i === entries.length - 1
            && entry.role !== "user";

          return (
          <div
            key={i}
            className={cn("text-sm", entry.role === "user" ? "text-right" : "text-left")}
          >
            <div
              className={cn(
                "rounded-md px-2 py-1 transition-shadow duration-700",
                entry.role === "user"
                  ? "inline-block bg-neutral-900 text-warning-500 rounded-br-none"
                  : entry.role === "system"
                    ? "inline-block border border-warning-200 bg-warning-50 text-neutral-700 italic"
                    : "block w-full max-w-full border border-neutral-200 bg-neutral-50 text-neutral-900",
                isLatestCompletion && "ring-2 ring-warning-400/70 shadow-md",
              )}
            >
              {entry.role === "user" ? (
                entry.content
              ) : entry.role === "system" ? (
                entry.content
              ) : (
                <AiMarkdown compact>{entry.content}</AiMarkdown>
              )}
            </div>
          </div>
          );
        })}

        {loading && (
          <div
            className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-2 py-2 text-xs text-neutral-600"
            aria-live="polite"
            aria-busy="true"
          >
            <FontAwesomeIcon icon={faSpinner} spin className="text-warning-500" />
            <span>{t("common:aiAssistant.working", {name: assistantName})}</span>
          </div>
        )}

        {pending && (
          <div className="space-y-2 rounded-md border border-warning-500/40 bg-warning-50 p-2">
            <div className="text-xs font-semibold text-neutral-900">
              {t("common:aiAssistant.reviewTitle")}
            </div>
            <WriteProposalPreview proposal={pending.proposal} />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={handleCancel} disabled={loading}>
                {t("common:cancel")}
              </Button>
              <Button
                variant="primary"
                filled
                size="sm"
                onClick={handleConfirm}
                disabled={confirmDisabled}
              >
                {t("common:aiAssistant.confirm")}
              </Button>
            </div>
          </div>
        )}

        {error && <div className="text-xs text-danger-600">{error}</div>}
        <div ref={messagesEndRef} className="h-1 shrink-0" aria-hidden="true" />
      </div>

      <div className="flex items-end gap-2 border-t border-neutral-200 p-2">
        <Textarea
          value={prompt}
          onChange={(e: any) => setPrompt(e.target.value)}
          onKeyDown={(e: any) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={t("common:aiAssistant.placeholder")}
          rows={2}
          disabled={loading || !!pending}
          className="flex-1"
          enableKeyboard={false}
        />
        <Button
          variant="primary"
          filled
          size="sm"
          onClick={handleSubmit}
          disabled={loading || !!pending || !prompt.trim()}
        >
          {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : t("common:send")}
        </Button>
      </div>
    </div>
  );
}
