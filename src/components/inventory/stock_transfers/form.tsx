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
import {dateToCalendarDate, calendarDateToDate, getToday} from "@/utils/date.ts";
import {toJsDate} from "@/lib/datetime.ts";
import {
  createStockTransfer,
  updateStockTransfer,
} from "@/lib/inventory/stock_transfer.service.ts";
import {fetchNetQuantity, validateStoreTransferAvailability} from "@/utils/inventory.ts";
import {useInventoryLocations} from "@/hooks/useInventoryLocations.ts";

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

const resolveEndpointOption = (
  location?: {name?: string; id?: unknown} | null,
  store?: {name?: string; id?: unknown} | null
): SelectOption => {
  const endpoint = location ?? store;
  if (!endpoint) return null;
  return {
    label: endpoint.name ?? String(endpoint),
    value: toRecordIdString(endpoint.id ?? endpoint),
  };
};

export const StockTransferForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("inventory");
  const db = useDB();
  const [state] = useAtom(appPage);
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
    register,
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

    if (data) {
      reset({
        fromLocation: resolveEndpointOption(data.from_location, data.from_store),
        toLocation: resolveEndpointOption(data.to_location, data.to_store),
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
        createdAt: calendarDateToDate(values.date) ?? undefined,
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
        await createStockTransfer(db, payload, toRecordIdString(state.user.id));
        toast.success(t("stockTransfer.created"));
      }

      onClose();
    } catch (error) {
      console.error("Failed to save stock transfer", error);
      toast.error(t("stockTransfer.saveFailed"));
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
              <label>{t("stockTransfer.fromStore")}</label>
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
              <label>{t("stockTransfer.toStore")}</label>
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
              <Input
                label={t("stockTransfer.notes")}
                {...register("notes")}
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
                <Button
                  type="button"
                  variant="danger"
                  iconButton
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </Button>
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
