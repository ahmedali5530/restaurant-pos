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
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {InventoryWaste} from "@/api/model/inventory_waste.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {InventoryLocation} from "@/api/model/inventory_location.ts";
import {InventoryPurchaseItem} from "@/api/model/inventory_purchase.ts";
import {RecordId} from "surrealdb";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTrash, faPlus} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {fetchNextSequentialNumber, isUniqueRecordNumber} from "@/utils/recordNumbers.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {dateToCalendarDate, getToday} from "@/utils/date.ts";
import { documentCreatedAtFromDateValue, toJsDate, toLuxonDateTime } from "@/lib/datetime.ts";
import {InventoryFormPricedLineTotal} from "@/components/inventory/common/form.line.total.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { useIntegrationManager } from "@/providers/integration.provider.tsx";
import { publishWasteRecorded } from "@/integrations/accounting/events/publish.ts";
import { postDocument } from "@/lib/inventory/posting.service.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { useInventoryLocations } from "@/hooks/useInventoryLocations.ts";
import { useInventorySettings } from "@/hooks/useInventorySettings.ts";
import { fetchNetQuantity } from "@/utils/inventory.ts";
import { resolveCatalogUnitCost } from "@/lib/inventory/line.cost.ts";
import { toRecordId } from "@/lib/utils.ts";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {createWasteImportConfig} from "@/components/inventory/wastes/waste.import.config.ts";

type SelectOption = { label: string; value: string } | null;

interface WasteItemFormValue {
  item: SelectOption;
  quantity: number | string;
  comments?: string;
  purchase_item_id?: string | null;
  expiry_date?: string | null;
}

interface WasteFormValues {
  invoice_number: number | string;
  location: SelectOption;
  date?: DateValue | null;
  documents?: FileList;
  items: WasteItemFormValue[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryWaste;
}

const LOT_PREFIX = "lot:";

const createValidationSchema = (db: ReturnType<typeof useDB>, currentId?: string) => yup.object({
  invoice_number: yup.number().typeError("This should be a number").required("This is required").test(
    "unique-waste-invoice",
    "Invoice number already exists",
    async function (value) {
      if (value === undefined || value === null) {
        return true;
      }

      const isUnique = await isUniqueRecordNumber(
        db,
        Tables.inventory_wastes,
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
  location: yup.object({
    label: yup.string(),
    value: yup.string(),
  }).required("This is required").nullable(),
  date: yup.mixed().nullable().optional(),
  documents: yup.mixed().optional(),
  items: yup.array().of(
    yup.object({
      item: yup.object({
        label: yup.string(),
        value: yup.string()
      }).required("This is required").nullable(),
      quantity: yup.number().typeError("This should be a number").required("This is required").moreThan(0, "Quantity must be greater than 0"),
      comments: yup.string().nullable().optional(),
      purchase_item_id: yup.string().nullable().optional(),
      expiry_date: yup.string().nullable().optional(),
    })
  ).min(1, "Add at least one item"),
}).required();

const toIdString = (value?: string | { toString(): string }) => {
  if (!value) return "";
  return typeof value === "string" ? value : value.toString();
};

export const InventoryWasteForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation(['inventory', 'common', 'toast']);
  const db = useDB();
  const [state, ] = useAtom(appPage);
  const { manager: integrationManager } = useIntegrationManager();
  const { settings } = useInventorySettings();
  const validationSchema = useMemo(() => createValidationSchema(db, data?.id), [data?.id]);
  const resolver = useMemo(() => yupResolver(validationSchema), [validationSchema]);

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 9999, ["locations"], {
    enabled: false
  });

  const {
    options: locationOptions,
    loading: loadingLocations,
  } = useInventoryLocations(open);

  const {
    control,
    register,
    handleSubmit,
    formState: {errors},
    reset,
    setValue,
    setError,
    clearErrors,
  } = useForm<WasteFormValues>({
    resolver: resolver as any,
    defaultValues: {
      invoice_number: 1,
      location: null,
      date: getToday(),
      documents: undefined,
      items: [],
    },
  });

  const {fields, append, remove} = useFieldArray({
    control,
    name: "items"
  });

  const [importModal, setImportModal] = useState(false);
  const wasteImportConfig = useMemo(
    () => createWasteImportConfig({
      db,
      t,
      append: (line) => append({
        ...line,
        purchase_item_id: null,
        expiry_date: null,
      }),
    }),
    [db, t, append]
  );
  const watchedItems = useWatch({control, name: "items"});
  const watchedLocation = useWatch({control, name: "location"});

  const [rowNetQuantities, setRowNetQuantities] = useState<Record<number, number | undefined>>({});
  const netQuantityCacheRef = useRef<Record<string, number>>({});
  const [expiredLots, setExpiredLots] = useState<InventoryPurchaseItem[]>([]);
  const [loadingExpired, setLoadingExpired] = useState(false);

  const itemsList = (items?.data ?? []) as (InventoryItem & { locations?: InventoryLocation[] })[];

  const pricedLines = useMemo(
    () =>
      (watchedItems ?? []).map((line) => {
        const catalogItem = itemsList.find((ci) => String(ci.id) === String(line.item?.value));
        const expiredLot = line.purchase_item_id
          ? expiredLots.find((lot) => String(lot.id) === String(line.purchase_item_id))
          : undefined;
        const existing = data?.items?.find(
          (wi) =>
            String(wi.item?.id) === String(line.item?.value) ||
            String(wi.purchase_item?.id) === String(line.purchase_item_id)
        );
        const price =
          Number(expiredLot?.price) ||
          Number(existing?.price) ||
          resolveCatalogUnitCost(catalogItem) ||
          Number(catalogItem?.price) ||
          0;
        return {quantity: line.quantity, price};
      }),
    [watchedItems, itemsList, expiredLots, data?.items],
  );

  useEffect(() => {
    if (open) {
      fetchItems();
    }
  }, [open, fetchItems]);

  useEffect(() => {
    if (!open || !settings.enableExpiryTracking || !watchedLocation?.value) {
      setExpiredLots((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    let cancelled = false;
    setLoadingExpired(true);

    const loadExpired = async () => {
      try {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const [rows] = await db.query(
          `SELECT * FROM ${Tables.inventory_purchase_items}
           WHERE location = $location
             AND expiry_date != NONE
             AND expiry_date <= $today
           FETCH item, location`,
          {
            location: toRecordId(watchedLocation.value),
            today,
          }
        );
        if (!cancelled) {
          setExpiredLots(Array.isArray(rows) ? (rows as InventoryPurchaseItem[]) : []);
        }
      } catch (error) {
        console.error("Failed to load expired purchase lots", error);
        if (!cancelled) setExpiredLots([]);
      } finally {
        if (!cancelled) setLoadingExpired(false);
      }
    };

    void loadExpired();
    return () => {
      cancelled = true;
    };
  }, [open, settings.enableExpiryTracking, watchedLocation?.value]);

  useEffect(() => {
    if (!open) return;

    if (data) {
      const firstLocation = data.items?.find((item) => item.location || item.purchase_item?.location || item.issue_item?.location);
      const loc = firstLocation?.location || firstLocation?.purchase_item?.location || firstLocation?.issue_item?.location;
      reset({
        invoice_number: data.invoice_number,
        location: loc ? {
          label: loc.name ?? "",
          value: toIdString(loc.id),
        } : null,
        date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
        documents: undefined,
        items: data.items?.map(item => ({
          item: item.item ? {
            label: item.item.code ? `${item.item.name}-${item.item.code}` : item.item.name,
            value: toIdString(item.item.id),
          } : null,
          purchase_item_id: item.purchase_item?.id ? toIdString(item.purchase_item.id) : null,
          expiry_date: (item.purchase_item as any)?.expiry_date
            ? String((item.purchase_item as any).expiry_date)
            : null,
          quantity: item.quantity ?? 1,
          comments: item.comments ?? "",
        })) ?? [],
      });
    } else {
      reset({
        invoice_number: 1,
        location: null,
        date: getToday(),
        documents: undefined,
        items: [{
          item: null,
          quantity: 1,
          comments: "",
          purchase_item_id: null,
          expiry_date: null,
        }],
      });
    }
  }, [data?.id, open, reset]);

  useEffect(() => {
    if (!open || data?.id) {
      return;
    }

    let isMounted = true;

    fetchNextSequentialNumber(db, Tables.inventory_wastes, "invoice_number")
      .then((nextNumber) => {
        if (isMounted) {
          setValue("invoice_number", nextNumber);
        }
      })
      .catch((error) => {
        console.error("Failed to fetch next waste number", error);
        toast.error(t('toast:inventory.unableGenerateWasteNumber'));
      });

    return () => {
      isMounted = false;
    };
  }, [open, data?.id, setValue, t]);

  useEffect(() => {
    const locationId = watchedLocation?.value;
    if (!locationId) {
      setRowNetQuantities((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    watchedItems?.forEach((row, index) => {
      const itemId = row?.item?.value;
      if (!itemId) {
        setRowNetQuantities((prev) => {
          if (prev[index] === undefined) return prev;
          const next = {...prev};
          delete next[index];
          return next;
        });
        return;
      }

      const cacheKey = `${itemId}:${locationId}`;
      const cached = netQuantityCacheRef.current[cacheKey];
      if (cached !== undefined) {
        setRowNetQuantities((prev) => {
          if (prev[index] === cached) return prev;
          return {...prev, [index]: cached};
        });
        return;
      }

      void fetchNetQuantity(db, itemId, locationId).then((value) => {
        netQuantityCacheRef.current[cacheKey] = value;
        setRowNetQuantities((prev) => {
          if (prev[index] === value) return prev;
          return {...prev, [index]: value};
        });
      }).catch(() => {
        netQuantityCacheRef.current[cacheKey] = 0;
        setRowNetQuantities((prev) => {
          if (prev[index] === 0) return prev;
          return {...prev, [index]: 0};
        });
      });
    });
  }, [watchedLocation?.value, watchedItems]);

  const closeModal = () => {
    onClose();
    reset({
      invoice_number: 1,
      location: null,
      date: getToday(),
      documents: undefined,
      items: []
    });
    setRowNetQuantities({});
    netQuantityCacheRef.current = {};
    setExpiredLots([]);
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

  const validateAvailableStock = useCallback(async (formValues: WasteFormValues) => {
    let isValid = true;
    const locationId = formValues.location?.value;
    if (!locationId) return false;

    for (let index = 0; index < formValues.items.length; index++) {
      const row = formValues.items[index];
      const itemId = row.item?.value;
      if (!itemId) continue;

      const desiredQuantity = Number(row.quantity) || 0;
      if (desiredQuantity <= 0) continue;

      const cacheKey = `${itemId}:${locationId}`;
      let available = rowNetQuantities[index] ?? netQuantityCacheRef.current[cacheKey];

      if (available === undefined) {
        try {
          available = await fetchNetQuantity(db, itemId, locationId);
          netQuantityCacheRef.current[cacheKey] = available;
          setRowNetQuantities((prev) => ({...prev, [index]: available}));
        } catch {
          available = 0;
        }
      }

      if ((available ?? 0) < desiredQuantity) {
        setError(`items.${index}.quantity` as const, {
          type: "manual",
          message: t("stockTransfer.insufficientStock", {
            available: available ?? 0,
            requested: desiredQuantity,
          }),
        });
        isValid = false;
      } else {
        clearErrors(`items.${index}.quantity` as const);
      }
    }

    return isValid;
  }, [rowNetQuantities, setError, clearErrors, t]);

  const onSubmit = async (values: WasteFormValues) => {
    try {
      const hasAvailableStock = await validateAvailableStock(values);
      if (!hasAvailableStock) {
        toast.error(t('toast:inventory.itemsExceedQuantity'));
        return;
      }

      const locationId = values.location?.value;
      if (!locationId) {
        toast.error(t('validation.selectLocation'));
        return;
      }

      const documentRefs = await convertFilesToDocuments(values.documents);

      const payload = {
        invoice_number: Number(values.invoice_number),
        purchase: undefined,
        issue: undefined,
        documents: documentRefs.length > 0 ? documentRefs : undefined,
        items: [],
        created_at: documentCreatedAtFromDateValue(values.date ?? null),
        created_by: toRecordId(state.user.id),
        status: data?.id
          ? (data.status && data.status !== "posted" ? data.status : "draft")
          : "draft",
      };

      let wasteId: any = data?.id;

      if (wasteId) {
        await db.merge(wasteId, payload);
        if (data?.items?.length) {
          await Promise.all(
            data.items
              .filter((item) => item.id)
              .map((item) => db.delete(item.id!))
          );
        }
      } else {
        const [created] = await db.create(Tables.inventory_wastes, payload);
        wasteId = created?.id;
      }

      const wasteIdString = wasteId
        ? typeof wasteId === "string"
          ? wasteId
          : wasteId
        : undefined;

      if (!wasteIdString) {
        throw new Error("Failed to resolve waste identifier");
      }

      const itemsRefs = [];
      await Promise.all(
        values.items.map(async (item) => {
          const catalogItem = itemsList.find((ci) => String(ci.id) === String(item.item?.value));
          const expiredLot = item.purchase_item_id
            ? expiredLots.find((lot) => String(lot.id) === String(item.purchase_item_id))
            : undefined;
          const existing = data?.items?.find(
            (wi) => String(wi.item?.id) === String(item.item?.value)
          );
          const snapshotPrice =
            Number(expiredLot?.price) ||
            Number(existing?.price) ||
            resolveCatalogUnitCost(catalogItem) ||
            Number(catalogItem?.price) ||
            0;

          const [created] = await db.create(Tables.inventory_waste_items, {
            item: item.item ? toRecordId(item.item.value) : undefined,
            location: toRecordId(locationId),
            purchase_item: item.purchase_item_id ? toRecordId(item.purchase_item_id) : undefined,
            quantity: Number(item.quantity),
            price: snapshotPrice > 0 ? snapshotPrice : undefined,
            comments: item.comments?.trim() ? item.comments.trim() : undefined,
            waste: toRecordId(wasteId),
          });

          if (created?.id) {
            itemsRefs.push(created.id);
          }
        })
      );

      await db.merge(toRecordId(wasteIdString), {
        items: itemsRefs,
      });

      const userId = state?.user?.id ? recordIdToString(state.user.id) : undefined;
      await postDocument({
        db,
        documentType: "waste",
        documentId: String(wasteIdString),
        userId,
        integrationManager,
      });

      const inventoryValue = Number(
        values.items
          .reduce((sum, item) => {
            const qty = Number(item.quantity || 0);
            const catalogItem = itemsList.find((ci) => String(ci.id) === String(item.item?.value));
            const expiredLot = item.purchase_item_id
              ? expiredLots.find((lot) => String(lot.id) === String(item.purchase_item_id))
              : undefined;
            const price =
              Number(expiredLot?.price) ||
              resolveCatalogUnitCost(catalogItem) ||
              Number(catalogItem?.price) ||
              0;
            return sum + qty * price;
          }, 0)
          .toFixed(2)
      );
      if (inventoryValue > 0) {
        await publishWasteRecorded(integrationManager, {
          documentId: String(wasteIdString),
          inventoryValue,
        });
      }

      toast.success(t('toast:inventory.wasteSaved'));
      closeModal();
    } catch (error) {
      console.log(error)
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

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
      value: toIdString(item.id),
    }));
  }, [itemsList]);

  const itemOptions = useMemo(() => {
    const locationId = watchedLocation?.value;
    const base = getItemOptionsForLocation(locationId);
    if (!settings.enableExpiryTracking || expiredLots.length === 0) {
      return base;
    }

    const lotOptions = expiredLots
      .filter((lot) => lot.item?.id)
      .map((lot) => {
        const expiryLabel = lot.expiry_date
          ? toLuxonDateTime(lot.expiry_date as any).toFormat(import.meta.env.VITE_DATE_FORMAT)
          : "";
        const name = lot.item?.code
          ? `${lot.item.name}-${lot.item.code}`
          : lot.item?.name ?? String(lot.id);
        return {
          label: `${name} (${t("forms.expiredLot", { date: expiryLabel })})`,
          value: `${LOT_PREFIX}${toIdString(lot.id)}`,
        };
      });

    return [...lotOptions, ...base];
  }, [getItemOptionsForLocation, watchedLocation?.value, settings.enableExpiryTracking, expiredLots, t]);

  const resolveItemSelection = (option: SelectOption, index: number) => {
    if (!option?.value) {
      setValue(`items.${index}.item`, null);
      setValue(`items.${index}.purchase_item_id`, null);
      setValue(`items.${index}.expiry_date`, null);
      return;
    }

    if (option.value.startsWith(LOT_PREFIX)) {
      const purchaseItemId = option.value.slice(LOT_PREFIX.length);
      const lot = expiredLots.find((l) => toIdString(l.id) === purchaseItemId);
      const itemId = lot?.item?.id ? toIdString(lot.item.id) : "";
      const itemLabel = lot?.item?.code
        ? `${lot.item.name}-${lot.item.code}`
        : lot?.item?.name ?? option.label;
      setValue(`items.${index}.item`, itemId ? { label: itemLabel, value: itemId } : null);
      setValue(`items.${index}.purchase_item_id`, purchaseItemId);
      setValue(
        `items.${index}.expiry_date`,
        lot?.expiry_date ? String(lot.expiry_date) : null
      );
      return;
    }

    setValue(`items.${index}.item`, option);
    setValue(`items.${index}.purchase_item_id`, null);
    setValue(`items.${index}.expiry_date`, null);
  };

  const selectedOptionForRow = (index: number): SelectOption => {
    const row = watchedItems?.[index];
    if (!row?.item) return null;
    if (row.purchase_item_id) {
      const lotValue = `${LOT_PREFIX}${row.purchase_item_id}`;
      const match = itemOptions.find((opt) => opt.value === lotValue);
      if (match) return match;
      return {
        label: row.item.label,
        value: lotValue,
      };
    }
    return row.item;
  };

  return (
    <>
    <Modal
      title={data ? t('forms.updateWaste', { number: data.invoice_number }) : t('forms.createWaste')}
      open={open}
      onClose={closeModal}
      size="xl"
    >
      <form onSubmit={handleSubmit(onSubmit as any)}>
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
              <label>{t('columns.location')}</label>
              <Controller
                name="location"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={(option) => {
                      field.onChange(option);
                      (watchedItems ?? []).forEach((_, index) => {
                        setValue(`items.${index}.item`, null);
                        setValue(`items.${index}.purchase_item_id`, null);
                        setValue(`items.${index}.expiry_date`, null);
                      });
                      netQuantityCacheRef.current = {};
                      setRowNetQuantities({});
                    }}
                    options={locationOptions}
                    isLoading={loadingLocations}
                    isClearable={false}
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
              <label>{t('upload.attachDocuments')}</label>
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
                onClick={() => append({
                  item: null,
                  quantity: 1,
                  comments: "",
                  purchase_item_id: null,
                  expiry_date: null,
                })}
                disabled={!watchedLocation?.value}
              >
                {t('common:actions.add')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setImportModal(true)}
                disabled={!watchedLocation?.value}
              >
                <span className="mr-2"><AiSparklesIcon /></span>
                {t('common:actions.smartImport', {defaultValue: 'AI Import'})}
              </Button>
            </div>

            {fields.map((field, index) => {
              const availableQuantity = rowNetQuantities[index];

              return (
                <div className="flex flex-col mb-3" key={field.id}>
                  <input type="hidden" {...register(`items.${index}.purchase_item_id` as const)} />
                  <input type="hidden" {...register(`items.${index}.expiry_date` as const)} />

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label>{t('buttons.item')}</label>
                      <Controller
                        name={`items.${index}.item`}
                        control={control}
                        render={() => (
                          <ReactSelect
                            value={selectedOptionForRow(index)}
                            onChange={(option) => resolveItemSelection(option as SelectOption, index)}
                            options={itemOptions}
                            isLoading={loadingItems || loadingExpired}
                            isDisabled={!watchedLocation?.value}
                          />
                        )}
                      />
                      <InputError error={_.get(errors, ["items", index, "item", "message"])}/>
                    </div>
                    <div className="flex-1">
                      <Controller
                        name={`items.${index}.quantity`}
                        control={control}
                        render={({field: qtyField}) => (
                          <Input
                            label={
                              availableQuantity === undefined
                                ? t('forms.quantity')
                                : t('stockTransfer.available', { qty: availableQuantity })
                            }
                            type="number"
                            value={qtyField.value as number | string}
                            onChange={qtyField.onChange}
                            error={_.get(errors, ["items", index, "quantity", "message"])}
                          />
                        )}
                      />
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
            <InventoryFormPricedLineTotal lines={pricedLines} />
          </fieldset>
        </div>

        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
    {importModal && (
      <DataImportModal
        isOpen
        onClose={() => setImportModal(false)}
        config={wasteImportConfig}
        title={t('forms.smartImportWasteTitle', {defaultValue: 'AI Import waste lines'})}
        onDone={() => setImportModal(false)}
      />
    )}
    </>
  );
};
