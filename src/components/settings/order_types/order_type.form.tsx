import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import React, { useEffect } from "react";
import { OrderType } from "@/api/model/order_type.ts";
import {Switch} from "@/components/common/input/switch.tsx";

interface Props {
  open: boolean
  onClose: () => void;
  data?: OrderType
}

const validationSchema = yup.object({
  name: yup.string().required("This is required"),
  priority: yup.string().required("This is required"),
  allow_service_charges: yup.boolean(),
});

export const OrderTypeForm = ({
  open, onClose, data
}: Props) => {
  const closeModal = () => {
    onClose();
    reset({
      name: null,
      priority: null,
      allow_service_charges: false
    });
  }

  useEffect(() => {
    if( data ) {
      reset({
        ...data,
        priority: data.priority.toString(),
      });
    }
  }, [data]);

  const db = useDB();

  const { register, control, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: yupResolver(validationSchema)
  });

  const onSubmit = async (values: any) => {
    const vals = { ...values };

    vals.priority = parseInt(vals.priority);

    try {
      if( data?.id ) {
        await db.update(data.id, {
          ...vals
        })
      } else {
        await db.create(Tables.order_types, {
          ...vals
        });
      }

      closeModal();
      toast.success(`Order type ${values.name} saved`);
    } catch ( e ) {
      toast.error(e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        title={data ? `Update ${data?.name}` : 'Create new order type'}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input label="Name" {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>
            <div className="flex-1">
              <Controller
                render={({ field }) => (
                  <Input
                    type="number"
                    label="Priority"
                    error={errors?.priority?.message}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
                name="priority"
                control={control}
              />

            </div>
          </div>

          <div className="mb-3 flex-1">
            <div className="flex-1">
              <Controller
                name={`allow_service_charges`}
                control={control}
                render={({ field }) => (
                  <Switch checked={!!field.value} onChange={field.onChange}>
                    Allow service charges
                  </Switch>
                )}
              />
            </div>
          </div>

          <div>
            <Button type="submit" variant="primary">Save</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
