import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import * as yup from "yup";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { toast } from "sonner";
import {
  INVENTORY_LOCATION_TYPES,
  InventoryLocation,
  InventoryLocationType,
} from "@/api/model/inventory_location.ts";
import { useDB } from "@/api/db/db.ts";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { Switch } from "@/components/common/input/switch.tsx";
import {
  createLocation,
  updateLocation,
} from "@/lib/inventory/location.service.ts";
import { recordIdToString } from "@/api/reports/shared/records.ts";

interface LocationFormValues {
  name: string;
  type: InventoryLocationType | string;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryLocation;
}

const validationSchema = yup
  .object({
    name: yup.string().required("This is required"),
    type: yup.string().required("This is required"),
    is_active: yup.boolean().required(),
  })
  .required();

export const InventoryLocationForm = ({ open, onClose, data }: Props) => {
  const { t } = useTranslation("inventory");
  const db = useDB();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<LocationFormValues>({
    resolver: yupResolver(validationSchema) as any,
    defaultValues: {
      name: "",
      type: "Store",
      is_active: true,
    },
  });

  const closeModal = () => {
    onClose();
    reset({ name: "", type: "Store", is_active: true });
  };

  useEffect(() => {
    if (data) {
      reset({
        name: data.name ?? "",
        type: (data.type as InventoryLocationType) || "Store",
        is_active: data.is_active !== false,
      });
    } else {
      reset({ name: "", type: "Store", is_active: true });
    }
  }, [data, reset]);

  const typeOptions = INVENTORY_LOCATION_TYPES.map((value) => ({
    value,
    label: t(`location.types.${value}`, { defaultValue: value }),
  }));

  const onSubmit = async (values: LocationFormValues) => {
    try {
      if (data?.id) {
        await updateLocation(db, recordIdToString(data.id) || String(data.id), {
          name: values.name,
          type: values.type,
          is_active: values.is_active,
        });
      } else {
        await createLocation(db, {
          name: values.name,
          type: values.type,
          is_active: values.is_active,
        });
      }
      toast.success(t("location.saved", { name: values.name }));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const linkedKitchen =
    data?.linked_kitchen &&
    (typeof data.linked_kitchen === "object"
      ? (data.linked_kitchen as { name?: string }).name
      : null);

  return (
    <Modal
      title={data ? t("location.edit", { name: data.name }) : t("location.create")}
      open={open}
      onClose={closeModal}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <Input
            label={t("columns.name")}
            {...register("name")}
            autoFocus
            error={errors?.name?.message}
          />
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <ReactSelect
                label={t("columns.locationType")}
                options={typeOptions}
                value={typeOptions.find((o) => o.value === field.value) ?? null}
                onChange={(opt: any) => field.onChange(opt?.value ?? "Store")}
              />
            )}
          />
          <Controller
            name="is_active"
            control={control}
            render={({ field }) => (
              <Switch
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
              >
                {t("columns.active")}
              </Switch>
            )}
          />
          {linkedKitchen && (
            <p className="text-sm text-neutral-500">
              {t("columns.linkedKitchen")}: {linkedKitchen}
            </p>
          )}
        </div>
        <Button type="submit" variant="primary">
          {t("common:actions.save")}
        </Button>
      </form>
    </Modal>
  );
};
