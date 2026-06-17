import React, {useEffect} from "react";
import { useTranslation } from 'react-i18next';
import * as yup from "yup";
import {useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {InventorySupplier} from "@/api/model/inventory_supplier.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";

interface SupplierFormValues {
  id?: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventorySupplier;
}

const normalizeString = (value?: string | null) => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const validationSchema: yup.ObjectSchema<SupplierFormValues> = yup.object({
  id: yup.string().optional(),
  name: yup.string().required("This is required"),
  address: yup.string().transform((value) => normalizeString(value)).optional(),
  phone: yup.string().transform((value) => normalizeString(value)).optional(),
  email: yup.string().transform((value) => normalizeString(value)).email("Invalid email").optional(),
}).required();

export const SupplierForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();

  const {register, handleSubmit, formState: {errors}, reset} = useForm({
    resolver: yupResolver(validationSchema)
  });

  const closeModal = () => {
    onClose();
    reset({
      name: "",
      address: "",
      phone: "",
      email: "",
      id: undefined
    });
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        name: data.name ?? "",
        address: data.address ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: SupplierFormValues) => {
    try {
      const payload = {
        name: values.name,
        address: normalizeString(values.address ?? undefined),
        phone: normalizeString(values.phone ?? undefined),
        email: normalizeString(values.email ?? undefined),
      } as Record<string, unknown>;

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.inventory_suppliers, payload);
      }

      toast.success(t('toast:inventory.supplierSaved', { name: values.name }));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal
      title={data ? `Update ${data?.name}` : "Create new supplier"}
      open={open}
      onClose={closeModal}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <input type="hidden" {...register("id")} />
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex-1">
            <Input label={t('columns.name')} {...register("name")} autoFocus error={errors?.name?.message} />
          </div>
          <div className="flex-1">
            <Input label={t('columns.address')} {...register("address")} error={errors?.address?.message ?? undefined} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input label={t('columns.phone')} {...register("phone")} error={errors?.phone?.message ?? undefined} />
            </div>
            <div className="flex-1">
              <Input label={t('columns.email')} {...register("email")} error={errors?.email?.message ?? undefined} />
            </div>
          </div>
        </div>
        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};
