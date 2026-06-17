import {useState} from "react";
import { useTranslation } from 'react-i18next';
import {REPORTS_AI} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {
  type AiReportFormat,
  loadAiReportFormat,
  saveAiReportFormat,
  saveAiReportPrompt,
} from "@/lib/ai.report.storage.ts";
import {faList, faTable} from "@fortawesome/free-solid-svg-icons";

export const AiReportFilter = () => {
  const { t } = useTranslation('reports');
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
        Prompt
        <Textarea
          className="mt-1 min-h-40 w-full"
          placeholder={t('filters.aiPrompt')}
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-600">{t('filters.format')}</span>
        <Button
          variant="primary"
          size="sm"
          icon={faList}
          active={format === "list"}
          filled={format === "list"}
          onClick={() => handleFormatChange("list")}
        >
          List
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={faTable}
          active={format === "table"}
          filled={format === "table"}
          onClick={() => handleFormatChange("table")}
        >
          Table
        </Button>
      </div>
      <Button variant="primary" filled onClick={handleRun} disabled={!prompt.trim()}>
        Run
      </Button>
    </div>
  );
};
