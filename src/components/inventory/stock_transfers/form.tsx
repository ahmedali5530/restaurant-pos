import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useTranslation} from "react-i18next";
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
import {StockTransfer} from "@/api/model/stock_transfer.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import _ from "lodash";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {DatePicker} from "@/components/common/antd/datepicker.tsx";
import {DateValue} from "react-aria-components";
import {dateToCalendarDate, getToday} from "@/utils/date.ts";
import {documentCreatedAtFromDateValue, toJsDate} from "@/lib/datetime.ts";
import {
  createStockTransfer,
  updateStockTransfer,
} from "@/lib/inventory/stock_transfer.service.ts";
import {postDocument, InventoryPostingError} from "@/lib/inventory/posting.service.ts";
import {fetchNetQuantity, validateStoreTransferAvailability} from "@/utils/inventory.ts";
import {ensureLocationForStore} from "@/lib/inventory/location.service.ts";
import {useInventoryLocations} from "@/hooks/useInventoryLocations.ts";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { useIntegrationManager } from "@/providers/integration.provider.tsx";
import {recordIdToString} from "@/api/reports/shared/records.ts";

type SelectOption = {label: string; value: string} | null;

interface StockTransferItemFormValue {
  item: SelectOption;
  quantity: number | string;
}

interface StockTransferFormValues {
  fromLocation: SelectOption;
  toLocation: SelectOption;
  date: DateValue | null;
  notes?: string;
  items: StockTransferItemFormValue[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: StockTransfer;
}

const toRecordIdString = (id: unknown): string => {
  if (!id) return "";
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null && "toString" in id) {
    return (id as {toString(): string}).toString();
  }
  return String(id);
};

const selectOptionSchema = yup.object({
  label: yup.string(),
  value: yup.string(),
});

const validationSchema = yup
  .object({
    fromLocation: selectOptionSchema.required("This is required").nullable(),
    toLocation: selectOptionSchema.required("This is required").nullable(),
    date: yup.mixed().nullable().required("This is required"),
    notes: yup.string().nullable().optional(),
    items: yup
      .array()
      .of(
        yup.object({
          item: selectOptionSchema.required("This is required").nullable(),
          quantity: yup
            .number()
            .typeError("This should be a number")
            .moreThan(0, "Quantity must be greater than 0")
            .required("This is required"),
        })
      )
      .min(1, "Add at least one item"),
  })
  .test("transfer-endpoints", "Invalid transfer endpoints", function (values) {
    if (!values) return true;
    if (!values.fromLocation?.value) {
      return this.createError({path: "fromLocation", message: "This is required"});
    }
    if (!values.toLocation?.value) {
      return this.createError({path: "toLocation", message: "This is required"});
    }
    if (values.fromLocation.value === values.toLocation.value) {
      return this.createError({
        path: "toLocation",
        message: "Source and destination must differ",
      });
    }
    return true;
  })
  .required();

const resolveLocationOption = (
  location?: {name?: string; id?: unknown} | null
): SelectOption => {
  if (!location) return null;
  return {
    label: location.name ?? String(location),
    value: toRecordIdString(location.id ?? location),
  };
};

const resolveEndpointFromLegacyStore = async (
  db: ReturnType<typeof useDB>,
  location?: {name?: string; id?: unknown} | null,
  store?: {name?: string; id?: unknown} | null
): Promise<SelectOption> => {
  if (location) return resolveLocationOption(location);
  if (!store?.id) return null;
  try {
    const locationId = await ensureLocationForStore(db, recordIdToString(store.id));
    return {
      label: store.name ?? String(store),
      value: locationId,
    };
  } catch (error) {
    console.error("Failed to resolve location for store", error);
    return null;
  }
};

export const StockTransferForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation(["inventory", 'common']);
  const db = useDB();
  const [state] = useAtom(appPage);
  const { manager: integrationManager } = useIntegrationManager();
  const resolver = useMemo(() => yupResolver(validationSchema), []);

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 9999, [], {
    enabled: false,
  });

  const {
    options: locationOptions,
    loading: loadingLocations,
  } = useInventoryLocations(open);

  const {
    control,
    handleSubmit,
    formState: {errors, isSubmitting},
    reset,
    watch,
  } = useForm({
    resolver,
    defaultValues: {
      fromLocation: null,
      toLocation: null,
      date: getToday(),
      notes: "",
      items: [{item: null, quantity: 1}],
    },
  });

  const watchedFromLocation = watch("fromLocation");
  const watchedItems = useWatch({control, name: "items"});
  const [rowNetQuantities, setRowNetQuantities] = useState<Record<number, number | undefined>>({});
  const netQuantityCacheRef = useRef<Record<string, number>>({});

  const {fields, append, remove} = useFieldArray({
    control,
    name: "items",
  });

  const createEmptyItem = useCallback(
    (): StockTransferItemFormValue => ({
      item: null,
      quantity: 1,
    }),
    []
  );

  useEffect(() => {
    if (open) {
      fetchItems();
    }
  }, [open, fetchItems]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const applyReset = async () => {
      if (data) {
        const [fromLocation, toLocation] = await Promise.all([
          resolveEndpointFromLegacyStore(db, data.from_location, data.from_store),
          resolveEndpointFromLegacyStore(db, data.to_location, data.to_store),
        ]);
        if (cancelled) return;

        reset({
          fromLocation,
          toLocation,
          date: data.created_at ? dateToCalendarDate(toJsDate(data.created_at)) : getToday(),
          notes: data.notes ?? "",
          items:
            data.items?.map((line) => ({
              item: line.item
                ? {
                    label: `${line.item.name}-${line.item.code}`,
                    value: toRecordIdString(line.item.id),
                  }
                : null,
              quantity: line.quantity ?? 1,
            })) ?? [createEmptyItem()],
        } as any);
      } else {
        reset({
          fromLocation: null,
          toLocation: null,
          date: getToday(),
          notes: "",
          items: [createEmptyItem()],
        } as any);
      }
    };

    void applyReset();
    return () => {
      cancelled = true;
    };
  }, [data?.id, open, reset, createEmptyItem, data]);

  useEffect(() => {
    if (!watchedFromLocation?.value) {
      setRowNetQuantities({});
      return;
    }

    watchedItems?.forEach((row, index) => {
      const itemId = row?.item?.value;
      const locationId = watchedFromLocation.value;
      if (!itemId || !locationId) {
        setRowNetQuantities((prev) => ({...prev, [index]: undefined}));
        return;
      }

      const cacheKey = `${itemId}:${locationId}`;
      const cached = netQuantityCacheRef.current[cacheKey];
      if (cached !== undefined) {
        setRowNetQuantities((prev) => ({...prev, [index]: cached}));
        return;
      }

      void fetchNetQuantity(db, itemId, locationId).then((value) => {
        netQuantityCacheRef.current[cacheKey] = value;
        setRowNetQuantities((prev) => ({...prev, [index]: value}));
      });
    });
  }, [watchedFromLocation?.value, watchedItems]);

  const itemOptions = useMemo(
    () =>
      items?.data?.map((item) => ({
        label: `${item.name}-${item.code}`,
        value: toRecordIdString(item.id),
      })) ?? [],
    [items]
  );

  const onSubmit = async (values: any) => {
    try {
      const payload = {
        type: "location" as const,
        fromLocationId: values.fromLocation?.value,
        toLocationId: values.toLocation?.value,
        createdAt: values.date
          ? toJsDate(documentCreatedAtFromDateValue(values.date))
          : undefined,
        notes: values.notes,
        items: values.items.map((line) => ({
          itemId: line.item!.value,
          quantity: Number(line.quantity),
        })),
      };

      if (values.fromLocation?.value) {
        const availability = await validateStoreTransferAvailability(
          db,
          values.fromLocation.value,
          payload.items,
          data?.id ? toRecordIdString(data.id) : undefined
        );

        if (!availability.valid) {
          toast.error(
            t("stockTransfer.insufficientStock", {
              available: availability.available ?? 0,
              requested: availability.requested ?? 0,
            })
          );
          return;
        }
      }

      if (data?.id) {
        await updateStockTransfer(db, toRecordIdString(data.id), payload);
        toast.success(t("stockTransfer.updated"));
      } else {
        if (!state?.user?.id) {
          toast.error(t("stockTransfer.userRequired"));
          return;
        }
        const userId = toRecordIdString(state.user.id);
        const created = await createStockTransfer(db, payload, userId, integrationManager);
        const documentId = toRecordIdString(created.id);
        try {
          await postDocument({
            db,
            documentType: "stock_transfer",
            documentId,
            userId,
            integrationManager,
          });
        } catch (error) {
          console.error("Failed to post stock transfer", error);
          toast.error(
            error instanceof InventoryPostingError
              ? error.message
              : t("stockTransfer.saveFailed")
          );
          return;
        }
        toast.success(t("stockTransfer.created"));
      }

      onClose();
    } catch (error) {
      console.error("Failed to save stock transfer", error);
      toast.error(
        error instanceof InventoryPostingError
          ? error.message
          : t("stockTransfer.saveFailed")
      );
    }
  };

  return (
    <Modal
      title={
        data
          ? t("stockTransfer.updateTitle")
          : t("stockTransfer.createTitle")
      }
      open={open}
      onClose={onClose}
      size="xl"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-4 mb-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <label>{t("stockTransfer.fromLocation")}</label>
              <Controller
                name="fromLocation"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    options={locationOptions}
                    isLoading={loadingLocations}
                    isClearable
                  />
                )}
              />
              <InputError error={_.get(errors, ["fromLocation", "message"])} />
            </div>
            <div className="flex-1">
              <label>{t("stockTransfer.toLocation")}</label>
              <Controller
                name="toLocation"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    options={locationOptions}
                    isLoading={loadingLocations}
                    isClearable
                  />
                )}
              />
              <InputError error={_.get(errors, ["toLocation", "message"])} />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Controller
                name="date"
                control={control}
                render={({field}) => (
                  <DatePicker
                    label={t("forms.date")}
                    value={field.value as DateValue}
                    onChange={field.onChange}
                    maxValue={getToday()}
                    isClearable={false}
                  />
                )}
              />
              <InputError error={_.get(errors, ["date", "message"])} />
            </div>
            <div className="flex-1">
              <InputField
                name="notes"
                control={control}
                label={t("stockTransfer.notes")}
                error={_.get(errors, ["notes", "message"])}
              />
            </div>
          </div>

          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend>{t("tabs.items")}</legend>
            <div className="mb-3">
              <Button
                type="button"
                icon={faPlus}
                variant="primary"
                onClick={() => append(createEmptyItem() as any)}
              >
                {t("buttons.item")}
              </Button>
              <InputError error={_.get(errors, ["items", "message"])} />
            </div>

            {fields.map((field, index) => (
              <div className="flex gap-3 mb-3 items-end" key={field.id}>
                <div className="flex-1">
                  <label>{t("buttons.item")}</label>
                  <Controller
                    name={`items.${index}.item`}
                    control={control}
                    render={({field: itemField}) => (
                      <ReactSelect
                        value={itemField.value}
                        onChange={itemField.onChange}
                        onBlur={itemField.onBlur}
                        options={itemOptions}
                        isLoading={loadingItems}
                      />
                    )}
                  />
                  <InputError error={_.get(errors, ["items", index, "item", "message"])} />
                </div>
                <div className="w-40">
                  <Controller
                    name={`items.${index}.quantity`}
                    control={control}
                    render={({field: qtyField}) => (
                      <Input
                        label={t("forms.quantity")}
                        type="number"
                        value={qtyField.value}
                        onChange={qtyField.onChange}
                        error={_.get(errors, ["items", index, "quantity", "message"])}
                      />
                    )}
                  />
                  {rowNetQuantities[index] !== undefined && (
                    <p className="text-xs text-neutral-500 mt-1">
                      {t("stockTransfer.available", {qty: rowNetQuantities[index]})}
                    </p>
                  )}
                </div>
                <IconTooltipButton label={t('common:actions.remove')}
                  type="button"
                  variant="danger"
                 
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </IconTooltipButton>
              </div>
            ))}
          </fieldset>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("stockTransfer.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {data ? t("stockTransfer.save") : t("stockTransfer.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
