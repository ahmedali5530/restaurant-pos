import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Controller, useForm, useWatch} from "react-hook-form";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {Menu, MenuMenuItem, TaxMode} from "@/api/model/menu.ts";
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
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {calculateInclusiveBasePrice} from "@/lib/tax-calculator.ts";
import {Radio} from "@/components/common/input/radio.tsx";

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
  base_price?: number;
  org_price: number
  tax?: { label: string; value: string } | null;
  taxes?: { label: string; value: string }[] | null;
  tax_mode?: TaxMode;
  active?: boolean;
  menu_menu_item_id?: string; // ID of the menu_item_item record if it exists
}

type PriceAdjustmentMode = 'percent' | 'fixed';
type BulkScope = 'all' | 'categories';

type BulkSettings = {
  scope: BulkScope;
  categoryIds: { label: string; value: string }[];
  tax_mode: TaxMode;
  taxes: { label: string; value: string }[] | null;
  priceFactor: string;
  priceMode: PriceAdjustmentMode;
};

const DEFAULT_BULK_SETTINGS: BulkSettings = {
  scope: 'all',
  categoryIds: [],
  tax_mode: 'exclusive',
  taxes: null,
  priceFactor: '',
  priceMode: 'percent',
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
      base_price: yup.number().nullable(),
      tax: yup.object().nullable(),
      taxes: yup.array().nullable(),
      tax_mode: yup.string().oneOf(['exclusive', 'inclusive']).nullable(),
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
  const [bulkSettings, setBulkSettings] = useState<BulkSettings>(DEFAULT_BULK_SETTINGS);

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
      value: String(item.id),
    })) || [];
  }, [taxes?.data]);

  const bulkCategoryOptions = useMemo(() => {
    const opts = categories?.data?.map(cat => ({
      label: cat.name,
      value: cat.id.toString(),
    })) || [];
    return [...opts, {label: t('forms.uncategorized'), value: 'uncategorized'}];
  }, [categories?.data, t]);

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
        
        // Handle new multi-tax structure
        const taxes = existingItem?.taxes && existingItem.taxes.length > 0
          ? existingItem.taxes.map(t => ({
              label: `${t.name} (${t.rate}%)`,
              value: String(t.id),
            }))
          : (existingItem?.tax ? [{
              label: `${existingItem.tax.name} (${existingItem.tax.rate}%)`,
              value: String(existingItem.tax.id),
            }] : null);

        const taxMode = existingItem?.tax_mode || 'exclusive';
        const price = existingItem?.price !== undefined && existingItem?.price !== null ? existingItem.price : dish.price || 0;
        
        // Calculate base price for inclusive mode
        let basePrice = existingItem?.base_price;
        if (!basePrice && taxMode === 'inclusive' && taxes && taxes.length > 0) {
          const taxObjects = existingItem?.taxes || [];
          basePrice = calculateInclusiveBasePrice(price, taxObjects);
        }
        if (!basePrice) {
          basePrice = price;
        }

        return {
          id: existingItem?.id,
          item_name: dish.name,
          dish_id: dish.id,
          menu_menu_item_id: existingItem?.id || undefined,
          price: price,
          base_price: basePrice,
          org_price: dish.price,
          tax: existingItem?.tax ? {
            label: `${existingItem.tax.name} (${existingItem.tax.rate}%)`,
            value: String(existingItem.tax.id),
          } : (dish.tax ? {
            label: `${dish.tax.name} (${dish.tax.rate}%)`,
            value: String(dish.tax.id),
          } : null),
          taxes: taxes,
          tax_mode: taxMode,
          active: existingItem?.active !== undefined ? existingItem.active : true
        };
      });
      reset({items});
    }
  }, [dishes?.data, menu, reset, taxes?.data]);

  const closeModal = () => {
    onClose();
    reset({items: []});
    setBulkSettings(DEFAULT_BULK_SETTINGS);
  }

  const updateBulkSettings = (partial: Partial<BulkSettings>) => {
    setBulkSettings((prev) => ({...prev, ...partial}));
  };

  const getDishCategoryId = (dishId: string): string | null => {
    const dish = dishes?.data?.find(d => d.id === dishId);
    if (dish?.categories && dish.categories.length > 0) {
      return dish.categories[0].id.toString();
    }
    return null;
  };

  const getBulkTargetIndices = (): number[] => {
    const currentItems = formItems.length > 0 ? formItems : [];
    if (bulkSettings.scope === 'all') {
      return currentItems.map((_, index) => index);
    }

    if (bulkSettings.categoryIds.length === 0) {
      return [];
    }

    const selectedIds = new Set(bulkSettings.categoryIds.map(c => c.value));
    const includeUncategorized = selectedIds.has('uncategorized');

    return currentItems
      .map((item: MenuItemFormValue, index: number) => {
        const categoryId = getDishCategoryId(item.dish_id);
        if (categoryId === null) {
          return includeUncategorized ? index : -1;
        }
        return selectedIds.has(categoryId) ? index : -1;
      })
      .filter(index => index >= 0);
  };

  const applyBulkSettings = () => {
    if (bulkSettings.scope === 'categories' && bulkSettings.categoryIds.length === 0) {
      toast.error(t('toast:admin.selectCategoriesRequired'));
      return;
    }

    const targetIndices = getBulkTargetIndices();
    if (targetIndices.length === 0) {
      return;
    }

    const priceFactorParsed = parseFloat(bulkSettings.priceFactor);
    const applyPriceAdjustment = bulkSettings.priceFactor !== '' && Number.isFinite(priceFactorParsed);

    const taxObjects: Tax[] = (bulkSettings.taxes || [])
      .map(sel => taxes?.data?.find(t => String(t.id) === String(sel.value)))
      .filter((t): t is Tax => Boolean(t));

    targetIndices.forEach(index => {
      let price = Number(formItems[index]?.price ?? 0);

      setValue(`items.${index}.tax_mode`, bulkSettings.tax_mode, {shouldDirty: true, shouldValidate: true});
      setValue(`items.${index}.taxes`, bulkSettings.taxes, {shouldDirty: true, shouldValidate: true});
      setValue(`items.${index}.tax`, null, {shouldDirty: true});

      if (applyPriceAdjustment) {
        price = adjustPrice(price, priceFactorParsed, bulkSettings.priceMode);
        setValue(`items.${index}.price`, price, {shouldDirty: true, shouldValidate: true});
      }

      if (bulkSettings.tax_mode === 'inclusive' && taxObjects.length > 0) {
        setValue(`items.${index}.base_price`, calculateInclusiveBasePrice(price, taxObjects), {
          shouldDirty: true,
          shouldValidate: true,
        });
      } else {
        setValue(`items.${index}.base_price`, price, {shouldDirty: true, shouldValidate: true});
      }
    });

    toast.success(t('toast:admin.menuItemsUpdated', {count: targetIndices.length}));
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

        if (item.base_price !== undefined && item.base_price !== null && item.base_price !== '') {
          menuMenuItemData.base_price = parseFloat(item.base_price.toString());
        }

        // Handle new multi-tax structure
        if (item.taxes && item.taxes.length > 0) {
          menuMenuItemData.taxes = item.taxes.map(t => new StringRecordId(t.value));
        } else if (item.tax) {
          // Fallback to legacy single tax
          menuMenuItemData.tax = new StringRecordId(item.tax.value);
        }

        if (item.tax_mode) {
          menuMenuItemData.tax_mode = item.tax_mode;
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
            <>
              <div className="mb-4 p-4 border border-neutral-300 rounded-lg bg-neutral-50">
                <h3 className="text-lg font-semibold text-neutral-900 mb-3">{t('forms.bulkItemSettings')}</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block mb-1">{t('forms.applyTo')}</label>
                      <div className="flex gap-4">
                        <Radio
                          name="bulkScope"
                          label={t('forms.allItems')}
                          checked={bulkSettings.scope === 'all'}
                          onChange={() => updateBulkSettings({scope: 'all', categoryIds: []})}
                        />
                        <Radio
                          name="bulkScope"
                          label={t('forms.selectedCategories')}
                          checked={bulkSettings.scope === 'categories'}
                          onChange={() => updateBulkSettings({scope: 'categories'})}
                        />
                      </div>
                    </div>
                    {bulkSettings.scope === 'categories' && (
                      <div className="flex-1 min-w-[240px]">
                        <label className="block mb-1">{t('columns.categories')}</label>
                        <ReactSelect
                          value={bulkSettings.categoryIds}
                          onChange={(value) => updateBulkSettings({
                            categoryIds: (value as { label: string; value: string }[]) || [],
                          })}
                          options={bulkCategoryOptions}
                          isMulti
                          isLoading={loadingCategories}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block mb-1">Tax Mode</label>
                      <select
                        className="form-control"
                        value={bulkSettings.tax_mode}
                        onChange={(e) => updateBulkSettings({tax_mode: e.target.value as TaxMode})}
                      >
                        <option value="exclusive">Exclusive</option>
                        <option value="inclusive">Inclusive</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                      <label className="block mb-1">Taxes</label>
                      <ReactSelect
                        value={bulkSettings.taxes}
                        onChange={(value) => updateBulkSettings({
                          taxes: (value as { label: string; value: string }[]) || null,
                        })}
                        options={taxOptions}
                        isLoading={loadingTaxes}
                        isMulti
                        isClearable
                      />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <Input
                        type="number"
                        label={t('forms.factor')}
                        placeholder={t('forms.factor')}
                        value={bulkSettings.priceFactor}
                        onChange={(e) => updateBulkSettings({priceFactor: e.target.value})}
                      />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="block mb-1">{t('forms.priceAdjustmentMode')}</label>
                      <select
                        className="form-control"
                        value={bulkSettings.priceMode}
                        onChange={(e) => updateBulkSettings({
                          priceMode: e.target.value as PriceAdjustmentMode,
                        })}
                      >
                        <option value="percent">Percent</option>
                        <option value="fixed">Fixed</option>
                      </select>
                    </div>
                    <div>
                      <Button type="button" variant="primary" onClick={applyBulkSettings}>
                        {t('forms.applyToItems')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4 mb-3 max-h-[calc(100vh_-_175px)] overflow-y-auto">
              {groupedItems.map((group) => {
                const allActive = isCategoryAllActive(group);
                const categoryId = String(group.category.id);
                return (
                  <div key={categoryId} className="flex flex-col gap-2">
                    <div
                      className="sticky top-0 bg-white z-10 py-2 border-b-2 border-neutral-900 flex items-center justify-between gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-neutral-900">{group.category.name}</h3>
                      <Switch
                        checked={allActive}
                        onChange={(event) => handleCategoryToggle(categoryId, event.currentTarget.checked)}
                      >
                        Toggle All
                      </Switch>
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
                              <div className="flex-1">
                                <label>Tax Mode</label>
                                <Controller
                                  name={`items.${index}.tax_mode`}
                                  control={control}
                                  render={({field}) => (
                                    <select
                                      className="form-control"
                                      value={field.value || 'exclusive'}
                                      onChange={field.onChange}
                                    >
                                      <option value="exclusive">Exclusive</option>
                                      <option value="inclusive">Inclusive</option>
                                    </select>
                                  )}
                                />
                              </div>
                              <div className="flex-1">
                                <label>Taxes</label>
                                <Controller
                                  name={`items.${index}.taxes`}
                                  control={control}
                                  render={({field}) => (
                                    <ReactSelect
                                      value={field.value}
                                      onChange={field.onChange}
                                      options={taxOptions}
                                      isLoading={loadingTaxes}
                                      isMulti
                                      isClearable
                                    />
                                  )}
                                />
                              </div>
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
            </>
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

