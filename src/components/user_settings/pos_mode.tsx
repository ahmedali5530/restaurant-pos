import {Button} from "@/components/common/input/button.tsx";
import {useAtom} from "jotai";
import {appState} from "@/store/jotai.ts";
import {useTranslation} from "react-i18next";

export const PosModeSettings = () => {
  const [state, setState] = useAtom(appState);
  const {t} = useTranslation(["settings", "common"]);
  const mode = state.posMode === "retail" ? "retail" : "restaurant";

  const setMode = (next: "restaurant" | "retail") => {
    setState((prev) => ({
      ...prev,
      posMode: next,
      hideTableSelection: next === "retail" ? true : prev.hideTableSelection,
      ...(next === "retail"
        ? {
            showFloor: false,
            showPersons: false,
            table: undefined,
            order: {id: "new" as const, order: undefined},
          }
        : {}),
    }));
  };

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-pos-mode">
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t("settings:posMode.title")}</h2>
          <p className="text-sm text-muted">{t("settings:posMode.description")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant={mode === "restaurant" ? "success" : "primary"}
          size="lg"
          onClick={() => setMode("restaurant")}
          data-testid="settings-pos-mode-restaurant"
        >
          {t("settings:posMode.restaurant")}
        </Button>
        <Button
          variant={mode === "retail" ? "success" : "primary"}
          size="lg"
          onClick={() => setMode("retail")}
          data-testid="settings-pos-mode-retail"
        >
          {t("settings:posMode.retail")}
        </Button>
      </div>
    </div>
  );
};
