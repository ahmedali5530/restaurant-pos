import {useMemo, useState} from "react";
import {useTranslation} from "react-i18next";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faArrowRightArrowLeft, faRulerCombined} from "@fortawesome/free-solid-svg-icons";
import {Input} from "@/components/common/input/input.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useInventoryUomCatalog} from "@/hooks/useInventoryUomCatalog.ts";
import {convertQuantity, normalizeUom} from "@/utils/inventoryUom.ts";
import {formatInventoryNumber} from "@/lib/inventory/rounding.ts";

type UomOption = {label: string; value: string};

/**
 * Toolbar button beside sync status that opens a larger UOM converter modal.
 * Usable while other modals are open (toolbar is excluded from interact-outside).
 */
export const UomConverterToolbar = () => {
  const {t} = useTranslation("inventory");
  const {activeUnits} = useInventoryUomCatalog();
  const [open, setOpen] = useState(false);

  const [qty, setQty] = useState<number | string>(1);
  const [from, setFrom] = useState<UomOption | null>({
    label: "KG",
    value: "KG",
  });
  const [to, setTo] = useState<UomOption | null>({
    label: "G",
    value: "G",
  });

  const uomOptions = useMemo(
    () => activeUnits.map((u) => ({label: u.name || u.code, value: u.code})),
    [activeUnits]
  );

  const result = useMemo(() => {
    const n = Number(qty);
    if (!Number.isFinite(n) || !from?.value || !to?.value) return null;
    try {
      const converted = convertQuantity(n, from.value, to.value);
      return Number.isFinite(converted) ? converted : null;
    } catch {
      return null;
    }
  }, [qty, from, to]);

  const swapUnits = () => {
    setFrom(to);
    setTo(from);
  };

  const buttonLabel = t("uom.preview.openButton", {defaultValue: "Unit converter"});

  return (
    <>
      <button
        type="button"
        title={buttonLabel}
        aria-label={buttonLabel}
        data-testid="uom-converter-open"
        data-app-toolbar-converter
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground hover:bg-surface"
      >
        <FontAwesomeIcon icon={faRulerCombined} className="text-sm text-muted" />
        <span className="hidden sm:inline">{buttonLabel}</span>
      </button>

      {open && (
        <Modal
          open={true}
          onClose={() => setOpen(false)}
          title={t("uom.preview.title", {defaultValue: "Conversion preview"})}
          size="md"
          testId="uom-converter-modal"
        >
          <div className="flex flex-col gap-4" data-app-toolbar-converter>
            <p className="text-sm text-muted">
              {t("uom.preview.hint", {
                defaultValue:
                  "Check how units convert with the current factors (US gallon by default).",
              })}
            </p>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                {t("forms.quantity")}
              </label>
              <div>
                <Input
                  type="number"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="!text-lg !py-2.5"
                  aria-label={t("forms.quantity")}
                  autoFocus
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  {t("uom.preview.from", {defaultValue: "From"})}
                </label>
                <ReactSelect
                  options={uomOptions}
                  value={from}
                  onChange={(opt) => setFrom(opt as UomOption | null)}
                  menuPortalTarget={
                    typeof document !== "undefined" ? document.body : undefined
                  }
                  styles={{
                    control: (base: any) => ({
                      ...base,
                      minHeight: 44,
                      fontSize: "1rem",
                    }),
                  }}
                />
              </div>

              <Button
                type="button"
                variant="primary"
                flat
                onClick={swapUnits}
                className="mb-0.5 !px-3 !py-2"
                aria-label={t("uom.preview.swap", {defaultValue: "Swap units"})}
                title={t("uom.preview.swap", {defaultValue: "Swap units"})}
              >
                <FontAwesomeIcon icon={faArrowRightArrowLeft} />
              </Button>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  {t("uom.preview.to", {defaultValue: "To"})}
                </label>
                <ReactSelect
                  options={uomOptions}
                  value={to}
                  onChange={(opt) => setTo(opt as UomOption | null)}
                  menuPortalTarget={
                    typeof document !== "undefined" ? document.body : undefined
                  }
                  styles={{
                    control: (base: any) => ({
                      ...base,
                      minHeight: 44,
                      fontSize: "1rem",
                    }),
                  }}
                />
              </div>
            </div>

            <div className="rounded-xl bg-surface px-4 py-5 text-center">
              {result != null ? (
                <div className="text-2xl font-semibold tabular-nums text-foreground">
                  {formatInventoryNumber(Number(qty) || 0)}{" "}
                  <span className="text-muted font-normal text-lg">
                    {normalizeUom(from?.value) ?? from?.value}
                  </span>
                  <span className="mx-2 text-muted font-normal">=</span>
                  {formatInventoryNumber(result)}{" "}
                  <span className="text-muted font-normal text-lg">
                    {normalizeUom(to?.value) ?? to?.value}
                  </span>
                </div>
              ) : (
                <div className="text-base text-muted">
                  {t("uom.preview.unavailable", {
                    defaultValue: "Choose related units in the same family",
                  })}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
};
