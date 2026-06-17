import React, {useEffect} from "react";
import { useTranslation } from 'react-i18next';
import * as yup from "yup";
import {Controller, useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {InventoryCategory} from "@/api/model/inventory_category.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";

interface InventoryCategoryFormValues {
  name: string;
  priority: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryCategory;
}

const validationSchema: yup.ObjectSchema<InventoryCategoryFormValues> = yup.object({
  id: yup.string().optional(),
  name: yup.string().required("This is required"),
  priority: yup.number().typeError("This should be a number").required("This is required"),
}).required();

export const InventoryCategoryForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();

  const {register, handleSubmit, formState: {errors}, reset, control} = useForm({
    resolver: yupResolver(validationSchema),
  });

  const closeModal = () => {
    onClose();
    reset({
      name: "",
      priority: 0,
    });
  };

  useEffect(() => {
    if (data) {
      reset({
        name: data.name ?? "",
        priority: data.priority ?? 0,
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: InventoryCategoryFormValues) => {
    try {
      const payload = {
        name: values.name,
        priority: Number(values.priority),
      };

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.inventory_categories, payload);
      }

      toast.success(t('toast:inventory.categorySaved', { name: values.name }));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal
      title={data ? `Update ${data?.name}` : "Create new category"}
      open={open}
      onClose={closeModal}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex-1">
            <Input label={t('columns.name')} {...register("name")} autoFocus error={errors?.name?.message} />
          </div>
          <div className="flex-1">
            <Controller
              control={control}
              name="priority"
              render={({field}) => (
                <Input
                  label={t('columns.priority')}
                  type="number"
                  {...field}
                  value={field.value ?? ""}
                  error={errors?.priority?.message}
                />
              )}
            />
          </div>
        </div>
        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};

