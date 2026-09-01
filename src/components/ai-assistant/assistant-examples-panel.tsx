import {useTranslation} from "react-i18next";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTimes} from "@fortawesome/free-solid-svg-icons";
import {AI_ASSISTANT_NAME, ASSISTANT_EXAMPLE_PROMPT_IDS,} from "@/lib/ai/assistant-config.ts";

type AssistantExamplesPanelProps = {
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
};

export function AssistantExamplesPanel({onClose, onSelectPrompt}: AssistantExamplesPanelProps) {
  const {t} = useTranslation("common");
  return (
    <div className="border-b border-neutral-200 bg-neutral-300 bg-warning-50/60 px-3 py-2">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-neutral-900">
            {t("aiAssistant.examplesTitle")}
          </div>
          <div className="text-xs text-neutral-600">
            {t("aiAssistant.examplesHint", {name: AI_ASSISTANT_NAME})}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-neutral-500 hover:text-neutral-800"
          aria-label={t("close")}
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ASSISTANT_EXAMPLE_PROMPT_IDS.map(id => {
          const prompt = t(`aiAssistant.examples.${id}`);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectPrompt(prompt)}
              className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 text-left text-xs text-neutral-800 transition-colors hover:border-warning-500 hover:bg-warning-50"
            >
              {prompt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
