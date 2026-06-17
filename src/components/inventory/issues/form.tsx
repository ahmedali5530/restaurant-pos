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
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {InventoryIssue} from "@/api/model/inventory_issue.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {User} from "@/api/model/user.ts";
import {Kitchen} from "@/api/model/kitchen.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {RecordId, StringRecordId} from "surrealdb";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {appPage} from "@/store/jotai.ts";
import {useAtom} from "jotai";
import {fetchNextSequentialNumber, isUniqueRecordNumber} from "@/utils/recordNumbers.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {dateToCalendarDate, calendarDateToDate, getToday} from "@/utils/date.ts";
import {Switch} from "@/components/common/input/switch.tsx";
import { nowSurrealDateTime, toJsDate, toSurrealDateTime } from "@/lib/datetime.ts";

interface InventoryIssueItemFormValue {
  store: { label: string; value: string } | null;
  item: { label: string; value: string } | null;
  requested?: number | string;
  quantity: number | string;
  price?: number | string;
  comments?: string;
}

interface InventoryIssueFormValues {
  invoice_number: number | string;
  issued_to?: { label: string; value: string } | null;
  kitchen?: { label: string; value: string } | null;
  date?: DateValue | null;
  documents?: FileList;
  update_item_cost?: boolean;
  items: InventoryIssueItemFormValue[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryIssue;
}

const toRecordId = (value?: string | { toString(): string }) => {
  if (!value) return undefined;
  const stringValue = typeof value === "string" ? value : value.toString();
  return new StringRecordId(stringValue);
};

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
  kitchen: yup.object({
    label: yup.string(),
    value: yup.string()
  }).required('This is required'),
  date: yup.mixed().nullable().optional(),
  documents: yup.mixed().optional(),
  update_item_cost: yup.boolean().optional(),
  items: yup.array().of(
    yup.object({
      store: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("Store is required"),
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
  const { t } = useTranslation('inventory');
  const db = useDB();
  const validationSchema = useMemo(() => createValidationSchema(db, data?.id), [db, data?.id]);
  const resolver = useMemo(() => yupResolver(validationSchema), [validationSchema]);

  const [state, ] = useAtom(appPage);

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 9999, ["stores"], {
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
    data: kitchens,
    fetchData: fetchKitchens,
    isFetching: loadingKitchens,
  } = useApi<SettingsData<Kitchen>>(Tables.kitchens, ['deleted_at = none'], [], 0, 9999, [], {
    enabled: false
  });

  const {
    data: stores,
    fetchData: fetchStores,
    isFetching: loadingStores,
  } = useApi<SettingsData<InventoryStore>>(Tables.inventory_stores, [], [], 0, 9999, [], {
    enabled: false
  });

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
    store: null,
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

  const getTotalFromResult = useCallback((result: any) => {
    if (!result) return 0;
    if (Array.isArray(result)) {
      return result[0]?.total ?? 0;
    }
    if (Array.isArray(result.result)) {
      return result.result[0]?.total ?? 0;
    }
    return 0;
  }, []);

  const fetchNetQuantity = useCallback(async (itemId: string, storeId: string) => {
    const params = {
      item: toRecordId(itemId),
      store: toRecordId(storeId)
    };

    const [
      [purchaseRows],
      [returnRows],
      [issueRows],
      [issueReturnRows],
      [wasteRows],
    ] = await Promise.all([
      db.query(`SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_items} WHERE item = $item AND store = $store GROUP ALL`, params),
      db.query(`SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_purchase_return_items} WHERE item = $item AND purchase_item.store = $store GROUP ALL`, params),
      db.query(`SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_items} WHERE item = $item AND store = $store GROUP ALL`, params),
      db.query(`SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_issue_return_items} WHERE item = $item AND store = $store GROUP ALL`, params),
      db.query(`SELECT Math::sum(quantity) AS total FROM ${Tables.inventory_waste_items} WHERE item = $item AND purchase_item != null AND purchase_item.store = $store GROUP ALL`, params),
    ]);

    const purchaseTotal = getTotalFromResult(purchaseRows);
    const returnTotal = getTotalFromResult(returnRows);
    const issueTotal = getTotalFromResult(issueRows);
    const issueReturnTotal = getTotalFromResult(issueReturnRows);
    const wasteTotal = getTotalFromResult(wasteRows);

    return purchaseTotal - returnTotal - issueTotal + issueReturnTotal - wasteTotal;
  }, [db, getTotalFromResult]);

  const {fields, append, remove, replace} = useFieldArray({
    control,
    name: "items"
  });

  useEffect(() => {
    if (open) {
      fetchItems();
      fetchUsers();
      fetchKitchens();
      fetchStores();
    }
  }, [open, fetchItems, fetchUsers, fetchKitchens, fetchStores]);

  useEffect(() => {
    if (data) {
      resetInventoryState();
      reset({
        invoice_number: data?.invoice_number,
        issued_to: data.issued_to ? {
          label: `${data.issued_to.first_name} ${data.issued_to.last_name}`,
          value: data.issued_to.id
        } : null,
        kitchen: data.kitchen ? {
          label: data.kitchen.name,
          value: data.kitchen.id
        } : null,
        date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
        documents: undefined,
        update_item_cost: false,
        items: data.items?.map(item => ({
          store: item.store ? {
            label: item.store.name,
            value: item.store.id
          } : null,
          item: item.item ? {
            label: `${item.item.name}-${item.item.code}`,
            value: item.item.id
          } : null,
          requested: item.requested ?? 1,
          quantity: item.quantity ?? 1,
          price: item.price ?? 0,
          comments: item.comments ?? "",
        }))
      });
    } else if (open) {
      resetInventoryState();
      reset({
        invoice_number: 1,
        issued_to: null,
        kitchen: null,
        date: getToday(),
        documents: undefined,
        update_item_cost: false,
        items: [createEmptyItem()]
      });
    }
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
  }, [open, data?.id, db, setValue]);

  useEffect(() => {
    if (open && !data && fields.length === 0) {
      append(createEmptyItem());
    }
  }, [open, data, fields.length, append, createEmptyItem]);

  useEffect(() => {
    watchedItems?.forEach((item, index) => {
      const itemId = item?.item?.value;
      const storeId = item?.store?.value;
      
      if (!itemId || !storeId) {
        setRowNetQuantities(prev => {
          if (prev[index] === undefined) return prev;
          const next = {...prev};
          delete next[index];
          return next;
        });
        return;
      }

      const cacheKey = `${itemId}-${storeId}`;
      const cached = netQuantityCacheRef.current[cacheKey];
      if (cached !== undefined) {
        setRowNetQuantities(prev => {
          if (prev[index] === cached) return prev;
          return {...prev, [index]: cached};
        });
        return;
      }

      fetchNetQuantity(itemId, storeId)
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
  }, [watchedItems, fetchNetQuantity]);

  const validateAvailableStock = useCallback(async (formValues: InventoryIssueFormValues) => {
    let isValid = true;

    for (let index = 0; index < formValues.items.length; index++) {
      const row = formValues.items[index];
      const itemId = row.item?.value;
      const storeId = row.store?.value;
      
      if (!itemId || !storeId) continue;

      const desiredQuantity = Number(row.quantity) || 0;
      if (desiredQuantity <= 0) continue;

      const cacheKey = `${itemId}-${storeId}`;
      let available = rowNetQuantities[index] ?? netQuantityCacheRef.current[cacheKey];

      if (available === undefined) {
        try {
          available = await fetchNetQuantity(itemId, storeId);
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
  }, [rowNetQuantities, fetchNetQuantity, setError, clearErrors, setRowNetQuantities]);

  const closeModal = () => {
    onClose();
    resetInventoryState();
    reset({
      invoice_number: 1,
      issued_to: null,
      kitchen: null,
      date: getToday(),
      documents: undefined,
      update_item_cost: false,
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

  const onSubmit = async (values: any) => {
    try {
      const hasAvailableStock = await validateAvailableStock(values);
      if (!hasAvailableStock) {
        toast.error(t('toast:inventory.itemsExceedQuantity'));
        return;
      }

      const documentRefs = await convertFilesToDocuments(values.documents);

      const payload: Record<string, unknown> = {
        issued_to: values.issued_to ? toRecordId(values.issued_to.value) : undefined,
        kitchen: values.kitchen ? toRecordId(values.kitchen.value) : undefined,
        items: [],
        invoice_number: Number(values.invoice_number),
        documents: documentRefs.length > 0 ? documentRefs : undefined,
      };

      if (!data?.id) {
        payload.created_at = values.date ? toSurrealDateTime(calendarDateToDate(values.date) || undefined) : nowSurrealDateTime();
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
            store: item.store ? toRecordId(item.store.value) : undefined,
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

      toast.success(t('toast:inventory.issueSaved'));
      closeModal();
    } catch (error) {
      console.log(error)
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const itemsList = (items?.data ?? []) as (InventoryItem & { stores?: InventoryStore[] })[];
  const storeOptions = stores?.data?.map(store => ({
    label: store.name,
    value: store.id
  })) ?? [];
  
  const getItemOptionsForStore = useCallback((storeId?: string) => {
    if (!storeId) {
      return [];
    }
    return itemsList
      .filter(item => item.stores?.some(store => store.id.toString() === storeId.toString()))
      .map(item => ({
        label: item.code ? `${item.name}-${item.code}` : item.name,
        value: item.id
      }));
  }, [itemsList]);

  const userOptions = users?.data?.map(user => ({
    label: `${user.first_name} ${user.last_name}`,
    value: user.id
  })) ?? [];

  const kitchenOptions = kitchens?.data?.map(kitchen => ({
    label: kitchen.name,
    value: kitchen.id
  })) ?? [];

  return (
    <Modal
      title={data ? `Update issue# ${data?.invoice_number}` : "Create new issue"}
      open={open}
      onClose={closeModal}
      size="xl"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
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
              <label>{t('columns.kitchen')}</label>
              <Controller
                name="kitchen"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={kitchenOptions}
                    isLoading={loadingKitchens}
                    isClearable
                  />
                )}
              />
              <InputError error={_.get(errors, ["kitchen", "message"])}/>
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
              const rowStoreId = watchedItems?.[index]?.store?.value;
              const rowItemOptions = getItemOptionsForStore(rowStoreId);
              
              return (
              <div className="flex flex-col mb-3" key={field.id}>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label>Store</label>
                    <Controller
                      name={`items.${index}.store`}
                      control={control}
                      render={({field}) => (
                        <ReactSelect
                          value={field.value}
                          onChange={(value) => {
                            field.onChange(value);
                            // Clear item when store changes
                            setValue(`items.${index}.item`, null);
                          }}
                          options={storeOptions}
                          isLoading={loadingStores}
                        />
                      )}
                    />
                    <InputError error={_.get(errors, ["items", index, "store", "message"])}/>
                  </div>
                  <div className="flex-1">
                    <label>{t('buttons.item')}</label>
                    <Controller
                      name={`items.${index}.item`}
                      control={control}
                      render={({field}) => (
                        <ReactSelect
                          value={field.value}
                          onChange={field.onChange}
                          options={rowItemOptions}
                          isLoading={loadingItems}
                          isDisabled={!rowStoreId}
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
                          disabled={!rowStoreId}
                        />
                      )}
                    />
                    {rowStoreId && (
                      <p className="text-xs text-neutral-500 mt-1">
                        Available: {rowNetQuantities[index] ?? "—"}
                      </p>
                    )}
                  </div>
                  <div className="flex-1">
                    <Input
                      label={t('forms.comments')}
                      {...register(`items.${index}.comments` as const)}
                    />
                  </div>
                  <div className="flex-0 self-end">
                    <Button
                      type="button"
                      variant="danger"
                      iconButton
                      onClick={() => remove(index)}
                    >
                      <FontAwesomeIcon icon={faTrash}/>
                    </Button>
                  </div>
                </div>
              </div>
              );
            })}
          </fieldset>
        </div>

        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};

