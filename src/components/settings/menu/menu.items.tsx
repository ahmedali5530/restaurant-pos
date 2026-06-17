import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Controller, useForm, useWatch} from "react-hook-form";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Menu, MenuMenuItem} from "@/api/model/menu.ts";
import {toast} from 'sonner';
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import React, {useEffect, useMemo, useState} from "react";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Dish} from "@/api/model/dish.ts";
import {Tax} from "@/api/model/tax.ts";
import {Category} from "@/api/model/category.ts";
import {StringRecordId} from "surrealdb";
import _ from "lodash";
import {Switch} from "@/components/common/input/switch.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useTranslation} from 'react-i18next';
import {faArrowLeft} from "@fortawesome/free-solid-svg-icons";

interface Props {
  open: boolean
  onClose: () => void;
  menu?: Menu
}

interface MenuItemFormValue {
  id: string;
  item_name: string;
  dish_id: string;
  price?: number;
  org_price: number
  tax?: { label: string; value: string } | null;
  active?: boolean;
  menu_menu_item_id?: string; // ID of the menu_item_item record if it exists
}

type PriceAdjustmentMode = 'percent' | 'fixed';

type CategoryAdjustment = {
  factor: string;
  mode: PriceAdjustmentMode;
};

const DEFAULT_CATEGORY_ADJUSTMENT: CategoryAdjustment = {
  factor: '',
  mode: 'percent',
};

function adjustPrice(current: number, factor: number, mode: PriceAdjustmentMode): number {
  const raw = mode === 'percent'
    ? current * (1 + factor / 100)
    : current + factor;
  return Math.max(0, Math.round(raw * 100) / 100);
}

const validationSchema = yup.object({
  items: yup.array().of(
    yup.object({
      item_name: yup.string(),
      dish_id: yup.string().required(),
      price: yup.number().nullable(),
      tax: yup.object().nullable(),
      active: yup.boolean(),
      menu_menu_item_id: yup.string().nullable()
    })
  )
});

export const MenuItems = ({
  open, onClose, menu
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const db = useDB();
  const [loading, setLoading] = useState(false);
  const [categoryAdjustments, setCategoryAdjustments] = useState<Record<string, CategoryAdjustment>>({});

  const {
    data: dishes,
    fetchData: fetchDishes,
    isFetching: loadingDishes
  } = useApi<SettingsData<Dish>>(Tables.dishes, [], ['priority asc'], 0, 99999, ['categories'], {
    enabled: false
  });

  const {
    data: taxes,
    fetchData: fetchTaxes,
    isFetching: loadingTaxes
  } = useApi<SettingsData<Tax>>(Tables.taxes, [], [], 0, 99999, [], {
    enabled: false
  });

  const {
    data: categories,
    fetchData: fetchCategories,
    isFetching: loadingCategories
  } = useApi<SettingsData<Category>>(Tables.categories, [], ['priority asc'], 0, 99999, [], {
    enabled: false
  });

  const taxOptions = useMemo(() => {
    return taxes?.data.map(item => ({
      label: `${item.name} (${item.rate}%)`,
      value: item.id
    })) || [];
  }, [taxes?.data]);

  const {control, handleSubmit, formState: {errors}, reset, setValue} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      items: [] as MenuItemFormValue[]
    }
  });

  const formItems = useWatch({control, name: "items"}) || [];

  useEffect(() => {
    if (open) {
      fetchDishes();
      fetchTaxes();
      fetchCategories();
    }
  }, [open]);

  useEffect(() => {
    if (dishes?.data && dishes.data.length > 0) {
      // Create a map of existing menu items by dish id for quick lookup
      const existingItemsMap = new Map<string, MenuMenuItem>();
      if (menu?.items) {
        menu.items.forEach((item: MenuMenuItem) => {
          if (item?.menu_item?.id) {
            existingItemsMap.set(item.menu_item.id.toString(), item);
          }
        });
      }

      // Create form items for all dishes
      const items = dishes.data.map((dish: Dish) => {
        const existingItem = existingItemsMap.get(dish.id.toString());
        return {
          id: existingItem?.id,
          item_name: dish.name,
          dish_id: dish.id,
          menu_menu_item_id: existingItem?.id || undefined,
          price: existingItem?.price !== undefined && existingItem?.price !== null ? existingItem.price : dish.price || 0,
          org_price: dish.price,
          tax: existingItem?.tax ? {
            label: `${existingItem.tax.name} (${existingItem.tax.rate}%)`,
            value: existingItem.tax.id
          } : (dish.tax ? {
            label: `${dish.tax.name} (${dish.tax.rate}%)`,
            value: dish.tax.id
          } : null),
          active: existingItem?.active !== undefined ? existingItem.active : true
        };
      });
      reset({items});
    }
  }, [dishes?.data, menu, reset]);

  const closeModal = () => {
    onClose();
    reset({items: []});
    setCategoryAdjustments({});
  }

  const getCategoryAdjustment = (categoryId: string): CategoryAdjustment => {
    return categoryAdjustments[categoryId] ?? DEFAULT_CATEGORY_ADJUSTMENT;
  };

  const updateCategoryAdjustment = (
    categoryId: string,
    partial: Partial<CategoryAdjustment>
  ) => {
    setCategoryAdjustments((prev) => ({
      ...prev,
      [categoryId]: {
        ...(prev[categoryId] ?? DEFAULT_CATEGORY_ADJUSTMENT),
        ...partial,
      },
    }));
  };

  const onSubmit = async (values: any) => {
    if (!menu?.id) {
      toast.error(t('toast:admin.menuNotFound'));
      return;
    }

    setLoading(true);
    try {
      // Delete existing menu_menu_item records for this menu
      if (menu.items && menu.items.length > 0) {
        console.log(menu.items)
        await Promise.all(
          menu.items
            .map(item => db.delete(item.id!))
        );
      }

      // Create new menu_item_item records for all items (active and inactive) and collect their IDs
      const itemRefs = [];

      for (const item of values.items) {
        const menuMenuItemData: any = {
          menu_item: new StringRecordId(item.dish_id)
        };

        if (item.price !== undefined && item.price !== null && item.price !== '') {
          menuMenuItemData.price = parseFloat(item.price.toString());
        }

        if (item.tax) {
          menuMenuItemData.tax = new StringRecordId(item.tax.value);
        }

        if (item.active !== undefined) {
          menuMenuItemData.active = item.active;
        } else {
          menuMenuItemData.active = true; // Default to active if not specified
        }

        const [created] = await db.create(Tables.menu_menu_items, menuMenuItemData);

        if (created?.id) {
          itemRefs.push(new StringRecordId(created.id.toString()));
        }
      }

      // Update menu with references to menu_item_item records
      await db.merge(new StringRecordId(menu.id.toString()), {
        items: itemRefs
      });

      closeModal();
      toast.success(t('toast:admin.menuItemsSaved'));
    } catch (e) {
      toast.error(String(e));
      console.log(e);
    } finally {
      setLoading(false);
    }
  }

  const items = formItems.length > 0 ? formItems : [];

  // Group items by category
  const groupedItems = useMemo(() => {
    if (!dishes?.data || !categories?.data || items.length === 0) {
      return [];
    }

    // Create a map of category ID to category name
    const categoryMap = new Map<string, Category>();
    categories.data.forEach(cat => {
      categoryMap.set(cat.id, cat);
    });

    // Create a map of category to items
    const categoryGroups = new Map<string, { category: Category; items: MenuItemFormValue[] }>();
    const uncategorizedItems: MenuItemFormValue[] = [];

    items.forEach((item: MenuItemFormValue) => {
      // Find the dish to get its categories
      const dish = dishes.data.find(d => d.id === item.dish_id);

      if (dish?.categories && dish.categories.length > 0) {
        // Use the first category (or you could handle multiple categories differently)
        const category = dish.categories[0];
        const categoryId = category.id.toString();

        if (!categoryGroups.has(categoryId)) {
          categoryGroups.set(categoryId, {
            category: category,
            items: []
          });
        }
        categoryGroups.get(categoryId)!.items.push(item);
      } else {
        uncategorizedItems.push(item);
      }
    });

    // Convert map to array and sort by category priority
    const groups = Array.from(categoryGroups.values())
      .sort((a, b) => (a.category.priority || 0) - (b.category.priority || 0));

    // Add uncategorized items at the end if any
    if (uncategorizedItems.length > 0) {
      groups.push({
        category: {id: 'uncategorized', name: 'Uncategorized', priority: 9999} as Category,
        items: uncategorizedItems
      });
    }

    return groups;
  }, [items, dishes?.data, categories?.data]);

  // Create a map to get item index from dish_id
  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item: MenuItemFormValue, index: number) => {
      map.set(item.dish_id, index);
    });
    return map;
  }, [items]);

  const applyCategoryPriceAdjustment = (categoryId: string) => {
    const {factor, mode} = getCategoryAdjustment(categoryId);
    const parsed = parseFloat(factor);
    if (!Number.isFinite(parsed)) {
      toast.error(t('toast:admin.invalidFactor'));
      return;
    }

    const group = groupedItems.find(g => String(g.category.id) === String(categoryId));
    if (!group) return;

    group.items.forEach((item: MenuItemFormValue) => {
      const index = itemIndexMap.get(item.dish_id);
      if (index === undefined) return;
      const current = Number(formItems[index]?.price ?? 0);
      setValue(`items.${index}.price`, adjustPrice(current, parsed, mode), {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
    toast.success(t('toast:admin.menuItemsUpdated', { count: group.items.length }));
  };

  // Handle master switch toggle for a category
  const handleCategoryToggle = (categoryId: string, checked: boolean) => {
    const group = groupedItems.find(g => String(g.category.id) === String(categoryId));
    if (!group) return;

    // Update each item in the category using setValue
    group.items.forEach((item: MenuItemFormValue) => {
      const index = itemIndexMap.get(item.dish_id);
      if (index !== undefined) {
        setValue(`items.${index}.active`, checked, {shouldDirty: true, shouldValidate: true});
      }
    });
  };

  // Check if all items in a category are active
  const isCategoryAllActive = (group: { category: Category; items: MenuItemFormValue[] }) => {
    return group.items.every(item => {
      const index = itemIndexMap.get(item.dish_id);
      if (index === undefined) return true;
      const formItem = formItems[index];
      return formItem?.active !== false;
    });
  };

  // Check if any items in a category are active (for indeterminate state)
  const isCategoryAnyActive = (group: { category: Category; items: MenuItemFormValue[] }) => {
    return group.items.some(item => {
      const index = itemIndexMap.get(item.dish_id);
      if (index === undefined) return false;
      const formItem = formItems[index];
      return formItem?.active !== false;
    });
  };

  return (
    <>
      <Modal
        title={menu ? t('forms.manageItemsFor', { name: menu.name }) : t('forms.manageMenuItems')}
        open={open}
        onClose={closeModal}
        size="xl"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <InputError error={_.get(errors, ["items", "message"])}/>

          {loadingDishes && (
            <div className="text-center text-neutral-500 py-8">
              Loading dishes...
            </div>
          )}

          {!loadingDishes && items.length === 0 && (
            <div className="text-center text-neutral-500 py-8">
              No dishes found.
            </div>
          )}

          {!loadingDishes && items.length > 0 && (
            <div className="flex flex-col gap-4 mb-3 max-h-[calc(100vh_-_175px)] overflow-y-auto">
              {groupedItems.map((group) => {
                const allActive = isCategoryAllActive(group);
                const categoryId = String(group.category.id);
                const adjustment = getCategoryAdjustment(categoryId);
                return (
                  <div key={categoryId} className="flex flex-col gap-2">
                    <div
                      className="sticky top-0 bg-white z-10 py-2 border-b-2 border-neutral-900 flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-neutral-900">{group.category.name}</h3>
                      <div className="flex items-center gap-5 flex-row">
                        <div className="flex justify-center items-center flex-row gap-3">
                          <span className="text-neutral-600 whitespace-nowrap">Adjust prices:</span>
                          <Input
                            type="number"
                            className="w-24"
                            placeholder={t('forms.factor')}
                            value={adjustment.factor}
                            onChange={(e) => updateCategoryAdjustment(categoryId, {factor: e.target.value})}
                          />
                          <select
                            className="form-control w-28"
                            value={adjustment.mode}
                            onChange={(e) => updateCategoryAdjustment(categoryId, {
                              mode: e.target.value as PriceAdjustmentMode,
                            })}
                          >
                            <option value="percent">Percent</option>
                            <option value="fixed">Fixed</option>
                          </select>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => applyCategoryPriceAdjustment(categoryId)}
                          >
                            Apply
                          </Button>
                        </div>
                        <div className="v-separator w-[3px] h-[42px]"></div>
                        <Switch
                          checked={allActive}
                          onChange={(event) => handleCategoryToggle(categoryId, event.currentTarget.checked)}
                        >
                          Toggle All
                        </Switch>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {group.items.map((item: MenuItemFormValue) => {
                        const index = itemIndexMap.get(item.dish_id) ?? 0;
                        return (
                          <div className="flex flex-col gap-3 rounded-lg hover:bg-neutral-200"
                               key={item.dish_id}>
                            <div className="flex gap-3 items-end">
                              <div className="flex-1">
                                <Input
                                  label={t('forms.itemName')}
                                  value={item.item_name || ''}
                                  readOnly
                                  disabled
                                />
                              </div>
                              <div className="flex-1">
                                <Controller
                                  name={`items.${index}.price`}
                                  control={control}
                                  render={({field}) => (
                                    <Input
                                      label={t('common:actions.price')}
                                      type="number"
                                      value={field.value as number | string | undefined}
                                      onChange={field.onChange}
                                      error={_.get(errors, ["items", index, "price", "message"])}
                                    />
                                  )}
                                />
                              </div>
                              <div className="flex-1">
                                {item.org_price !== item.price && (
                                  <div>
                                    <label htmlFor="">{t('forms.orgPrice')}</label>
                                    <div className="input-group">
                                      <button
                                        className="btn btn-secondary"
                                        onClick={() => {
                                          setValue(`items.${index}.price`, item.org_price)
                                        }}
                                      >
                                        <FontAwesomeIcon icon={faArrowLeft}/>
                                      </button>
                                      <input
                                        value={item.org_price}
                                        disabled
                                        className="form-control"
                                      />
                                    </div>
                                  </div>
                                )}

                              </div>
                              {/*<div className="flex-1">
                              <label>{t('columns.tax')}</label>
                              <Controller
                                name={`items.${index}.tax`}
                                control={control}
                                render={({field}) => (
                                  <ReactSelect
                                    value={field.value}
                                    onChange={field.onChange}
                                    options={taxOptions}
                                    isLoading={loadingTaxes}
                                    isClearable
                                  />
                                )}
                              />
                              <InputError error={_.get(errors, ["items", index, "tax", "message"])}/>
                            </div>*/}
                              <div className="flex-1">
                                <Controller
                                  name={`items.${index}.active`}
                                  control={control}
                                  render={({field}) => (
                                    <div className="pt-6">
                                      <Switch
                                        checked={field.value !== undefined ? Boolean(field.value) : true}
                                        onChange={(checked) => field.onChange(checked)}
                                      >
                                        Active
                                      </Switch>
                                    </div>
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <Button type="submit" variant="primary" disabled={loading || items.length === 0}>
              Save
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

