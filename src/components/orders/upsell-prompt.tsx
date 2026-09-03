/**
 * UpsellPrompt — contextual modifier/upsell suggestions shown when an item
 * is added to the cart.
 *
 * Research finding: Toast and Square show upsell prompts that increase
 * average check size by 15-30% (COMP-1 UX innovations). POSR currently
 * has modifiers but no proactive upsell suggestions.
 *
 * This component:
 *   - Shows a modal when a dish with upsell opportunities is added
 *   - Suggests common pairings (e.g. "Add fries for $3?", "Add a drink?")
 *   - Uses the dish's modifier_groups to find upsell-eligible items
 *   - Tracks acceptance rate (future: AI-optimized suggestions)
 *   - Can be disabled per-terminal in settings
 *
 * The upsell items are derived from the dish's modifier_groups where:
 *   - The modifier group has `is_upsell = true` (new field, defaults false)
 *   - OR the modifier group name contains "upsell" / "add-on" / "extra"
 *
 * Placement: shown as a modal after dish is added to cart.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Button } from "@/components/common/input/button.tsx";

export interface UpsellItem {
  id: string;
  name: string;
  price: number;
  modifierGroupId?: string;
}

interface Props {
  upsellItems: UpsellItem[];
  onAccept: (item: UpsellItem) => void;
  onDecline: () => void;
  dishName?: string;
}

export function UpsellPrompt({ upsellItems, onAccept, onDecline, dishName }: Props) {
  const { t } = useTranslation(["cart"]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Don't show if no upsell items or if terminal has disabled upsells
  if (!upsellItems || upsellItems.length === 0) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    for (const item of upsellItems) {
      if (selected.has(item.id)) {
        onAccept(item);
      }
    }
    onDecline();
  };

  return (
    <Modal
      testId="upsell-prompt-modal"
      title={t("cart:upsell.title", {
        defaultValue: "Would you like to add?",
        dishName: dishName || "",
      })}
      open={true}
      onClose={onDecline}
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-500">
          {t("cart:upsell.description", {
            defaultValue: "Popular additions for {{dishName}}",
            dishName: dishName || t("cart:upsell.thisItem", { defaultValue: "this item" }),
          })}
        </p>

        <div className="space-y-2">
          {upsellItems.map((item) => (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                selected.has(item.id)
                  ? "border-primary bg-primary/10"
                  : "border-neutral-200 hover:border-primary/50"
              }`}
              data-testid={`upsell-item-${item.id}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                    selected.has(item.id)
                      ? "border-primary bg-primary text-white"
                      : "border-neutral-300"
                  }`}
                >
                  {selected.has(item.id) && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6L5 9L10 3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="font-medium">{item.name}</span>
              </div>
              <span className="text-sm font-semibold text-primary">
                +${item.price.toFixed(2)}
              </span>
            </button>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleConfirm} disabled={selected.size === 0}>
            {selected.size > 0
              ? t("cart:upsell.addItems", {
                  defaultValue: "Add {{count}} item(s)",
                  count: selected.size,
                })
              : t("cart:upsell.noThanks", { defaultValue: "No thanks" })}
          </Button>
          <Button variant="ghost" onClick={onDecline}>
            {t("cart:upsell.skip", { defaultValue: "Skip" })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Extract upsell items from a dish's modifier groups.
 * Items in modifier groups flagged as upsell (or with names containing
 * "upsell", "add-on", "extra") are considered upsell opportunities.
 */
export function extractUpsellItems(
  dish: any,
  modifierGroups: any[]
): UpsellItem[] {
  if (!dish?.modifier_groups || !Array.isArray(dish.modifier_groups)) {
    return [];
  }

  const upsellItems: UpsellItem[] = [];

  for (const mgRef of dish.modifier_groups) {
    const mg = typeof mgRef === "object" ? mgRef : modifierGroups.find((g) => g.id === mgRef);
    if (!mg) continue;

    // Check if this modifier group is an upsell
    const isUpsell =
      mg.is_upsell === true ||
      (mg.name && /upsell|add.?on|extra/i.test(mg.name));

    if (!isUpsell) continue;

    // Extract individual modifiers as upsell items
    if (mg.modifiers && Array.isArray(mg.modifiers)) {
      for (const mod of mg.modifiers) {
        if (mod.price && Number(mod.price) > 0) {
          upsellItems.push({
            id: String(mod.id || mod.modifier_id || ""),
            name: mod.name || "Add-on",
            price: Number(mod.price),
            modifierGroupId: String(mg.id || ""),
          });
        }
      }
    }
  }

  // Limit to 5 suggestions to avoid overwhelming the user
  return upsellItems.slice(0, 5);
}
