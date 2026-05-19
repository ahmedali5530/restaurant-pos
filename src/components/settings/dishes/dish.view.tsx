import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Dish} from "@/api/model/dish.ts";
import React, {useEffect, useMemo, useState} from "react";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {detectMimeType} from "@/utils/files.ts";
import defaultImage from "@/assets/images/default-image.png";
import {withCurrency} from "@/lib/utils.ts";

interface Props {
  open: boolean
  onClose: () => void;
  data: Dish
}

interface DishModifierGroupRow {
  id: string
  out: {
    id: string
    name: string
    modifiers?: {
      id: string
      modifier?: {
        id: string
        name: string
      }
      price?: number
    }[]
  }
  required_modifiers?: number
  should_auto_open?: boolean
  has_required_modifiers?: boolean
  should_auto_select?: boolean
  priority?: number
}

interface DishRecipeRow {
  id: string
  item?: {
    id: string
    name: string
  }
  quantity: number
  cost: number
  is_price_locked?: boolean
}

export const DishView = ({
  open, onClose, data
}: Props) => {
  const db = useDB();
  const [modifierGroups, setModifierGroups] = useState<DishModifierGroupRow[]>([]);
  const [recipes, setRecipes] = useState<DishRecipeRow[]>([]);
  const [imageSrc, setImageSrc] = useState(defaultImage);

  const categories = useMemo(() => data?.categories ?? [], [data?.categories]);
  const usedAsModifier = useMemo(() => {
    const source = (data as any)?.modifier_items;
    return Array.isArray(source) ? source : [];
  }, [data]);
  const totalRecipeCost = useMemo(() => {
    return recipes.reduce((sum, recipe) => {
      const quantity = Number(recipe.quantity ?? 0);
      const cost = Number(recipe.cost ?? 0);
      return sum + quantity * cost;
    }, 0);
  }, [recipes]);

  useEffect(() => {
    if (!open || !data?.id) {
      return;
    }

    let cancelled = false;
    const loadModifierGroups = async () => {
      try {
        const [record]: any = await db.query(
          `SELECT * FROM ${Tables.dish_modifier_groups}
           WHERE in = $dish
           FETCH out, out.modifiers, out.modifiers.modifier`,
          {dish: data.id}
        );

        if (!cancelled) {
          setModifierGroups(record ?? []);
        }
      } catch {
        if (!cancelled) {
          setModifierGroups([]);
        }
      }
    };

    const loadRecipes = async () => {
      try {
        const [record]: any = await db.query(
          `SELECT * FROM ${Tables.dishes_recipes}
           WHERE menu_item = $dish
           FETCH item`,
          {dish: data.id}
        );

        if (!cancelled) {
          setRecipes(record ?? []);
        }
      } catch {
        if (!cancelled) {
          setRecipes([]);
        }
      }
    };

    loadModifierGroups();
    loadRecipes();

    return () => {
      cancelled = true;
    };
  }, [open, data?.id]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const resolveDishPhoto = async () => {
      try {
        if (data?.photo instanceof ArrayBuffer) {
          const mimeType = detectMimeType(data.photo, "image/png");
          objectUrl = URL.createObjectURL(new Blob([data.photo], {type: mimeType}));
          if (!cancelled) {
            setImageSrc(objectUrl);
          }
          return;
        }

        const dishPhotoId = data?.dish_photo?.toString();
        if (!dishPhotoId) {
          setImageSrc(defaultImage);
          return;
        }

        const [photo] = await db.query(`SELECT * FROM ONLY ${dishPhotoId}`);
        if (!photo?.content || !(photo.content instanceof ArrayBuffer)) {
          if (!cancelled) {
            setImageSrc(defaultImage);
          }
          return;
        }

        const mimeType = detectMimeType(photo.content, "image/png");
        objectUrl = URL.createObjectURL(new Blob([photo.content], {type: mimeType}));
        if (!cancelled) {
          setImageSrc(objectUrl);
        }
      } catch {
        if (!cancelled) {
          setImageSrc(defaultImage);
        }
      }
    };

    resolveDishPhoto();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [open, data]);

  const closeModal = () => {
    onClose();
  }

  return (
    <>
      <Modal
        title={`View ${data.name}`}
        open={open}
        onClose={closeModal}
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              className="rounded-lg border border-neutral-200 bg-white p-3 flex items-center justify-center min-h-[220px] md:col-span-1">
              <img
                src={imageSrc}
                alt={data.name}
                className="max-h-[260px] w-full object-contain rounded-md"
              />
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4 md:col-span-2">
              <h4 className="font-semibold text-lg mb-3">Dish details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-neutral-500">Name</p>
                  <p className="font-medium">{data.name || '-'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Number</p>
                  <p className="font-medium">{data.number || '-'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Priority</p>
                  <p className="font-medium">{data.priority ?? '-'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Sale price</p>
                  <p className="font-medium">{withCurrency(data.price ?? 0)}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Cost price</p>
                  <p className="font-medium">{withCurrency(data.cost ?? 0)}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Discount</p>
                  <p className="font-medium">{data.discount ?? '-'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Allow half</p>
                  <p className="font-medium">{data.allow_half ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-neutral-500">Allow service charges</p>
                  <p className="font-medium">{data.allow_service_charges ? 'Yes' : 'No'}</p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-neutral-500 text-sm mb-2">Categories</p>
                {categories.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {categories.map((category) => (
                      <span className="tag" key={category.id}>{category.name}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-medium">-</p>
                )}
              </div>

              <div className="mt-4">
                <p className="text-neutral-500 text-sm mb-2">Used as modifier</p>
                {usedAsModifier.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {usedAsModifier.map((item: { name?: string }, index: number) => (
                      <span className="tag" key={`used-as-modifier-${index}`}>{item?.name ?? '-'}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-medium">-</p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h4 className="font-semibold text-lg mb-3">Attached modifier groups</h4>

            {modifierGroups.length === 0 ? (
              <p className="text-sm text-neutral-500">No modifier groups attached.</p>
            ) : (
              <div className="space-y-3">
                {modifierGroups.map((group) => (
                  <div key={group.id} className="rounded-md border border-neutral-200 p-3">
                    <div className="flex flex-wrap gap-2 items-center mb-2">
                      <span className="font-medium">{group.out?.name ?? '-'}</span>
                      <span className="tag">Priority: {group.priority ?? 0}</span>
                      <span className="tag">Auto open: {group.should_auto_open ? 'Yes' : 'No'}</span>
                      <span className="tag">Auto select: {group.should_auto_select ? 'Yes' : 'No'}</span>
                      <span className="tag">Has required: {group.has_required_modifiers ? 'Yes' : 'No'}</span>
                      <span className="tag">Required count: {group.required_modifiers ?? 0}</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(group.out?.modifiers ?? []).length > 0 ? (
                        group.out.modifiers.map((modifier) => (
                          <span key={modifier.id} className="tag">
                            {modifier.modifier?.name ?? '-'} ({withCurrency(modifier.price ?? 0)})
                          </span>
                        ))
                      ) : (
                        <p className="text-sm text-neutral-500">No modifiers in this group.</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h4 className="font-semibold text-lg mb-3">Recipe items</h4>

            {recipes.length === 0 ? (
              <p className="text-sm text-neutral-500">No recipe items attached.</p>
            ) : (
              <>
                <div className="overflow-auto">
                  <table className="table-auto w-full">
                    <thead>
                    <tr className="text-left border-b border-neutral-200">
                      <th className="py-2">Item</th>
                      <th className="py-2">Quantity</th>
                      <th className="py-2">Cost</th>
                      <th className="py-2">Price locked</th>
                      <th className="py-2">Line total</th>
                    </tr>
                    </thead>
                    <tbody>
                    {recipes.map((recipe) => {
                      const quantity = Number(recipe.quantity ?? 0);
                      const cost = Number(recipe.cost ?? 0);
                      const lineTotal = quantity * cost;
                      return (
                        <tr key={recipe.id} className="border-b border-neutral-100">
                          <td className="py-2">{recipe.item?.name ?? '-'}</td>
                          <td className="py-2">{quantity}</td>
                          <td className="py-2">{withCurrency(cost)}</td>
                          <td className="py-2">{recipe.is_price_locked ? 'Yes' : 'No'}</td>
                          <td className="py-2">{withCurrency(lineTotal)}</td>
                        </tr>
                      );
                    })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex justify-end">
                  <span className="tag">Total recipe cost: {withCurrency(totalRecipeCost)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
