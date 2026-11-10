import React, {useMemo, useState} from "react";
import {MenuItem, MenuItemType} from "@/api/model/cart_item.ts";
import {useAtom} from "jotai";
import {appSettings, appState} from "@/store/jotai.ts";
import {cn} from "@/lib/utils.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faComment, faMinus, faPencil, faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {MenuDishModifiers} from "@/components/menu/modifiers.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {VirtualKeyboard} from "@/components/common/input/virtual.keyboard.tsx";
import {CartItemName} from "@/components/common/cart/cart.item.name.tsx";
import {useTranslation} from "react-i18next";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {canAddDishQty, dishSoldMapAtom, soldFromMap, withLiveAvailability,} from "@/lib/dish-availability.ts";
import {toast} from "sonner";

interface Props {
  item: MenuItem
  index: number
}

export const CartItem = ({item, index}: Props) => {
  const {t} = useTranslation(['cart', 'common', 'menu']);
  const [state, setState] = useAtom(appState);
  const [settings] = useAtom(appSettings);
  const [soldMap] = useAtom(dishSoldMapAtom);
  const enforceLimits = state.enforceItemAvailability !== false;

  const trySetQuantity = (nextQty: number) => {
    // Allow fractional qty (scale weight in kg); reject empty/zero/negative.
    if (!Number.isFinite(nextQty) || nextQty < 0.001) {
      return;
    }
    const liveDish = withLiveAvailability(settings.dishes, item.dish) ?? item.dish;
    const check = canAddDishQty({
      dish: liveDish,
      sold: soldFromMap(soldMap, item.dish?.id),
      cart: state.cart,
      addQty: nextQty,
      excludeCartLineId: item.id,
      enforceLimits,
    });
    if (!check.ok) {
      if (check.reason === "unavailable") {
        toast.warning(t("menu:availability.unavailable", {name: item.dish?.name}));
      } else {
        toast.warning(
          t("menu:availability.onlyNLeft", {
            name: item.dish?.name,
            count: check.remaining ?? 0,
          }),
        );
      }
      return;
    }
    setState((prev) => ({
      ...prev,
      cart: prev.cart.map((_item) => {
        if (item.id === _item.id) {
          _item.quantity = nextQty;
        }
        return _item;
      }),
    }));
  };
  const [isModifiersOpen, setModifiersOpen] = useState(false);
  const [isCommentKeyboardOpen, setCommentKeyboardOpen] = useState(false);
  const [commentText, setCommentText] = useState(item.comments || "");

  const hasOldItems = useMemo(() => {
    return state.cart.filter(item => item.newOrOld === MenuItemType.old && item.isSelected).length > 0
  }, [state.cart]);


  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-1 cursor-pointer select-none px-2 text-foreground border-b-2",
          item.isSelected
            ? 'bg-neutral-300 dark:bg-neutral-700'
            : item.isHold
              ? 'bg-warning-100 dark:bg-warning-900/50'
              : '',
        )}
        onClick={() => {
          if (item.deleted_at === undefined && (item.newOrOld === 'new' || item.isHold)) {
            setState(prev => ({
              ...prev,
              cart: prev.cart.map(ci => {
                if (ci.id === item.id) {
                  ci.isSelected = !ci.isSelected;
                }

                return ci
              })
            }))
          }
        }}
      >
        <div className="flex">
          {item.newOrOld === MenuItemType.old && (
            <span className="p-2 px-3 justify-center items-center">{item.quantity} &times;</span>
          )}
          <div className={
            cn(
              "flex-1 items-center p-2",
              item.deleted_at ? 'line-through text-danger-500' : ''
            )
          }>
            <CartItemName item={item} mainItem={item}/>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 pb-2">
          <div
            className="flex gap-2 items-center"
            // Qty controls must not toggle cart-line selection.
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {item.newOrOld === MenuItemType.new && (
              <>
                <IconTooltipButton
                  label={t('common:actions.add')}
                  flat
                  variant="primary"
                  onClick={() => trySetQuantity(item.quantity + 1)}
                  className="!rounded-none"
                ><FontAwesomeIcon icon={faPlus}/></IconTooltipButton>
                <Input
                  type="number"
                  enableKeyboard
                  value={item.quantity}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    if (!Number.isFinite(next)) {
                      return;
                    }
                    trySetQuantity(next);
                  }}
                  placeholder={item.dish.name}
                  className="!w-[60px] !border-0 !bg-surface-elevated !rounded-none text-center"
                />
                <IconTooltipButton
                  label={t('common:actions.remove')}
                  flat
                  variant="primary"
                  onClick={() => {
                    if(item.quantity === 1){
                      setState(prev => ({
                        ...prev,
                        cart: prev.cart.filter((_item) => {
                          if (item.id !== _item.id) {
                            return _item;
                          }
                        })
                      }))

                      return;
                    }

                    setState(prev => ({
                      ...prev,
                      cart: prev.cart.map((_item) => {
                        if (item.id === _item.id) {
                          if (_item.quantity === 1) {
                            return _item;
                          }

                          _item.quantity--;
                        }
                        return _item;
                      })
                    }))
                  }}
                  className="!rounded-none"
                ><FontAwesomeIcon icon={faMinus}/></IconTooltipButton>
                <IconTooltipButton
                  label={t('common:actions.remove')}
                  flat
                  variant={'danger'}
                  onClick={() => {
                    setState(prev => ({
                      ...prev,
                      cart: prev.cart.filter((_item) => {
                        if (item.id !== _item.id) {
                          return _item;
                        }
                      })
                    }))
                  }}
                  className="!rounded-none"
                ><FontAwesomeIcon icon={faTrash}/></IconTooltipButton>
              </>
            )}

            {item.newOrOld === MenuItemType.new && (
              <>
                <IconTooltipButton
                  label={t('common:actions.comment')}
                  flat
                  variant="primary"

                  onClick={() => {
                    setCommentText(item.comments || "");
                    setCommentKeyboardOpen(true);
                  }}
                  className="!rounded-none"
                >
                  <FontAwesomeIcon icon={faComment}/>
                </IconTooltipButton>
              </>
            )}

            {((item.newOrOld === MenuItemType.new && item?.selectedGroups?.length > 0) || (item.newOrOld === MenuItemType.new)) && (
              <div>
                {item.newOrOld === MenuItemType.new && item?.selectedGroups?.length > 0 && (
                  <>
                    <IconTooltipButton
                      label={t('common:actions.edit')}
                      flat
                      variant="primary"

                      onClick={() => {
                        setModifiersOpen(true)
                      }}
                      className="mr-2 !rounded-none"
                    ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {isModifiersOpen && (
        <MenuDishModifiers
          isOpen={isModifiersOpen}
          dish={item.dish}
          groups={item.selectedGroups}
          level={item.level + 1}
          editing={true}
          onClose={(groups) => {
            setModifiersOpen(false);
            // update item
            setState(prev => ({
              ...prev,
              cart: prev.cart.map((cItem, cIndex) => {
                if (cIndex === index) {
                  cItem.selectedGroups = groups;
                }

                return cItem;
              })
            }))
          }}
        />
      )}
      {isCommentKeyboardOpen && (
        <VirtualKeyboard
          open={isCommentKeyboardOpen}
          onClose={() => {
            setCommentKeyboardOpen(false);
            setState(prev => ({
              ...prev,
              cart: prev.cart.map((_item) => {
                if (item.id === _item.id) {
                  _item.comments = commentText;
                }
                return _item;
              })
            }));
          }}
          type="text"
          placeholder={t('seats.addComment')}
          value={commentText}
          onChange={(v) => setCommentText(v)}
        />
      )}
    </>
  );
}