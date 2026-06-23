import {useState} from "react";
import {useTranslation} from "react-i18next";
import {REPORTS_AI} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {AiExamplePrompts} from "@/components/reports/ai/ai.example.prompts.tsx";
import {AiFormatSelector} from "@/components/reports/ai/ai.format.selector.tsx";
import {
  type AiReportFormat,
  loadAiReportFormat,
  saveAiReportFormat,
  saveAiReportPrompt,
} from "@/lib/ai.report.storage.ts";

export const AiReportFilter = () => {
  const {t} = useTranslation("reports");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<AiReportFormat>(() => loadAiReportFormat());

  const handleFormatChange = (nextFormat: AiReportFormat) => {
    setFormat(nextFormat);
    saveAiReportFormat(nextFormat);
  };

  const handleRun = () => {
    if (!prompt.trim()) {
      return;
    }

    saveAiReportPrompt(prompt);
    saveAiReportFormat(format);
    window.open(REPORTS_AI, "_blank");
  };

  return (
    <div className="flex flex-col gap-3 items-start w-full">
      <label className="text-sm text-gray-600 w-full">
        {t("filters.prompt")}
        <Textarea
          className="mt-1 min-h-40 w-full"
          placeholder={t("filters.aiPrompt")}
          value={prompt}
          onChange={event => setPrompt(event.currentTarget.value)}
          enableKeyboard={false}
        />
      </label>

      <AiExamplePrompts onSelect={setPrompt}/>

      <AiFormatSelector format={format} onChange={handleFormatChange} size="md"/>

      <Button variant="primary" filled onClick={handleRun} disabled={!prompt.trim()}>
        {t("filters.run")}
      </Button>
    </div>
  );
};
