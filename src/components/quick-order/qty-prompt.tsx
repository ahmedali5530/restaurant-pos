import {useEffect, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import type {Dish} from "@/api/model/dish.ts";

const QUICK_QTY = [1, 2, 3, 4, 5, 6, 10, 12] as const;

type Props = {
  dish: Dish;
  open: boolean;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
};

export const QuickOrderQtyPrompt = ({dish, open, onConfirm, onCancel}: Props) => {
  const {t} = useTranslation(["quick-order", "common"]);
  const [value, setValue] = useState("1");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setValue("1");
      // Focus after modal mounts so Enter confirms immediately.
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => window.clearTimeout(id);
    }
  }, [open, dish?.id]);

  const submit = () => {
    const qty = Math.floor(Number(value));
    if (!Number.isFinite(qty) || qty < 1) {
      return;
    }
    onConfirm(qty);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t("quick-order:qtyPrompt.title", {name: dish.name})}
      size="sm"
      testId="quick-order-qty-prompt"
    >
      <div className="flex flex-col gap-4 p-1">
        <p className="text-sm text-muted">{t("quick-order:qtyPrompt.hint")}</p>
        <div>
          <Input
            ref={inputRef}
            type="number"
            label={t("quick-order:qtyPrompt.quantity")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            data-testid="quick-order-qty-input"
            autoFocus
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_QTY.map((n) => (
            <Button
              key={n}
              type="button"
              size="lg"
              variant={String(n) === value ? "success" : "primary"}
              onClick={() => {
                setValue(String(n));
                onConfirm(n);
              }}
              data-testid={`quick-order-qty-quick-${n}`}
            >
              {n}
            </Button>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            type="button"
            variant="success"
            onClick={submit}
            data-testid="quick-order-qty-confirm"
          >
            {t("quick-order:qtyPrompt.add")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
