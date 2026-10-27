import {Button} from "@/components/common/input/button.tsx";
import {useAtom} from "jotai";
import {appState} from "@/store/jotai.ts";
import {useTranslation} from "react-i18next";

export const ItemAvailabilitySettings = () => {
  const [state, setState] = useAtom(appState);
  const {t} = useTranslation(["settings", "common"]);
  const enabled = state.enforceItemAvailability !== false;

  const setEnabled = (next: boolean) => {
    setState((prev) => ({
      ...prev,
      enforceItemAvailability: next,
    }));
  };

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-item-availability">
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t("settings:itemAvailability.title")}</h2>
          <p className="text-sm text-muted">{t("settings:itemAvailability.description")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant={enabled ? "success" : "primary"}
          size="lg"
          onClick={() => setEnabled(true)}
          data-testid="settings-item-availability-on"
        >
          {t("settings:itemAvailability.enabled")}
        </Button>
        <Button
          variant={!enabled ? "success" : "primary"}
          size="lg"
          onClick={() => setEnabled(false)}
          data-testid="settings-item-availability-off"
        >
          {t("settings:itemAvailability.disabled")}
        </Button>
      </div>
    </div>
  );
};
