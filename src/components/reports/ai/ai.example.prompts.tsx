import {useState} from "react";
import {useTranslation} from "react-i18next";
import {
  AI_EXAMPLE_PROMPT_CATEGORIES,
  AI_EXAMPLE_PROMPTS,
  type AiExamplePromptFilter,
} from "@/lib/ai/example.prompts.ts";

const PROMPT_CHIP_CLASS =
  "rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-left text-sm text-foreground transition hover:border-warning-300 hover:bg-warning/10 disabled:cursor-not-allowed disabled:opacity-50";

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
            ? "border-warning bg-warning/10 text-warning-700"
            : "border-border bg-surface-elevated text-muted hover:border-warning-300 hover:bg-warning/10"
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
    <div className="rounded-lg border border-border bg-surface w-full">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground"
      >
        <span>{t("filters.aiExamples")}</span>
        <span className="text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 overflow-y-auto max-h-[350px]">
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
                  {/* <span className="text-xs font-medium uppercase tracking-wide text-muted">
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
