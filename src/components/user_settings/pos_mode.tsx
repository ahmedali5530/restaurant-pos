import {Button} from "@/components/common/input/button.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {useAtom} from "jotai";
import {appState} from "@/store/jotai.ts";
import {useTranslation} from "react-i18next";

export const PosModeSettings = () => {
  const [state, setState] = useAtom(appState);
  const {t} = useTranslation(["settings", "common"]);
  const mode = state.posMode === "retail" ? "retail" : "restaurant";
  const askQty = state.askQuantityAfterAdd === true;

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

      {mode === "retail" && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="mb-2">
            <h3 className="text-base font-semibold text-foreground">
              {t("settings:posMode.askQuantityTitle")}
            </h3>
            <p className="text-sm text-muted">{t("settings:posMode.askQuantityDescription")}</p>
          </div>
          <div>
            <Switch
              checked={askQty}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  askQuantityAfterAdd: e.target.checked,
                }))
              }
              data-testid="settings-ask-quantity-after-add"
            >
              {t("settings:posMode.askQuantityEnabled")}
            </Switch>
          </div>
        </div>
      )}
    </div>
  );
};
