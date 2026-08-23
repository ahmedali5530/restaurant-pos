import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {useAtom} from "jotai";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faComments, faTimes, faSpinner} from "@fortawesome/free-solid-svg-icons";
import {useDB} from "@/api/db/db.ts";
import {appPage} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import type {OpenAIChatMessage} from "@/lib/openai.service.ts";
import {
  resumeAiAssistantAgent,
  runAiAssistantAgent,
  type AssistantAgentResult,
  type AssistantDbClient,
} from "@/lib/ai/assistant-agent.ts";
import {commitWriteProposal} from "@/lib/ai/write-executor.ts";
import type {WriteProposal} from "@/lib/ai/tools/write-tools.ts";
import {WriteProposalPreview} from "@/components/ai-assistant/write-proposal-preview.tsx";

type DisplayEntry = {role: "user" | "assistant" | "system"; content: string};

type PendingProposal = {
  proposal: WriteProposal;
  toolCallId: string;
};

/**
 * Global floating assistant — mounted once in app.tsx next to
 * GlobalDeliveryOrderPopup, available from any screen. Old Reports > AI
 * (screens/reports/ai.report.tsx) is untouched and still works as a
 * read-only fallback; this widget adds dish write capability on top of the
 * same read tools via assistant-agent.ts.
 */
export function AiAssistantWidget() {
  const {t} = useTranslation(["admin", "common", "toast"]);
  const [{user}] = useAtom(appPage);
  const db = useDB() as unknown as AssistantDbClient;

  const [open, setOpen] = useState(false);
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

  const applyResult = (result: AssistantAgentResult) => {
    setHistory(result.messages);
    if (result.type === "answer") {
      setEntries(prev => [...prev, {role: "assistant", content: result.answer}]);
      setPending(null);
    } else {
      setPending({proposal: result.proposal, toolCallId: result.toolCallId});
      setEntries(prev => [
        ...prev,
        {
          role: "assistant",
          content: t("aiAssistant.reviewPrompt", {
            defaultValue: `I've prepared ${result.proposal.records.length} ${result.proposal.entityLabel.toLowerCase()} change(s) for you to review below.`,
          }),
        },
      ]);
    }
  };

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
      setError(err instanceof Error ? err.message : String(err));
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
          content: t("aiAssistant.applied", {
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
        {confirmed: false, error: t("aiAssistant.cancelled", {defaultValue: "User cancelled this change."})},
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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700"
        aria-label={t("aiAssistant.open", {defaultValue: "Open assistant"})}
      >
        <FontAwesomeIcon icon={faComments} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex h-[32rem] w-96 flex-col rounded-lg border border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <span className="text-sm font-semibold text-gray-800">
          {t("aiAssistant.title", {defaultValue: "Assistant"})}
        </span>
        <button type="button" onClick={() => setOpen(false)} aria-label={t("common:close", {defaultValue: "Close"})}>
          <FontAwesomeIcon icon={faTimes} className="text-gray-500" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {entries.map((entry, i) => (
          <div
            key={i}
            className={`text-sm ${entry.role === "user" ? "text-right" : "text-left"}`}
          >
            <span
              className={`inline-block rounded-md px-2 py-1 ${
                entry.role === "user"
                  ? "bg-blue-600 text-white"
                  : entry.role === "system"
                    ? "bg-gray-100 text-gray-600 italic"
                    : "bg-gray-100 text-gray-800"
              }`}
            >
              {entry.content}
            </span>
          </div>
        ))}

        {pending && (
          <div className="space-y-2">
            <WriteProposalPreview proposal={pending.proposal} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={handleCancel} disabled={loading}>
                {t("common:cancel", {defaultValue: "Cancel"})}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirm}
                disabled={loading || pending.proposal.hasBlockingErrors && pending.proposal.records.every(r => r.issues.some(i => i.severity === "error"))}
              >
                {t("aiAssistant.confirm", {defaultValue: "Confirm"})}
              </Button>
            </div>
          </div>
        )}

        {error && <div className="text-xs text-red-600">{error}</div>}
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
          placeholder={t("aiAssistant.placeholder", {defaultValue: "Ask about sales, or ask to add/update a dish…"})}
          rows={2}
          disabled={loading}
          className="flex-1"
        />
        <Button variant="primary" size="sm" onClick={handleSubmit} disabled={loading || !prompt.trim()}>
          {loading ? <FontAwesomeIcon icon={faSpinner} spin /> : t("common:send", {defaultValue: "Send"})}
        </Button>
      </div>
    </div>
  );
}
