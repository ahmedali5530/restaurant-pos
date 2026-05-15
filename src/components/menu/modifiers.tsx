import {Dish} from "@/api/model/dish.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import React, {useEffect, useMemo, useState} from "react";
import {cn} from "@/lib/utils.ts";
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

interface Props {
  dish?: Dish
  onClose?: (payload: CartModifierGroup[]) => void
  isOpen: boolean
  groups: CartModifierGroup[]
  level: number
  editing?: boolean
}

export const MenuDishModifiers = (props: Props) => {
  const [state] = useAtom(appState);
  const [, setAlert] = useAtom(appAlert);

  const [groups, setGroups] = useState(props.groups);
  const [group, setGroup] = useState<CartModifierGroup>();
  const ITEMS_PER_SLIDE = 18;

  const slides = useMemo(() => {
    if (!group) {
      return 1;
    }

    return Math.ceil(group.modifiers.length / ITEMS_PER_SLIDE);
  }, [group]);

  const selected = useMemo(() => {
    return groups.reduce((prev, item) => prev + item.selectedModifiers.length, 0);
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

    // Block dismiss only when at least one required group is incomplete.
    return !groups.some(
      grp => grp.has_required_modifiers && grp.selectedModifiers.length < grp.required_modifiers
    );
  }, [groups]);

  // Keep the close icon behavior aligned with dismiss rules:
  // show it only when dismiss actions are currently allowed.
  const hideCloseButton = !isDismissible;

  useEffect(() => {
    if (props.dish && !group && groups.length > 0) {
      setGroup(groups[0]);

      return;
    }

    // auto select modifiers if they are same as required
    if (
      group &&
      group.modifiers.length === group.required_modifiers &&
      props.editing !== true &&
      group.should_auto_select
    ) {
      for (const dish of group.modifiers) {
        onModifierClick(buildModifiersObj(dish.dish, dish.selectedGroups, dish.price));
      }
    }
  }, [props.dish, group, state.seat, props.level, props.editing]);

  const onModifierClick = (d: MenuItem, selectedGroups?: CartModifierGroup[], price?: number) => {
    setGroups(
      newGroups => newGroups.map(grp => {
        if (grp.out.id.toString() === group.out.id.toString()) {
          if(props.editing && grp.has_required_modifiers && grp.selectedModifiers.length === grp.required_modifiers){
            // remove last modifier and choose this one
            grp.selectedModifiers.pop();
            grp.selectedModifiers.push(buildModifiersObj(d.dish, selectedGroups, price ?? d.price));

            setAlert(prev => ({
              ...prev,
              message: 'Last modifier is replaced, to replace any other modifier remove it from right sidebar and choose again.',
              type: 'warning',
              opened: true
            }));

            return grp;
          }
          if (
            (grp.has_required_modifiers && grp.selectedModifiers.length !== grp.required_modifiers) ||
            (!grp.has_required_modifiers)
          ) {
            grp.selectedModifiers.push(buildModifiersObj(d.dish, selectedGroups, price ?? d.price));
          }
        }

        return grp;
      })
    );
  }

  const buildModifiersObj = (dish: Dish, groups?: CartModifierGroup[], price?: number): MenuItem => {
    return {
      quantity: 1,
      dish: dish,
      seat: state.seat,
      id: nanoid(),
      level: props.level,
      selectedGroups: groups,
      newOrOld: MenuItemType.new,
      category: state.category ? state.category?.name : (dish.categories.length === 1 ? dish.categories[0].name : ''),
      isModifier: true,
      price: price
    }
  }

  const requireClass = (grp: CartModifierGroup) => {
    if (grp.has_required_modifiers && grp.selectedModifiers.length < grp.required_modifiers) {
      return 'bg-danger-200';
    } else if (grp.has_required_modifiers && grp.selectedModifiers.length === grp.required_modifiers) {
      return 'bg-white'; //'bg-success-200';
    }

    return 'bg-white';
  }

  useEffect(() => {
    if (group) {
      if (
        (group.has_required_modifiers && group.selectedModifiers.length === group.required_modifiers)
        || group.should_auto_open
      ) {

        // move to next group if exists
        const nextGroup = groups.find(item => (item.has_required_modifiers && item.selectedModifiers.length !== item.required_modifiers) || (item.should_auto_open && !item.has_required_modifiers));

        if (nextGroup) {
          setGroup(nextGroup);
        }
      }
    }
  }, [groups, group]);

  // close modifiers box automatically when all required groups are selected and optional modifiers are 0
  useEffect(() => {
    if (selected === required && optional === 0 && props.editing !== true) {
      props.onClose(selected > 0 ? groups : []);
    }
  }, [selected, required, groups, optional, props]);

  const removeItem = (group: CartModifierGroup, itemIndex: number) => {
    const newGroups = [...groups];
    newGroups.map(grp => {
      if (grp.out.id.toString() === group.out.id.toString()) {
        grp.selectedModifiers.splice(itemIndex, 1);
      }
    });

    setGroups(newGroups);
  }

  const [editModifiers, setEditModifiers] = useState(false);

  return (
    <Modal
      open={props.isOpen}
      title={`Modify ${props.dish.name}`}
      shouldCloseOnOverlayClick={isDismissible}
      shouldCloseOnEsc={isDismissible}
      hideCloseButton={hideCloseButton}
      onClose={() => {
        // pass groups when required selected modifiers are greater than 0 or optional groups are greater than 0
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
                      group?.out?.id === item.out.id ? 'bg-gradient' : requireClass(item)
                    )
                  }
                  style={{
                    '--padding': '0'
                  } as any}
                  key={item.out.id}
                  onClick={() => setGroup(item)}
                >
                  <span>{item.out.name}</span>
                  <>{item.has_required_modifiers && (
                    <span className="text-sm">{item.selectedModifiers.length} / {item.required_modifiers}</span>
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
                    {group.modifiers.slice(rowId * ITEMS_PER_SLIDE, ((rowId * ITEMS_PER_SLIDE) + ITEMS_PER_SLIDE)).map((modifier, mIndex) => (
                      <MenuDish
                        onClick={onModifierClick}
                        item={modifier.dish}
                        key={mIndex}
                        level={props.level + 1}
                        isModifier
                        price={modifier.price}
                        allowedNextGroupIds={modifier.allowedNextGroupIds}
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
            >Cancel</Button>
            <ScrollContainer className="modifiers-swiper">
              {groups.map((g, index) => (
                <div key={index}>
                  <span className="font-bold">{g.out.name}</span>
                  {g.selectedModifiers.map((m, mIndex) => (
                    <div key={mIndex} className="flex items-center gap-3">
                      <Button
                        className="grow shrink-0"
                        size="lg"
                        variant="danger"
                        flat iconButton onClick={() => removeItem(g, mIndex)}>
                        <FontAwesomeIcon icon={faTimes}/>
                      </Button>
                      {' '}
                      {m?.selectedGroups?.length > 0 ? (
                        <>
                          <Button
                            icon={faPencil}
                            onClick={() => setEditModifiers(true)}
                            className="flex !justify-between w-full"
                            flat
                            variant="custom"
                          >
                            <span>
                              {m.dish.name}
                            </span>
                            <span>
                             {m.price}
                            </span>
                          </Button>
                          {editModifiers && (
                            <MenuDishModifiers
                              isOpen={editModifiers}
                              dish={m.dish}
                              groups={m.selectedGroups}
                              level={m.level + 1}
                              editing={true}
                              onClose={() => {
                                setEditModifiers(false);
                              }}
                            />
                          )}
                        </>
                      ) : (
                        <div className="flex justify-between w-full">
                          <span>
                            {m.dish.name}
                          </span>
                          <span>
                           {m.price}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </ScrollContainer>
          </div>
        </div>
      )}
    </Modal>
  )
}
