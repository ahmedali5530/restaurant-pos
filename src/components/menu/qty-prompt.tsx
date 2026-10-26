import {useEffect, useState} from "react";
import {useTranslation} from "react-i18next";
import {faMinus, faPlus} from "@fortawesome/free-solid-svg-icons";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {VirtualKeyboardPad} from "@/components/common/input/virtual.keyboard.tsx";
import type {Dish} from "@/api/model/dish.ts";

const QUICK_QTY = [1, 2, 3, 4, 5, 6, 10, 12] as const;

export const dishAsksQuantity = (
  dish: {ask_quantity?: boolean | null} | null | undefined,
): boolean => dish?.ask_quantity === true;

type Props = {
  dish: Dish;
  open: boolean;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
};

const parseQty = (raw: string): number => {
  const qty = Math.floor(Number(raw));
  return Number.isFinite(qty) && qty >= 1 ? qty : 0;
};

/** Shared qty dialog for Menu and Quick Order when a dish has ask_quantity. */
export const DishQtyPrompt = ({dish, open, onConfirm, onCancel}: Props) => {
  const {t} = useTranslation(["menu", "common"]);
  const [value, setValue] = useState("1");

  useEffect(() => {
    if (open) {
      setValue("1");
    }
  }, [open, dish?.id]);

  const submit = () => {
    const qty = parseQty(value);
    if (qty < 1) {
      return;
    }
    onConfirm(qty);
  };

  const bump = (delta: number) => {
    const current = parseQty(value) || 0;
    const next = Math.max(1, current + delta);
    setValue(String(next));
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t("menu:qtyPrompt.title", {name: dish.name})}
      size="lg"
      testId="dish-qty-prompt"
    >
      <div className="flex flex-col gap-4 p-1">
        <p className="text-sm text-muted">{t("menu:qtyPrompt.hint")}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Left: +/- then quick presets */}
          <div className="flex flex-col gap-3 min-w-0">
            <div className="flex gap-3">
              <Button
                type="button"
                size="xl"
                variant="primary"
                className="flex-1 !min-h-[4.5rem] !text-2xl"
                onClick={() => bump(1)}
                data-testid="dish-qty-plus"
                icon={faPlus}
              />
              <Button
                type="button"
                size="xl"
                variant="primary"
                className="flex-1 !min-h-[4.5rem] !text-2xl"
                onClick={() => bump(-1)}
                data-testid="dish-qty-minus"
                icon={faMinus}
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {QUICK_QTY.map((n) => (
                <Button
                  key={n}
                  type="button"
                  size="lg"
                  variant={String(n) === value ? "success" : "primary"}
                  className="!min-h-[3.25rem] !text-lg"
                  onClick={() => {
                    setValue(String(n));
                    onConfirm(n);
                  }}
                  data-testid={`dish-qty-quick-${n}`}
                >
                  {n}
                </Button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 md:pt-4">
              <Button type="button" variant="secondary" size="lg" onClick={onCancel}>
                {t("common:actions.cancel")}
              </Button>
              <Button
                type="button"
                variant="success"
                size="lg"
                onClick={submit}
                data-testid="dish-qty-confirm"
              >
                {t("menu:qtyPrompt.add")}
              </Button>
            </div>
          </div>

          {/* Right: reused numeric keypad */}
          <div
            className="rounded-xl border border-border bg-surface-elevated p-3 min-w-0"
            data-testid="dish-qty-keyboard"
          >
            <VirtualKeyboardPad
              type="number"
              integerOnly
              placeholder={t("menu:qtyPrompt.quantity")}
              value={value}
              onChange={setValue}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};
