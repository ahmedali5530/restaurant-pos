import {withCurrency} from "@/lib/utils.ts";
import {Dish} from "@/api/model/dish.ts";
import {useCallback, useEffect, useMemo, useState} from "react";
import {useAtom} from "jotai";
import {appSettings, appState} from "@/store/jotai.ts";
import {MenuDishModifiers} from "@/components/menu/modifiers.tsx";
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

const dishImageCache = new Map<string, string>();

interface Props {
  onClick: (item: MenuItem, groups?: CartModifierGroup[], price?: number) => void
  item: Dish
  level: number
  isModifier?: boolean
  price: number
  allowedNextGroupIds?: string[]
  parentModifier?: Modifier
}

export const MenuDish = ({
  onClick,
  item,
  level,
  isModifier,
  price,
  allowedNextGroupIds,
  parentModifier,
}: Props) => {
  const [state] = useAtom(appState);
  const [{groups_dishes}] = useAtom(appSettings);
  const db = useDB();

  const [modifiersModal, setModifiersModal] = useState(false);
  const [imageSrc, setImageSrc] = useState(defaultImage);

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
        parentModifier
      );
    }

    return buildCartModifierGroups(modifierGroups, level, categoryForGroup, parentModifier);
  }, [
    allowedNextGroupIds,
    item.id,
    groups_dishes,
    level,
    categoryForGroup,
    parentModifier,
    modifierGroups,
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
        const [photo] = await db.query(`SELECT * FROM ONLY ${dishPhotoId}`);
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
        className="flex justify-center p-1 relative select-none"
        role="button"
        tabIndex={0}
        onClick={() => {
          if (modifierGroups.length > 0 && hasAutoOpen) {
            setModifiersModal(true)
          } else {
            onClick({
              quantity: 1,
              dish: item,
              seat: state.seat,
              id: nanoid(),
              level: level,
              selectedGroups: [],
              newOrOld: MenuItemType.new,
              category: state.category ? state.category?.name : (item.categories.length === 1 ? item.categories[0].name : ''),
              price: price,
              menu_name: item.menu_name
            }, undefined, price)
          }
        }}
      >
        <div
          className="flex-1 bg-white w-fit rounded-xl shadow-lg cursor-pointer menu-item active:shadow-none flex text-neutral-900 active:text-warning-500"
          style={{
            '--padding': '0'
          } as any}
        >
          <div className="flex-shrink-0 flex justify-start">
            <img
              loading="lazy"
              src={imageSrc}
              alt={item.name}
              className="rounded-xl rounded-r-none pointer-events-none h-full w-[90px] xl:w-[120px] object-contain"/>
          </div>
          <div className="flex flex-1 flex-col px-3 py-2">
            <span className="flex flex-row gap-2 mb-1">
              <span
                className="bg-neutral-900 text-warning-500 rounded-full border-2 border-warning-500 py-1 px-3 text-sm font-bold">{withCurrency(price)}</span>
            </span>
            <h6 className="text-ellipsis line-clamp-2 flex-shrink flex-grow-0 text-pretty text-neutral-700"
                title={item.name}>
              {item.name}
            </h6>
          </div>
        </div>
        <span className="absolute bottom-2 right-2 text-primary-500 text-xs font-bold">{dishCount(item)}</span>
      </div>

      {modifierGroups.length > 0 && modifiersModal && (
        <MenuDishModifiers
          dish={item}
          isOpen={modifiersModal}
          groups={cartModifierGroups}
          onClose={(payload) => {
            if (payload.length > 0) {
              const clonedGroups = cloneCartModifierGroups(payload);
              onClick({
                dish: item,
                seat: state.seat,
                quantity: 1,
                selectedGroups: clonedGroups,
                id: nanoid(),
                isModifier,
                level: level,
                newOrOld: MenuItemType.new,
                category: state.category ? state.category?.name : (item.categories.length === 1 ? item.categories[0].name : ''),
                price: price,
                menu_name: item.menu_name
              }, clonedGroups, price);
            }
            setModifiersModal(false);
          }}
          level={level + 1}
        />
      )}
    </>
  )
}
