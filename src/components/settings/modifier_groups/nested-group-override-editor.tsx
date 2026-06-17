import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Switch } from "@/components/common/input/switch.tsx";
import { useEffect, useState } from "react";
import {
  ModifierNextGroupOverrideItem,
} from "@/api/model/modifier.ts";
import { ModifierGroup } from "@/api/model/modifier_group.ts";
import {
  buildOverrideItemsFromTemplate,
  normalizeNextGroupOverrides,
} from "@/lib/modifier-groups.ts";
import {useTranslation} from 'react-i18next';
import ScrollContainer from "react-indiana-drag-scroll";

interface Props {
  open: boolean
  groupId: string
  groupName: string
  title: string
  template: ModifierGroup | null
  items: ModifierNextGroupOverrideItem[]
  onClose: () => void
  onSave: (items: ModifierNextGroupOverrideItem[]) => void
}

export const NestedGroupOverrideEditor = ({
  open,
  groupId,
  groupName,
  title,
  template,
  items,
  onClose,
  onSave,
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const [draftItems, setDraftItems] = useState<ModifierNextGroupOverrideItem[]>([]);

  useEffect(() => {
    if (!open || !template) {
      return;
    }

    const templateItems = buildOverrideItemsFromTemplate(template.modifiers ?? []);
    const normalized = normalizeNextGroupOverrides([
      { group_id: groupId, items },
    ]).find((row) => row.group_id === groupId)?.items;

    if (!normalized?.length) {
      setDraftItems(templateItems);
      return;
    }

    setDraftItems(
      templateItems.map((templateItem) => {
        const saved = normalized.find(
          (row) => row.nested_modifier_id === templateItem.nested_modifier_id
        );

        return saved ?? templateItem;
      })
    );
  }, [open, groupId, template, items]);

  if (!template) {
    return null;
  }

  const templateById = new Map(
    (template.modifiers ?? []).map((row) => [row.id.toString(), row])
  );

  const resetGroup = () => {
    setDraftItems(buildOverrideItemsFromTemplate(template.modifiers ?? []));
  };

  const updateItem = (
    nestedModifierId: string,
    patch: Partial<ModifierNextGroupOverrideItem>
  ) => {
    setDraftItems((prev) =>
      prev.map((row) =>
        row.nested_modifier_id === nestedModifierId ? { ...row, ...patch } : row
      )
    );
  };

  return (
    <Modal
      open={open}
      title={t('forms.customize', { title })}
      onClose={onClose}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-neutral-600">
          Changes apply only to this modifier row. The base group &quot;{groupName}&quot; is unchanged.
        </p>

        <div className="flex gap-2">
          <Button variant="secondary" type="button" onClick={resetGroup}>
            Reset to menu
          </Button>
          <Button
            variant="success"
            type="button"
            className="ml-auto"
            onClick={() => onSave(draftItems)}
          >
            Save
          </Button>
        </div>

        <ScrollContainer className="max-h-[55vh] flex flex-col gap-2">
          {draftItems.map((row) => {
            const templateRow = templateById.get(row.nested_modifier_id);
            const dishName = templateRow?.modifier?.name ?? row.nested_modifier_id;
            const basePrice = Number(templateRow?.price ?? row.price);

            return (
              <div
                key={row.nested_modifier_id}
                className="flex items-center gap-3 py-2 border-b border-neutral-100 last:border-0"
              >
                <div className="grow-0 min-w-[250px]">
                  <Switch
                    checked={!row.hidden}
                    onChange={(e) =>
                      updateItem(row.nested_modifier_id, { hidden: !e.target.checked })
                    }
                  >
                    <span className="text-sm">{dishName}</span>
                  </Switch>
                </div>
                <Input
                  type="number"
                  className="ml-auto"
                  value={row.price}
                  onChange={(e) =>
                    updateItem(row.nested_modifier_id, {
                      price: Number(e.target.value) || 0,
                    })
                  }
                />
                <Button
                  variant="secondary"
                  flat
                  filled
                  type="button"
                  onClick={() =>
                    updateItem(row.nested_modifier_id, {
                      price: basePrice,
                      hidden: false,
                    })
                  }
                >
                  Reset
                </Button>
              </div>
            );
          })}
        </ScrollContainer>
      </div>
    </Modal>
  );
};
