import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Dish} from "@/api/model/dish.ts";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Controller, useFieldArray, useForm, useWatch} from "react-hook-form";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useDB} from "@/api/db/db.ts";
import React, {useCallback, useEffect, useState} from "react";
import {Tables} from "@/api/db/tables.ts";
import {Category} from "@/api/model/category.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {CategoryForm} from "@/components/settings/categories/category.form.tsx";
import * as yup from 'yup';
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {ModifierGroup} from "@/api/model/modifier_group.ts";
import {Switch} from "@/components/common/input/switch.tsx";
import _ from "lodash";
import {ModifierGroupForm} from "@/components/settings/modifier_groups/modifier_group.form.tsx";
import {RecordId, StringRecordId} from "surrealdb";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {detectMimeType} from "@/utils/files";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Dish
}

const validationSchema = yup.object({
  name: yup.string().required("This is required"),
  number: yup.string().required("This is required"),
  priority: yup.number().required("This is required").typeError('This should be a number'),
  // position: yup.number().required("This is required").typeError('This should be a number'),
  price: yup.number().required("This is required").typeError('This should be a number'),
  cost: yup.number().required("This is required").typeError('This should be a number'),
  categories: yup.array(yup.object({
    label: yup.string(),
    value: yup.string()
  })).min(1, 'This is required'),
  modifier_groups: yup.array(yup.object({
    modifier_group: yup.object({
      label: yup.string(),
      value: yup.string()
    }).required('This is required'),
    has_required_modifiers: yup.boolean(),
    required_modifiers: yup.number().when('has_required_modifiers', (has_required_modifiers, schema) => {
      if (has_required_modifiers[0]) {
        return schema.min(1, 'This must be greater then 0').required('This is required');
      }

      return schema;
    }),
    should_auto_open: yup.boolean(),
    should_auto_select: yup.boolean(),
    priority: yup.string().required('This is required'),
  })),
  recipes: yup.array(yup.object({
    item: yup.object({
      label: yup.string(),
      value: yup.string()
    }).required('This is required'),
    quantity: yup.number().required('This is required').min(0.01, 'Quantity must be greater than 0'),
    cost: yup.number().required('This is required').min(0, 'Cost must be greater than or equal to 0'),
    is_price_locked: yup.boolean().optional(),
    id: yup.string().nullable().optional()
  })).test('unique-items', 'Each item can only be added once', function (recipes) {
    if (!recipes || recipes.length === 0) return true;
    const itemValues = recipes.map(r => r?.item?.value).filter(Boolean);
    return itemValues.length === new Set(itemValues).size;
  })
});

export const DishForm = ({
  open, onClose, data
}: Props) => {

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoData, setPhotoData] = useState<ArrayBuffer | null>(null);

  const closeModal = () => {
    onClose();

    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoData(null);
  }

  useEffect(() => {
    if (data) {
      reset({
        ...data,
        categories: data.categories.map(item => ({
          label: item.name,
          value: item.id
        })),
        recipes: [],
        modifier_groups: []
      });

      setPhotoFile(null);
      setPhotoData(null);
      if (data.photo) {
        const buffer = data.photo;
        const mimeType = detectMimeType(buffer, "image/png");
        const blob = new Blob([buffer], {type: mimeType});
        setPhotoPreview(URL.createObjectURL(blob));
      }

      getModifierGroups(data.id);
      getRecipes(data.id);
    } else {
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoData(null);
    }
  }, [data]);

  const {
    data: categories,
    fetchData: fetchCategories,
    isFetching: loadingCategories
  } = useApi<SettingsData<Category>>(Tables.categories, [], [], 0, 99999, [], {
    enabled: false
  });

  const {
    data: modifierGroups,
    fetchData: fetchModifierGroups,
    isFetching: loadingModifierGroups
  } = useApi<SettingsData<ModifierGroup>>(Tables.modifier_groups, [], [], 0, 99999, ['modifiers', 'modifiers.modifier'], {
    enabled: false
  });

  const {
    data: inventoryItems,
    fetchData: fetchInventoryItems,
    isFetching: loadingInventoryItems
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 99999, ['category'], {
    enabled: false
  });

  useEffect(() => {
    if (open) {
      fetchCategories();
      fetchModifierGroups();
      fetchInventoryItems();
    }
  }, [open]);

  const getModifierGroups = async (id) => {
    const [record]: any = await db.query(`SELECT *
                                          from ${Tables.dish_modifier_groups}
                                          where in = ${id} fetch out, out.modifiers, out.modifiers.modifier`);


    replace(record.map(item => ({
      modifier_group: {
        label: item.out.name,
        value: item.out.id
      },
      has_required_modifiers: item.has_required_modifiers,
      required_modifiers: item.required_modifiers,
      should_auto_select: item.should_auto_select,
      should_auto_open: item.should_auto_open,
      priority: item.priority
    })));
  }

  const getRecipes = async (id) => {
    try {
      const record: any = await db.query(`SELECT *
                                          FROM ${Tables.dishes_recipes}
                                          WHERE menu_item = $item FETCH item`, {item: id});
      if (record[0] && record[0].length > 0) {

        replaceRecipes(record[0].map(rec => ({
          item: {
            label: rec.item.name,
            value: rec.item.id
          },
          quantity: rec.quantity,
          cost: rec.cost,
          is_price_locked: rec.is_price_locked || false,
          id: rec.id // Store the recipe ID for updates
        })));
      }
    } catch (e) {
      // If recipes don't exist yet, that's fine
      console.log('No recipes found or error loading recipes:', e);
    }
  }

  const [categoriesModal, setCategoriesModal] = useState(false);
  const [modifierGroupsModal, setModifierGroupsModal] = useState(false);

  const db = useDB();

  const {register, control, handleSubmit, formState: {errors}, reset, watch, getValues, setValue} = useForm({
    resolver: yupResolver(validationSchema)
  });

  const {
    fields: modifierGroupFields,
    append, remove, replace
  } = useFieldArray({
    name: 'modifier_groups',
    control: control
  });

  const {
    fields: recipeFields,
    append: appendRecipe,
    remove: removeRecipe,
    replace: replaceRecipes
  } = useFieldArray({
    name: 'recipes',
    control: control
  });

  const onSubmit = async (values: any) => {
    try {
      const formData = {
        ...values,
        // position: parseInt(values.position),
        priority: parseInt(values.priority),
        price: parseFloat(values.price),
        cost: parseFloat(values.cost),
        categories: values?.categories?.map(item => new StringRecordId(item.value.toString()))
      };

      const dishData: any = {
        name: formData.name,
        number: formData.number,
        // position: data.position,
        priority: formData.priority,
        price: formData.price,
        cost: formData.cost,
        categories: formData.categories,
      };


      let menuId: any;
      if (data?.id) {
        menuId = data.id;
        await db.merge(data.id, dishData);
      } else {
        const [record] = await db.create(Tables.dishes, dishData);
        menuId = record.id;
      }

      if (photoData) {
        const [photoId] = await db.create(Tables.documents, {
          content: photoData
        });

        await db.merge(menuId, {
          dish_photo: photoId.id
        });
      }

      if (formData.modifier_groups) {
        // delete graph edges and create again
        await db.query(`DELETE ${menuId}->${Tables.dish_modifier_groups} where in = ${menuId}`);

        for (const modifierGroup of formData.modifier_groups) {
          await db.query(`RELATE ${menuId}->${Tables.dish_modifier_groups}->${modifierGroup.modifier_group.value} set has_required_modifiers = $has_required_modifiers, should_auto_open = $should_auto_open, required_modifiers = $required_modifiers, should_auto_select = $should_auto_select, priority = $priority`, {
            has_required_modifiers: modifierGroup.has_required_modifiers,
            should_auto_open: modifierGroup.should_auto_open,
            required_modifiers: modifierGroup.required_modifiers,
            should_auto_select: modifierGroup.should_auto_select,
            priority: Number(modifierGroup.priority ?? 0)
          });
        }
      }

      // Save recipes as separate records in dishes_recipes table
      if (formData.recipes) {
        // Delete existing recipe records
        await db.query(`DELETE ${Tables.dishes_recipes} WHERE menu_item = $dish`, {dish: menuId});

        // Create new recipe records and collect their IDs
        const recipeIds: RecordId[] = [];
        for (const recipe of formData.recipes) {
          const recipeData = {
            menu_item: menuId,
            item: new StringRecordId(recipe.item.value.toString()),
            quantity: parseFloat(recipe.quantity),
            cost: parseFloat(recipe.cost),
            is_price_locked: recipe.is_price_locked || false
          };
          const [recipeRecord] = await db.create(Tables.dishes_recipes, recipeData);
          recipeIds.push(recipeRecord.id);
        }

        // Update dish with recipe IDs in items field
        await db.merge(menuId, {
          items: recipeIds
        });
      } else {
        // Clear recipes if none provided
        await db.query(`DELETE ${Tables.dishes_recipes} WHERE menu_item = $dish`, {dish: menuId});
        await db.merge(menuId, {
          items: []
        });
      }


      closeModal();
      toast.success(`Dish ${values.name} saved`);
    } catch (e) {
      toast.error(e);
      console.log(e)
    }
  }

  const toggleRequiredField = useCallback((index: number) => {
    return watch(`modifier_groups.${index}.has_required_modifiers`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getValues()]);

  // Watch recipes and calculate total cost
  // Use useWatch to watch the entire recipes array for proper reactivity
  const watchedRecipes = useWatch({
    control,
    name: 'recipes',
    defaultValue: []
  });

  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoData(null);
      return;
    }

    setPhotoFile(file);

    try {
      const buffer = await file.arrayBuffer();
      setPhotoData(buffer);

      const blob = new Blob([buffer], {type: file.type || 'application/octet-stream'});
      const objectUrl = URL.createObjectURL(blob);
      setPhotoPreview(objectUrl);
    } catch (err) {
      console.log('Failed to read photo file', err);
      setPhotoData(null);
      setPhotoPreview(null);
    }
  };

  useEffect(() => {
    if (watchedRecipes && watchedRecipes.length > 0) {
      const totalCost = watchedRecipes.reduce((sum: number, recipe: any) => {
        if (recipe?.quantity !== undefined && recipe?.cost !== undefined) {
          const quantity = parseFloat(String(recipe.quantity)) || 0;
          const cost = parseFloat(String(recipe.cost)) || 0;
          return sum + (quantity * cost);
        }
        return sum;
      }, 0);

      setValue('cost', totalCost, {shouldValidate: false, shouldDirty: false});
    } else {
      // If no recipes, keep the current cost value (don't reset to 0)
      // User can still manually set the cost
    }
  }, [watchedRecipes, setValue]);

  return (
    <>
      <Modal
        title={data ? `Update ${data?.name}` : 'Create new dish'}
        open={open}
        onClose={closeModal}
        size="full"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input label="Name of item" {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>
            <div className="flex-1">
              <Input label="Number of item" {...register('number')} error={errors?.number?.message}/>
            </div>
            <div className="flex-1">
              <Controller
                name="priority"
                control={control}
                render={({field}) => (
                  <Input
                    value={field.value}
                    onChange={field.onChange}
                    type="number"
                    label="Priority"
                    error={errors?.priority?.message}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex gap-3">
            {/*<div className="flex-1">*/}
            {/*  <Controller*/}
            {/*    name="position"*/}
            {/*    control={control}*/}
            {/*    render={({ field }) => (*/}
            {/*      <Input*/}
            {/*        value={field.value}*/}
            {/*        onChange={field.onChange}*/}
            {/*        type="number"*/}
            {/*        label="Position on menu"*/}
            {/*        error={errors?.position?.message}*/}
            {/*      />*/}
            {/*    )}*/}
            {/*  />*/}
            {/*</div>*/}
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Controller
                name="price"
                control={control}
                render={({field}) => (
                  <Input
                    value={field.value}
                    onChange={field.onChange}
                    type="number"
                    label="Sale price"
                    error={errors?.price?.message}
                  />
                )}
              />
            </div>
            <div className="flex-1">
              <Controller
                name="cost"
                control={control}
                render={({field}) => (
                  <Input
                    value={field.value}
                    onChange={field.onChange}
                    type="number"
                    label="Cost of item"
                    error={errors?.cost?.message}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex gap-3 mb-3 items-end">
            <div className="flex-1">
              <label>Categories</label>
              <Controller
                name="categories"
                render={({field}) => (
                  <ReactSelect
                    options={categories?.data?.map(item => ({
                      label: item.name,
                      value: item.id
                    }))}
                    isMulti
                    value={field.value}
                    onChange={field.onChange}
                    isLoading={loadingCategories}
                  />
                )}
                control={control}
              />
              {errors?.categories?.message && <InputError error={errors?.categories?.message}/>}
            </div>
            <div className="flex-0">
              <Button onClick={() => setCategoriesModal(true)} type="button" variant="primary">
                <FontAwesomeIcon icon={faPlus}/>
              </Button>
            </div>
          </div>

          <div className="flex gap-3 mb-3 items-end">
            <div className="flex-1">
              <label className="block mb-1">Photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="block w-full text-sm text-neutral-700
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-full file:border-0
                           file:text-sm file:font-semibold
                           file:bg-neutral-600 file:text-white
                           hover:file:bg-neutral-700"
              />
            </div>
            {photoPreview && (
              <div
                className="w-24 h-24 rounded-lg overflow-hidden border border-neutral-300 flex items-center justify-center bg-neutral-100">
                <img
                  src={photoPreview}
                  alt="Dish photo preview"
                  className="object-cover w-full h-full"
                />
              </div>
            )}
          </div>

          <div className="flex mb-3">
            <fieldset className="border-2 border-neutral-900 rounded-lg p-3 flex-1">
              <legend>Modifier groups</legend>
              <div className="mb-3 flex gap-3">
                <Button type="button" icon={faPlus} variant="primary" onClick={() => {
                  append({
                    modifier_group: null,
                    has_required_modifiers: false,
                    required_modifiers: 0
                  })
                }}>
                  Modifier group
                </Button>

                <Button type="button" icon={faPlus} variant="primary" flat onClick={() => {
                  setModifierGroupsModal(true)
                }}>
                  Create modifier group
                </Button>
              </div>

              {modifierGroupFields.map((item, index) => (
                <div className="flex gap-3 mb-3" key={item.id}>
                  <div className="flex-1">
                    <label htmlFor="group">Modifier group</label>
                    <Controller
                      name={`modifier_groups.${index}.modifier_group`}
                      control={control}
                      render={({field}) => (
                        <ReactSelect
                          value={field.value}
                          onChange={field.onChange}
                          isLoading={loadingModifierGroups}
                          options={modifierGroups?.data?.map(item => ({
                            label: item.name,
                            value: item.id,
                            modifiers: item.modifiers
                          }))}
                        />
                      )}
                    />
                    <InputError error={_.get(errors, ['modifier_groups', index, 'modifier_group', 'message'])}/>
                  </div>
                  <div className="flex-1 self-end">
                    <Controller
                      name={`modifier_groups.${index}.should_auto_select`}
                      control={control}
                      render={({field}) => (
                        <Switch checked={field.value} onChange={field.onChange}>
                          Auto select modifiers?
                        </Switch>
                      )}
                    />
                  </div>
                  <div className="flex-1 self-end">
                    <Controller
                      name={`modifier_groups.${index}.should_auto_open`}
                      control={control}
                      render={({field}) => (
                        <Switch checked={field.value} onChange={field.onChange}>
                          Auto open modifiers?
                        </Switch>
                      )}
                    />
                  </div>
                  <div className="flex-1 self-end">
                    <Controller
                      name={`modifier_groups.${index}.has_required_modifiers`}
                      control={control}
                      render={({field}) => (
                        <Switch checked={field.value} onChange={field.onChange}>
                          Has required modifiers
                        </Switch>
                      )}
                    />
                  </div>
                  <div className="flex-1 self-end">
                    <Controller
                      name={`modifier_groups.${index}.required_modifiers`}
                      control={control}
                      render={({field}) => (
                        <Input
                          type="number" value={field.value} onChange={field.onChange}
                          label="Required modifiers"
                          disabled={!toggleRequiredField(index)}
                          error={_.get(errors, ['modifier_groups', index, 'required_modifiers', 'message'])}
                        />
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <Controller
                      name={`modifier_groups.${index}.priority`}
                      control={control}
                      render={({field}) => (
                        <Input
                          type="number" value={field.value} onChange={field.onChange}
                          label="Priority"
                          error={_.get(errors, ['modifier_groups', index, 'priority', 'message'])}
                        />
                      )}
                    />
                  </div>
                  <div className="flex-0 self-end">
                    <Button iconButton variant="danger" onClick={() => remove(index)}>
                      <FontAwesomeIcon icon={faTrash}/>
                    </Button>
                  </div>
                </div>
              ))}
            </fieldset>
          </div>

          <div className="flex mb-3">
            <fieldset className="border-2 border-neutral-900 rounded-lg p-3 flex-1">
              <legend>Recipe</legend>
              <div className="mb-3">
                <Button type="button" icon={faPlus} variant="primary" onClick={() => {
                  appendRecipe({
                    item: null,
                    quantity: 1,
                    cost: 0,
                    is_price_locked: false
                  })
                }}>
                  Add recipe item
                </Button>
              </div>

              {recipeFields.map((item, index) => {
                const currentItemValue = watch(`recipes.${index}.item`)?.value;
                const availableOptions = inventoryItems?.data
                  ?.filter(invItem => {
                    // Filter out items that are already selected in other recipe fields
                    const allSelectedItems = watch('recipes')
                      ?.map((r: any, idx: number) => idx !== index ? r?.item?.value : null)
                      .filter(Boolean);
                    return !allSelectedItems?.includes(invItem.id);
                  })
                  ?.map(invItem => ({
                    label: invItem.name,
                    value: invItem.id.toString()
                  })) || [];

                return (
                  <div className="flex gap-3 mb-3" key={item.id}>
                    <div className="flex-1">
                      <label htmlFor="recipe-item">Inventory Item</label>
                      <Controller
                        name={`recipes.${index}.item`}
                        control={control}
                        render={({field}) => (
                          <ReactSelect
                            value={field.value}
                            onChange={(selected) => {
                              field.onChange(selected);
                              // Auto-fill cost from inventory item if available
                              if (selected && inventoryItems?.data) {
                                const invItem = inventoryItems.data.find(i => i.id === selected.value);
                                if (invItem) {
                                  setValue(`recipes.${index}.cost`, invItem.price || 0);
                                }
                              }
                            }}
                            isLoading={loadingInventoryItems}
                            options={availableOptions}
                          />
                        )}
                      />
                      <InputError error={_.get(errors, ['recipes', index, 'item', 'message'])}/>
                    </div>
                    <div className="flex-1">
                      <Controller
                        name={`recipes.${index}.quantity`}
                        control={control}
                        render={({field}) => (
                          <Input
                            type="number"
                            value={field.value}
                            onChange={field.onChange}
                            label="Quantity"
                            error={_.get(errors, ['recipes', index, 'quantity', 'message'])}
                          />
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <Controller
                        name={`recipes.${index}.cost`}
                        control={control}
                        render={({field}) => (
                          <Input
                            type="number"
                            value={field.value}
                            onChange={field.onChange}
                            label="Cost"
                            error={_.get(errors, ['recipes', index, 'cost', 'message'])}
                          />
                        )}
                      />
                    </div>
                    <div className="flex-1 self-end">
                      <Controller
                        name={`recipes.${index}.is_price_locked`}
                        control={control}
                        render={({field}) => (
                          <Switch checked={field.value} onChange={field.onChange}>
                            Price locked
                          </Switch>
                        )}
                      />
                    </div>
                    <div className="flex-0 self-end">
                      <Button iconButton variant="danger" onClick={() => removeRecipe(index)}>
                        <FontAwesomeIcon icon={faTrash}/>
                      </Button>
                    </div>
                  </div>
                );
              })}
              {errors?.recipes && typeof errors.recipes === 'object' && 'message' in errors.recipes && (
                <InputError error={errors.recipes.message as string}/>
              )}
            </fieldset>
          </div>

          <div>
            <Button type="submit" variant="primary">Save</Button>
          </div>
        </form>
      </Modal>

      {categoriesModal && (
        <CategoryForm
          open={categoriesModal}
          onClose={() => {
            setCategoriesModal(false);
            fetchCategories();
          }}
        />
      )}

      {modifierGroupsModal && (
        <ModifierGroupForm
          open={modifierGroupsModal}
          onClose={() => {
            setModifierGroupsModal(false);
            fetchModifierGroups();
          }}
        />
      )}
    </>
  )
}
