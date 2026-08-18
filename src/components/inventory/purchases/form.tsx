import React, {useEffect, useMemo, useState} from "react";
import {useTranslation} from 'react-i18next';
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
import {Textarea} from "@/components/common/input/textarea.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {InventoryPurchase} from "@/api/model/inventory_purchase.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryPurchaseOrder, PurchaseOrderStatus} from "@/api/model/inventory_purchase_order.ts";
import {RecordId, StringRecordId} from "surrealdb";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {InventoryPurchaseOrderForm} from "@/components/inventory/purchase_orders/form.tsx";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {createPurchaseImportConfig} from "@/components/inventory/purchases/purchase.import.config.ts";
import {fetchNextSequentialNumber, isUniqueRecordNumber} from "@/utils/recordNumbers.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {calendarDateToDate, dateToCalendarDate, getToday} from "@/utils/date.ts";
import {Switch} from "@/components/common/input/switch.tsx";
import {documentCreatedAtFromDateValue, toJsDate} from "@/lib/datetime.ts";
import {withCurrency} from "@/lib/utils.ts";
import {computePurchaseTotals} from "@/lib/inventory/purchase.totals.ts";
import {InventoryFormLineTotal} from "@/components/inventory/common/form.line.total.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
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
import {
  AdvancedExtraFormValue,
  extrasForInvoiceTotals,
  mergePurchaseExtrasForSave,
  splitPurchaseExtrasForForm,
} from "@/lib/inventory/purchase-cost/form.extras.ts";
import type {
  PurchaseAllocationMethod,
  PurchaseInventoryTreatment,
} from "@/api/model/inventory_purchase.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";

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
  location?: { label: string; value: string } | null;
  code?: string;
  taxable?: boolean;
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
  tax_rate?: number | string;
  discount?: number | string;
  shipping?: number | string;
  extras: AdvancedExtraFormValue[];
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
  tax_rate: yup.number().typeError("This should be a number").min(0).nullable().optional(),
  discount: yup.number().typeError("This should be a number").min(0).nullable().optional(),
  shipping: yup.number().typeError("This should be a number").min(0).nullable().optional(),
  extras: yup.array().of(
    yup.object({
      name: yup.string().required("This is required"),
      amount: yup.number().typeError("This should be a number").required("This is required"),
      category: yup.object({ label: yup.string(), value: yup.string() }).nullable().optional(),
      allocation_method: yup.object({ label: yup.string(), value: yup.string() }).nullable().optional(),
      inventory_treatment: yup.object({ label: yup.string(), value: yup.string() }).nullable().optional(),
    })
  ).optional(),
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
      location: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required('Location is required'),
      code: yup.string().nullable().optional(),
      taxable: yup.boolean().optional(),
    })
  ).min(1, "Add at least one item"),
}).required();

export const InventoryPurchaseForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation(['inventory', 'common']);
  const db = useDB();
  const { manager } = useIntegrationManager();
  const [purchaseOrderModal, setPurchaseOrderModal] = useState(false);
  const [postingAfterSave, setPostingAfterSave] = useState(false);
  const [showAdditionalCosts, setShowAdditionalCosts] = useState(false);
  const [state,] = useAtom(appPage);

  const categoryOptions = useMemo(
    () =>
      (
        [
          "Shipping",
          "Freight",
          "Insurance",
          "Customs",
          "ImportDuty",
          "Handling",
          "Miscellaneous",
        ] as const
      ).map((value) => ({ label: t(`costCategories.${value}`), value })),
    [t]
  );
  const allocationOptions = useMemo(
    () =>
      (["by_value", "by_quantity", "equal"] as PurchaseAllocationMethod[]).map((value) => ({
        label: t(`allocationMethod.${value}`),
        value,
      })),
    [t]
  );
  const treatmentOptions = useMemo(
    () =>
      (["capitalize", "expense", "ignore"] as PurchaseInventoryTreatment[]).map((value) => ({
        label: t(`inventoryTreatment.${value}`),
        value,
      })),
    [t]
  );
  const validationSchema = useMemo(() => createValidationSchema(db, data?.id), [db, data?.id]);
  const resolver = useMemo(() => yupResolver(validationSchema), [validationSchema]);
  // Missing status means "posted" only for existing legacy rows — new creates are editable.
  const locked = Boolean(data?.id) && isLocked(data?.status);

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
    ["suppliers", "locations"],
    {
      enabled: false
    }
  );

  const {
    options: globalLocationOptions,
    loading: loadingLocations,
  } = useInventoryLocations(open);

  const {
    data: purchaseOrders,
    fetchData: fetchPurchaseOrders,
    isFetching: loadingPurchaseOrders,
  } = useApi<SettingsData<InventoryPurchaseOrder>>(
    Tables.inventory_purchase_orders,
    [`status = '${PurchaseOrderStatus.approved}'`],
    [],
    0,
    9999,
    ["supplier", "items", "items.item", "items.supplier", "items.item.locations"],
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
    getValues,
  } = useForm<InventoryPurchaseFormValues>({
    resolver: resolver as any,
  });

  const {fields, append, remove, replace, update} = useFieldArray({
    control,
    name: "items"
  });

  const purchaseImportConfig = useMemo(
    () => createPurchaseImportConfig({
      db,
      t,
      append,
      update,
      getLines: () => getValues("items") ?? [],
    }),
    [db, t, append, update, getValues]
  );
  const {
    fields: extraFields,
    append: appendExtra,
    remove: removeExtra,
  } = useFieldArray({
    control,
    name: "extras"
  });
  const [syncedPurchaseOrderId, setSyncedPurchaseOrderId] = useState<string | undefined>();
  const selectedPurchaseOrder = watch("purchase_order");
  const method = watch("method");
  const itemsValues = useWatch({control, name: "items"});
  const taxRateValue = useWatch({control, name: "tax_rate"});
  const discountValue = useWatch({control, name: "discount"});
  const shippingValue = useWatch({control, name: "shipping"});
  const extrasValues = useWatch({control, name: "extras"});
  const mergedExtrasForTotals = useMemo(
    () =>
      extrasForInvoiceTotals(
        mergePurchaseExtrasForSave({
          discount: discountValue,
          shipping: shippingValue,
          advanced: extrasValues as AdvancedExtraFormValue[],
        })
      ),
    [discountValue, shippingValue, extrasValues]
  );
  const purchaseTotals = computePurchaseTotals(itemsValues, taxRateValue, mergedExtrasForTotals);
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
      location: (() => {
        const locs = orderItem.item?.locations;
        if (locs && locs.length === 1) {
          return { label: locs[0].name, value: locs[0].id };
        }
        return null;
      })(),
      code: orderItem.item?.code ?? "",
      taxable: !!orderItem.item?.taxable,
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
      const split = splitPurchaseExtrasForForm(data.extras, {
        category: (c) => t(`costCategories.${c}`, { defaultValue: c }),
        allocation: (m) => t(`allocationMethod.${m}`, { defaultValue: m }),
        treatment: (tr) => t(`inventoryTreatment.${tr}`, { defaultValue: tr }),
      });
      setShowAdditionalCosts(split.advanced.length > 0);
      reset({
        invoice_number: data.invoice_number ?? 1,
        purchase_order: data.purchase_order ? {
          label: `PO #${data.purchase_order.po_number}`,
          value: data.purchase_order.id
        } : null,
        method: data.method ? {
          label: data.method,
          value: data.method.toLowerCase() as PurchaseMethod,
        } : {
          label: t('purchaseMethods.manual'),
          value: "manual"
        },
        comments: data.comments ?? "",
        documents: undefined,
        date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
        update_item_cost: false,
        tax_rate: data.tax_rate ?? 0,
        discount: split.discount,
        shipping: split.shipping,
        extras: split.advanced,
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
          location: (() => {
            const loc = item.location;
            return loc ? {
              label: loc.name,
              value: loc.id.toString()
            } : null;
          })(),
          code: item.code ?? "",
          taxable: !!item.taxable,
        }))
      });
    } else if (open) {
      setShowAdditionalCosts(false);
      reset({
        invoice_number: 1,
        purchase_order: null,
        method: {label: t('purchaseMethods.manual'), value: "manual"},
        comments: "",
        documents: undefined,
        date: getToday(),
        update_item_cost: false,
        tax_rate: 0,
        discount: 0,
        shipping: 0,
        extras: [],
        items: []
      });
    }
  }, [data, open, reset, t]);

  const closeModal = () => {
    onClose();
    setSyncedPurchaseOrderId(undefined);
    setShowAdditionalCosts(false);
    reset({
      invoice_number: 1,
      purchase_order: null,
      method: {label: "Manual", value: "manual"},
      comments: "",
      documents: undefined,
      date: getToday(),
      update_item_cost: false,
      tax_rate: 0,
      discount: 0,
      shipping: 0,
      extras: [],
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

  const onSubmit = async (values: any, options?: { postAfterSave?: boolean }) => {
    if (data?.id) {
      const deps = await getDependencies(db, "purchase", String(data.id));
      if (deps.length > 0) {
        toast.error(formatDependencyMessage("purchase", deps));
        return;
      }
      if (!canEdit(data.status)) {
        toast.error("Posted documents cannot be edited");
        return;
      }
    }

    try {
      const documentRefs = await convertFilesToDocuments(values.documents);
      const extrasPayload = mergePurchaseExtrasForSave({
        discount: values.discount,
        shipping: values.shipping,
        advanced: values.extras,
      });
      const totals = computePurchaseTotals(
        values.items,
        values.tax_rate,
        extrasForInvoiceTotals(extrasPayload)
      );

      const payload = {
        invoice_number: Number(values.invoice_number),
        purchase_order: isPurchaseOrderMethod && values.purchase_order ? toRecordId(values.purchase_order.value) : undefined,
        method: values.method ? values.method.value : 'manual',
        comments: values.comments?.trim() ? values.comments.trim() : undefined,
        documents: documentRefs.length > 0 ? documentRefs : undefined,
        tax_rate: Number(values.tax_rate) || 0,
        tax_amount: totals.taxAmount,
        extras: extrasPayload.length > 0 ? extrasPayload : null,
        items: [],
        created_at: documentCreatedAtFromDateValue(values.date ?? null),
        created_by: toRecordId(state.user.id),
        // New docs start as draft; edits of draft/approved keep current status
        status: data?.id ? (data.status && data.status !== "posted" ? data.status : "draft") : "draft",
      };

      let purchaseId: any = data?.id;
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
            location: item.location ? toRecordId(item.location.value) : undefined,
            code: item.code?.trim() || undefined,
            taxable: !!item.taxable,
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

        const [purchaseOrder] = await db.query(`SELECT *
                                                FROM ONLY ${toRecordId(selectedPurchaseOrderId)} fetch supplier`);
        if (data === undefined && purchaseOrder.supplier) {
          await db.merge(toRecordId(purchaseOrder.supplier.id), {
            purchases: Array.from(new Set([...(purchaseOrder.supplier.purchases || []), purchaseIdString])),
          });
        }
      }

      if (options?.postAfterSave) {
        const userId = state?.user?.id ? recordIdToString(state.user.id) : undefined;
        const result = await postDocument({
          db,
          documentType: "purchase",
          documentId: String(purchaseIdString),
          userId,
          integrationManager: manager,
        });
        toast.success(
          result.skipped
            ? (result.reason || t('toast:inventory.purchaseSaved'))
            : `Purchase posted (${result.ledgerEntryCount} ledger entries)`
        );
      } else {
        toast.success(t('toast:inventory.purchaseSaved'));
      }
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPostingAfterSave(false);
    }
  };

  const itemsList: (InventoryItem & {
    suppliers?: { id: string; name: string }[];
    locations?: InventoryLocation[];
  })[] = (items?.data as any) ?? [];

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

  const itemLocationsMap = React.useMemo(() => {
    const map: Record<string, { label: string; value: string }[]> = {};
    for (const item of itemsList) {
      const key = item.id?.toString();
      if (!key) continue;
      const locs = item.locations ?? [];
      map[key] = locs.map((loc) => ({
        label: loc.name,
        value: String((loc as any).id ?? loc)
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
        <form onSubmit={handleSubmit((values) => onSubmit(values))}>
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
                <IconTooltipButton label={t('common:actions.add')}
                  disabled={data?.purchase_order !== undefined}
                  type="button" variant="primary" onClick={() => setPurchaseOrderModal(true)}>
                  <FontAwesomeIcon icon={faPlus}/>
                </IconTooltipButton>
              </div>
            )}

            {isCsvMethod && (
              <div className="flex gap-2 items-end">
                <Button
                  type="button"
                  variant="primary"
                  filled
                  onClick={() => setCsvModal(true)}
                ><span className="mr-2"><AiSparklesIcon /></span>{t('common:actions.smartImport', {defaultValue: 'AI Import'})}</Button>
              </div>
            )}

            <div className="flex gap-3">
              <div className="flex-1">
                <Controller
                  name="comments"
                  control={control}
                  render={({field}) => (
                    <Textarea
                      placeholder={t('forms.comments')}
                      rows={4}
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  )}
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
                    location: null,
                    taxable: false,
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
                const locationOptionsForItem =
                  selectedItemId && itemLocationsMap[selectedItemId]?.length
                    ? itemLocationsMap[selectedItemId]
                    : globalLocationOptions;

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
                                const catalog = itemsList.find((it) => it.id === option?.value);
                                setValue(`items.${index}.taxable`, !!catalog?.taxable);
                                if (catalog?.price != null) {
                                  setValue(`items.${index}.price`, catalog.price);
                                }
                                if (catalog?.base_quantity != null) {
                                  setValue(`items.${index}.base_quantity`, catalog.base_quantity);
                                }
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
                      <div className="flex-0 self-end pb-1">
                        <Controller
                          name={`items.${index}.taxable`}
                          control={control}
                          render={({field}) => (
                            <Checkbox
                              label={t('forms.taxable')}
                              checked={!!field.value}
                              onChange={(e) => field.onChange((e.target as HTMLInputElement).checked)}
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
                        <label>{t('columns.location')}</label>
                        <Controller
                          name={`items.${index}.location`}
                          control={control}
                          render={({field}) => (
                            <ReactSelect
                              value={field.value}
                              onChange={field.onChange}
                              options={locationOptionsForItem}
                              isLoading={loadingItems || loadingLocations}
                              isClearable
                            />
                          )}
                        />
                        <InputError error={_.get(errors, ["items", index, "location", "message"])}/>
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
                         
                          disabled={isPurchaseOrderMethod}
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

            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-40">
                <Controller
                  name="discount"
                  control={control}
                  render={({field}) => (
                    <Input
                      label={t('totals.discount')}
                      type="number"
                      value={field.value ?? 0}
                      onChange={field.onChange}
                      error={_.get(errors, ["discount", "message"])}
                    />
                  )}
                />
              </div>
              <div className="w-40">
                <Controller
                  name="shipping"
                  control={control}
                  render={({field}) => (
                    <Input
                      label={t('totals.shipping')}
                      type="number"
                      value={field.value ?? 0}
                      onChange={field.onChange}
                      error={_.get(errors, ["shipping", "message"])}
                    />
                  )}
                />
              </div>
              <div className="w-40">
                <Controller
                  name="tax_rate"
                  control={control}
                  render={({field}) => (
                    <Input
                      label={t('totals.taxRate')}
                      type="number"
                      value={field.value ?? 0}
                      onChange={field.onChange}
                      error={_.get(errors, ["tax_rate", "message"])}
                    />
                  )}
                />
              </div>
              <div className="ml-auto rounded-lg border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm space-y-1 min-w-[220px]">
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-600">{t('totals.subtotal')}</span>
                  <span className="font-medium">{withCurrency(purchaseTotals.subtotal)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-600">{t('totals.discount')}</span>
                  <span className="font-medium">{withCurrency(Number(discountValue) || 0)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-600">{t('totals.shipping')}</span>
                  <span className="font-medium">{withCurrency(Number(shippingValue) || 0)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-neutral-600">
                    {t('totals.tax')}
                    {Number(taxRateValue) > 0 ? ` (${taxRateValue}%)` : ""}
                  </span>
                  <span className="font-medium">{withCurrency(purchaseTotals.taxAmount)}</span>
                </div>
                {(extrasValues?.length ?? 0) > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-600">{t('totals.additionalCosts')}</span>
                    <span className="font-medium">
                      {withCurrency(
                        purchaseTotals.extrasTotal +
                          (Number(discountValue) || 0) -
                          (Number(shippingValue) || 0)
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4 border-t border-neutral-300 pt-1 font-semibold">
                  <span>{t('totals.grandTotal')}</span>
                  <span>{withCurrency(purchaseTotals.grandTotal)}</span>
                </div>
              </div>
            </div>

            <div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowAdditionalCosts((v) => !v)}
              >
                {showAdditionalCosts
                  ? t('totals.hideAdditionalCosts')
                  : t('totals.showAdditionalCosts')}
              </Button>
            </div>

            {showAdditionalCosts && (
              <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
                <legend>{t('totals.additionalCosts')}</legend>
                <div className="mb-3">
                  <Button
                    type="button"
                    icon={faPlus}
                    variant="primary"
                    onClick={() =>
                      appendExtra({
                        name: "",
                        amount: 0,
                        category: categoryOptions.find((o) => o.value === "Miscellaneous") ?? null,
                        allocation_method: allocationOptions[0],
                        inventory_treatment: treatmentOptions[0],
                      })
                    }
                  >
                    {t('totals.addExtra')}
                  </Button>
                </div>
                {extraFields.map((field, index) => (
                  <div className="flex flex-wrap gap-3 mb-3 items-end" key={field.id}>
                    <div className="flex-1 min-w-[140px]">
                      <InputField
                        name={`extras.${index}.name`}
                        control={control}
                        label={t('totals.extraName')}
                        error={_.get(errors, ["extras", index, "name", "message"])}
                      />
                    </div>
                    <div className="w-40">
                      <Controller
                        name={`extras.${index}.category`}
                        control={control}
                        render={({field: catField}) => (
                          <div>
                            <label className="block text-sm mb-1">{t('totals.extraCategory')}</label>
                            <ReactSelect
                              options={categoryOptions}
                              value={catField.value}
                              onChange={catField.onChange}
                              isClearable={false}
                            />
                          </div>
                        )}
                      />
                    </div>
                    <div className="w-32">
                      <Controller
                        name={`extras.${index}.amount`}
                        control={control}
                        render={({field: amountField}) => (
                          <Input
                            label={t('totals.extraAmount')}
                            type="number"
                            value={amountField.value as number | string}
                            onChange={amountField.onChange}
                            error={_.get(errors, ["extras", index, "amount", "message"])}
                          />
                        )}
                      />
                    </div>
                    <div className="w-36">
                      <Controller
                        name={`extras.${index}.allocation_method`}
                        control={control}
                        render={({field: methodField}) => (
                          <div>
                            <label className="block text-sm mb-1">{t('totals.allocationMethod')}</label>
                            <ReactSelect
                              options={allocationOptions}
                              value={methodField.value}
                              onChange={methodField.onChange}
                              isClearable={false}
                            />
                          </div>
                        )}
                      />
                    </div>
                    <div className="w-36">
                      <Controller
                        name={`extras.${index}.inventory_treatment`}
                        control={control}
                        render={({field: treatField}) => (
                          <div>
                            <label className="block text-sm mb-1">{t('totals.inventoryTreatment')}</label>
                            <ReactSelect
                              options={treatmentOptions}
                              value={treatField.value}
                              onChange={treatField.onChange}
                              isClearable={false}
                            />
                          </div>
                        )}
                      />
                    </div>
                    <div className="flex-0">
                      <IconTooltipButton label={t('common:actions.remove')}
                        type="button"
                        variant="danger"
                       
                        onClick={() => removeExtra(index)}
                      >
                        <FontAwesomeIcon icon={faTrash}/>
                      </IconTooltipButton>
                    </div>
                  </div>
                ))}
              </fieldset>
            )}
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
        <DataImportModal
          isOpen={csvModal}
          onClose={() => setCsvModal(false)}
          config={purchaseImportConfig}
          title={t('forms.smartImportPurchaseTitle', {defaultValue: 'AI Import purchase lines'})}
          enableImportModes
          defaultMatchFields={['code']}
          onExport={() => {
            const formatDate = (value: any) => {
              if (!value) return '';
              const d = calendarDateToDate(value);
              if (!d) return '';
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              return `${y}-${m}-${day}`;
            };

            return (itemsValues ?? []).map((row: any) => {
              const catalog = itemsList.find((it) => String(it.id) === String(row?.item?.value));
              return {
                name: catalog?.name ?? '',
                code: catalog?.code ?? '',
                base_quantity: String(row?.base_quantity ?? ''),
                quantity: String(row?.quantity ?? ''),
                requested: String(row?.requested ?? ''),
                price: String(row?.price ?? ''),
                expiry_date: formatDate(row?.expiry_date),
                manufacturing_date: formatDate(row?.manufacturing_date),
                supplier: row?.supplier?.label ?? '',
                location: row?.location?.label ?? '',
                comments: row?.comments ?? '',
              };
            });
          }}
          onDone={() => setCsvModal(false)}
        />
      )}
    </>
  );
};

