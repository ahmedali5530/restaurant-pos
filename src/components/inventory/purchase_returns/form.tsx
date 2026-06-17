import React, {useEffect, useMemo, useState, useCallback, useRef} from "react";
import { useTranslation } from 'react-i18next';
import * as yup from "yup";
import {Controller, useFieldArray, useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {InventoryPurchaseReturn} from "@/api/model/inventory_purchase_return.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {RecordId, StringRecordId} from "surrealdb";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTrash, faPlus} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {fetchNextSequentialNumber, isUniqueRecordNumber} from "@/utils/recordNumbers.ts";
import {fetchNetQuantity} from "@/utils/inventory.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {dateToCalendarDate, calendarDateToDate, getToday} from "@/utils/date.ts";
import { nowSurrealDateTime, toJsDate, toSurrealDateTime } from "@/lib/datetime.ts";


interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryPurchaseReturn;
}

const createValidationSchema = (db: ReturnType<typeof useDB>, currentId?: string) => yup.object({
  invoice_number: yup.number().typeError("This should be a number").required("This is required").test(
    "unique-purchase-return-invoice",
    "Invoice number already exists",
    async function (value) {
      if (value === undefined || value === null) {
        return true;
      }

      const isUnique = await isUniqueRecordNumber(
        db,
        Tables.inventory_purchase_returns,
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
  purchase: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
  date: yup.mixed().nullable().optional(),
  documents: yup.mixed().optional(),
  items: yup.array().of(
    yup.object({
      store: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("This is required"),
      item: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("This is required"),
      quantity: yup.number().typeError("This should be a number").required("This is required").min(1, "Quantity must be at least 1"),
      supplier: yup.object({
        label: yup.string(),
        value: yup.string()
      }).nullable().optional(),
      comments: yup.string().nullable().optional(),
      purchase_item_id: yup.string().nullable().optional(),
    })
  ).min(1, 'At least one item is required'),
}).required();

export const InventoryPurchaseReturnForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();
  const [state, ] = useAtom(appPage);
  const validationSchema = useMemo(() => createValidationSchema(db, data?.id), [db, data?.id]);
  const resolver = useMemo(() => yupResolver(validationSchema), [validationSchema]);

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 9999, ['suppliers', 'stores'], {
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
    data: purchases,
    fetchData: fetchPurchases,
    isFetching: loadingPurchases
  } = useApi<SettingsData<InventoryPurchase>>(
    Tables.inventory_purchases,
    data?.id === undefined ? ['count(items[where is_done != true]) > 0'] : [],
    [], 0, 9999, ["supplier", "items", "items.item"],
    {
      enabled: false
    },
    data?.id === undefined ? ['*', 'items[where is_done != true] as items'] : ['*']
  );

  const {
    control,
    register,
    handleSubmit,
    formState: {errors},
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
  } = useForm({
    resolver
  });

  const {fields, append, remove, replace} = useFieldArray({
    control,
    name: "items"
  });

  const [syncedPurchaseId, setSyncedPurchaseId] = useState<string | undefined>();
  const [rowNetQuantities, setRowNetQuantities] = useState<Record<number, number>>({});
  const netQuantityCacheRef = useRef<Record<string, number>>({});
  const watchedItems = watch("items");

  useEffect(() => {
    if (open) {
      fetchItems();
      fetchStores();
      fetchPurchases();
    }
  }, [open, fetchItems, fetchStores, fetchPurchases]);


  useEffect(() => {
    if (data) {
      reset({
        invoice_number: data.invoice_number,
        purchase: data.purchase ? {
          label: `Invoice #${data.purchase.invoice_number}`,
          value: data.purchase.id
        } : null,
        date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
        documents: undefined,
        items: data.items?.map(item => ({
          store: (item.store || item.purchase_item?.store) ? {
            label: (item.store || item.purchase_item?.store)?.name ?? "",
            value: (item.store || item.purchase_item?.store)?.id ?? ""
          } : null,
          item: item.item ? {
            label: `${item.item.name}-${item.item.code}`,
            value: item.item.id
          } : null,
          purchase_item_id: item.purchase_item?.id,
          quantity: item.quantity ?? 1,
          supplier: (item.supplier || item.purchase_item?.supplier) ? {
            label: (item.supplier || item.purchase_item?.supplier)?.name ?? "",
            value: (item.supplier || item.purchase_item?.supplier)?.id ?? ""
          } : null,
          comments: item.comments ?? "",
        }))
      });

      setSyncedPurchaseId(data.purchase?.id);
    } else if (open && fields.length === 0) {
      reset({
        invoice_number: 1,
        purchase: null,
        date: getToday(),
        documents: undefined,
        items: []
      });
      append({
        store: null,
        item: null,
        quantity: 1,
        supplier: null,
        comments: "",
        purchase_item_id: null,
      });
    }
  }, [data, open, reset, append, fields.length]);

  useEffect(() => {
    if (!open || data?.id) {
      return;
    }

    let isMounted = true;

    fetchNextSequentialNumber(db, Tables.inventory_purchase_returns, "invoice_number")
      .then((nextNumber) => {
        if (isMounted) {
          setValue("invoice_number", nextNumber);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch next purchase return number", error);
        toast.error(t('toast:inventory.unableGenerateReturnNumber'));
      });

    return () => {
      isMounted = false;
    };
  }, [open, data?.id, db]);

  const closeModal = () => {
    onClose();
    reset({
      invoice_number: 1,
      purchase: null,
      date: getToday(),
      documents: undefined,
      items: []
    });
    setSyncedPurchaseId(undefined);
    setRowNetQuantities({});
    netQuantityCacheRef.current = {};
  };

  const toRecordId = (value?: string | { toString(): string }) => {
    if (!value) return undefined;
    const stringValue = typeof value === "string" ? value : value.toString();
    return new StringRecordId(stringValue);
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

      const payload = {
        invoice_number: Number(values.invoice_number),
        purchase: values.purchase ? toRecordId(values.purchase.value) : undefined,
        documents: documentRefs.length > 0 ? documentRefs : undefined,
        items: [],
        created_at: values.date ? toSurrealDateTime(calendarDateToDate(values.date) || undefined) : nowSurrealDateTime(),
        created_by: toRecordId(state.user.id)
      };

      let purchaseReturnId: any = data?.id;

      if (purchaseReturnId) {
        await db.merge(purchaseReturnId, payload);
        if (data?.items?.length) {
          await Promise.all(
            data.items
              .filter((item) => item.id)
              .map((item) => db.delete(item.id!))
          );
        }
      } else {
        const [created] = await db.create(Tables.inventory_purchase_returns, payload);
        purchaseReturnId = created?.id;
      }

      const purchaseReturnIdString = purchaseReturnId
        ? typeof purchaseReturnId === "string"
          ? purchaseReturnId
          : purchaseReturnId
        : undefined;

      if (!purchaseReturnIdString) {
        throw new Error("Failed to resolve purchase return identifier");
      }

      const itemsRefs = [];
      await Promise.all(
        values.items.map(async (item) => {
          const [created] = await db.create(Tables.inventory_purchase_return_items, {
            purchase_return: toRecordId(purchaseReturnId),
            item: item.item ? toRecordId(item.item.value) : undefined,
            store: item.store ? toRecordId(item.store.value) : undefined,
            supplier: item.supplier ? toRecordId(item.supplier.value) : undefined,
            purchase_item: item.purchase_item_id ? toRecordId(item.purchase_item_id) : undefined,
            quantity: Number(item.quantity),
            comments: item.comments?.trim() ? item.comments.trim() : undefined,
          });

          if (created?.id) {
            itemsRefs.push((created.id));
          }

          if(item.purchase_item_id) {
            await db.merge(toRecordId(item.purchase_item_id), {
              is_done: true
            });
          }
        })
      );

      await db.merge(toRecordId(purchaseReturnIdString), {
        items: itemsRefs,
      });

      toast.success(t('toast:inventory.purchaseReturnSaved'));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

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

      fetchNetQuantity(db, itemId, storeId)
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
  }, [watchedItems, db]);

  const validateAvailableStock = useCallback(async (formValues: any) => {
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
          available = await fetchNetQuantity(db, itemId, storeId);
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
  }, [rowNetQuantities, db, setError, clearErrors]);

  const itemsList = (items?.data ?? []) as (InventoryItem & { stores?: InventoryStore[]; suppliers?: { id: string; name: string }[] })[];
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

  const itemSuppliersMap = useMemo(() => {
    const map: Record<string, { label: string; value: string }[]> = {};
    for (const item of itemsList) {
      const key = item.id?.toString();
      if (!key) continue;
      map[key] = (item.suppliers ?? []).map((s) => ({
        label: s.name,
        value: s.id
      }));
    }
    return map;
  }, [itemsList]);

  const purchaseOptions = purchases?.data?.map(purchase => ({
    label: `Invoice #${purchase.invoice_number}`,
    value: purchase.id
  })) ?? [];

  return (
    <Modal
      title={data ? `Update return #${data?.invoice_number}` : "Create new purchase return"}
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
                  <Input
                    label={t('forms.returnInvoiceNumber')}
                    type="number"
                    {...field}
                    value={field.value ?? ""}
                    error={errors?.invoice_number?.message}
                    disabled={data?.id !== undefined}
                  />
                )}
              />
            </div>
            <div className="flex-1">
              <label>{t('sourceType.purchase')}</label>
              <Controller
                name="purchase"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={purchaseOptions}
                    isLoading={loadingPurchases}
                    isClearable
                    isDisabled={data?.id !== undefined}
                  />
                )}
              />
              <InputError error={_.get(errors, ["purchase", "message"])}/>
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

          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend>{t('tabs.items')}</legend>
            <div className="mb-3">
              <Button
                type="button"
                icon={faPlus}
                variant="primary"
                onClick={() => append({
                  store: null,
                  item: null,
                  quantity: 1,
                  supplier: null,
                  comments: "",
                  purchase_item_id: null,
                })}
              >
                Add item
              </Button>
              <InputError error={_.get(errors, ["items", "message"])}/>
            </div>
            {fields.map((field, index) => {
              const rowStoreId = watchedItems?.[index]?.store?.value;
              const rowItemId = watchedItems?.[index]?.item?.value;
              const rowItemOptions = getItemOptionsForStore(rowStoreId);
              const supplierOptionsForItem = rowItemId && itemSuppliersMap[rowItemId] ? itemSuppliersMap[rowItemId] : [];
              const availableQuantity = rowNetQuantities[index] ?? 0;
              
              return (
                <div className="flex flex-col gap-3 mb-3" key={field.id}>
                  <input type="hidden" {...register(`items.${index}.purchase_item_id` as const)} />
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
                              setValue(`items.${index}.item`, null);
                              setValue(`items.${index}.supplier`, null);
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
                            onChange={(value) => {
                              field.onChange(value);
                              setValue(`items.${index}.supplier`, null);
                            }}
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
                        name={`items.${index}.quantity`}
                        control={control}
                        render={({field}) => (
                          <Input
                            label={`Quantity (Available: ${availableQuantity})`}
                            type="number"
                            value={field.value as number | string}
                            onChange={field.onChange}
                            error={_.get(errors, ["items", index, "quantity", "message"])}
                          />
                        )}
                      />
                    </div>
                    <div className="flex-1">
                      <label>Supplier</label>
                      <Controller
                        name={`items.${index}.supplier`}
                        control={control}
                        render={({field}) => (
                          <ReactSelect
                            value={field.value}
                            onChange={field.onChange}
                            options={supplierOptionsForItem}
                            isDisabled={!rowItemId}
                            isClearable
                          />
                        )}
                      />
                      <InputError error={_.get(errors, ["items", index, "supplier", "message"])}/>
                    </div>
                    <div className="flex-1">
                      <Input
                        label={t('forms.comments')}
                        {...register(`items.${index}.comments` as const)}
                      />
                    </div>
                    <div className="flex-0 self-end">
                      {data?.id === undefined && (
                        <Button
                          type="button"
                          variant="danger"
                          iconButton
                          onClick={() => remove(index)}
                        >
                          <FontAwesomeIcon icon={faTrash}/>
                        </Button>
                      )}
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

