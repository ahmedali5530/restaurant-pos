import React, {useEffect, useMemo, useState} from "react";
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
import {InventoryPurchaseOrder, PurchaseOrderStatus} from "@/api/model/inventory_purchase_order.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventorySupplier} from "@/api/model/inventory_supplier.ts";
import {RecordId, StringRecordId} from "surrealdb";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {SupplierForm} from "@/components/inventory/suppliers/form.tsx";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {fetchNextSequentialNumber, isUniqueRecordNumber} from "@/utils/recordNumbers.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {dateToCalendarDate, calendarDateToDate, getToday} from "@/utils/date.ts";
import { nowSurrealDateTime, toJsDate, toSurrealDateTime } from "@/lib/datetime.ts";

interface PurchaseOrderItemFormValue {
  item: { label: string; value: string } | null;
  quantity: number | string;
  price?: number | string;
  supplier?: { label: string; value: string } | null;
}

interface InventoryPurchaseOrderFormValues {
  po_number: number | string;
  status: string;
  supplier?: { label: string; value: string } | null;
  date?: DateValue | null;
  documents?: FileList | null;
  items: PurchaseOrderItemFormValue[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryPurchaseOrder;
}

const createValidationSchema = (db: ReturnType<typeof useDB>, currentId?: string) => yup.object({
  po_number: yup.number().typeError("This should be a number").required("This is required").test(
    "unique-po-number",
    "PO number already exists",
    async function (value) {
      if (value === undefined || value === null) {
        return true;
      }

      const isUnique = await isUniqueRecordNumber(
        db,
        Tables.inventory_purchase_orders,
        "po_number",
        value,
        currentId
      );

      if (!isUnique) {
        return this.createError({
          message: "PO number already exists",
          path: "po_number"
        });
      }

      return true;
    }
  ),
  supplier: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
  date: yup.mixed().nullable().optional(),
  documents: yup.mixed().optional(),
  items: yup.array().of(
    yup.object({
      item: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("This is required"),
      quantity: yup.number().typeError("This should be a number").required("This is required"),
      price: yup.number().typeError("This should be a number").optional(),
      supplier: yup.object({
        label: yup.string(),
        value: yup.string()
      }).nullable().optional(),
    })
  ).min(1, "Add at least one item"),
}).required();

export const InventoryPurchaseOrderForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();
  const [state, ] = useAtom(appPage);
  const validationSchema = useMemo(() => createValidationSchema(db, data?.id), [db, data?.id]);
  const resolver = useMemo(() => yupResolver(validationSchema), [validationSchema]);

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 9999, ['suppliers'], {
    enabled: false
  });

  const {
    data: suppliers,
    fetchData: fetchSuppliers,
    isFetching: loadingSuppliers,
  } = useApi<SettingsData<InventorySupplier>>(Tables.inventory_suppliers, [], [], 0, 9999, [], {
    enabled: false
  });
  const [supplierModal, setSupplierModal] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    formState: {errors},
    reset,
    watch,
    setValue,
  } = useForm({
    resolver
  });

  const {fields, append, remove} = useFieldArray({
    control,
    name: "items"
  });
  const watchedItems = useWatch({
    control,
    name: "items"
  });
  const selectedSupplier = watch("supplier");
  const selectedSupplierId = selectedSupplier?.value;

  const convertFilesToDocuments = async (files: FileList | null | undefined) => {
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

  useEffect(() => {
    if (open) {
      fetchItems();
      fetchSuppliers();
    }
  }, [open, fetchItems, fetchSuppliers]);

  useEffect(() => {
    if (!open || data?.id) {
      return;
    }

    let isMounted = true;
    fetchNextSequentialNumber(db, Tables.inventory_purchase_orders, "po_number")
      .then((nextNumber) => {
        if (isMounted) {
          setValue("po_number", nextNumber);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch next PO number", error);
        toast.error(t('toast:inventory.unableGeneratePoNumber'));
      });

    return () => {
      isMounted = false;
    };
  }, [open, data?.id, db, setValue]);

  useEffect(() => {
    if (data) {
      reset({
        po_number: data.po_number,
        supplier: data.supplier ? {
          label: data.supplier.name,
          value: data.supplier.id
        } : null,
        date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
        documents: undefined,
        items: data?.items?.map(item => ({
          item: {
            label: `${item.item.name}-${item.item.code}`,
            value: item.item.id
          },
          quantity: item.quantity ?? 1,
          price: item.price ?? 0,
          supplier: item.supplier ? {
            label: item.supplier.name,
            value: item.supplier.id
          } : null
        }))
      });
    }
  }, [data, reset]);

  const closeModal = () => {
    onClose();
    reset({
      po_number: 0,
      supplier: null,
      date: getToday(),
      documents: undefined,
      items: [{
        item: null,
        quantity: 1,
        price: 0,
        supplier: null
      }]
    });
  };

  const toRecordId = (value?: string | { toString(): string }) => {
    if (!value) return undefined;
    const stringValue = typeof value === "string" ? value : value.toString();
    return new StringRecordId(stringValue);
  };

  const onSubmit = async (values: any) => {
    try {
      const documentRefs = await convertFilesToDocuments(values.documents);

      const payload = {
        po_number: Number(values.po_number),
        supplier: values.supplier ? toRecordId(values.supplier.value) : undefined,
        items: [],
        created_at: values.date ? toSurrealDateTime(calendarDateToDate(values.date) || undefined) : nowSurrealDateTime(),
        created_by: state.user.id,
        status: PurchaseOrderStatus.pending,
        documents: documentRefs.length > 0 ? documentRefs : undefined,
      };

      let orderId: any = data?.id;

      if (orderId) {
        await db.update(orderId, payload);
        if (data?.items?.length) {
          await Promise.all(
            data.items
              .filter((item) => item.id)
              .map((item) => db.delete(item.id!))
          );
        }
      } else {
        const [created] = await db.create(Tables.inventory_purchase_orders, payload);
        orderId = created?.id;
      }

      const orderIdString = orderId
        ? typeof orderId === "string"
          ? orderId
          : orderId
        : undefined;

      if (!orderIdString) {
        throw new Error("Failed to resolve purchase order identifier");
      }

      const itemsRefs = [];
      await Promise.all(
        values.items.map(async (item) => {
          const [created] = await db.create(Tables.inventory_purchase_order_items, {
            purchase_order: toRecordId(orderIdString),
            item: item.item ? toRecordId(item.item.value) : undefined,
            quantity: Number(item.quantity),
            price: Number(item.price),
            supplier: item.supplier ? toRecordId(item.supplier.value) : undefined,
          });

          if (created?.id) {
            itemsRefs.push(created.id);
          }
        })
      );

      await db.merge(orderIdString, {
        items: itemsRefs,
      });

      toast.success(t('toast:inventory.purchaseOrderSaved'));
      closeModal();
    } catch (error) {
      console.log(error)
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const suppliersList = suppliers?.data ?? [];
  const itemsList = items?.data ?? [];

  const supplierOptions = useMemo(() => suppliersList.map(supplier => ({
    label: supplier.name,
    value: supplier.id
  })), [suppliersList]);

  const itemOptions = useMemo(() => itemsList.map(item => ({
    label: `${item.name}-${item.code}`,
    value: item.id
  })), [itemsList]);

  const supplierFilteredItemOptions = useMemo(() => {
    if (!selectedSupplierId) {
      return itemOptions;
    }

    return itemsList
      .filter(item => item.suppliers?.some(supplier => {
        return supplier.id.toString() === selectedSupplierId.toString()
      }))
      .map(item => ({
        label: `${item.name}-${item.code}`,
        value: item.id
      }));
  }, [itemOptions, itemsList, selectedSupplierId]);

  const availableItemOptions = selectedSupplierId ? supplierFilteredItemOptions : itemOptions;

  const itemSuppliersMap = useMemo(() => {
    return itemsList.reduce<Record<string, { label: string; value: string }[]>>((acc, item) => {
      acc[item.id.toString()] = item.suppliers?.map(supplier => ({
        label: supplier.name,
        value: supplier.id
      })) ?? [];
      return acc;
    }, {});
  }, [itemsList]);

  console.log();

  return (
    <>
      <Modal
        title={data ? `Update PO #${data?.po_number}` : "Create new purchase order"}
        open={open}
        onClose={closeModal}
        size="xl"
      >
        <form onSubmit={handleSubmit(onSubmit)}>

          <div className="flex flex-col gap-3 mb-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <Controller
                  name="po_number"
                  control={control}
                  render={({field}) => (
                    <Input
                      label={t('forms.poNumber')}
                      type="number"
                      {...field}
                      value={field.value ?? ""}
                      error={errors?.po_number?.message}
                    />
                  )}
                />
              </div>
              <div className="flex-1 flex gap-3 items-end">
                <div className="flex-1 flex gap-2 items-end">
                  <div className="flex-1">
                    <label>Supplier</label>
                    <Controller
                      name="supplier"
                      control={control}
                      render={({field}) => (
                        <ReactSelect
                          value={field.value}
                          onChange={field.onChange}
                          options={supplierOptions}
                          isLoading={loadingSuppliers}
                          isClearable
                        />
                      )}
                    />
                    <InputError error={_.get(errors, ["supplier", "message"])}/>
                  </div>
                  <Button type="button" variant="primary" iconButton onClick={() => setSupplierModal(true)}>
                    <FontAwesomeIcon icon={faPlus}/>
                  </Button>
                </div>
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
              <div className="mb-3 flex gap-2">
                <Button
                  type="button"
                  icon={faPlus}
                  variant="primary"
                  onClick={() => append({item: null, quantity: 1, price: 0, supplier: null})}
                >
                  Add item
                </Button>
              </div>

              <InputError error={_.get(errors, ["items", "message"])}/>


              {fields.map((field, index) => {
                const selectedRowItemId = watchedItems?.[index]?.item?.value;
                const rowSupplierOptions = selectedRowItemId
                  ? itemSuppliersMap[selectedRowItemId] ?? []
                  : supplierOptions;

                return (
                  <div className="flex flex-col gap-3 mb-3" key={field.id}>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label>{t('buttons.item')}</label>
                        <Controller
                          name={`items.${index}.item`}
                          control={control}
                          render={({field}) => (
                            <ReactSelect
                              value={field.value}
                              onChange={field.onChange}
                              options={availableItemOptions}
                              isLoading={loadingItems}
                            />
                          )}
                        />
                        <InputError error={_.get(errors, ["items", index, "item", "message"])}/>
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
                      </div>
                      <div className="flex-1">
                        <label>Supplier override</label>
                        <Controller
                          name={`items.${index}.supplier`}
                          control={control}
                          render={({field}) => (
                            <ReactSelect
                              value={field.value}
                              onChange={field.onChange}
                              options={rowSupplierOptions}
                              isLoading={loadingSuppliers}
                              isClearable
                            />
                          )}
                        />
                        <InputError error={_.get(errors, ["items", index, "supplier", "message"])}/>
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

      {supplierModal && (
        <SupplierForm
          open
          onClose={() => {
            setSupplierModal(false);
            fetchSuppliers();
          }}
        />
      )}
    </>
  );
};

