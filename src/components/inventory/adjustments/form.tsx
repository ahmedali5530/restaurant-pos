import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import * as yup from "yup";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { toast } from "sonner";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useDB } from "@/api/db/db.ts";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input, InputError } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { InventoryItem } from "@/api/model/inventory_item.ts";
import {
  INVENTORY_ADJUSTMENT_REASON_VALUES,
  InventoryAdjustment,
} from "@/api/model/inventory_adjustment.ts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { fetchNextSequentialNumber } from "@/utils/recordNumbers.ts";
import { toRecordId } from "@/lib/utils.ts";
import { nowSurrealDateTime } from "@/lib/datetime.ts";
import { useAtom } from "jotai";
import { appPage } from "@/store/jotai.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";
import { canEdit } from "@/lib/inventory/lifecycle.ts";
import { postDocument } from "@/lib/inventory/posting.service.ts";
import { useIntegrationManager } from "@/providers/integration.provider.tsx";
import { useInventoryLocations } from "@/hooks/useInventoryLocations.ts";

type Option = { label: string; value: string };

interface FormValues {
  invoice_number: number;
  reason: Option | null;
  notes?: string;
  location: Option | null;
  items: Array<{
    item: Option | null;
    quantity_change: number | string;
    unit_cost?: number | string;
    comments?: string;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryAdjustment;
}

const validationSchema = yup.object({
  invoice_number: yup.number().required(),
  reason: yup.object({ label: yup.string(), value: yup.string() }).required().nullable(),
  location: yup.object({ label: yup.string(), value: yup.string() }).required().nullable(),
  notes: yup.string().optional(),
  items: yup
    .array()
    .of(
      yup.object({
        item: yup.object({ label: yup.string(), value: yup.string() }).required().nullable(),
        quantity_change: yup.number().typeError("Required").required(),
        unit_cost: yup.number().nullable().optional(),
        comments: yup.string().optional(),
      })
    )
    .min(1),
});

const resolveLocationOption = (data?: InventoryAdjustment): Option | null => {
  const loc = data?.location ?? data?.store;
  if (!loc) return null;
  return {
    label: (loc as any).name ?? String(loc),
    value: recordIdToString((loc as any).id ?? loc),
  };
};

export const InventoryAdjustmentForm = ({ open, onClose, data }: Props) => {
  const { t } = useTranslation("inventory");
  const db = useDB();
  const [state] = useAtom(appPage);
  const { manager } = useIntegrationManager();
  const locked = data?.id ? !canEdit(data.status) : false;

  const reasonOptions = useMemo(
    () =>
      INVENTORY_ADJUSTMENT_REASON_VALUES.map((value) => ({
        value,
        label: t(`adjustment.reasons.${value}`),
      })),
    [t]
  );

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
    reload: reloadLocations,
  } = useInventoryLocations(open);

  const { control, handleSubmit, register, reset, formState: { errors } } = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as any,
    defaultValues: {
      invoice_number: 1,
      reason: reasonOptions[0],
      notes: "",
      location: null,
      items: [{ item: null, quantity_change: 0, unit_cost: "", comments: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  useEffect(() => {
    if (!open) return;
    fetchItems();
    void reloadLocations();
    if (!data?.id) {
      fetchNextSequentialNumber(db, Tables.inventory_adjustments, "invoice_number").then(
        (n) => reset((prev) => ({ ...prev, invoice_number: n, reason: reasonOptions[0] }))
      );
    }
  }, [open]);

  useEffect(() => {
    if (!data) return;
    reset({
      invoice_number: data.invoice_number,
      reason:
        reasonOptions.find((r) => r.value === data.reason) ?? reasonOptions[0],
      notes: data.notes ?? "",
      location: resolveLocationOption(data),
      items: (data.items ?? []).map((line) => ({
        item: line.item
          ? {
              label: `${line.item.name}-${line.item.code ?? ""}`,
              value: recordIdToString(line.item.id ?? line.item),
            }
          : null,
        quantity_change: line.quantity_change,
        unit_cost: line.unit_cost ?? "",
        comments: line.comments ?? "",
      })),
    });
  }, [data, reset, reasonOptions]);

  const itemOptions: Option[] = (items?.data ?? []).map((item) => ({
    label: `${item.name}-${item.code ?? ""}`,
    value: recordIdToString(item.id),
  }));

  const save = async (values: FormValues, postAfterSave?: boolean) => {
    if (data?.id && !canEdit(data.status)) {
      toast.error(t("adjustment.cannotEditPosted"));
      return;
    }

    try {
      const locationId = values.location!.value;

      const payload: Record<string, unknown> = {
        invoice_number: Number(values.invoice_number),
        reason: values.reason!.value,
        notes: values.notes?.trim() || undefined,
        location: toRecordId(locationId),
        status: data?.id
          ? data.status && data.status !== "posted"
            ? data.status
            : "draft"
          : "draft",
        items: [],
      };

      if (!data?.id) {
        payload.created_at = nowSurrealDateTime();
        if (state?.user?.id) {
          payload.created_by = toRecordId(state.user.id);
        }
      }

      let adjustmentId = data?.id ? String(data.id) : "";
      if (data?.id) {
        await db.merge(toRecordId(data.id), payload);
        await db.query(
          `DELETE FROM ${Tables.inventory_adjustment_items} WHERE adjustment = $id`,
          { id: toRecordId(data.id) }
        );
      } else {
        const [created] = await db.create(Tables.inventory_adjustments, payload);
        adjustmentId = recordIdToString(created?.id) || String(created?.id ?? "");
      }

      if (!adjustmentId) {
        throw new Error(t("adjustment.saveFailed"));
      }

      const lineIds: string[] = [];
      for (const line of values.items) {
        const [created] = await db.create(Tables.inventory_adjustment_items, {
          adjustment: toRecordId(adjustmentId),
          item: toRecordId(line.item!.value),
          location: toRecordId(locationId),
          quantity_change: Number(line.quantity_change) || 0,
          unit_cost:
            line.unit_cost === "" || line.unit_cost == null
              ? undefined
              : Number(line.unit_cost),
          comments: line.comments?.trim() || undefined,
        });
        if (created?.id) {
          lineIds.push(recordIdToString(created.id) || String(created.id));
        }
      }

      await db.merge(toRecordId(adjustmentId), {
        items: lineIds.map((id) => toRecordId(id)),
      });

      if (postAfterSave) {
        await postDocument({
          db,
          documentType: "adjustment",
          documentId: adjustmentId,
          userId: state?.user?.id ? recordIdToString(state.user.id) : undefined,
          integrationManager: manager,
        });
        toast.success(t("adjustment.savedAndPosted"));
      } else {
        toast.success(t("adjustment.saved"));
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        data?.id
          ? t("forms.editAdjustment", { number: data.invoice_number })
          : t("forms.createAdjustment")
      }
      size="lg"
    >
      <form className="space-y-4" onSubmit={handleSubmit((v) => save(v, false))}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Input
              type="number"
              label={t("columns.invoiceNumber")}
              disabled={locked}
              {...register("invoice_number")}
            />
            <InputError error={errors.invoice_number?.message} />
          </div>
          <Controller
            name="reason"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm mb-1">{t("forms.reason")}</label>
                <ReactSelect
                  options={reasonOptions}
                  value={field.value}
                  onChange={field.onChange}
                  isDisabled={locked}
                  isClearable={false}
                />
              </div>
            )}
          />
          <Controller
            name="location"
            control={control}
            render={({ field }) => (
              <div>
                <label className="block text-sm mb-1">{t("columns.store")}</label>
                <ReactSelect
                  options={locationOptions}
                  value={field.value}
                  onChange={field.onChange}
                  isLoading={loadingLocations}
                  isDisabled={locked}
                />
              </div>
            )}
          />
        </div>

        <Input label={t("forms.notes")} disabled={locked} {...register("notes")} />

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">{t("forms.lines")}</h3>
            {!locked && (
              <Button
                type="button"
                variant="secondary"
                icon={faPlus}
                onClick={() =>
                  append({ item: null, quantity_change: 0, unit_cost: "", comments: "" })
                }
              >
                {t("buttons.line")}
              </Button>
            )}
          </div>
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
              <div className="col-span-5">
                <Controller
                  name={`items.${index}.item`}
                  control={control}
                  render={({ field: f }) => (
                    <ReactSelect
                      options={itemOptions}
                      value={f.value}
                      onChange={f.onChange}
                      isLoading={loadingItems}
                      isDisabled={locked}
                    />
                  )}
                />
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  step="any"
                  placeholder={t("columns.quantityChange")}
                  disabled={locked}
                  {...register(`items.${index}.quantity_change`)}
                />
              </div>
              <div className="col-span-2">
                <Input
                  type="number"
                  step="any"
                  placeholder={t("columns.unitCost")}
                  disabled={locked}
                  {...register(`items.${index}.unit_cost`)}
                />
              </div>
              <div className="col-span-2">
                <Input
                  disabled={locked}
                  placeholder={t("forms.comments")}
                  {...register(`items.${index}.comments`)}
                />
              </div>
              <div className="col-span-1">
                {!locked && fields.length > 1 && (
                  <Button type="button" variant="danger" iconButton onClick={() => remove(index)}>
                    <FontAwesomeIcon icon={faTrash} />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {!locked && (
          <div className="flex gap-2 justify-end">
            <Button type="submit" variant="secondary">
              {t("buttons.saveDraft")}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => handleSubmit((v) => save(v, true))()}
            >
              {t("buttons.saveAndPost")}
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
};
