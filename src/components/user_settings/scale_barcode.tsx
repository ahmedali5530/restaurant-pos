import {useAtom} from "jotai";
import {useTranslation} from "react-i18next";
import {appState} from "@/store/jotai.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {
  DEFAULT_SCALE_BARCODE_CONFIG,
  normalizeScaleBarcodeConfig,
  type ScaleBarcodeConfig,
  type ScaleValueMode,
} from "@/lib/scale-barcode.ts";

export const ScaleBarcodeSettings = () => {
  const {t} = useTranslation(["settings", "common"]);
  const [state, setState] = useAtom(appState);
  const config = normalizeScaleBarcodeConfig(state.scaleBarcode);

  const patch = (partial: Partial<ScaleBarcodeConfig>) => {
    setState((prev) => ({
      ...prev,
      scaleBarcode: normalizeScaleBarcodeConfig({
        ...prev.scaleBarcode,
        ...partial,
      }),
    }));
  };

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-scale-barcode">
      <div className="flex items-start mb-4">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t("settings:scaleBarcode.title")}</h2>
          <p className="text-sm text-muted">{t("settings:scaleBarcode.description")}</p>
        </div>
      </div>

      <div className="flex items-center min-h-12 mb-4">
        <div>
          <Switch
            checked={config.enabled}
            onChange={(e) => patch({enabled: e.target.checked})}
          >
            {t("settings:scaleBarcode.enabled")}
          </Switch>
        </div>
      </div>

      <div className={`flex flex-col gap-3 ${config.enabled ? "" : "opacity-50 pointer-events-none"}`}>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="lg"
            variant={config.valueMode === "weight_grams" ? "success" : "primary"}
            onClick={() => patch({valueMode: "weight_grams" satisfies ScaleValueMode})}
            data-testid="scale-barcode-mode-weight"
          >
            {t("settings:scaleBarcode.modeWeight")}
          </Button>
          <Button
            type="button"
            size="lg"
            variant={config.valueMode === "price_minor" ? "success" : "primary"}
            onClick={() => patch({valueMode: "price_minor" satisfies ScaleValueMode})}
            data-testid="scale-barcode-mode-price"
          >
            {t("settings:scaleBarcode.modePrice")}
          </Button>
        </div>
        <p className="text-sm text-muted">
          {config.valueMode === "weight_grams"
            ? t("settings:scaleBarcode.modeWeightHint")
            : t("settings:scaleBarcode.modePriceHint")}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Input
              label={t("settings:scaleBarcode.prefix")}
              value={config.prefix}
              onChange={(e) => patch({prefix: e.target.value})}
            />
          </div>
          <div className="flex items-center min-h-12 pt-6">
            <div>
              <Switch
                checked={config.validateCheckDigit}
                onChange={(e) => patch({validateCheckDigit: e.target.checked})}
              >
                {t("settings:scaleBarcode.validateCheck")}
              </Switch>
            </div>
          </div>
          <div>
            <Input
              type="number"
              label={t("settings:scaleBarcode.pluStart")}
              value={String(config.pluStart)}
              onChange={(e) => patch({pluStart: Number(e.target.value)})}
            />
          </div>
          <div>
            <Input
              type="number"
              label={t("settings:scaleBarcode.pluLength")}
              value={String(config.pluLength)}
              onChange={(e) => patch({pluLength: Number(e.target.value)})}
            />
          </div>
          <div>
            <Input
              type="number"
              label={t("settings:scaleBarcode.valueStart")}
              value={String(config.valueStart)}
              onChange={(e) => patch({valueStart: Number(e.target.value)})}
            />
          </div>
          <div>
            <Input
              type="number"
              label={t("settings:scaleBarcode.valueLength")}
              value={String(config.valueLength)}
              onChange={(e) => patch({valueLength: Number(e.target.value)})}
            />
          </div>
          {config.valueMode === "weight_grams" ? (
            <div>
              <Input
                type="number"
                label={t("settings:scaleBarcode.weightDivisor")}
                value={String(config.weightDivisor)}
                onChange={(e) => patch({weightDivisor: Number(e.target.value)})}
              />
            </div>
          ) : (
            <div>
              <Input
                type="number"
                label={t("settings:scaleBarcode.priceDivisor")}
                value={String(config.priceDivisor)}
                onChange={(e) => patch({priceDivisor: Number(e.target.value)})}
              />
            </div>
          )}
        </div>

        <p className="text-xs text-muted">
          {t("settings:scaleBarcode.layoutHint", {
            example: `${config.prefix} + PLU(${config.pluLength}) + value(${config.valueLength}) + check`,
          })}
        </p>

        <Button
          type="button"
          variant="secondary"
          onClick={() =>
            setState((prev) => ({
              ...prev,
              scaleBarcode: {...DEFAULT_SCALE_BARCODE_CONFIG, enabled: true},
            }))
          }
        >
          {t("settings:scaleBarcode.resetDefaults")}
        </Button>
      </div>
    </div>
  );
};
