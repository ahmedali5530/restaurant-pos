import {useCallback, useEffect, useMemo, useState} from "react";
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
} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {appPage} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {Modal} from "@/components/common/react-aria/modal.tsx";
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
import {LOGIN, REPORTS} from "@/routes/posr.ts";
import {AiQuotaError} from "@/lib/openai.service.ts";

const EXPANDED_STORAGE_KEY = "ai-assistant-expanded";
const AUTO_EXPAND_MIN_LENGTH = 800;

type DisplayEntry = {role: "user" | "assistant" | "system"; content: string};

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

const isReportsPath = (pathname: string) =>
  pathname === REPORTS || pathname.startsWith(`${REPORTS}/`);

/**
 * Global floating assistant — mounted once in app.tsx next to
 * GlobalDeliveryOrderPopup, available from any screen. Old Reports > AI
 * (screens/reports/ai.report.tsx) is untouched and still works as a
 * read-only fallback; this widget adds dish write capability on top of the
 * same read tools via assistant-agent.ts.
 */
export function AiAssistantWidget() {
  const {t} = useTranslation(["admin", "common", "toast"]);
  const location = useLocation();
  const [{user}] = useAtom(appPage);
  const db = useDB() as unknown as AssistantDbClient;

  const visible = useMemo(() => {
    if (!user?.id) return false;
    if (location.pathname === LOGIN) return false;
    if (isReportsPath(location.pathname)) return false;
    return true;
  }, [user?.id, location.pathname]);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(loadExpandedPreference);
  const [prompt, setPrompt] = useState("");
  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  const [history, setHistory] = useState<OpenAIChatMessage[]>([]);
  const [pending, setPending] = useState<PendingProposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedModules = useMemo(() => {
    const roles = user?.user_role?.roles ?? user?.role?.roles ?? [];
    return Array.isArray(roles) ? (roles as string[]) : [];
  }, [user?.user_role?.roles, user?.role?.roles]);

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

  const applyResult = useCallback((result: AssistantAgentResult) => {
    setHistory(result.messages);
    if (result.type === "answer") {
      if (shouldAutoExpand(result.answer)) {
        setExpanded(true);
      }
      setEntries(prev => [...prev, {role: "assistant", content: result.answer}]);
      setPending(null);
    } else {
      setPending({proposal: result.proposal, toolCallId: result.toolCallId});
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
      const result = await runAiAssistantAgent(db, t, trimmed, {allowedModules}, history);
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
    setLoading(true);
    setError(null);

    try {
      const summary = await commitWriteProposal(db, t, pending.proposal);
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
        db, t, history, pending.toolCallId, {confirmed: true, summary}, {allowedModules},
      );
      setPending(null);
      applyResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      try {
        const result = await resumeAiAssistantAgent(
          db, t, history, pending.toolCallId, {confirmed: false, error: message}, {allowedModules},
        );
        setPending(null);
        applyResult(result);
      } catch {
        setPending(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!pending || loading) return;
    setLoading(true);
    setError(null);

    try {
      const result = await resumeAiAssistantAgent(
        db, t, history, pending.toolCallId,
        {confirmed: false, error: t("common:aiAssistant.cancelled")},
        {allowedModules},
      );
      setPending(null);
      applyResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(null);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) {
    return null;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg hover:bg-primary-600"
        aria-label={t("common:aiAssistant.open")}
      >
        <FontAwesomeIcon icon={faComments} />
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-40 flex flex-col rounded-lg border border-gray-200 bg-white shadow-2xl transition-all duration-200",
        expanded
          ? "h-[min(42rem,85vh)] w-[min(56rem,92vw)]"
          : "h-[32rem] w-96",
      )}
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold text-gray-800">
          {t("common:aiAssistant.title")}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleExpanded}
            aria-label={expanded ? t("common:aiAssistant.collapse") : t("common:aiAssistant.expand")}
            title={expanded ? t("common:aiAssistant.collapse") : t("common:aiAssistant.expand")}
          >
            <FontAwesomeIcon icon={expanded ? faCompress : faExpand} className="text-gray-500" />
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("common:close")}>
            <FontAwesomeIcon icon={faTimes} className="text-gray-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {entries.map((entry, i) => (
          <div
            key={i}
            className={cn("text-sm", entry.role === "user" ? "text-right" : "text-left")}
          >
            <div
              className={cn(
                "rounded-md px-2 py-1",
                entry.role === "user"
                  ? "inline-block bg-primary-500 text-white"
                  : entry.role === "system"
                    ? "inline-block bg-gray-100 text-gray-600 italic"
                    : "block w-full max-w-full bg-gray-100 text-gray-800",
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
        ))}

        {error && <div className="text-xs text-danger-600">{error}</div>}
      </div>

      <div className="flex items-end gap-2 border-t border-gray-200 p-2">
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
          disabled={loading}
          className="flex-1"
          enableKeyboard={false}
        />
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={loading || !prompt.trim()}>
          {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : t("common:send")}
        </Button>
      </div>

      {pending && (
        <Modal open onClose={handleCancel} size="xl" title={t("common:aiAssistant.reviewTitle")}>
          <div className="space-y-3">
            <WriteProposalPreview proposal={pending.proposal} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={handleCancel} disabled={loading}>
                {t("common:cancel")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={loading || (pending.proposal.hasBlockingErrors && pending.proposal.records.every(r => r.issues.some(i => i.severity === "error")))}
              >
                {t("common:aiAssistant.confirm")}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
