import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import { useTranslation } from 'react-i18next';
import * as yup from "yup";
import {Controller, useFieldArray, useForm, useWatch} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {InputField} from "@/components/common/form/rhf-fields.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {InventoryIssue} from "@/api/model/inventory_issue.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {User} from "@/api/model/user.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {RecordId} from "surrealdb";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {appPage} from "@/store/jotai.ts";
import {useAtom} from "jotai";
import {fetchNextSequentialNumber, isUniqueRecordNumber} from "@/utils/recordNumbers.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {dateToCalendarDate, getToday} from "@/utils/date.ts";
import {Switch} from "@/components/common/input/switch.tsx";
import { documentCreatedAtFromDateValue, toJsDate } from "@/lib/datetime.ts";
import {fetchNetQuantity} from "@/utils/inventory.ts";
import {syncDishRecipeCostsForItems} from "@/lib/inventory/dish.recipe.cost.ts";
import {InventoryFormLineTotal} from "@/components/inventory/common/form.line.total.tsx";
import { postDocument } from "@/lib/inventory/posting.service.ts";
import { useIntegrationManager } from "@/providers/integration.provider.tsx";
import { canEdit, isLocked } from "@/lib/inventory/lifecycle.ts";
import {
  formatDependencyMessage,
  getDependencies,
} from "@/lib/inventory/dependency-validator.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { InventoryDocumentStatusBadge } from "@/components/inventory/common/document.status.badge.tsx";
import { useInventoryLocations } from "@/hooks/useInventoryLocations.ts";
import { ensureLocationForKitchen, toLocationRecordId } from "@/lib/inventory/location.service.ts";
import { toRecordId } from "@/lib/utils.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";

interface InventoryIssueItemFormValue {
  location: { label: string; value: string } | null;
  item: { label: string; value: string } | null;
  requested?: number | string;
  quantity: number | string;
  price?: number | string;
  comments?: string;
}

interface InventoryIssueFormValues {
  invoice_number: number | string;
  issued_to?: { label: string; value: string } | null;
  /** Destination stock location (typically a kitchen location). */
  location?: { label: string; value: string } | null;
  date?: DateValue | null;
  documents?: FileList;
  update_item_cost?: boolean;
  update_recipe_cost?: boolean;
  items: InventoryIssueItemFormValue[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryIssue;
}

const createValidationSchema = (db: ReturnType<typeof useDB>, currentId?: string) => yup.object({
  invoice_number: yup.number().required('This is required').test(
    "unique-issue-invoice",
    "Invoice number already exists",
    async function (value) {
      if (value === undefined || value === null) {
        return true;
      }

      const isUnique = await isUniqueRecordNumber(
        db,
        Tables.inventory_issues,
        "invoice_number",
        value,
        currentId
      );

      if (!isUnique) {
        return this.createError({
          message: "Invoice number already exists",
          path: "invoice_number"
        });
      }

      return true;
    }
  ),
  issued_to: yup.object({
    label: yup.string(),
    value: yup.string()
  }).required('This is required'),
  location: yup.object({
    label: yup.string(),
    value: yup.string()
  }).required('This is required'),
  date: yup.mixed().nullable().optional(),
  documents: yup.mixed().optional(),
  update_item_cost: yup.boolean().optional(),
  update_recipe_cost: yup.boolean().optional(),
  items: yup.array().of(
    yup.object({
      location: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("Location is required"),
      item: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("This is required").nullable(),
      requested: yup.number().typeError("This should be a number").nullable().optional(),
      quantity: yup.number().typeError("This should be a number").required("This is required"),
      price: yup.number().typeError("This should be a number").nullable().optional(),
      comments: yup.string().nullable().optional(),
    })
  ).min(1, "Add at least one item"),
}).required();

export const InventoryIssueForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation(['inventory', 'common']);
  const db = useDB();
  const { manager } = useIntegrationManager();
  const validationSchema = useMemo(() => createValidationSchema(db, data?.id), [db, data?.id]);
  const resolver = useMemo(() => yupResolver(validationSchema), [validationSchema]);
  const [postingAfterSave, setPostingAfterSave] = useState(false);
  // Missing status means "posted" only for existing legacy rows — new creates are editable.
  const locked = Boolean(data?.id) && isLocked(data?.status);

  const [state, ] = useAtom(appPage);

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 9999, ["locations"], {
    enabled: false
  });

  const {
    data: users,
    fetchData: fetchUsers,
    isFetching: loadingUsers,
  } = useApi<SettingsData<User>>(Tables.users, ['deleted_at = none'], [], 0, 9999, [], {
    enabled: false
  });

  const {
    options: sourceLocationOptions,
    loading: loadingSourceLocations,
  } = useInventoryLocations(open);

  const {
    options: destinationLocationOptions,
    loading: loadingDestinationLocations,
  } = useInventoryLocations(open, {types: [], sync: true});

  const {
    control,
    register,
    handleSubmit,
    formState: {errors},
    reset,
    setValue,
    watch,
    setError,
    clearErrors
  } = useForm({
    resolver
  });

  const watchedItems = useWatch({
    control,
    name: "items"
  });
  const [rowNetQuantities, setRowNetQuantities] = useState<Record<number, number | undefined>>({});
  const netQuantityCacheRef = useRef<Record<string, number>>({});
  const createEmptyItem = useCallback(() => ({
    location: null,
    item: null,
    requested: 1,
    quantity: 1,
    price: 0,
    comments: ""
  }), []);

  const resetInventoryState = useCallback(() => {
    netQuantityCacheRef.current = {};
    setRowNetQuantities({});
  }, [setRowNetQuantities]);

  const fetchNetQuantityForLocation = useCallback(async (itemId: string, locationId: string) => {
    return fetchNetQuantity(db, itemId, locationId);
  }, []);

  const {fields, append, remove, replace} = useFieldArray({
    control,
    name: "items"
  });

  useEffect(() => {
    if (open) {
      fetchItems();
      fetchUsers();
    }
  }, [open, fetchItems, fetchUsers]);

  useEffect(() => {
    let cancelled = false;

    const applyReset = async () => {
      if (data) {
        resetInventoryState();

        let destinationLocation: {label: string; value: string} | null = null;
        if (data.location) {
          destinationLocation = {
            label: data.location.name,
            value: recordIdToString(data.location.id),
          };
        } else if (data.kitchen?.id) {
          try {
            const locationId = await ensureLocationForKitchen(
              db,
              recordIdToString(data.kitchen.id)
            );
            if (!cancelled) {
              destinationLocation = {
                label: data.kitchen.name,
                value: locationId,
              };
            }
          } catch (error) {
            console.error("Failed to resolve location for kitchen", error);
          }
        }

        if (cancelled) return;

        reset({
          invoice_number: data?.invoice_number,
          issued_to: data.issued_to ? {
            label: `${data.issued_to.first_name} ${data.issued_to.last_name}`,
            value: recordIdToString(data.issued_to.id)
          } : null,
          location: destinationLocation,
          date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
          documents: undefined,
          update_item_cost: false,
          update_recipe_cost: false,
          items: data.items?.map(item => {
            const loc = item.location;
            return {
              location: loc ? {
                label: loc.name,
                value: recordIdToString(loc.id)
              } : null,
              item: item.item ? {
                label: `${item.item.name}-${item.item.code}`,
                value: recordIdToString(item.item.id)
              } : null,
              requested: item.requested ?? 1,
              quantity: item.quantity ?? 1,
              price: item.price ?? 0,
              comments: item.comments ?? "",
            };
          })
        });
      } else if (open) {
        resetInventoryState();
        reset({
          invoice_number: 1,
          issued_to: null,
          location: null,
          date: getToday(),
          documents: undefined,
          update_item_cost: false,
          update_recipe_cost: false,
          items: [createEmptyItem()]
        });
      }
    };

    void applyReset();
    return () => {
      cancelled = true;
    };
  }, [data, open, reset, resetInventoryState, createEmptyItem]);

  useEffect(() => {
    if (!open || data?.id) {
      return;
    }

    let isMounted = true;

    fetchNextSequentialNumber(db, Tables.inventory_issues, "invoice_number")
      .then((nextNumber) => {
        if (isMounted) {
          setValue("invoice_number", nextNumber);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch next issue number", error);
        toast.error(t('toast:inventory.unableGenerateIssueNumber'));
      });

    return () => {
      isMounted = false;
    };
  }, [open, data?.id, setValue]);

  useEffect(() => {
    if (open && !data && fields.length === 0) {
      append(createEmptyItem());
    }
  }, [open, data, fields.length, append, createEmptyItem]);

  useEffect(() => {
    watchedItems?.forEach((item, index) => {
      const itemId = item?.item?.value;
      const locationId = item?.location?.value;
      
      if (!itemId || !locationId) {
        setRowNetQuantities(prev => {
          if (prev[index] === undefined) return prev;
          const next = {...prev};
          delete next[index];
          return next;
        });
        return;
      }

      const cacheKey = `${itemId}-${locationId}`;
      const cached = netQuantityCacheRef.current[cacheKey];
      if (cached !== undefined) {
        setRowNetQuantities(prev => {
          if (prev[index] === cached) return prev;
          return {...prev, [index]: cached};
        });
        return;
      }

      fetchNetQuantityForLocation(itemId, locationId)
        .then((value) => {
          netQuantityCacheRef.current[cacheKey] = value;
          setRowNetQuantities(prev => ({ ...prev, [index]: value }));
        })
        .catch((error) => {
          console.error("Failed to fetch net quantity", error);
          netQuantityCacheRef.current[cacheKey] = 0;
          setRowNetQuantities(prev => ({ ...prev, [index]: 0 }));
        });
    });
  }, [watchedItems, fetchNetQuantityForLocation]);

  const validateAvailableStock = useCallback(async (formValues: InventoryIssueFormValues) => {
    let isValid = true;

    for (let index = 0; index < formValues.items.length; index++) {
      const row = formValues.items[index];
      const itemId = row.item?.value;
      const locationId = row.location?.value;
      
      if (!itemId || !locationId) continue;

      const desiredQuantity = Number(row.quantity) || 0;
      if (desiredQuantity <= 0) continue;

      const cacheKey = `${itemId}-${locationId}`;
      let available = rowNetQuantities[index] ?? netQuantityCacheRef.current[cacheKey];

      if (available === undefined) {
        try {
          available = await fetchNetQuantityForLocation(itemId, locationId);
          netQuantityCacheRef.current[cacheKey] = available;
          setRowNetQuantities(prev => ({ ...prev, [index]: available }));
        } catch (error) {
          console.error("Failed to validate inventory", error);
          available = 0;
        }
      }

      if (available < desiredQuantity) {
        setError(`items.${index}.quantity` as const, {
          type: "manual",
          message: `Only ${available} available`
        });
        isValid = false;
      } else {
        clearErrors(`items.${index}.quantity` as const);
      }
    }

    return isValid;
  }, [rowNetQuantities, fetchNetQuantityForLocation, setError, clearErrors, setRowNetQuantities]);

  const closeModal = () => {
    onClose();
    resetInventoryState();
    reset({
      invoice_number: 1,
      issued_to: null,
      location: null,
      date: getToday(),
      documents: undefined,
      update_item_cost: false,
      update_recipe_cost: false,
      items: [createEmptyItem()]
    });
  };

  const convertFilesToDocuments = async (files: FileList | null | undefined): Promise<RecordId[]> => {
    if (!files || files.length === 0) return [];

    const documentRefs: RecordId[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = await file.arrayBuffer();

      const [created] = await db.create(Tables.documents, {
        name: file.name,
        content,
        size: file.size,
        mimeType: file.type || undefined,
      });

      if (created?.id) {
        documentRefs.push(created.id as RecordId);
      }
    }

    return documentRefs;
  };

  const onSubmit = async (values: any, options?: { postAfterSave?: boolean }) => {
    if (data?.id) {
      const deps = await getDependencies(db, "issue", String(data.id));
      if (deps.length > 0) {
        toast.error(formatDependencyMessage("issue", deps));
        return;
      }
      if (!canEdit(data.status)) {
        toast.error("Posted documents cannot be edited");
        return;
      }
    }

    try {
      const hasAvailableStock = await validateAvailableStock(values);
      if (!hasAvailableStock) {
        toast.error(t('toast:inventory.itemsExceedQuantity'));
        return;
      }

      const documentRefs = await convertFilesToDocuments(values.documents);

      const destinationLocationId = values.location?.value
        ? recordIdToString(values.location.value)
        : undefined;

      const payload: Record<string, unknown> = {
        issued_to: values.issued_to ? toRecordId(values.issued_to.value) : undefined,
        location: destinationLocationId ? toLocationRecordId(destinationLocationId) : undefined,
        items: [],
        invoice_number: Number(values.invoice_number),
        documents: documentRefs.length > 0 ? documentRefs : undefined,
        status: data?.id ? (data.status && data.status !== "posted" ? data.status : "draft") : "draft",
      };

      if (!data?.id) {
        payload.created_at = documentCreatedAtFromDateValue(values.date ?? null);
        if (state?.user?.id) {
          payload.created_by = toRecordId(state.user.id);
        }
      }

      let issueId: any = data?.id;

      if (issueId) {
        await db.merge(issueId, payload);
        if (data?.items?.length) {
          await Promise.all(
            data.items
              .filter((item) => item.id)
              .map((item) => db.delete(item.id!))
          );
        }
      } else {
        const [created] = await db.create(Tables.inventory_issues, payload);
        issueId = created?.id;
      }

      const issueIdString = issueId
        ? typeof issueId === "string"
          ? issueId
          : issueId
        : undefined;

      if (!issueIdString) {
        throw new Error("Failed to resolve issue identifier");
      }

      const itemRefs = [];
      await Promise.all(
        values.items.map(async (item) => {
          const [created] = await db.create(Tables.inventory_issue_items, {
            issue: toRecordId(issueIdString),
            item: item.item ? toRecordId(item.item.value) : undefined,
            location: item.location ? toRecordId(item.location.value) : undefined,
            requested: item.requested !== undefined && item.requested !== "" ? Number(item.requested) : undefined,
            quantity: Number(item.quantity),
            price: item.price !== undefined && item.price !== "" ? Number(item.price) : undefined,
            comments: item.comments?.trim() ? item.comments.trim() : undefined,
          });

          if (created?.id) {
            itemRefs.push(created.id);
          }

          // Update item price if switch is enabled
          if (values.update_item_cost && item.item?.value && item.price !== undefined && item.price !== "" && Number(item.price) > 0) {
            await db.merge(toRecordId(item.item.value), {
              price: Number(item.price)
            });
          }
        }
        )
      );

      await db.merge(issueIdString, {
        items: itemRefs,
      });

      if (values.update_recipe_cost) {
        const issuedItemIds = values.items
          .map((item) => item.item?.value)
          .filter((id): id is string => Boolean(id));
        await syncDishRecipeCostsForItems(db, issuedItemIds);
      }

      if (options?.postAfterSave) {
        const userId = state?.user?.id ? recordIdToString(state.user.id) : undefined;
        const result = await postDocument({
          db,
          documentType: "issue",
          documentId: String(issueIdString),
          userId,
          integrationManager: manager,
        });
        toast.success(
          result.skipped
            ? (result.reason || t('toast:inventory.issueSaved'))
            : `Issue posted (${result.ledgerEntryCount} ledger entries)`
        );
      } else {
        toast.success(t('toast:inventory.issueSaved'));
      }
      closeModal();
    } catch (error) {
      console.log(error)
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPostingAfterSave(false);
    }
  };

  const itemsList = (items?.data ?? []) as (InventoryItem & { locations?: InventoryLocation[] })[];

  const getItemOptionsForLocation = useCallback((locationId?: string) => {
    if (!locationId) {
      return [];
    }
    const filtered = itemsList.filter((item) => {
      const locs = item.locations;
      if (!locs?.length) return true;
      return locs.some((loc) => loc.id.toString() === locationId.toString());
    });
    return filtered.map(item => ({
      label: item.code ? `${item.name}-${item.code}` : item.name,
      value: item.id.toString()
    }));
  }, [itemsList]);

  const userOptions = users?.data?.map(user => ({
    label: `${user.first_name} ${user.last_name}`,
    value: recordIdToString(user.id)
  })) ?? [];

  return (
    <Modal
      title={data ? `Update issue# ${data?.invoice_number}` : "Create new issue"}
      open={open}
      onClose={closeModal}
      size="xl"
    >
      <form onSubmit={handleSubmit((values) => onSubmit(values))}>
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <Controller
                name="invoice_number"
                control={control}
                render={({field}) => (
                  <Input value={field.value} onChange={field.onChange} label={t('columns.issueNumber')} error={_.get(errors, ["invoice_number", "message"])} />
                )}
              />
            </div>
            <div className="flex-1">
              <label>{t('columns.issuedTo')}</label>
              <Controller
                name="issued_to"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={userOptions}
                    isLoading={loadingUsers}
                    isClearable
                  />
                )}
              />
              <InputError error={_.get(errors, ["issued_to", "message"])}/>
            </div>
            <div className="flex-1">
              <label>{t('columns.location')}</label>
              <Controller
                name="location"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={destinationLocationOptions}
                    isLoading={loadingDestinationLocations}
                    isClearable
                  />
                )}
              />
              <InputError error={_.get(errors, ["location", "message"])}/>
            </div>
            <div className="flex-1">
              <Controller
                name="date"
                control={control}
                render={({field}) => (
                  <DatePicker
                    label={t('forms.date')}
                    value={field.value as any}
                    onChange={field.onChange}
                    maxValue={getToday()}
                    isClearable={false}
                  />
                )}
              />
              <InputError error={_.get(errors, ["date", "message"])}/>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label>Documents</label>
              <input
                type="file"
                multiple
                {...register("documents")}
                className="w-full px-3 py-2 border border-neutral-400 rounded-lg"
              />
              <InputError error={_.get(errors, ["documents", "message"])}/>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Controller
                name="update_item_cost"
                control={control}
                render={({field}) => (
                  <Switch checked={field.value || false} onChange={field.onChange}>
                    Update cost of item itself
                  </Switch>
                )}
              />
            </div>
            <div className="flex-1">
              <Controller
                name="update_recipe_cost"
                control={control}
                render={({field}) => (
                  <Switch checked={field.value || false} onChange={field.onChange}>
                    Update recipe cost
                  </Switch>
                )}
              />
            </div>
          </div>

          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend>{t('tabs.items')}</legend>
            <div className="mb-3">
              <Button
                type="button"
                icon={faPlus}
                variant="primary"
                onClick={() => append(createEmptyItem())}
              >
                Add item
              </Button>
              <InputError error={_.get(errors, ["items", "message"])}/>
            </div>

            {fields.map((field, index) => {
              const rowLocationId = watchedItems?.[index]?.location?.value;
              const rowItemOptions = getItemOptionsForLocation(rowLocationId);
              
              return (
              <div className="flex flex-col mb-3" key={field.id}>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label>{t('columns.location')}</label>
                    <Controller
                      name={`items.${index}.location`}
                      control={control}
                      render={({field}) => (
                        <ReactSelect
                          value={field.value}
                          onChange={(value) => {
                            field.onChange(value);
                            setValue(`items.${index}.item`, null);
                          }}
                          options={sourceLocationOptions}
                          isLoading={loadingSourceLocations}
                        />
                      )}
                    />
                    <InputError error={_.get(errors, ["items", index, "location", "message"])}/>
                  </div>
                    <div className="flex-1">
                    <label>{t('buttons.item')}</label>
                    <Controller
                      name={`items.${index}.item`}
                      control={control}
                      render={({field}) => (
                        <ReactSelect
                          value={field.value}
                          onChange={(option) => {
                            field.onChange(option);
                            const catalog = itemsList.find((it) => it.id.toString() === option?.value);
                            if (catalog) {
                              const catalogPrice = catalog.price || catalog.average_price || 0;
                              if (catalogPrice > 0) {
                                setValue(`items.${index}.price`, catalogPrice);
                              }
                            }
                          }}
                          options={rowItemOptions}
                          isLoading={loadingItems}
                          isDisabled={!rowLocationId}
                        />
                      )}
                    />
                    <InputError error={_.get(errors, ["items", index, "item", "message"])}/>
                  </div>
                  <div className="flex-1">
                    <Controller
                      name={`items.${index}.requested`}
                      control={control}
                      render={({field}) => (
                        <Input
                          label={t('forms.requested')}
                          type="number"
                          value={field.value as number | string | undefined}
                          onChange={field.onChange}
                          error={_.get(errors, ["items", index, "requested", "message"])}
                        />
                      )}
                    />
                  </div>
                  {/*<div className="flex-1">
                    <Controller
                      name={`items.${index}.price`}
                      control={control}
                      render={({field}) => (
                        <Input
                          label={t('columns.price')}
                          type="number"
                          value={field.value as number | string | undefined}
                          onChange={field.onChange}
                          error={_.get(errors, ["items", index, "price", "message"])}
                        />
                      )}
                    />
                  </div>*/}
                  <div className="flex-1">
                    <Controller
                      name={`items.${index}.quantity`}
                      control={control}
                      render={({field}) => (
                        <Input
                          label={t('forms.quantity')}
                          type="number"
                          value={field.value as number | string}
                          onChange={field.onChange}
                          error={_.get(errors, ["items", index, "quantity", "message"])}
                          disabled={!rowLocationId}
                        />
                      )}
                    />
                    {rowLocationId && (
                      <p className="text-xs text-neutral-500 mt-1">
                        Available: {rowNetQuantities[index] ?? "—"}
                      </p>
                    )}
                  </div>
                  <div className="flex-1">
                    <InputField
                      name={`items.${index}.comments`}
                      control={control}
                      label={t('forms.comments')}
                    />
                  </div>
                  <div className="flex-0 self-end">
                    <IconTooltipButton label={t('common:actions.remove')}
                      type="button"
                      variant="danger"
                     
                      onClick={() => remove(index)}
                    >
                      <FontAwesomeIcon icon={faTrash}/>
                    </IconTooltipButton>
                  </div>
                </div>
              </div>
              );
            })}
            <InventoryFormLineTotal control={control} name="items" />
          </fieldset>
        </div>

        <div className="flex gap-2 items-center">
          {data?.status && <InventoryDocumentStatusBadge status={data.status} />}
          {!locked && (
            <>
              <Button type="submit" variant="secondary" disabled={postingAfterSave}>
                {t('common:actions.save')} (Draft)
              </Button>
              <Button
                type="button"
                variant="primary"
                isLoading={postingAfterSave}
                disabled={postingAfterSave}
                onClick={() => {
                  setPostingAfterSave(true);
                  void handleSubmit((values) => onSubmit(values, { postAfterSave: true }))();
                }}
              >
                Save &amp; Post
              </Button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
};

