import {cn, withCurrency} from "@/lib/utils.ts";
import {Dish} from "@/api/model/dish.ts";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useAtom} from "jotai";
import {appSettings, appState, appPage} from "@/store/jotai.ts";
import {MenuDishModifiers} from "@/components/menu/modifiers.tsx";
import {DishQtyPrompt, dishAsksQuantity} from "@/components/menu/qty-prompt.tsx";
import {CartModifierGroup, MenuItem, MenuItemType} from "@/api/model/cart_item.ts";
import {nanoid} from "nanoid";
import {detectMimeType} from "@/utils/files.ts";
import defaultImage from '@/assets/images/default-image.png';
import {useDB} from "@/api/db/db.ts";
import {
  buildCartModifierGroups,
  buildNestedGroupsForModifier,
  cloneCartModifierGroups,
} from "@/lib/modifier-groups.ts";
import {Modifier} from "@/api/model/modifier.ts";
import {DishModifierGroup} from "@/api/model/dish_modifier_group.ts";
import {MenuModifierOverrides} from "@/api/model/menu.ts";
import {get} from 'idb-keyval'
import {Tables} from "@/api/db/tables.ts";
import {
  canAddDishQty,
  canAddModifierOptionQty,
  dishSoldMapAtom,
  getRemainingQty,
  lookupModifierAvailability,
  modifierContextualSoldMapAtom,
  soldFromContextualMap,
  soldFromMap,
  withLiveAvailability,
} from "@/lib/dish-availability.ts";
import {toast} from "sonner";
import {useTranslation} from "react-i18next";

const dishImageCache = new Map<string, string>();

interface Props {
  onClick: (item: MenuItem, groups?: CartModifierGroup[], price?: number) => void
  item: Dish
  level: number
  isModifier?: boolean
  price: number
  allowedNextGroupIds?: string[]
  parentModifier?: Modifier
  /** Root dish menu overrides (needed when item is a nested modifier dish) */
  menuModifierOverrides?: MenuModifierOverrides | null
  /** Immediate parent dish id when rendering a modifier option tile. */
  parentDishId?: string
}

export const MenuDish = ({
  onClick,
  item,
  level,
  isModifier,
  price,
  allowedNextGroupIds,
  parentModifier,
  menuModifierOverrides,
  parentDishId,
}: Props) => {
  const [state] = useAtom(appState);
  const [{groups_dishes, dishes: catalogDishes, modifier_availability}] = useAtom(appSettings);
  const [page] = useAtom(appPage);
  const [soldMap] = useAtom(dishSoldMapAtom);
  const [contextualSoldMap] = useAtom(modifierContextualSoldMapAtom);
  const {t} = useTranslation(["menu", "toast"]);
  const db = useDB();
  const showDishNumber = page.menuConfig?.showDishNumber !== false;
  const enforceLimits = state.enforceItemAvailability !== false;
  const liveItem = withLiveAvailability(catalogDishes, item) ?? item;
  const sold = soldFromMap(soldMap, item.id);
  const modifierOverride =
    isModifier && parentDishId
      ? lookupModifierAvailability(modifier_availability, parentDishId, String(item.id ?? ""))
      : undefined;
  const contextualSold =
    isModifier && parentDishId
      ? soldFromContextualMap(contextualSoldMap, parentDishId, String(item.id ?? ""))
      : 0;
  const addCheck =
    isModifier && parentDishId
      ? canAddModifierOptionQty({
          parentDishId,
          optionDish: liveItem,
          globalSold: sold,
          contextualSold,
          cart: state.cart,
          addQty: 1,
          enforceLimits,
          override: modifierOverride,
        })
      : canAddDishQty({
          dish: liveItem,
          sold,
          cart: state.cart,
          addQty: 1,
          enforceLimits,
        });
  const blocked = !addCheck.ok;
  const globalRemaining = enforceLimits
    ? getRemainingQty({dish: liveItem, sold, cart: state.cart})
    : null;
  const contextualRemaining =
    enforceLimits &&
    isModifier &&
    parentDishId &&
    modifierOverride?.available_qty != null
      ? addCheck.remaining
      : null;
  const remaining =
    contextualRemaining != null
      ? globalRemaining == null
        ? contextualRemaining
        : Math.min(globalRemaining, contextualRemaining)
      : globalRemaining;

  const [modifiersModal, setModifiersModal] = useState(false);
  const [qtyPromptOpen, setQtyPromptOpen] = useState(false);
  const [pendingQtyGroups, setPendingQtyGroups] = useState<CartModifierGroup[] | undefined>(undefined);
  const [imageSrc, setImageSrc] = useState(defaultImage);
  const shouldAskQty = !isModifier && dishAsksQuantity(liveItem);

  const resolvedMenuOverrides = menuModifierOverrides ?? item.menu_modifier_overrides ?? null;

  const categoryForGroup = useCallback((grp: DishModifierGroup) => {
    return state.category
      ? state.category.name
      : (grp.in?.categories?.length === 1 ? grp.in.categories[0].name : '');
  }, [state.category]);

  const modifierGroups = useMemo(() => {
    const allGroups = groups_dishes.filter((a) => a.in.id.toString() === item.id.toString());

    if (allowedNextGroupIds === undefined) {
      return allGroups;
    }

    return allGroups.filter((g) => allowedNextGroupIds.includes(g.out.id.toString()));
  }, [item.id, groups_dishes, allowedNextGroupIds]);

  const cartModifierGroups = useMemo(() => {
    if (allowedNextGroupIds !== undefined) {
      return buildNestedGroupsForModifier(
        item.id.toString(),
        allowedNextGroupIds,
        groups_dishes,
        level,
        categoryForGroup,
        parentModifier,
        resolvedMenuOverrides
      );
    }

    return buildCartModifierGroups(
      modifierGroups,
      level,
      categoryForGroup,
      parentModifier,
      resolvedMenuOverrides
    );
  }, [
    allowedNextGroupIds,
    item.id,
    groups_dishes,
    level,
    categoryForGroup,
    parentModifier,
    modifierGroups,
    resolvedMenuOverrides,
  ]);

  const hasAutoOpen = useMemo(() => {
    return modifierGroups.filter(m => m.has_required_modifiers || m.should_auto_open).length > 0;
  }, [modifierGroups]);


  const dishCount = useCallback((dish: Dish) => {
    if (isModifier) {
      return null;
    }

    return state.cart.filter(item => item.dish === dish).reduce((prev, item) => prev + item.quantity, 0)
  }, [state.cart]);

  const menuTaxFields = useMemo(() => ({
    tax_mode: item.tax_mode ?? 'exclusive',
    taxes: item.taxes,
  }), [item.tax_mode, item.taxes]);

  const emitAdd = useCallback(
    (quantity: number, groups?: CartModifierGroup[]) => {
      const qty = Math.max(1, Math.floor(Number(quantity) || 1));
      const check =
        isModifier && parentDishId
          ? canAddModifierOptionQty({
              parentDishId,
              optionDish: liveItem,
              globalSold: sold,
              contextualSold,
              cart: state.cart,
              addQty: qty,
              enforceLimits,
              override: modifierOverride,
            })
          : canAddDishQty({
              dish: liveItem,
              sold,
              cart: state.cart,
              addQty: qty,
              enforceLimits,
            });
      if (!check.ok) {
        if (check.reason === "unavailable") {
          toast.warning(t("menu:availability.unavailable", {name: item.name}));
        } else {
          toast.warning(
            t("menu:availability.onlyNLeft", {
              name: item.name,
              count: check.remaining ?? 0,
            }),
          );
        }
        return;
      }
      const selectedGroups = groups ? cloneCartModifierGroups(groups) : [];
      onClick(
        {
          quantity: qty,
          dish: item,
          seat: state.seat,
          id: nanoid(),
          level: level,
          selectedGroups,
          isModifier,
          newOrOld: MenuItemType.new,
          category: state.category
            ? state.category?.name
            : item.categories?.length === 1
              ? item.categories[0].name
              : "",
          category_id: state.category?.id?.toString(),
          price: price,
          menu_name: item.menu_name,
          ...menuTaxFields,
        },
        selectedGroups.length ? selectedGroups : undefined,
        price,
      );
    },
    [
      contextualSold,
      enforceLimits,
      isModifier,
      item,
      level,
      liveItem,
      menuTaxFields,
      modifierOverride,
      onClick,
      parentDishId,
      price,
      sold,
      state.cart,
      state.category,
      state.seat,
      t,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const dishPhotoId = item?.dish_photo?.toString();

    if (!dishPhotoId) {
      setImageSrc(defaultImage);
      return;
    }

    const cachedImage = dishImageCache.get(dishPhotoId);
    if (cachedImage) {
      setImageSrc(cachedImage);
      return;
    }

    const loadImage = async () => {
      try {
        const images = await get(Tables.documents);

        if(Array.isArray(images)){
          const photo = images.find(image => image.id.toString() === dishPhotoId);

          if (!photo?.content || !(photo.content instanceof ArrayBuffer)) {
            if (!cancelled) {
              setImageSrc(defaultImage);
            }
            return;
          }

          const mimeType = detectMimeType(photo.content, "image/png");
          const blob = new Blob([photo.content], {type: mimeType});
          const objectUrl = URL.createObjectURL(blob);
          dishImageCache.set(dishPhotoId, objectUrl);

          if (!cancelled) {
            setImageSrc(objectUrl);
          }
        }

      } catch {
        if (!cancelled) {
          setImageSrc(defaultImage);
        }
      }
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [item?.dish_photo]);

  return (
    <>
      <div
        className={cn(
          "flex justify-center p-1 relative select-none",
          blocked && "opacity-50",
        )}
        role="button"
        tabIndex={0}
        data-testid="menu-dish"
        data-dish-name={item.name}
        data-unavailable={blocked ? "true" : undefined}
        aria-disabled={blocked || undefined}
        onClick={() => {
          if (blocked) {
            if (addCheck.reason === "unavailable") {
              toast.warning(t("menu:availability.unavailable", {name: item.name}));
            } else {
              toast.warning(
                t("menu:availability.onlyNLeft", {
                  name: item.name,
                  count: addCheck.remaining ?? 0,
                }),
              );
            }
            return;
          }
          if (modifierGroups.length > 0 && hasAutoOpen) {
            setModifiersModal(true);
          } else if (shouldAskQty) {
            setPendingQtyGroups(undefined);
            setQtyPromptOpen(true);
          } else {
            emitAdd(1);
          }
        }}
      >
        <div
          className={cn(
            "flex-1 bg-surface-elevated w-fit rounded-xl shadow-lg cursor-pointer menu-item active:shadow-none flex text-foreground active:text-warning",
            blocked && "cursor-not-allowed",
          )}
          style={{
            '--padding': '0'
          } as any}
        >
          <div className="flex-shrink-0 flex justify-start">
            <img
              loading="lazy"
              src={imageSrc}
              alt={item.name}
              className="rounded-xl rounded-r-none pointer-events-none h-full sm:w-[50px] md:w-[60px] lg:w-[90px] xl:w-[100px] object-cover"/>
          </div>
          <div className="flex flex-1 flex-col px-3 py-2">
            <span className="flex flex-row gap-2 mb-1 flex-wrap">
              {showDishNumber && item.number != null && String(item.number).trim() !== '' && (
                <span
                  className="bg-primary-100 text-primary-700 rounded-full border-2 border-primary-300 py-1 px-3 text-sm font-bold"
                  title={String(item.number)}
                >
                  #{String(item.number).trim()}
                </span>
              )}
              <span
                className="bg-neutral-900 text-warning rounded-full border-2 border-warning py-1 px-3 text-sm font-bold">{withCurrency(price)}</span>
            </span>
            <h6 className="text-ellipsis line-clamp-2 flex-shrink flex-grow-0 text-pretty text-foreground"
                title={item.name}>
              {item.name}
            </h6>
            {blocked && (
              <span className="text-xs font-bold text-danger mt-1">
                {t("menu:availability.unavailableBadge")}
              </span>
            )}
            {!blocked && remaining != null && remaining > 0 && (
              <span className="text-xs font-medium text-muted mt-1">
                {t("menu:availability.nLeft", {count: remaining})}
              </span>
            )}
          </div>
        </div>
        <span className="absolute bottom-2 right-2 text-primary text-xs font-bold">{dishCount(item)}</span>
      </div>

      {modifierGroups.length > 0 && modifiersModal && (
        <MenuDishModifiers
          dish={{
            ...item,
            menu_modifier_overrides: resolvedMenuOverrides,
          }}
          isOpen={modifiersModal}
          groups={cartModifierGroups}
          onClose={(payload) => {
            setModifiersModal(false);
            if (payload.length === 0) {
              return;
            }
            const clonedGroups = cloneCartModifierGroups(payload);
            if (shouldAskQty) {
              setPendingQtyGroups(clonedGroups);
              setQtyPromptOpen(true);
              return;
            }
            emitAdd(1, clonedGroups);
          }}
          level={level + 1}
        />
      )}

      {qtyPromptOpen && (
        <DishQtyPrompt
          dish={item}
          open
          onConfirm={(qty) => {
            setQtyPromptOpen(false);
            emitAdd(qty, pendingQtyGroups);
            setPendingQtyGroups(undefined);
          }}
          onCancel={() => {
            setQtyPromptOpen(false);
            setPendingQtyGroups(undefined);
          }}
        />
      )}
    </>
  )
}
