import {useAtom} from "jotai";
import {useTranslation} from "react-i18next";
import {Switch} from "@/components/common/input/switch.tsx";
import {skipFinalPrintOnPayment} from "@/store/jotai.ts";

/** App toolbar control — terminal preference for skipping the final receipt on settle. */
export const SkipFinalPrintToolbar = () => {
  const {t} = useTranslation(["common"]);
  const [skipFinalPrint, setSkipFinalPrint] = useAtom(skipFinalPrintOnPayment);
  const label = t("common:toolbar.skipFinalPrint");

  return (
    <div
      className="flex h-8 items-center px-1"
      data-testid="toolbar-skip-final-print"
      title={label}
    >
      <div>
        <Switch
          checked={skipFinalPrint}
          onChange={(e) => setSkipFinalPrint(e.target.checked)}
          aria-label={label}
        >
          <span className="max-w-[9rem] truncate sm:max-w-none">{label}</span>
        </Switch>
      </div>
    </div>
  );
};
