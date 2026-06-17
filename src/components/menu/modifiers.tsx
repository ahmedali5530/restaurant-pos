import {Dish} from "@/api/model/dish.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import React, {useEffect, useMemo, useState} from "react";
import {cn, formatNumber} from "@/lib/utils.ts";
import {MenuDish} from "@/components/menu/dish.tsx";
import {Swiper, SwiperSlide} from "swiper/react";
import _ from "lodash";
import {CartModifierGroup, MenuItem, MenuItemType} from "@/api/model/cart_item.ts";
import {useAtom} from "jotai";
import {appAlert, appState} from "@/store/jotai.ts";
import {nanoid} from "nanoid";
import ScrollContainer from "react-indiana-drag-scroll";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencil, faTimes} from "@fortawesome/free-solid-svg-icons";
import {
  cloneCartModifierGroups,
  findNextActiveGroup,
  getGroupInstanceKey,
  getGroupSidebarLabel,
  getVisibleCatalogModifiers,
  isSameGroupInstance,
  resolveGroupInList,
  shouldAdvanceFromGroup,
  updateModifierNestedGroups,
} from "@/lib/modifier-groups.ts";
import {useTranslation} from "react-i18next";

interface Props {
  dish?: Dish
  onClose?: (payload: CartModifierGroup[]) => void
  isOpen: boolean
  groups: CartModifierGroup[]
  level: number
  editing?: boolean
}

const NestedModifiersSummary = ({groups}: { groups: CartModifierGroup[] }) => (
  <>
    {groups.map((grp) => (
      <div
        key={getGroupInstanceKey(grp)}
        className="mt-1 flex flex-col"
      >
        <div className="text-sm font-bold bg-slate-600 text-white self-start rounded px-[3px]">{getGroupSidebarLabel(grp, groups)}</div>
        {(grp.selectedModifiers ?? []).map((modifier) => (
          <div key={modifier.id} className="text-sm border-l-2 border-warning-500">
            <div className="flex justify-between gap-2 pl-1">
              <span className="min-w-0 truncate">{modifier.dish.name}</span>
              <span className="shrink-0">{formatNumber(modifier.price ?? 0)}</span>
            </div>
            {(modifier.selectedGroups?.length ?? 0) > 0 && (
              <NestedModifiersSummary groups={modifier.selectedGroups!}/>
            )}
          </div>
        ))}
      </div>
    ))}
  </>
);

export const MenuDishModifiers = (props: Props) => {
  const [state] = useAtom(appState);
  const [, setAlert] = useAtom(appAlert);
  const { t } = useTranslation('menu');

  const [groups, setGroups] = useState(() => cloneCartModifierGroups(props.groups));
  const [group, setGroup] = useState<CartModifierGroup>();
  const [editingNestedFor, setEditingNestedFor] = useState<string | null>(null);
  const ITEMS_PER_SLIDE = 18;

  useEffect(() => {
    const cloned = cloneCartModifierGroups(props.groups);
    setGroups(cloned);
    setGroup((prev) => {
      if (!prev) {
        return prev;
      }

      const resolved = cloned.find((g) => isSameGroupInstance(g, prev));

      return resolved ?? (cloned.length > 0 ? cloned[0] : undefined);
    });
  }, [props.groups]);

  const visibleModifiers = useMemo(() => {
    if (!group) {
      return [];
    }

    return getVisibleCatalogModifiers(group);
  }, [group]);

  const slides = useMemo(() => {
    if (!group) {
      return 1;
    }

    return Math.ceil(visibleModifiers.length / ITEMS_PER_SLIDE);
  }, [group, visibleModifiers.length]);

  const selected = useMemo(() => {
    return groups.reduce(
      (prev, item) => prev + (item.selectedModifiers?.length ?? 0),
      0
    );
  }, [groups]);

  const required = useMemo(() => {
    return groups.filter(item => item.has_required_modifiers).reduce((prev, item) => prev + item.required_modifiers, 0);
  }, [groups]);

  const optional = useMemo(() => {
    return groups.filter(item => !item.has_required_modifiers).length;
  }, [groups]);

  const isDismissible = useMemo(() => {
    if (!groups || groups.length === 0) {
      return true;
    }

    return !groups.some(
      grp => grp.has_required_modifiers && (grp.selectedModifiers?.length ?? 0) < grp.required_modifiers
    );
  }, [groups]);

  const hideCloseButton = !isDismissible;

  useEffect(() => {
    if (props.dish && !group && groups.length > 0) {
      setGroup(groups[0]);

      return;
    }

    if (
      group &&
      visibleModifiers.length === group.required_modifiers &&
      props.editing !== true &&
      group.should_auto_select
    ) {
      for (const catalog of visibleModifiers) {
        onModifierClick(
          {
            quantity: 1,
            dish: catalog.dish,
            seat: state.seat,
            id: nanoid(),
            level: props.level,
            price: catalog.price,
            newOrOld: MenuItemType.new,
            category: state.category
              ? state.category.name
              : (catalog.dish.categories.length === 1
                ? catalog.dish.categories[0].name
                : ''),
          },
          catalog.selectedGroups,
          catalog.price,
          catalog
        );
      }
    }
  }, [props.dish, group, state.seat, props.level, props.editing, visibleModifiers]);

  const buildModifiersObj = (
    dish: Dish,
    nestedGroups?: CartModifierGroup[],
    price?: number,
    catalog?: MenuItem
  ): MenuItem => {
    const sourceModifier = catalog?.sourceModifier;

    return {
      quantity: 1,
      dish: dish,
      seat: state.seat,
      id: nanoid(),
      level: props.level,
      selectedGroups: nestedGroups,
      newOrOld: MenuItemType.new,
      category: state.category ? state.category?.name : (dish.categories.length === 1 ? dish.categories[0].name : ''),
      isModifier: true,
      price: price,
      sourceModifier,
      catalogModifierId: catalog
        ? (catalog.catalogModifierId ?? catalog.id.toString())
        : undefined,
    }
  }

  const onModifierClick = (
    d: MenuItem,
    selectedGroups?: CartModifierGroup[],
    price?: number,
    catalog?: MenuItem
  ) => {
    setGroups(
      newGroups => newGroups.map(grp => {
        if (isSameGroupInstance(grp, group)) {
          const clonedNested = selectedGroups
            ? cloneCartModifierGroups(selectedGroups)
            : undefined;

          if(props.editing && grp.has_required_modifiers && (grp.selectedModifiers?.length ?? 0) === grp.required_modifiers){
            grp.selectedModifiers = [...(grp.selectedModifiers ?? [])];
            grp.selectedModifiers.pop();
            grp.selectedModifiers.push(
              buildModifiersObj(d.dish, clonedNested, price ?? d.price, catalog)
            );

            setAlert(prev => ({
              ...prev,
              message: t('modifiers.replacedWarning'),
              type: 'warning',
              opened: true
            }));

            return grp;
          }
          if (
            (grp.has_required_modifiers && (grp.selectedModifiers?.length ?? 0) !== grp.required_modifiers) ||
            (!grp.has_required_modifiers)
          ) {
            grp.selectedModifiers = [...(grp.selectedModifiers ?? [])];
            grp.selectedModifiers.push(
              buildModifiersObj(d.dish, clonedNested, price ?? d.price, catalog)
            );
          }
        }

        return grp;
      })
    );
  }

  const requireClass = (grp: CartModifierGroup) => {
    if (grp.has_required_modifiers && (grp.selectedModifiers?.length ?? 0) < grp.required_modifiers) {
      return 'bg-danger-200';
    } else if (grp.has_required_modifiers && (grp.selectedModifiers?.length ?? 0) === grp.required_modifiers) {
      return 'bg-white';
    }

    return 'bg-white';
  }

  useEffect(() => {
    if (!group) {
      return;
    }

    const current = resolveGroupInList(groups, group);

    if (!shouldAdvanceFromGroup(current)) {
      return;
    }

    const next = findNextActiveGroup(groups, current);

    if (next && !isSameGroupInstance(next, current)) {
      setGroup(next);
    }
  }, [groups, group]);

  useEffect(() => {
    if (selected === required && optional === 0 && props.editing !== true) {
      props.onClose(selected > 0 ? groups : []);
    }
  }, [selected, required, groups, optional, props]);

  const removeItem = (targetGroup: CartModifierGroup, itemIndex: number) => {
    setGroups(prev => prev.map(grp => {
      if (isSameGroupInstance(grp, targetGroup)) {
        const selectedModifiers = [...(grp.selectedModifiers ?? [])];
        selectedModifiers.splice(itemIndex, 1);
        return {...grp, selectedModifiers};
      }

      return grp;
    }));
  }

  const editingNestedModifier = useMemo(() => {
    if (!editingNestedFor) {
      return undefined;
    }

    for (const grp of groups) {
      const found = (grp.selectedModifiers ?? []).find((m) => m.id === editingNestedFor);
      if (found) {
        return found;
      }
    }

    return undefined;
  }, [editingNestedFor, groups]);

  return (
    <Modal
      open={props.isOpen}
      title={t('modifiers.modifyTitle', { name: props.dish.name })}
      shouldCloseOnOverlayClick={isDismissible}
      shouldCloseOnEsc={isDismissible}
      hideCloseButton={hideCloseButton}
      onClose={() => {
        props.onClose(selected > 0 || optional > 0 ? groups : []);
      }}
      size="full"
    >
      {props.dish && (
        <div className="!grid grid-cols-7 gap-3">
          <div className="col-span-1 flex flex-col rounded-3xl bg-neutral-100">
            <ScrollContainer className="modifiers-swiper flex flex-col gap-[5px]">
              {groups.map((item, index) => (
                <span
                  className={
                    cn(
                      'flex flex-col items-center justify-center p-1 cursor-pointer min-h-[56px] shadow',
                      index === 0 && 'rounded-t-3xl',
                      index + 1 === groups.length && 'rounded-b-3xl',
                      group && isSameGroupInstance(group, item) ? 'bg-gradient' : requireClass(item)
                    )
                  }
                  style={{
                    '--padding': '0'
                  } as any}
                  key={getGroupInstanceKey(item)}
                  onClick={() => setGroup(item)}
                >
                  <span>{getGroupSidebarLabel(item, groups)}</span>
                  <>{item.has_required_modifiers && (
                    <span className="text-sm">{(item.selectedModifiers?.length ?? 0)} / {item.required_modifiers}</span>
                  )}</>
                </span>
              ))}
            </ScrollContainer>
          </div>
          <div className="col-span-4">
            {group && (
              <Swiper
                slidesPerView={1}
                className="modifiers-swiper"
                direction="vertical"
              >
                {_.range(0, slides).map(rowId => (
                  <SwiperSlide
                    key={rowId}
                    className={cn(
                      '!grid grid-cols-3 grid-rows-7'
                    )}
                  >
                    {visibleModifiers.slice(rowId * ITEMS_PER_SLIDE, ((rowId * ITEMS_PER_SLIDE) + ITEMS_PER_SLIDE)).map((catalog) => (
                      <MenuDish
                        onClick={(item, groups, itemPrice) =>
                          onModifierClick(item, groups, itemPrice, catalog)
                        }
                        item={catalog.dish}
                        key={catalog.catalogModifierId ?? catalog.id}
                        level={props.level + 1}
                        isModifier
                        price={catalog.price ?? 0}
                        allowedNextGroupIds={catalog.allowedNextGroupIds}
                        parentModifier={catalog.sourceModifier}
                      />
                    ))}
                  </SwiperSlide>
                ))}
              </Swiper>
            )}
          </div>
          <div className="col-span-2 bg-white p-3 rounded-3xl">
            <Button
              variant="danger"
              onClick={() => {
                props.onClose([]);
              }}
              className="mb-3 w-full lg"
            >{t('modifiers.cancel')}</Button>
            <ScrollContainer className="modifiers-swiper">
              {groups.map((g) => (
                <div key={getGroupInstanceKey(g)}>
                  <span className="font-bold">{getGroupSidebarLabel(g, groups)}</span>
                  {(g.selectedModifiers ?? []).map((m, mIndex) => (
                    <div key={mIndex} className="mb-2 flex items-start gap-3">
                      <Button
                        className="shrink-0"
                        size="lg"
                        variant="danger"
                        flat
                        iconButton
                        onClick={() => removeItem(g, mIndex)}
                      >
                        <FontAwesomeIcon icon={faTimes}/>
                      </Button>
                      <div className="min-w-0 flex-1">
                        {m?.selectedGroups?.length > 0 ? (
                          <>
                            <Button
                              icon={faPencil}
                              onClick={() => setEditingNestedFor(m.id)}
                              className="flex w-full !justify-between"
                              flat
                              variant="custom"
                            >
                              <span className="min-w-0 truncate">{m.dish.name}</span>
                              <span className="shrink-0">{formatNumber(m.price ?? 0)}</span>
                            </Button>
                            <NestedModifiersSummary groups={m.selectedGroups}/>
                          </>
                      ) : (
                          <div className="flex justify-between gap-2 py-2">
                            <span className="min-w-0 truncate">{m.dish.name}</span>
                            <span className="shrink-0">{formatNumber(m.price ?? 0)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </ScrollContainer>
          </div>
        </div>
      )}

      {editingNestedModifier && editingNestedFor && (
        <MenuDishModifiers
          key={editingNestedFor}
          isOpen={editingNestedFor !== null}
          dish={editingNestedModifier.dish}
          groups={cloneCartModifierGroups(editingNestedModifier.selectedGroups ?? [])}
          level={editingNestedModifier.level + 1}
          editing={true}
          onClose={(payload) => {
            const modifierId = editingNestedFor;
            setEditingNestedFor(null);
            if (payload.length > 0 && modifierId) {
              setGroups((prev) =>
                updateModifierNestedGroups(prev, modifierId, payload)
              );
            }
          }}
        />
      )}
    </Modal>
  )
}
