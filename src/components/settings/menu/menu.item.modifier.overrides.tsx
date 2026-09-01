import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { useEffect, useState } from "react";
import { useDB } from "@/api/db/db.ts";
import { DishModifierGroup } from "@/api/model/dish_modifier_group.ts";
import { Modifier } from "@/api/model/modifier.ts";
import { ModifierGroup } from "@/api/model/modifier_group.ts";
import {
  MenuModifierOverrides,
  MenuModifierPriceOverride,
  MenuNestedModifierPriceOverride,
} from "@/api/model/menu.ts";
import {
  fetchAttachableGroupsForDish,
  fetchModifierGroupTemplate,
  getMenuNestedOverrideItems,
  getMenuTopLevelPrice,
  normalizeMenuModifierOverrides,
} from "@/lib/modifier-groups.ts";
import { toRecordId } from "@/lib/utils.ts";
import { useTranslation } from "react-i18next";
import { faPencil } from "@fortawesome/free-solid-svg-icons";
import ScrollContainer from "react-indiana-drag-scroll";

interface Props {
  open: boolean
  dishId: string
  dishName: string
  value?: MenuModifierOverrides | null
  onClose: () => void
  onSave: (overrides: MenuModifierOverrides | null) => void
}

type NestedEditorState = {
  parentModifierId: string
  parentModifierName: string
  groupId: string
  groupName: string
  template: ModifierGroup | null
}

function buildPricesFromDraft(
  draftPrices: Record<string, number>,
  templateById: Map<string, number>
): MenuModifierPriceOverride[] {
  return Object.entries(draftPrices)
    .filter(([modifierId, price]) => {
      const templatePrice = templateById.get(modifierId);
      return templatePrice === undefined || Number(price) !== Number(templatePrice);
    })
    .map(([modifier_id, price]) => ({
      modifier_id,
      price: Number(price),
    }));
}

export const MenuItemModifierOverridesEditor = ({
  open,
  dishId,
  dishName,
  value,
  onClose,
  onSave,
}: Props) => {
  const { t } = useTranslation(["admin", "common"]);
  const db = useDB();

  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DishModifierGroup[]>([]);
  const [draftPrices, setDraftPrices] = useState<Record<string, number>>({});
  const [draftNested, setDraftNested] = useState<MenuNestedModifierPriceOverride[]>([]);
  const [nestedEditor, setNestedEditor] = useState<NestedEditorState | null>(null);
  const [nestedDraftPrices, setNestedDraftPrices] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open || !dishId) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const attached = await fetchAttachableGroupsForDish(db, dishId);
        const templates = await Promise.all(
          attached.map(async (row) => {
            const template = await fetchModifierGroupTemplate(db, row.out.id.toString());
            return {
              ...row,
              out: template ?? row.out,
            };
          })
        );

        if (cancelled) {
          return;
        }

        setGroups(templates);

        const normalized = normalizeMenuModifierOverrides(value);
        const nextPrices: Record<string, number> = {};

        templates.forEach((grp) => {
          (grp.out.modifiers ?? []).forEach((mod: Modifier) => {
            const modifierId = mod.id.toString();
            const menuPrice = getMenuTopLevelPrice(normalized, modifierId);
            nextPrices[modifierId] = menuPrice ?? Number(mod.price);
          });
        });

        setDraftPrices(nextPrices);
        setDraftNested(normalized?.next_group_overrides ?? []);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [open, dishId, value]);

  const templatePriceById = new Map<string, number>();
  groups.forEach((grp) => {
    (grp.out.modifiers ?? []).forEach((mod: Modifier) => {
      templatePriceById.set(mod.id.toString(), Number(mod.price));
    });
  });

  const openNestedEditor = async (parent: Modifier, groupId: string, groupName: string) => {
    const template = await fetchModifierGroupTemplate(db, groupId);
    const existing = getMenuNestedOverrideItems(
      { next_group_overrides: draftNested },
      parent.id.toString(),
      groupId
    );

    const parentOverrides = parent.next_group_overrides?.find(
      (row) => toRecordId(row.group_id as string).toString() === toRecordId(groupId).toString()
    )?.items;

    const prices: Record<string, number> = {};
    (template?.modifiers ?? []).forEach((mod) => {
      const modifierId = mod.id.toString();
      const menuPrice = existing?.find(
        (row) => toRecordId(row.nested_modifier_id as string).toString() === modifierId
      )?.price;
      const parentPrice = parentOverrides?.find(
        (row) => toRecordId(row.nested_modifier_id as string).toString() === modifierId
      )?.price;
      prices[modifierId] = menuPrice ?? parentPrice ?? Number(mod.price);
    });

    setNestedDraftPrices(prices);
    setNestedEditor({
      parentModifierId: parent.id.toString(),
      parentModifierName: parent.modifier?.name ?? parent.id.toString(),
      groupId: toRecordId(groupId).toString(),
      groupName,
      template,
    });
  };

  const saveNestedEditor = () => {
    if (!nestedEditor) {
      return;
    }

    const templateById = new Map(
      (nestedEditor.template?.modifiers ?? []).map((row) => [
        row.id.toString(),
        Number(row.price),
      ])
    );

    const parent = groups
      .flatMap((grp) => grp.out.modifiers ?? [])
      .find((mod) => mod.id.toString() === nestedEditor.parentModifierId);

    const parentOverrides = parent?.next_group_overrides?.find(
      (row) =>
        toRecordId(row.group_id as string).toString() === nestedEditor.groupId
    )?.items;

    const items = Object.entries(nestedDraftPrices)
      .filter(([modifierId, price]) => {
        const parentPrice = parentOverrides?.find(
          (row) =>
            toRecordId(row.nested_modifier_id as string).toString() === modifierId
        )?.price;
        const base = parentPrice ?? templateById.get(modifierId);
        return base === undefined || Number(price) !== Number(base);
      })
      .map(([nested_modifier_id, price]) => ({
        nested_modifier_id,
        price: Number(price),
      }));

    setDraftNested((prev) => {
      const without = prev.filter(
        (row) =>
          !(
            toRecordId(row.parent_modifier_id as string).toString() ===
              nestedEditor.parentModifierId &&
            toRecordId(row.group_id as string).toString() === nestedEditor.groupId
          )
      );

      if (items.length === 0) {
        return without;
      }

      return [
        ...without,
        {
          parent_modifier_id: nestedEditor.parentModifierId,
          group_id: nestedEditor.groupId,
          items,
        },
      ];
    });
    setNestedEditor(null);
  };

  const handleSave = () => {
    onSave(
      normalizeMenuModifierOverrides({
        prices: buildPricesFromDraft(draftPrices, templatePriceById),
        next_group_overrides: draftNested,
      })
    );
  };

  const resetAll = () => {
    const nextPrices: Record<string, number> = {};
    groups.forEach((grp) => {
      (grp.out.modifiers ?? []).forEach((mod: Modifier) => {
        nextPrices[mod.id.toString()] = Number(mod.price);
      });
    });
    setDraftPrices(nextPrices);
    setDraftNested([]);
  };

  const hasNestedOverride = (parentModifierId: string, groupId: string) => {
    return draftNested.some(
      (row) =>
        toRecordId(row.parent_modifier_id as string).toString() ===
          toRecordId(parentModifierId).toString() &&
        toRecordId(row.group_id as string).toString() ===
          toRecordId(groupId).toString()
    );
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t("forms.menuModifierPricesTitle", { name: dishName })}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">{t("forms.menuModifierPricesHelp")}</p>

          <div className="flex gap-2">
            <Button variant="secondary" type="button" onClick={resetAll}>
              {t("forms.resetModifierPrices")}
            </Button>
            <Button
              variant="success"
              type="button"
              className="ml-auto"
              onClick={handleSave}
              disabled={loading}
            >
              {t("common:actions.save")}
            </Button>
          </div>

          {loading && (
            <div className="text-center text-neutral-500 py-6">
              {t("forms.loadingModifierGroups")}
            </div>
          )}

          {!loading && groups.length === 0 && (
            <div className="text-center text-neutral-500 py-6">
              {t("forms.attachModifierGroupsFirst")}
            </div>
          )}

          {!loading && groups.length > 0 && (
            <ScrollContainer className="max-h-[55vh] flex flex-col gap-4">
              {groups.map((grp) => (
                <div key={grp.id.toString()} className="border border-neutral-200 rounded-lg p-3">
                  <h4 className="font-semibold text-neutral-900 mb-3">{grp.out.name}</h4>
                  <div className="flex flex-col gap-2">
                    {(grp.out.modifiers ?? []).map((mod: Modifier) => {
                      const modifierId = mod.id.toString();
                      const templatePrice = Number(mod.price);
                      const allowedNext = (mod.allowed_next_groups ?? []).filter(Boolean);

                      return (
                        <div
                          key={modifierId}
                          className="flex flex-col gap-2 py-2 border-b border-neutral-100 last:border-0"
                        >
                          <div className="flex items-end gap-3">
                            <div className="flex-1 min-w-[180px]">
                              <div className="text-sm font-medium">
                                {mod.modifier?.name ?? modifierId}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {t("forms.templatePrice")}: {templatePrice}
                              </div>
                            </div>
                            <Input
                              type="number"
                              label={t("common:actions.price")}
                              value={draftPrices[modifierId] ?? templatePrice}
                              onChange={(e) =>
                                setDraftPrices((prev) => ({
                                  ...prev,
                                  [modifierId]: Number(e.target.value) || 0,
                                }))
                              }
                            />
                            <Button
                              variant="secondary"
                              flat
                              filled
                              type="button"
                              onClick={() =>
                                setDraftPrices((prev) => ({
                                  ...prev,
                                  [modifierId]: templatePrice,
                                }))
                              }
                            >
                              {t("forms.reset")}
                            </Button>
                          </div>

                          {allowedNext.length > 0 && (
                            <div className="flex flex-wrap gap-2 pl-1">
                              {allowedNext.map((nextGroup) => {
                                const groupId =
                                  typeof nextGroup === "string"
                                    ? nextGroup
                                    : nextGroup.id.toString();
                                const groupName =
                                  typeof nextGroup === "string"
                                    ? groupId
                                    : nextGroup.name ?? groupId;
                                const customized = hasNestedOverride(modifierId, groupId);

                                return (
                                  <Button
                                    key={groupId}
                                    type="button"
                                    variant={customized ? "warning" : "secondary"}
                                    flat
                                    filled
                                    icon={faPencil}
                                    onClick={() => openNestedEditor(mod, groupId, groupName)}
                                  >
                                    {t("forms.nestedModifierPrices", { name: groupName })}
                                  </Button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </ScrollContainer>
          )}
        </div>
      </Modal>

      {nestedEditor && (
        <Modal
          open={Boolean(nestedEditor)}
          onClose={() => setNestedEditor(null)}
          title={t("forms.menuNestedModifierPricesTitle", {
            modifier: nestedEditor.parentModifierName,
            group: nestedEditor.groupName,
          })}
          size="lg"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-neutral-600">
              {t("forms.menuNestedModifierPricesHelp")}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  const prices: Record<string, number> = {};
                  (nestedEditor.template?.modifiers ?? []).forEach((mod) => {
                    prices[mod.id.toString()] = Number(mod.price);
                  });
                  setNestedDraftPrices(prices);
                }}
              >
                {t("forms.resetModifierPrices")}
              </Button>
              <Button
                variant="success"
                type="button"
                className="ml-auto"
                onClick={saveNestedEditor}
              >
                {t("common:actions.save")}
              </Button>
            </div>
            <ScrollContainer className="max-h-[55vh] flex flex-col gap-2">
              {(nestedEditor.template?.modifiers ?? []).map((mod) => {
                const modifierId = mod.id.toString();
                return (
                  <div
                    key={modifierId}
                    className="flex items-end gap-3 py-2 border-b border-neutral-100 last:border-0"
                  >
                    <div className="flex-1 min-w-[180px]">
                      <div className="text-sm font-medium">
                        {mod.modifier?.name ?? modifierId}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {t("forms.templatePrice")}: {Number(mod.price)}
                      </div>
                    </div>
                    <Input
                      type="number"
                      label={t("common:actions.price")}
                      value={nestedDraftPrices[modifierId] ?? Number(mod.price)}
                      onChange={(e) =>
                        setNestedDraftPrices((prev) => ({
                          ...prev,
                          [modifierId]: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </ScrollContainer>
          </div>
        </Modal>
      )}
    </>
  );
};
