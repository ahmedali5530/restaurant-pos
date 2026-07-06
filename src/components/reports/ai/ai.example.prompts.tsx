import {useState} from "react";
import {useTranslation} from "react-i18next";
import {
  AI_EXAMPLE_PROMPT_CATEGORIES,
  AI_EXAMPLE_PROMPTS,
  type AiExamplePromptFilter,
} from "@/lib/ai/example.prompts.ts";

const PROMPT_CHIP_CLASS =
  "rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-left text-sm text-neutral-700 transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50";

const FILTER_PILL_CLASS =
  "rounded-full border px-3 py-1 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

interface AiExamplePromptsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export const AiExamplePrompts = ({onSelect, disabled}: AiExamplePromptsProps) => {
  const {t} = useTranslation("reports");
  const [open, setOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<AiExamplePromptFilter>("all");

  const filterPills: AiExamplePromptFilter[] = ["all", ...AI_EXAMPLE_PROMPT_CATEGORIES];

  const renderPromptChip = (prompt: string) => (
    <button
      key={prompt}
      type="button"
      disabled={disabled}
      onClick={() => onSelect(prompt)}
      className={PROMPT_CHIP_CLASS}
    >
      {prompt}
    </button>
  );

  const renderFilterPill = (filter: AiExamplePromptFilter) => {
    const isActive = activeFilter === filter;
    const label = filter === "all"
      ? t("filters.aiCategory.all")
      : t(`filters.aiCategory.${filter}`);

    return (
      <button
        key={filter}
        type="button"
        disabled={disabled}
        aria-pressed={isActive}
        onClick={() => setActiveFilter(filter)}
        className={`${FILTER_PILL_CLASS} ${
          isActive
            ? "border-primary-500 bg-primary-50 text-primary-700"
            : "border-neutral-200 bg-white text-neutral-600 hover:border-primary-300 hover:bg-primary-50"
        }`}
      >
        {label}
      </button>
    );
  };

  const handleToggle = () => {
    setOpen(prev => {
      if (prev) {
        setActiveFilter("all");
      }
      return !prev;
    });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 w-full">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-neutral-700"
      >
        <span>{t("filters.aiExamples")}</span>
        <span className="text-neutral-400">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-neutral-200 px-4 py-3 overflow-y-auto max-h-[350px]">
          <div className="flex flex-wrap gap-2">
            {filterPills.map(renderFilterPill)}
          </div>

          {activeFilter === "all" ? (
            AI_EXAMPLE_PROMPT_CATEGORIES.map(category => {
              const prompts = AI_EXAMPLE_PROMPTS.filter(p => p.category === category);
              if (!prompts.length) {
                return null;
              }

              return (
                <div key={category}>
                  {/* <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    {t(`filters.aiCategory.${category}`)}
                  </span> */}
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {prompts.map(({prompt}) => renderPromptChip(prompt))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-wrap gap-2">
              {AI_EXAMPLE_PROMPTS
                .filter(p => p.category === activeFilter)
                .map(({prompt}) => renderPromptChip(prompt))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
