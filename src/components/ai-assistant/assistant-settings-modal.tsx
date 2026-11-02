import {useMemo} from "react";
import {useTranslation} from "react-i18next";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {
  ASSISTANT_PERSONAS,
  ASSISTANT_PERSONA_IDS,
  type AssistantPersonaId,
} from "@/lib/ai/assistant-personas.ts";

type Props = {
  open: boolean;
  onClose: () => void;
  disabled?: boolean;
  personaId: AssistantPersonaId;
  onPersonaChange: (id: AssistantPersonaId) => void;
  deepResearch: boolean;
  onDeepResearchChange: (value: boolean) => void;
};

export function AssistantSettingsModal({
  open,
  onClose,
  disabled,
  personaId,
  onPersonaChange,
  deepResearch,
  onDeepResearchChange,
}: Props) {
  const {t} = useTranslation(["common"]);

  const personaOptions = useMemo(
    () =>
      ASSISTANT_PERSONA_IDS.map((id) => ({
        value: id,
        label: t(ASSISTANT_PERSONAS[id].labelKey, {
          defaultValue: ASSISTANT_PERSONAS[id].labelDefault,
        }),
      })),
    [t],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("common:aiAssistant.settingsTitle", {defaultValue: "Assistant settings"})}
      size="md"
    >
      <div className="space-y-4 p-1">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t("common:aiAssistant.personaLabel", {defaultValue: "Personality"})}
          </h3>
          <ReactSelect
            options={personaOptions}
            value={personaOptions.find((opt) => opt.value === personaId) ?? personaOptions[0]}
            onChange={(opt: any) => {
              const next = String(opt?.value ?? "analyst") as AssistantPersonaId;
              onPersonaChange(next);
            }}
            isDisabled={disabled}
            placeholder={t("common:aiAssistant.personaLabel", {defaultValue: "Personality"})}
          />
          <p className="text-xs text-muted">
            {t(ASSISTANT_PERSONAS[personaId].descriptionKey, {
              defaultValue: ASSISTANT_PERSONAS[personaId].descriptionDefault,
            })}
          </p>
        </section>

        <section className="space-y-2 border-t border-border pt-3">
          <div>
            <Switch
              checked={deepResearch}
              disabled={disabled}
              onChange={(e: any) => onDeepResearchChange(!!e.target.checked)}
            >
              {t("common:aiAssistant.deepResearch", {defaultValue: "Deep research"})}
            </Switch>
          </div>
          <p className="text-xs text-muted">
            {t("common:aiAssistant.deepResearchHint", {
              defaultValue:
                "Uses the stronger analysis profile, fuller prompts, more tool loops, and web search for external facts.",
            })}
          </p>
        </section>
      </div>
    </Modal>
  );
}
