import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Dish} from "@/api/model/dish.ts";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {InputField} from "@/components/common/form/rhf-fields.tsx";
import {Button} from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import {Controller, useFieldArray, useForm, useWatch} from "react-hook-form";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useDB} from "@/api/db/db.ts";
import React, { useMemo, useCallback, useEffect, useState} from "react";
import {Tables} from "@/api/db/tables.ts";
import {Category} from "@/api/model/category.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {CategoryForm} from "@/components/settings/categories/category.form.tsx";
import * as yup from 'yup';
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {ModifierGroup} from "@/api/model/modifier_group.ts";
import {Switch} from "@/components/common/input/switch.tsx";
import get from "lodash/get";
import {ModifierGroupForm} from "@/components/settings/modifier_groups/modifier_group.form.tsx";
import {RecordId, StringRecordId} from "surrealdb";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {canUseInDishRecipe} from "@/utils/inventoryItemTypes.ts";
import {detectMimeType, formatFileSize, MAX_UPLOAD_BYTES} from "@/utils/files";
import {Workflow} from "@/api/model/workflow.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {WorkflowForm} from "@/components/settings/workflows/workflow.form.tsx";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';

import { withCurrency } from "@/lib/utils.ts";
import {
  applyAvailabilityLocally,
  applyModifierAvailabilityLocally,
  buildAvailabilityPatch,
  normalizeAvailabilityDishId,
  toAvailabilityStampIso,
} from "@/lib/dish-availability.ts";
import {
  normalizeExtraBarcodes,
  queryBarcodeCollisions,
} from "@/lib/quick-order-scan.ts";
import {useSetAtom} from "jotai";
import {appSettings} from "@/store/jotai.ts";

type ModifierOptionOverrideDraft = {
  available: boolean;
  available_qty: number | null;
  previousQty: number | null;
  recordId?: string;
};
import {roundInventory, withInventoryCurrency} from "@/lib/inventory/rounding.ts";
import { useHqCatalogBranchEdit } from '@/hooks/useHqCatalogBranchEdit.ts';
import {toStockLine} from "@/lib/inventory/unit.convert.ts";
import {QuantityUomFields} from "@/components/inventory/common/quantity.uom.fields.tsx";
import {normalizeUom} from "@/utils/inventoryUom.ts";

const inventoryItemOptionLabel = (item: InventoryItem) =>
  item.uom ? `${item.name} (${item.uom})` : item.name;

const inventoryItemUnitCost = (item: InventoryItem) =>
  Number(item.price ?? item.average_price ?? 0) || 0;

const findInventoryItem = (items: InventoryItem[] | undefined, id?: string | null) =>
  items?.find((i) => String(i.id) === String(id));

interface Props {
  open: boolean
  onClose: () => void;
  data?: Dish
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  number: yup.string().required(i18n.t('validation:required')),
  barcode: yup.string().nullable().optional(),
  barcodes: yup.array().of(yup.string().nullable()).optional(),
  available: yup.boolean().optional(),
  ask_quantity: yup.boolean().optional(),
  available_qty: yup
    .number()
    .nullable()
    .transform((value, originalValue) =>
      originalValue === "" || originalValue === null || originalValue === undefined ? null : value,
    )
    .min(0, i18n.t('forms.greaterThanOrEqualZero'))
    .optional(),
  priority: yup.number().required(i18n.t('validation:required')).typeError(i18n.t('validation:mustBeNumber')),
  // position: yup.number().required(i18n.t('validation:required')).typeError(i18n.t('validation:mustBeNumber')),
  price: yup.number().required(i18n.t('validation:required')).typeError(i18n.t('validation:mustBeNumber')),
  cost: yup.number().required(i18n.t('validation:required')).typeError(i18n.t('validation:mustBeNumber')),
  categories: yup.array(yup.object({
    label: yup.string(),
    value: yup.string()
  })).min(1, i18n.t('validation:required')),
  modifier_groups: yup.array(yup.object({
    modifier_group: yup.object({
      label: yup.string(),
      value: yup.string()
    }).required(i18n.t('validation:required')),
    has_required_modifiers: yup.boolean(),
    required_modifiers: yup.number().when('has_required_modifiers', (has_required_modifiers, schema) => {
      if (has_required_modifiers[0]) {
        return schema.min(1, i18n.t('validation:mustBeGreaterThanZero')).required(i18n.t('validation:required'));
      }

      return schema;
    }),
    should_auto_open: yup.boolean(),
    should_auto_select: yup.boolean(),
    priority: yup.string().required(i18n.t('validation:required')),
  })),
  recipes: yup.array(yup.object({
    item: yup.object({
      label: yup.string(),
      value: yup.string()
    }).required(i18n.t('validation:required')),
    quantity: yup.number().required(i18n.t('validation:required')).min(0.01, i18n.t('validation:quantityMin')),
    entered_uom: yup.string().nullable().optional(),
    cost: yup.number().required(i18n.t('validation:required')).min(0, i18n.t('validation:costMin')),
    is_price_locked: yup.boolean().optional(),
    id: yup.string().nullable().optional()
  })).test('unique-items', i18n.t('validation:uniqueItems'), function (recipes) {
    if (!recipes || recipes.length === 0) return true;
    const itemValues = recipes.map(r => r?.item?.value).filter(Boolean);
    return itemValues.length === new Set(itemValues).size;
  })
});

export const DishForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);
  const { isBranchEditMode, loadMerged, save, soleBranchId, lockStructuralFields, canCreateEntities, isBranchOwnedBy } = useHqCatalogBranchEdit(Tables.dishes);
  const structuralLocked = lockStructuralFields(data);
  const setAppSettings = useSetAtom(appSettings);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoData, setPhotoData] = useState<ArrayBuffer | null>(null);

  const [workflowOption, setWorkflowOption] = useState<{ label: string; value: string } | null>(null);
  const [workflowStages, setWorkflowStages] = useState<any[]>([]);
  const [stageOverrides, setStageOverrides] = useState<Record<string, string>>({});
  const [modifierOptionOverrides, setModifierOptionOverrides] = useState<
    Record<string, ModifierOptionOverrideDraft>
  >({});

  const closeModal = () => {
    onClose();

    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoData(null);
    setWorkflowOption(null);
    setWorkflowStages([]);
    setStageOverrides({});
    setModifierOptionOverrides({});
  }

  useEffect(() => {
    if (!data) {
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoData(null);
      setWorkflowOption(null);
      setWorkflowStages([]);
      setStageOverrides({});
      return;
    }
    let cancelled = false;
    (async () => {
      const merged = isBranchEditMode ? await loadMerged(data.id) : null;
      if (cancelled) return;
      const src: any = merged || data;
      reset({
        ...src,
        available: src.available !== false,
        ask_quantity: src.ask_quantity === true,
        available_qty: src.available_qty ?? null,
        barcodes: Array.isArray(src.barcodes) ? src.barcodes.map(String) : [],
        barcode: src.barcode ?? '',
        categories: (src.categories || data.categories || []).map((item: any) => ({
          label: item.name,
          value: item.id
        })),
        recipes: [],
        modifier_groups: []
      });

      setPhotoFile(null);
      setPhotoData(null);
      if (src.photo || data.photo) {
        const buffer = src.photo || data.photo;
        const mimeType = detectMimeType(buffer, "image/png");
        const blob = new Blob([buffer], {type: mimeType});
        setPhotoPreview(URL.createObjectURL(blob));
      }

      getModifierGroups(data.id);
      getModifierAvailability(data.id);
      getRecipes(data.id);
      loadWorkflowAssignment(data.id);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isBranchEditMode]);

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

  const {
    data: workflows,
    fetchData: fetchWorkflows
  } = useApi<SettingsData<Workflow>>(Tables.workflows, ['deleted_at = none'], ['name asc'], 0, 99999, [], {
    enabled: false
  });

  const {
    data: kitchens,
    fetchData: fetchKitchens
  } = useApi<SettingsData<Kitchen>>(Tables.kitchens, ['deleted_at = none'], ['priority asc'], 0, 99999, [], {
    enabled: false
  });

  useEffect(() => {
    if (open) {
      fetchCategories();
      fetchModifierGroups();
      fetchInventoryItems();
      fetchWorkflows();
      fetchKitchens();
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

  const getModifierAvailability = async (id) => {
    try {
      const [rows]: any = await db.query(
        `SELECT * FROM ${Tables.dish_modifier_availability} WHERE parent = $parent`,
        {parent: id},
      );
      const next: Record<string, ModifierOptionOverrideDraft> = {};
      for (const row of rows ?? []) {
        const optionId = normalizeAvailabilityDishId(
          row.option?.id ?? row.option,
        );
        if (!optionId) {
          continue;
        }
        next[optionId] = {
          available: row.available !== false,
          available_qty: row.available_qty ?? null,
          previousQty: row.available_qty ?? null,
          recordId: row.id ? String(row.id) : undefined,
        };
      }
      setModifierOptionOverrides(next);
    } catch {
      setModifierOptionOverrides({});
    }
  };

  const updateModifierOptionOverride = (
    optionId: string,
    patch: Partial<ModifierOptionOverrideDraft>,
  ) => {
    const key = normalizeAvailabilityDishId(optionId);
    if (!key) {
      return;
    }
    setModifierOptionOverrides((prev) => {
      const current = prev[key] ?? {
        available: true,
        available_qty: null,
        previousQty: null,
      };
      return {
        ...prev,
        [key]: {...current, ...patch},
      };
    });
  };

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
          quantity: rec.entered_quantity ?? rec.quantity,
          entered_uom: rec.entered_uom ?? rec.item?.uom ?? "",
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
  const [workflowModal, setWorkflowModal] = useState(false);

  const db = useDB();

  const loadStagesFor = async (workflowId: string, existingOverrides: Record<string, string> = {}) => {
    const [stages]: any = await db.query(
      `SELECT * FROM ${Tables.workflow_stages} WHERE workflow = $wf ORDER BY sequence ASC FETCH kitchen`,
      {wf: new StringRecordId(workflowId.toString())}
    );

    setWorkflowStages(stages ?? []);
    setStageOverrides(existingOverrides ?? {});
  }

  const loadWorkflowAssignment = async (dishId: string) => {
    try {
      const res: any = await db.query(
        `SELECT stage_overrides, workflow FROM $dish FETCH workflow`,
        {dish: new StringRecordId(dishId.toString())}
      );
      const row = res?.[0]?.[0];
      const overrides: Record<string, string> = {};
      if (row?.stage_overrides) {
        for (const [stageId, kitchenId] of Object.entries(row.stage_overrides)) {
          overrides[stageId] = (kitchenId as any)?.toString?.() ?? String(kitchenId);
        }
      }

      if (row?.workflow?.id) {
        setWorkflowOption({label: row.workflow.name, value: row.workflow.id.toString()});
        await loadStagesFor(row.workflow.id.toString(), overrides);
      } else {
        setWorkflowOption(null);
        setWorkflowStages([]);
        setStageOverrides({});
      }
    } catch (e) {
      console.log('Failed to load workflow assignment', e);
    }
  }

  const onWorkflowChange = async (option: { label: string; value: string } | null) => {
    setWorkflowOption(option);
    setStageOverrides({});
    if (option?.value) {
      await loadStagesFor(option.value, {});
    } else {
      setWorkflowStages([]);
    }
  }

  const {control, handleSubmit, formState: {errors}, reset, watch, getValues, setValue} = useForm({
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
      if (!canCreateEntities && !data?.id) {
        toast.error(
          isBranchEditMode && !soleBranchId
            ? t('admin:hqBranchEdit.createMultiBlocked')
            : t('admin:hqBranchEdit.createBlocked')
        );
        return;
      }

      const formData = {
        ...values,
        // position: parseInt(values.position),
        priority: parseInt(values.priority),
        price: parseFloat(values.price),
        cost: roundInventory(parseFloat(values.cost)),
        categories: values?.categories?.map(item => new StringRecordId(item.value.toString()))
      };

      // Build per-stage kitchen overrides (only where they differ from the stage default).
      const overridesPayload: Record<string, StringRecordId> = {};
      for (const stage of workflowStages) {
        const stageId = stage.id.toString();
        const selectedKitchen = stageOverrides[stageId];
        const defaultKitchen = stage.kitchen?.id?.toString() ?? stage.kitchen?.toString();
        if (selectedKitchen && selectedKitchen !== defaultKitchen) {
          overridesPayload[stageId] = new StringRecordId(selectedKitchen);
        }
      }

      const barcodeRaw = typeof formData.barcode === 'string' ? formData.barcode.trim() : '';
      const extraBarcodes = normalizeExtraBarcodes(formData.barcodes, barcodeRaw);
      const allBarcodes = barcodeRaw ? [barcodeRaw, ...extraBarcodes] : extraBarcodes;
      if (allBarcodes.length > 0) {
        const collisions = await queryBarcodeCollisions(
          db,
          allBarcodes,
          data?.id ? [String(data.id)] : [],
        );
        if (collisions.length > 0) {
          const hit = collisions[0];
          throw new Error(
            t('toast:admin.barcodeInUse', {
              code: hit.code,
              name: hit.dishName,
            }),
          );
        }
      }
      const availability = buildAvailabilityPatch({
        available: formData.available !== false,
        available_qty: formData.available_qty,
        previousQty: data?.available_qty,
      });
      const stampBranch =
        soleBranchId && (!data?.id || isBranchOwnedBy(data))
          ? { branch_id: soleBranchId }
          : {};
      const dishData: any = {
        name: formData.name,
        number: formData.number,
        barcode: barcodeRaw || null,
        barcodes: extraBarcodes.length ? extraBarcodes : null,
        ask_quantity: formData.ask_quantity === true,
        // position: data.position,
        priority: formData.priority,
        price: formData.price,
        cost: formData.cost,
        categories: formData.categories,
        workflow: workflowOption?.value ? new StringRecordId(workflowOption.value) : null,
        stage_overrides: workflowOption?.value ? overridesPayload : null,
        ...availability,
        ...stampBranch,
      };

      let savedDishId: any = data?.id;
      await save({
        id: data?.id,
        existing: data,
        nextValues: {
          price: formData.price,
          cost: formData.cost,
          number: formData.number,
          priority: formData.priority,
          workflow: dishData.workflow,
          stage_overrides: dishData.stage_overrides,
        },
        structuralWrite: async () => {
          let menuId: any;
          if (data?.id) {
            menuId = data.id;
            await db.merge(data.id, dishData);
          } else {
            const [record] = await db.create(Tables.dishes, dishData);
            menuId = record.id;
          }
          savedDishId = menuId;

          if (photoData && photoFile) {
            const [photoId] = await db.create(Tables.documents, {
              name: photoFile.name,
              content: photoData,
              size: photoFile.size,
              type: photoFile.type || undefined,
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
              const invItem = findInventoryItem(inventoryItems?.data, recipe.item?.value);
              const stock = toStockLine({
                enteredQuantity: parseFloat(String(recipe.quantity)),
                enteredUom: recipe.entered_uom || invItem?.uom,
                stockUom: invItem?.uom || recipe.entered_uom,
                stockUnitPrice: parseFloat(String(recipe.cost)),
                mode: "quantity_only",
              });
              const recipeData = {
                menu_item: menuId,
                item: new StringRecordId(recipe.item.value.toString()),
                quantity: stock.quantity,
                entered_quantity: stock.entered_quantity,
                entered_uom: stock.entered_uom,
                cost: roundInventory(stock.price),
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

          {
            const parentKey = normalizeAvailabilityDishId(menuId) || String(menuId);
            const [existingRows]: any = await db.query(
              `SELECT id FROM ${Tables.dish_modifier_availability} WHERE parent = $parent`,
              {parent: menuId},
            );
            const deletedIds = (existingRows ?? []).map((row: any) => String(row.id)).filter(Boolean);
            if (deletedIds.length) {
              await db.query(
                `DELETE ${Tables.dish_modifier_availability} WHERE parent = $parent`,
                {parent: menuId},
              );
            }

            const localRows: Array<{
              id?: string;
              parent: string;
              option: string;
              available?: boolean;
              available_qty?: number | null;
              available_qty_set_at?: string | null;
            }> = [];

            for (const [optionId, ov] of Object.entries(modifierOptionOverrides)) {
              const inherits =
                ov.available !== false &&
                (ov.available_qty == null || ov.available_qty === ("" as any));
              if (inherits) {
                continue;
              }
              const patch = buildAvailabilityPatch({
                available: ov.available !== false,
                available_qty: ov.available_qty,
                previousQty: ov.previousQty,
              });
              const [created]: any = await db.create(Tables.dish_modifier_availability, {
                parent: menuId instanceof RecordId || String(menuId).includes(":")
                  ? (typeof menuId === "string" ? new StringRecordId(menuId) : menuId)
                  : new StringRecordId(parentKey),
                option: new StringRecordId(
                  optionId.includes(":") ? optionId : `menu_item:${optionId}`,
                ),
                ...patch,
              });
              localRows.push({
                id: created?.id ? String(created.id) : undefined,
                parent: parentKey,
                option: normalizeAvailabilityDishId(optionId) || optionId,
                available: patch.available,
                available_qty: patch.available_qty ?? null,
                available_qty_set_at: toAvailabilityStampIso(patch.available_qty_set_at),
              });
            }

            await applyModifierAvailabilityLocally({
              parentId: parentKey,
              rows: localRows,
              deletedIds,
              setAppSettings,
            }).catch(() => undefined);
          }

          await emitEntityCrudSave({
            domain: 'manage',
            table: Tables.dishes,
            entityId: String(menuId),
            isUpdate: Boolean(data?.id),
            after: dishData,
            source: 'settings-form',
            label: values.name,
          });
        },
      });

      await applyAvailabilityLocally({
        patches: [{
          id: String(savedDishId),
          ...availability,
        }],
        setAppSettings,
      }).catch(() => undefined);

      closeModal();
      toast.success(
        isBranchEditMode
          ? t('admin:hqBranchEdit.overrideSaved')
          : t('toast:admin.dishSaved', { name: values.name })
      );
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

    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        t('common:csvImport.fileTooLarge', { max: formatFileSize(MAX_UPLOAD_BYTES) })
      );
      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoData(null);
      event.target.value = '';
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
          const invItem = findInventoryItem(inventoryItems?.data, recipe?.item?.value);
          try {
            if (invItem?.uom) {
              const stock = toStockLine({
                enteredQuantity: quantity,
                enteredUom: recipe.entered_uom || invItem.uom,
                stockUom: invItem.uom,
                stockUnitPrice: cost,
                mode: "quantity_only",
              });
              return sum + roundInventory(stock.quantity * stock.price);
            }
          } catch {
            // fall through
          }
          return sum + roundInventory(quantity * cost);
        }
        return sum;
      }, 0);

      setValue('cost', roundInventory(totalCost), {shouldValidate: false, shouldDirty: false});
    } else {
      // If no recipes, keep the current cost value (don't reset to 0)
      // User can still manually set the cost
    }
  }, [watchedRecipes, setValue, inventoryItems?.data]);

  return (
    <>
      <Modal
        testId="admin-form-dish"
        title={data ? t('forms.updateDish', { name: data?.name }) : t('forms.createDish')}
        open={open}
        onClose={closeModal}
        size="full"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          {isBranchEditMode && (
            <p className="text-xs text-muted mb-3">{t('admin:hqBranchEdit.structuralLocked')}</p>
          )}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <InputField name="name" control={control} label={t('forms.nameOfItem')} autoFocus error={errors?.name?.message} disabled={structuralLocked}/>
            </div>
            <div className="flex-1">
              <InputField name="number" control={control} label={t('forms.numberOfItem')} error={errors?.number?.message}/>
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
                    label={t('columns.priority')}
                    error={errors?.priority?.message}
                  />
                )}
              />
            </div>
          </div>

              <InputField name="barcode" control={control} label={t('forms.barcodeOfItem')} error={errors?.barcode?.message}/>
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
                    label={t('columns.priority')}
                    error={errors?.priority?.message}
                  />
                )}
              />
            </div>
          </div>

          <div className="mb-3 rounded-xl border border-border p-3 bg-surface-elevated" data-testid="dish-form-extra-barcodes">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <div className="font-medium text-foreground">{t('forms.extraBarcodes')}</div>
                <p className="text-sm text-muted">{t('forms.extraBarcodesHint')}</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={faPlus}
                onClick={() => {
                  const current = (getValues('barcodes') as string[] | undefined) ?? [];
                  setValue('barcodes', [...current, ''], {shouldDirty: true});
                }}
              >
                {t('forms.addBarcode')}
              </Button>
            </div>
            <Controller
              name="barcodes"
              control={control}
              render={({field}) => {
                const rows = Array.isArray(field.value) ? field.value : [];
                if (rows.length === 0) {
                  return (
                    <p className="text-sm text-muted">{t('forms.extraBarcodesEmpty')}</p>
                  );
                }
                return (
                  <div className="flex flex-col gap-2">
                    {rows.map((code, index) => (
                      <div key={`barcode-${index}`} className="flex gap-2 items-center">
                        <div className="flex-1">
                          <Input
                            value={code ?? ''}
                            onChange={(e) => {
                              const next = [...rows];
                              next[index] = e.target.value;
                              field.onChange(next);
                            }}
                            placeholder={t('forms.extraBarcodePlaceholder')}
                            data-testid={`dish-extra-barcode-${index}`}
                          />
                        </div>
                        <IconTooltipButton
                          type="button"
                          icon={faTrash}
                          variant="danger"
                          label={t('common:remove', {defaultValue: 'Remove'})}
                          onClick={() => {
                            field.onChange(rows.filter((_, i) => i !== index));
                          }}
                        />
                      </div>
                    ))}
                  </div>
                );
              }}
            />
          </div>

          <div className="flex flex-wrap gap-3 mb-3 items-end">
            <div>
              <Controller
                name="available"
                control={control}
                defaultValue={true}
                render={({field}) => (
                  <Switch
                    checked={field.value !== false}
                    onChange={(e) => field.onChange((e.target as HTMLInputElement).checked)}
                  >
                    {t('forms.availableOnMenu')}
                  </Switch>
                )}
              />
            </div>
            <div>
              <Controller
                name="ask_quantity"
                control={control}
                defaultValue={false}
                render={({field}) => (
                  <Switch
                    checked={field.value === true}
                    onChange={(e) => field.onChange((e.target as HTMLInputElement).checked)}
                    data-testid="dish-form-ask-quantity"
                  >
                    {t('forms.askQuantity')}
                  </Switch>
                )}
              />
            </div>
            <div className="w-40">
              <Controller
                name="available_qty"
                control={control}
                render={({field}) => (
                  <Input
                    type="number"
                    label={t('forms.availableQty')}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      field.onChange(v === "" ? null : v);
                    }}
                    error={errors?.available_qty?.message as string | undefined}
                  />
                )}
              />
            </div>
            <p className="text-sm text-muted max-w-md pb-2">{t('forms.availableQtyHint')}</p>
            <p className="text-sm text-muted max-w-md pb-2">{t('forms.askQuantityHint')}</p>
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
                    label={t('columns.salePrice')}
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
                    label={t('forms.costOfItem')}
                    error={errors?.cost?.message}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex gap-3 mb-3 items-end">
            <div className="flex-1">
              <label>{t('columns.categories')}</label>
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
                    isDisabled={structuralLocked}
                  />
                )}
                control={control}
              />
              {errors?.categories?.message && <InputError error={errors?.categories?.message}/>}
            </div>
            <div className="flex-0">
              <IconTooltipButton label={t('common:actions.add')} onClick={() => setCategoriesModal(true)} type="button" variant="primary" disabled={structuralLocked}><FontAwesomeIcon icon={faPlus}/></IconTooltipButton>
            </div>
          </div>

          <div className="flex mb-3">
            <fieldset className="border-2 border-border rounded-lg p-3 flex-1">
              <legend>{t('forms.productionWorkflow')}</legend>
              <div className="flex gap-2 items-end mb-3">
                <div className="flex-1">
                  <label>{t('forms.workflowLegacyHint')}</label>
                  <ReactSelect
                    isClearable
                    value={workflowOption}
                    onChange={(option: any) => onWorkflowChange(option ?? null)}
                    options={workflows?.data?.map(item => ({
                      label: item.name,
                      value: item.id.toString()
                    }))}
                  />
                </div>
                <IconTooltipButton label={t('common:actions.add')} type="button" variant="primary" onClick={() => setWorkflowModal(true)}><FontAwesomeIcon icon={faPlus}/></IconTooltipButton>
              </div>

              {workflowOption && workflowStages.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted">
                    Stages run in order. Override a stage's kitchen for this product if needed.
                  </p>
                  {workflowStages.map((stage, index) => {
                    const stageId = stage.id.toString();
                    const defaultKitchenId = stage.kitchen?.id?.toString() ?? stage.kitchen?.toString();
                    const selectedKitchenId = stageOverrides[stageId] ?? defaultKitchenId;
                    const selectedKitchen = kitchens?.data?.find(k => k.id.toString() === selectedKitchenId);
                    return (
                      <div className="flex gap-3 items-end" key={stageId}>
                        <div className="flex-0 self-center text-muted font-bold w-6 text-center">
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          <Input label={t('forms.stage')} value={stage.name} disabled readOnly/>
                        </div>
                        <div className="flex-1">
                          <label>{t('forms.kitchenStation')}</label>
                          <ReactSelect
                            value={selectedKitchen ? {
                              label: selectedKitchen.name,
                              value: selectedKitchen.id.toString()
                            } : null}
                            onChange={(option: any) => {
                              setStageOverrides(prev => ({
                                ...prev,
                                [stageId]: option?.value ?? defaultKitchenId
                              }));
                            }}
                            options={kitchens?.data?.map(item => ({
                              label: item.name,
                              value: item.id.toString()
                            }))}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </fieldset>
          </div>

          <div className="flex gap-3 mb-3 items-end">
            <div className="flex-1">
              <label className="block mb-1">{t('forms.photo')}</label>
              <input
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={structuralLocked}
                className="block w-full text-sm text-foreground
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-full file:border-0
                           file:text-sm file:font-semibold
                           file:bg-neutral-600 file:text-white
                           hover:file:bg-neutral-700"
              />
            </div>
            {photoPreview && (
              <div
                className="w-24 h-24 rounded-lg overflow-hidden border border-border flex items-center justify-center bg-surface">
                <img
                  src={photoPreview}
                  alt={t('forms.dishPhotoPreview')}
                  className="object-cover w-full h-full"
                />
              </div>
            )}
          </div>

          <div className="flex mb-3">
            <fieldset className="border-2 border-border rounded-lg p-3 flex-1" disabled={structuralLocked}>
              <legend>{t('columns.modifierGroups')}</legend>
              <div className="mb-3 flex gap-3">
                <Button type="button" icon={faPlus} variant="primary" disabled={structuralLocked} onClick={() => {
                  append({
                    modifier_group: null,
                    has_required_modifiers: false,
                    required_modifiers: 0
                  })
                }}>
                  {t('entities.modifierGroup')}
                </Button>

                <Button type="button" icon={faPlus} variant="primary" flat disabled={structuralLocked} onClick={() => {
                  setModifierGroupsModal(true)
                }}>
                  {t('forms.createModifierGroup')}
                </Button>
              </div>

              {modifierGroupFields.map((item, index) => {
                const selected = watch(`modifier_groups.${index}.modifier_group`);
                const group = modifierGroups?.data?.find(
                  (g) => String(g.id) === String(selected?.value ?? ""),
                );
                const options = (group?.modifiers ?? []).filter((m: any) => m?.modifier?.id);
                return (
                  <div className="mb-3" key={item.id}>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label htmlFor="group">{t('entities.modifierGroup')}</label>
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
                        <InputError error={get(errors, ['modifier_groups', index, 'modifier_group', 'message'])}/>
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
                              label={t('forms.requiredModifiers')}
                              disabled={!toggleRequiredField(index)}
                              error={get(errors, ['modifier_groups', index, 'required_modifiers', 'message'])}
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
                              label={t('columns.priority')}
                              error={get(errors, ['modifier_groups', index, 'priority', 'message'])}
                            />
                          )}
                        />
                      </div>
                      <div className="flex-0 self-end">
                        <IconTooltipButton label={t('common:actions.remove')} variant="danger" onClick={() => remove(index)}><FontAwesomeIcon icon={faTrash}/></IconTooltipButton>
                      </div>
                    </div>
                    {options.length > 0 && (
                      <div className="mt-3 rounded-lg border border-border p-3">
                        <div className="mb-2 text-sm font-semibold">
                          {t('forms.modifierOptionAvailability')}
                        </div>
                        <p className="mb-3 text-sm text-muted">{t('forms.modifierOptionAvailableHint')}</p>
                        <div className="flex flex-col gap-3">
                          {options.map((mod: any) => {
                            const optionId = normalizeAvailabilityDishId(mod.modifier.id);
                            const ov = modifierOptionOverrides[optionId] ?? {
                              available: true,
                              available_qty: null,
                              previousQty: null,
                            };
                            return (
                              <div key={optionId} className="flex flex-wrap items-end gap-3">
                                <div className="min-w-[10rem] flex-1 font-medium">
                                  {mod.modifier?.name ?? optionId}
                                </div>
                                <div>
                                  <Switch
                                    checked={ov.available !== false}
                                    onChange={(e) =>
                                      updateModifierOptionOverride(optionId, {
                                        available: e.target.checked,
                                      })
                                    }
                                  >
                                    {t('forms.modifierOptionAvailable')}
                                  </Switch>
                                </div>
                                <div className="w-40">
                                  <Input
                                    type="number"
                                    value={ov.available_qty ?? ""}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      updateModifierOptionOverride(optionId, {
                                        available_qty:
                                          raw === "" || raw == null ? null : Number(raw),
                                      });
                                    }}
                                    label={t('forms.modifierOptionSaleLimit')}
                                    disabled={ov.available === false}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </fieldset>
          </div>

          <div className="flex mb-3">
            <fieldset className="border-2 border-border rounded-lg p-3 flex-1" disabled={structuralLocked}>
              <legend>{t('forms.recipe')}</legend>
              <div className="mb-3">
                <Button type="button" icon={faPlus} variant="primary" disabled={structuralLocked} onClick={() => {
                  appendRecipe({
                    item: null,
                    quantity: 1,
                    entered_uom: "",
                    cost: 0,
                    is_price_locked: false
                  })
                }}>
                  Add recipe item
                </Button>
              </div>

              {recipeFields.map((item, index) => {
                const selectedItemId = watch(`recipes.${index}.item`)?.value;
                const selectedInvItem = findInventoryItem(inventoryItems?.data, selectedItemId);
                const rowQuantity = parseFloat(String(watch(`recipes.${index}.quantity`) ?? 0)) || 0;
                const rowCost = parseFloat(String(watch(`recipes.${index}.cost`) ?? 0)) || 0;
                const rowEnteredUom = watch(`recipes.${index}.entered_uom`) || selectedInvItem?.uom;
                let rowTotal = rowQuantity * rowCost;
                try {
                  if (selectedInvItem?.uom && rowEnteredUom) {
                    const stock = toStockLine({
                      enteredQuantity: rowQuantity,
                      enteredUom: rowEnteredUom,
                      stockUom: selectedInvItem.uom,
                      stockUnitPrice: rowCost,
                      mode: "quantity_only",
                    });
                    rowTotal = roundInventory(stock.quantity * stock.price);
                  }
                } catch {
                  // keep entered × cost while the unit pair is invalid
                  rowTotal = roundInventory(rowTotal);
                }
                const availableOptions = inventoryItems?.data
                  ?.filter(invItem => canUseInDishRecipe(invItem))
                  ?.filter(invItem => {
                    // Filter out items that are already selected in other recipe fields
                    const allSelectedItems = watch('recipes')
                      ?.map((r: any, idx: number) => idx !== index ? r?.item?.value : null)
                      .filter(Boolean)
                      .map((id: any) => String(id));
                    return !allSelectedItems?.includes(String(invItem.id));
                  })
                  ?.map(invItem => ({
                    label: inventoryItemOptionLabel(invItem),
                    value: invItem.id.toString()
                  })) || [];

                return (
                  <div className="flex gap-3 mb-3" key={item.id}>
                    <div className="flex-[2]">
                      <label htmlFor="recipe-item">{t('forms.inventoryItem')}</label>
                      <Controller
                        name={`recipes.${index}.item`}
                        control={control}
                        render={({field}) => (
                          <ReactSelect
                            value={field.value}
                            onChange={(selected) => {
                              field.onChange(selected);
                              // Auto-fill cost from inventory item if available
                              if (selected) {
                                const invItem = findInventoryItem(inventoryItems?.data, selected.value);
                                if (invItem) {
                                  setValue(`recipes.${index}.cost`, inventoryItemUnitCost(invItem));
                                  setValue(
                                    `recipes.${index}.entered_uom`,
                                    normalizeUom(invItem.uom) ?? invItem.uom ?? ""
                                  );
                                }
                              }
                            }}
                            isLoading={loadingInventoryItems}
                            isDisabled={structuralLocked}
                            options={availableOptions}
                          />
                        )}
                      />
                      <InputError error={get(errors, ['recipes', index, 'item', 'message'])}/>
                    </div>
                    <QuantityUomFields
                      control={control}
                      quantityName={`recipes.${index}.quantity`}
                      uomName={`recipes.${index}.entered_uom`}
                      stockUom={selectedInvItem?.uom}
                      errors={errors}
                    />
                    <div className="flex-1">
                      <Controller
                        name={`recipes.${index}.cost`}
                        control={control}
                        render={({field}) => (
                          <Input
                            type="number"
                            value={field.value}
                            onChange={field.onChange}
                            label={t('forms.unitCost')}
                            error={get(errors, ['recipes', index, 'cost', 'message'])}
                          />
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <Input
                        type="text"
                        value={withInventoryCurrency(rowTotal)}
                        label={t('forms.lineTotal')}
                        readOnly
                        disabled
                      />
                    </div>
                    <div className="flex-1 self-end">
                      <Controller
                        name={`recipes.${index}.is_price_locked`}
                        control={control}
                        render={({field}) => (
                          <Switch checked={field.value} onChange={field.onChange}>
                            {t('forms.priceLocked')}
                          </Switch>
                        )}
                      />
                    </div>
                    <div className="flex-0 self-end">
                      <IconTooltipButton label={t('common:actions.remove')} variant="danger" onClick={() => removeRecipe(index)} disabled={structuralLocked}><FontAwesomeIcon icon={faTrash}/></IconTooltipButton>
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
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
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

      {workflowModal && (
        <WorkflowForm
          open={true}
          onClose={() => {
            fetchWorkflows();
            setWorkflowModal(false);
          }}
        />
      )}
    </>
  )
}
