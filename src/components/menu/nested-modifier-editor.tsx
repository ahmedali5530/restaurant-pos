import {Dish} from "@/api/model/dish.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {useEffect, useMemo, useState} from "react";
import {CartModifierGroup, MenuItem} from "@/api/model/cart_item.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {MenuDishModifiers} from "@/components/menu/modifiers.tsx";
import {
  cloneCartModifierGroups,
  getVisibleCatalogModifiers,
  isCatalogModifierSelected,
  resetCartModifierGroupCatalog,
  syncSelectedModifierPrices,
  validateNestedGroupsVisibility,
} from "@/lib/modifier-groups.ts";
import {useAtom} from "jotai";
import {appAlert} from "@/store/jotai.ts";
import ScrollContainer from "react-indiana-drag-scroll";

interface Props {
  isOpen: boolean
  dish: Dish
  modifier: MenuItem
  onClose: () => void
  onSave: (nestedGroups: CartModifierGroup[]) => void
}

export const NestedModifierEditor = ({
  isOpen,
  dish,
  modifier,
  onClose,
  onSave,
}: Props) => {
  const [, setAlert] = useAtom(appAlert);
  const [nestedGroups, setNestedGroups] = useState<CartModifierGroup[]>([]);
  const [selectionEditorOpen, setSelectionEditorOpen] = useState(false);

  useEffect(() => {
    if (isOpen && modifier.selectedGroups) {
      setNestedGroups(cloneCartModifierGroups(modifier.selectedGroups));
      setSelectionEditorOpen(false);
    }
  }, [isOpen, modifier.id, modifier.selectedGroups]);

  const validationError = useMemo(
    () => validateNestedGroupsVisibility(nestedGroups),
    [nestedGroups]
  );

  const updateGroup = (
    groupOutId: string,
    updater: (group: CartModifierGroup) => CartModifierGroup
  ) => {
    setNestedGroups((prev) =>
      prev.map((grp) =>
        grp.out.id.toString() === groupOutId ? updater(grp) : grp
      )
    );
  };

  const onCatalogPriceChange = (
    group: CartModifierGroup,
    catalogId: string,
    value: number
  ) => {
    updateGroup(group.out.id.toString(), (grp) => {
      const modifiers = (grp.modifiers ?? []).map((catalog) =>
        catalog.id === catalogId
          ? {...catalog, price: value}
          : catalog
      );

      return syncSelectedModifierPrices({
        ...grp,
        modifiers,
      });
    });
  };

  const onVisibilityChange = (
    group: CartModifierGroup,
    catalog: MenuItem,
    visible: boolean
  ) => {
    if (!visible && isCatalogModifierSelected(group, catalog)) {
      setAlert((prev) => ({
        ...prev,
        message:
          'Cannot hide a modifier that is already selected. Remove it from selections first.',
        type: 'warning',
        opened: true,
      }));
      return;
    }

    updateGroup(group.out.id.toString(), (grp) => {
      const modifiers = (grp.modifiers ?? []).map((row) =>
        row.id === catalog.id ? {...row, hidden: !visible} : row
      );

      return syncSelectedModifierPrices({
        ...grp,
        modifiers,
        catalogCustomized: true,
      });
    });
  };

  const handleSave = () => {
    if (validationError) {
      setAlert((prev) => ({
        ...prev,
        message: validationError,
        type: 'warning',
        opened: true,
      }));
      return;
    }

    onSave(nestedGroups);
    onClose();
  };

  return (
    <>
      <Modal
        open={isOpen && !selectionEditorOpen}
        title={`Nested groups: ${dish.name}`}
        onClose={onClose}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => setSelectionEditorOpen(true)}
            >
              Edit selections
            </Button>
            <Button variant="success" className="flex-1" onClick={handleSave}>
              Save
            </Button>
          </div>

          <ScrollContainer className="max-h-[60vh] overflow-y-auto flex flex-col gap-6">
            {nestedGroups.map((group) => (
              <div
                key={group.out.id.toString()}
                className="border border-neutral-200 rounded-xl p-3"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-bold">{group.out.name}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    flat
                    onClick={() =>
                      updateGroup(group.out.id.toString(), resetCartModifierGroupCatalog)
                    }
                  >
                    Reset to menu
                  </Button>
                </div>

                {group.has_required_modifiers && (
                  <p className="text-sm text-neutral-500 mb-2">
                    Required: {group.required_modifiers} · Visible:{' '}
                    {getVisibleCatalogModifiers(group).length}
                  </p>
                )}

                <div className="flex flex-col gap-2">
                  {(group.modifiers ?? []).map((catalog) => (
                    <div
                      key={catalog.id}
                      className="flex items-center gap-3 py-1 border-b border-neutral-100 last:border-0"
                    >
                      <Switch
                        checked={!catalog.hidden}
                        onChange={(e) =>
                          onVisibilityChange(group, catalog, e.target.checked)
                        }
                      >
                        <span className="text-sm">{catalog.dish.name}</span>
                      </Switch>
                      <Input
                        type="number"
                        inputSize="lg"
                        className="w-28 ml-auto"
                        value={catalog.price ?? 0}
                        onChange={(e) =>
                          onCatalogPriceChange(
                            group,
                            catalog.id,
                            Number(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </ScrollContainer>
        </div>
      </Modal>

      {selectionEditorOpen && (
        <MenuDishModifiers
          isOpen={selectionEditorOpen}
          dish={dish}
          groups={nestedGroups.map((grp) => ({
            ...grp,
            modifiers: getVisibleCatalogModifiers(grp),
          }))}
          level={modifier.level + 1}
          editing={true}
          onClose={(payload) => {
            setSelectionEditorOpen(false);
            if (payload.length === 0) {
              return;
            }

            setNestedGroups((prev) =>
              prev.map((prevGroup) => {
                const updated = payload.find(
                  (row) =>
                    row.out.id.toString() === prevGroup.out.id.toString()
                );

                if (!updated) {
                  return prevGroup;
                }

                return {
                  ...prevGroup,
                  selectedModifiers: updated.selectedModifiers,
                };
              })
            );
          }}
        />
      )}
    </>
  );
};
