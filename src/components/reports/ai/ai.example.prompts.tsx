import {useState} from "react";
import {useTranslation} from "react-i18next";
import {AI_EXAMPLE_PROMPTS, type AiExamplePromptCategory} from "@/lib/ai/example.prompts.ts";

const CATEGORY_ORDER: AiExamplePromptCategory[] = ["sales", "inventory", "charts", "analysis"];

interface AiExamplePromptsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export const AiExamplePrompts = ({onSelect, disabled}: AiExamplePromptsProps) => {
  const {t} = useTranslation("reports");
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 w-full">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-700"
      >
        <span>{t("filters.aiExamples")}</span>
        <span className="text-neutral-400">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-neutral-200 px-4 py-3">
          {CATEGORY_ORDER.map(category => {
            const prompts = AI_EXAMPLE_PROMPTS.filter(p => p.category === category);
            if (!prompts.length) {
              return null;
            }

            return (
              <div key={category}>
                <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {t(`filters.aiCategory.${category}`)}
                </span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {prompts.map(({prompt}) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(prompt)}
                      className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-left text-sm text-neutral-700 transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
