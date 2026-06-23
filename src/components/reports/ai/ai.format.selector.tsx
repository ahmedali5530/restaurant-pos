import {useTranslation} from "react-i18next";
import {Button} from "@/components/common/input/button.tsx";
import type {AiReportFormat} from "@/lib/ai.report.storage.ts";
import {faChartLine, faList, faTable, faWandMagicSparkles} from "@fortawesome/free-solid-svg-icons";

interface AiFormatSelectorProps {
  format: AiReportFormat;
  onChange: (format: AiReportFormat) => void;
  size?: "sm" | "md";
}

const FORMATS: {value: AiReportFormat; icon: typeof faList; labelKey: string}[] = [
  {value: "list", icon: faList, labelKey: "filters.list"},
  {value: "table", icon: faTable, labelKey: "filters.table"},
  {value: "chart", icon: faChartLine, labelKey: "filters.chart"},
  {value: "analysis", icon: faWandMagicSparkles, labelKey: "filters.analysis"},
];

export const AiFormatSelector = ({format, onChange, size = "md"}: AiFormatSelectorProps) => {
  const {t} = useTranslation("reports");

  return (
    <div className="input-group">
      {FORMATS.map(({value, icon, labelKey}) => (
        <Button
          key={value}
          variant="primary"
          size={size === "sm" ? "sm" : undefined}
          icon={icon}
          active={format === value}
          filled={format === value}
          onClick={() => onChange(value)}
        >
          {t(labelKey)}
        </Button>
      ))}
    </div>
  );
};
