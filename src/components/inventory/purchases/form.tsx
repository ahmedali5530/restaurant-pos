import React, {useEffect, useMemo, useState} from "react";
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
import {Textarea} from "@/components/common/input/textarea.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {InventoryPurchaseOrder, PurchaseOrderStatus} from "@/api/model/inventory_purchase_order.ts";
import {RecordId, StringRecordId} from "surrealdb";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {InventoryPurchaseOrderForm} from "@/components/inventory/purchase_orders/form.tsx";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {CsvUploadModal} from "@/components/common/table/csv.uploader.tsx";
import {fetchNextSequentialNumber, isUniqueRecordNumber} from "@/utils/recordNumbers.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {calendarDateToDate, dateToCalendarDate, getToday} from "@/utils/date.ts";
import {Switch} from "@/components/common/input/switch.tsx";
import {OrderStatus} from "@/api/model/order.ts";
import {DateTime} from "luxon";
import { nowSurrealDateTime, toJsDate, toSurrealDateTime } from "@/lib/datetime.ts";

type PurchaseMethod = "manual" | "csv" | "purchase_order";

interface PurchaseItemFormValue {
  item: { label: string; value: string } | null;
  quantity: number | string;
  requested?: number | string;
  price: number | string;
  base_quantity: number | string;
  expiry_date?: DateValue | null;
  manufacturing_date?: DateValue | null;
  comments?: string;
  supplier?: { label: string; value: string } | null;
  store?: { label: string; value: string } | null;
  code?: string;
}

interface InventoryPurchaseFormValues {
  invoice_number: number | string;
  purchase_order?: { label: string; value: string } | null;
  method: { label: string; value: PurchaseMethod } | null;
  csv_file?: FileList;
  comments?: string;
  documents?: FileList;
  date?: DateValue | null;
  update_item_cost?: boolean;
  items: PurchaseItemFormValue[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryPurchase;
}

const createValidationSchema = (db: ReturnType<typeof useDB>, currentId?: string) => yup.object({
  invoice_number: yup.number().typeError("This should be a number").required("This is required").test(
    "unique-invoice-number",
    "Invoice number already exists",
    async function (value) {
      if (value === undefined || value === null) {
        return true;
      }

      const isUnique = await isUniqueRecordNumber(
        db,
        Tables.inventory_purchases,
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
  method: yup.object({
    label: yup.string(),
    value: yup.string()
  }).required('Please select a purchase method'),
  purchase_order: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
  comments: yup.string().optional(),
  documents: yup.mixed().optional(),
  date: yup.mixed().nullable().optional(),
  update_item_cost: yup.boolean().optional(),
  items: yup.array().of(
    yup.object({
      item: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("This is required"),
      quantity: yup.number().typeError("This should be a number").required("This is required"),
      requested: yup.number().typeError("This should be a number").nullable().optional(),
      price: yup.number().typeError("This should be a number").required("This is required"),
      base_quantity: yup.number().typeError("This should be a number").required("This is required"),
      expiry_date: yup.mixed().nullable().optional(),
      manufacturing_date: yup.mixed().nullable().optional(),
      comments: yup.string().nullable().optional(),
      supplier: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required('Supplier is required'),
      store: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required('Store is required'),
      code: yup.string().nullable().optional(),
    })
  ).min(1, "Add at least one item"),
}).required();

export const InventoryPurchaseForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();
  const [purchaseOrderModal, setPurchaseOrderModal] = useState(false);
  const [state,] = useAtom(appPage);
  const validationSchema = useMemo(() => createValidationSchema(db, data?.id), [db, data?.id]);
  const resolver = useMemo(() => yupResolver(validationSchema), [validationSchema]);

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(
    Tables.inventory_items,
    [],
    [],
    0,
    9999,
    ["suppliers", "stores"],
    {
      enabled: false
    }
  );

  const {
    data: purchaseOrders,
    fetchData: fetchPurchaseOrders,
    isFetching: loadingPurchaseOrders,
  } = useApi<SettingsData<InventoryPurchaseOrder>>(
    Tables.inventory_purchase_orders,
    [`status = '${PurchaseOrderStatus.pending}'`],
    [],
    0,
    9999,
    ["supplier", "items", "items.item", "items.supplier", 'items.item.stores'],
    {
      enabled: false
    });

  const {
    control,
    register,
    handleSubmit,
    formState: {errors},
    reset,
    watch,
    setValue,
    getValues
  } = useForm({
    resolver,
  });

  const {fields, append, remove, replace} = useFieldArray({
    control,
    name: "items"
  });
  const [syncedPurchaseOrderId, setSyncedPurchaseOrderId] = useState<string | undefined>();
  const selectedPurchaseOrder = watch("purchase_order");
  const method = watch("method");
  const itemsValues = watch("items");
  const selectedPurchaseOrderId = selectedPurchaseOrder?.value;
  const isPurchaseOrderSelected = Boolean(selectedPurchaseOrderId);
  const isManualMethod = method?.value === "manual";
  const isCsvMethod = method?.value === "csv";
  const isPurchaseOrderMethod = method?.value === "purchase_order";

  const [csvModal, setCsvModal] = useState(false);

  useEffect(() => {
    if (open) {
      fetchItems();
      fetchPurchaseOrders();
    }
  }, [open, fetchItems, fetchPurchaseOrders]);

  useEffect(() => {
    // auto open csv modal if csv mode is selected
    if (isCsvMethod) {
      setCsvModal(true);
    }
  }, [isCsvMethod])

  useEffect(() => {
    if (!isPurchaseOrderMethod) {
      setValue("purchase_order", null);
      setSyncedPurchaseOrderId(undefined);
    }
  }, [isPurchaseOrderMethod, setValue]);

  useEffect(() => {
    if (!isPurchaseOrderMethod) {
      setSyncedPurchaseOrderId(undefined);
      return;
    }

    const selectedId = selectedPurchaseOrder?.value;

    if (!selectedId) {
      setSyncedPurchaseOrderId(undefined);
      return;
    }

    if (syncedPurchaseOrderId === selectedId) {
      return;
    }

    const order = purchaseOrders?.data?.find((po) => po.id === selectedId);
    if (!order?.items?.length) {
      return;
    }

    const mappedItems = order.items.map((orderItem) => ({
      item: orderItem.item
        ? {
          label: `${orderItem.item.name}-${orderItem.item.code}`,
          value: orderItem.item.id
        }
        : null,
      quantity: orderItem.quantity ?? 1,
      requested: orderItem.quantity ?? undefined,
      price: orderItem.price ?? orderItem.item?.price ?? 0,
      base_quantity: orderItem.item?.base_quantity ?? 1,
      expiry_date: null,
      manufacturing_date: null,
      comments: "",
      supplier: orderItem.supplier
        ? {
          label: orderItem.supplier.name,
          value: orderItem.supplier.id
        }
        : (order.supplier ? {
          label: order.supplier.name,
          value: order.supplier.id
        } : null),
      store: orderItem.item?.stores && orderItem.item.stores.length === 1
        ? {
          label: orderItem.item.stores[0].name,
          value: orderItem.item.stores[0].id
        }
        : null,
      code: orderItem.item?.code ?? ""
    }));

    replace(mappedItems);
    setSyncedPurchaseOrderId(selectedId);
  }, [selectedPurchaseOrder?.value, purchaseOrders?.data, replace, syncedPurchaseOrderId, isPurchaseOrderMethod]);

  useEffect(() => {
    if (!open || data?.id) {
      return;
    }

    let isMounted = true;

    fetchNextSequentialNumber(db, Tables.inventory_purchases, "invoice_number")
      .then((nextNumber) => {
        if (isMounted) {
          setValue("invoice_number", nextNumber);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch next purchase invoice number", error);
        toast.error(t('toast:inventory.unableGenerateInvoiceNumber'));
      });

    return () => {
      isMounted = false;
    };
  }, [open, data?.id, db, setValue]);

  useEffect(() => {
    if (data) {
      reset({
        invoice_number: data.invoice_number ?? 1,
        purchase_order: data.purchase_order ? {
          label: `PO #${data.purchase_order.po_number}`,
          value: data.purchase_order.id
        } : null,
        method: data.method ? {label: data.method, value: data.method.toLowerCase()} : {
          label: t('purchaseMethods.manual'),
          value: "manual"
        },
        comments: data.comments ?? "",
        documents: undefined,
        date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
        update_item_cost: false,
        items: data.items?.map(item => ({
          item: item.item ? {
            label: `${item.item.name}-${item.item.code}`,
            value: item.item.id
          } : null,
          quantity: item.quantity ?? 1,
          requested: item.requested ?? undefined,
          price: item.price ?? 0,
          base_quantity: item.base_quantity ?? 1,
          expiry_date: item.expiry_date ? dateToCalendarDate(item.expiry_date) : null,
          manufacturing_date: item.manufacturing_date ? dateToCalendarDate(item.manufacturing_date) : null,
          comments: item.comments ?? "",
          supplier: item.supplier ? {
            label: item.supplier.name,
            value: item.supplier.id
          } : null,
          store: item.store ? {
            label: item.store.name,
            value: item.store.id.toString()
          } : null,
          code: item.code ?? ""
        }))
      });
    } else if (open) {
      reset({
        invoice_number: 1,
        purchase_order: null,
        method: {label: t('purchaseMethods.manual'), value: "manual"},
        comments: "",
        documents: undefined,
        date: getToday(),
        update_item_cost: false,
        items: []
      });
    }
  }, [data, open, reset]);

  const closeModal = () => {
    onClose();
    setSyncedPurchaseOrderId(undefined);
    reset({
      invoice_number: 1,
      purchase_order: null,
      method: {label: "Manual", value: "manual"},
      comments: "",
      documents: undefined,
      date: getToday(),
      update_item_cost: false,
      items: []
    });
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
    console.log(values.items)
    try {
      const documentRefs = await convertFilesToDocuments(values.documents);

      const payload = {
        invoice_number: Number(values.invoice_number),
        purchase_order: isPurchaseOrderMethod && values.purchase_order ? toRecordId(values.purchase_order.value) : undefined,
        method: values.method ? values.method.value : 'manual',
        comments: values.comments?.trim() ? values.comments.trim() : undefined,
        documents: documentRefs.length > 0 ? documentRefs : undefined,
        items: [],
        created_at: values.date ? toSurrealDateTime(calendarDateToDate(values.date) || undefined) : nowSurrealDateTime(),
        created_by: toRecordId(state.user.id)
      };

      let purchaseId: any = data?.id;
      const previousPurchaseOrderId = data?.purchase_order?.id;
      const selectedPurchaseOrderId = isPurchaseOrderMethod ? values.purchase_order?.value : undefined;

      if (purchaseId) {
        await db.merge(purchaseId, payload);
        if (data?.items?.length) {
          await Promise.all(
            data.items
              .filter((item) => item.id)
              .map((item) => db.delete(item.id!))
          );
        }
      } else {
        const [created] = await db.create(Tables.inventory_purchases, payload);
        purchaseId = created?.id;
      }

      const purchaseIdString = purchaseId
        ? typeof purchaseId === "string"
          ? purchaseId
          : purchaseId
        : undefined;

      if (!purchaseIdString) {
        throw new Error("Failed to resolve purchase identifier");
      }

      console.log(values.items)

      const itemsRefs = [];
      await Promise.all(
        values.items.map(async (item) => {
          const [created] = await db.create(Tables.inventory_purchase_items, {
            item: item.item ? toRecordId(item.item.value) : undefined,
            quantity: Number(item.quantity),
            requested: item.requested !== undefined && item.requested !== "" ? Number(item.requested) : undefined,
            price: Number(item.price),
            base_quantity: Number(item.base_quantity),
            expiry_date: item.expiry_date ? calendarDateToDate(item.expiry_date) : undefined,
            manufacturing_date: item.manufacturing_date ? calendarDateToDate(item.manufacturing_date) : undefined,
            comments: item.comments?.trim() ? item.comments.trim() : undefined,
            supplier: item.supplier ? toRecordId(item.supplier.value) : undefined,
            store: item.store ? toRecordId(item.store.value) : undefined,
            code: item.code?.trim() || undefined,
            purchase: toRecordId(purchaseIdString)
          });

          if (created?.id) {
            itemsRefs.push(created.id);
          }

          // Update item price if switch is enabled
          if (values.update_item_cost && item.item?.value && item.price && Number(item.price) > 0) {
            await db.merge(toRecordId(item.item.value), {
              price: Number(item.price)
            });
          }
        })
      );

      await db.merge(toRecordId(purchaseIdString), {
        items: itemsRefs,
      });

      if (isPurchaseOrderMethod && selectedPurchaseOrderId) {
        await db.merge(toRecordId(selectedPurchaseOrderId), {
          status: PurchaseOrderStatus.fulfilled
        });

        const [purchaseOrder] = await db.query(`SELECT * FROM ONLY ${toRecordId(selectedPurchaseOrderId)} fetch supplier`);
        if(data === undefined && purchaseOrder.supplier){
          await db.merge(toRecordId(purchaseOrder.supplier.id), {
            purchases: Array.from(new Set([...(purchaseOrder.supplier.purchases || []), purchaseIdString])),
          });
        }
      }

      toast.success(t('toast:inventory.purchaseSaved'));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const itemsList: (InventoryItem & { suppliers?: { id: string; name: string }[]; stores?: InventoryStore[] })[] =
    (items?.data as any) ?? [];

  const itemOptions = itemsList.map(item => ({
    label: `${item.name}-${item.code}`,
    value: item.id
  }));

  const itemSuppliersMap = React.useMemo(() => {
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

  const itemStoresMap = React.useMemo(() => {
    const map: Record<string, { label: string; value: string }[]> = {};
    for (const item of itemsList) {
      const key = item.id?.toString();
      if (!key) continue;
      map[key] = (item.stores ?? []).map((st: InventoryStore) => ({
        label: st.name,
        value: (st as any).id ?? (st as any)?.toString?.() ?? ""
      }));
    }
    return map;
  }, [itemsList]);

  const purchaseOrderOptions = purchaseOrders?.data?.map(order => ({
    label: `PO #${order.po_number} (${order.status})`,
    value: order.id
  })) ?? [];

  const methodOptions: { label: string; value: PurchaseMethod }[] = [
    {label: t('purchaseMethods.manual'), value: "manual"},
    {label: t('purchaseMethods.csv'), value: "csv"},
    {label: t('purchaseMethods.purchaseOrder'), value: "purchase_order"},
  ];

  return (
    <>
      <Modal
        title={data ? `Update invoice #${data?.invoice_number}` : "Create new purchase"}
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
                      label={t('forms.invoiceNumber')}
                      type="number"
                      {...field}
                      value={field.value ?? ""}
                      error={errors?.invoice_number?.message}
                    />
                  )}
                />
              </div>
              <div className="flex-1">
                <label>Method</label>
                <Controller
                  name="method"
                  control={control}
                  render={({field}) => (
                    <ReactSelect
                      value={field.value}
                      onChange={field.onChange}
                      options={methodOptions}
                      isClearable={false}
                      isDisabled={data?.id !== undefined}
                    />
                  )}
                />
                <InputError error={_.get(errors, ["method", "message"])}/>
              </div>
              <div className="flex-1">
                <Controller
                  name="date"
                  control={control}
                  render={({field}) => (
                    <DatePicker
                      label={t('forms.date')}
                      value={field.value as DateValue}
                      onChange={field.onChange}
                      maxValue={getToday()}
                      isClearable={false}
                    />
                  )}
                />
                <InputError error={_.get(errors, ["date", "message"])}/>
              </div>
            </div>

            {isPurchaseOrderMethod && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label>Purchase order</label>
                  <Controller
                    name="purchase_order"
                    control={control}
                    render={({field}) => (
                      <ReactSelect
                        value={field.value}
                        onChange={field.onChange}
                        options={purchaseOrderOptions}
                        isLoading={loadingPurchaseOrders}
                        isClearable
                        isDisabled={data?.purchase_order !== undefined}
                      />
                    )}
                  />
                  <InputError error={_.get(errors, ["purchase_order", "message"])}/>
                </div>
                <Button
                  disabled={data?.purchase_order !== undefined}
                  type="button" variant="primary" iconButton onClick={() => setPurchaseOrderModal(true)}>
                  <FontAwesomeIcon icon={faPlus}/>
                </Button>
              </div>
            )}

            {isCsvMethod && (
              <div className="flex gap-2 items-end">
                <Button
                  type="button"
                  variant="primary"
                  filled
                  onClick={() => setCsvModal(true)}
                >{t('csv.uploadTitle')}</Button>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <Textarea
                  placeholder={t('forms.comments')}
                  rows={4}
                  {...register("comments")}
                />
              </div>
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
              {!isManualMethod && (
                <p className="text-sm text-neutral-500 mb-2">
                  {isPurchaseOrderMethod
                    ? "Items are synchronized from the selected purchase order. Switch back to Manual to edit the list."
                    : "Upload a CSV to import items later. Switch back to Manual to edit the list here."}
                </p>
              )}
              <div className="mb-3">
                <Button
                  type="button"
                  icon={faPlus}
                  variant="primary"
                  disabled={!isManualMethod}
                  onClick={() => append({
                    item: null,
                    quantity: 1,
                    requested: undefined,
                    price: 0,
                    base_quantity: 1,
                    expiry_date: null,
                    manufacturing_date: null,
                    comments: "",
                    supplier: null,
                    code: "",
                    store: null
                  })}
                >
                  Add item
                </Button>
                <InputError error={_.get(errors, ["items", "message"])}/>
              </div>

              {fields.map((field, index) => {
                const selectedItemId = itemsValues?.[index]?.item?.value as string | undefined;
                const supplierOptionsForItem =
                  selectedItemId && itemSuppliersMap[selectedItemId]
                    ? itemSuppliersMap[selectedItemId]
                    : [];
                const storeOptionsForItem =
                  selectedItemId && itemStoresMap[selectedItemId]
                    ? itemStoresMap[selectedItemId]
                    : [];

                return (
                  <div className="flex flex-col gap-3 mb-4 border border-neutral-400 rounded-lg p-3" key={field.id}>
                    <div className="flex gap-3">
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
                              }}
                              options={itemOptions}
                              isLoading={loadingItems}
                              isDisabled={isCsvMethod || isPurchaseOrderMethod}
                            />
                          )}
                        />
                        <InputError error={_.get(errors, ["items", index, "item", "message"])}/>
                      </div>
                      <div className="flex-1">
                        <Controller
                          name={`items.${index}.base_quantity`}
                          control={control}
                          render={({field}) => (
                            <Input
                              label={t('columns.baseQuantity')}
                              type="number"
                              value={field.value as number | string}
                              onChange={field.onChange}
                              error={_.get(errors, ["items", index, "base_quantity", "message"])}
                              disabled={isCsvMethod || isPurchaseOrderMethod}
                            />
                          )}
                        />
                      </div>
                      <div className="flex-1 self-end">
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
                            />
                          )}
                        />
                      </div>
                      <div className="flex-1 self-end">
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
                              disabled={isCsvMethod || isPurchaseOrderMethod}
                            />
                          )}
                        />
                      </div>
                      <div className="flex-1">
                        <Controller
                          name={`items.${index}.price`}
                          control={control}
                          render={({field}) => (
                            <Input
                              label={t('columns.price')}
                              type="number"
                              value={field.value as number | string}
                              onChange={field.onChange}
                              error={_.get(errors, ["items", index, "price", "message"])}
                            />
                          )}
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Controller
                          name={`items.${index}.expiry_date`}
                          control={control}
                          render={({field}) => (
                            <DatePicker
                              label={t('forms.expiryDate')}
                              value={field.value as DateValue}
                              onChange={field.onChange}
                              isClearable
                            />
                          )}
                        />
                      </div>
                      <div className="flex-1">
                        <Controller
                          name={`items.${index}.manufacturing_date`}
                          control={control}
                          render={({field}) => (
                            <DatePicker
                              label={t('forms.manufacturingDate')}
                              value={field.value as DateValue}
                              onChange={field.onChange}
                              isClearable
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
                              isLoading={loadingItems}
                              isClearable
                              isDisabled={isCsvMethod || isPurchaseOrderMethod}
                            />
                          )}
                        />
                        <InputError error={_.get(errors, ["items", index, "supplier", "message"])}/>
                      </div>
                      <div className="flex-1">
                        <label>Store</label>
                        <Controller
                          name={`items.${index}.store`}
                          control={control}
                          render={({field}) => (
                            <ReactSelect
                              value={field.value}
                              onChange={field.onChange}
                              options={storeOptionsForItem}
                              isLoading={loadingItems}
                              isClearable
                            />
                          )}
                        />
                        <InputError error={_.get(errors, ["items", index, "store", "message"])}/>
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
                          disabled={isPurchaseOrderMethod}
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
      {purchaseOrderModal && (
        <InventoryPurchaseOrderForm
          open
          onClose={() => {
            setPurchaseOrderModal(false);
            fetchPurchaseOrders();
          }}
        />
      )}

      {isCsvMethod && (
        <CsvUploadModal
          isOpen={csvModal}
          onClose={() => setCsvModal(false)}
          fields={[{
            name: 'name',
            label: t('itemName')
          }, {
            name: 'code',
            label: t('itemCode')
          }, {
            name: 'base_quantity',
            label: t('columns.baseQuantity')
          }, {
            name: 'quantity',
            label: t('forms.quantity')
          }, {
            name: 'requested',
            label: t('forms.requested')
          }, {
            name: 'price',
            label: t('columns.price')
          }, {
            name: 'expiry_date',
            label: t('forms.expiryDate')
          }, {
            name: 'manufacturing_date',
            label: t('forms.manufacturingDate')
          }, {
            name: 'supplier',
            label: t('columns.suppliers')
          }, {
            name: 'store',
            label: t('columns.stores')
          }, {
            name: 'comments',
            label: t('forms.comments')
          }]}
          onCreateRow={async (rowData) => {
            try {
              // find item
              const [item] = await db.query(`SELECT *
                                             FROM ${Tables.inventory_items}
                                             where name = $name
                                               and code = $code fetch suppliers
                                                 , stores`, {
                name: rowData.name,
                code: rowData.code,
              });

              if (item.length === 0) {
                throw new Error('Item not found');
              }

              const supplier = item[0]?.suppliers.find(item => item.name === rowData.supplier);
              if (supplier === undefined) {
                throw new Error('Supplier not found');
              }

              const store = item[0]?.stores.find(item => item.name === rowData.store);
              if (store === undefined) {
                throw new Error('Store not found');
              }

              append({
                item: {
                  label: `${item[0].name}-${item[0].code}`,
                  value: item[0].id
                },
                quantity: Number(rowData.quantity),
                requested: Number(rowData.requested),
                price: Number(rowData.price),
                base_quantity: Number(rowData.base_quantity),
                expiry_date: rowData.expiry_date ? dateToCalendarDate(rowData.expiry_date) : null,
                manufacturing_date: rowData.manufacturing_date ? dateToCalendarDate(rowData.manufacturing_date) : null,
                comments: rowData.comments,
                supplier: {
                  label: supplier.name,
                  value: supplier.id
                },
                code: "",
                store: {
                  label: store.name,
                  value: store.id
                }
              });
            } catch (e) {
              throw e;
            }
          }}
          onDone={(data) => {
            if (data.total === data.success) {
              setCsvModal(false);
            }
          }}
        />
      )}
    </>
  );
};

