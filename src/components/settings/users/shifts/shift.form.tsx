import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { toast } from "sonner";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Shift } from "@/api/model/shift.ts";
import { isOvernightShift, shiftDisplayTime } from "@/lib/shift.utils.ts";

interface Props {
  open: boolean
  onClose: () => void
  data?: Shift
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  start_time: yup.string().required(i18n.t('validation:required')),
  end_time: yup.string().required(i18n.t('validation:required')),
});

export const ShiftForm = ({ open, onClose, data }: Props) => {
  const db = useDB();
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const { register, control, watch, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: yupResolver(validationSchema),
  });

  const startTime = watch("start_time");
  const endTime = watch("end_time");
  const overnight = isOvernightShift(startTime, endTime);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      start_time: null,
      end_time: null,
    });
  };

  useEffect(() => {
    if (data) {
      reset({
        ...data,
        name: data.name,
        start_time: data.start_time,
        end_time: data.end_time,
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: any) => {
    const payload = {
      ...values,
      ends_next_day: isOvernightShift(values.start_time, values.end_time),
    };

    try {
      if (payload.id) {
        await db.update(payload.id, payload);
      } else {
        await db.create(Tables.shifts, payload);
      }
      closeModal();
      toast.success(t('toast:admin.shiftSaved', { name: values.name }));
    } catch (e) {
      toast.error(String(e));
      console.log(e);
    }
  };

  return (
    <Modal
      title={data ? t('forms.updateShift', { name: data.name }) : t('forms.createShift')}
      open={open}
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex-1">
            <Input label={t('forms.shiftName')} {...register("name")} autoFocus error={errors?.name?.message} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <Controller
                name="start_time"
                control={control}
                render={({ field }) => (
                  <Input
                    type="time"
                    label={t('columns.startTime')}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors?.start_time?.message}
                  />
                )}
              />
            </div>
            <div className="flex-1">
              <Controller
                name="end_time"
                control={control}
                render={({ field }) => (
                  <Input
                    type="time"
                    label={t('columns.endTime')}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors?.end_time?.message}
                  />
                )}
              />
            </div>
          </div>
          <div className="text-sm text-neutral-600">
            {shiftDisplayTime({ start_time: startTime, end_time: endTime, ends_next_day: overnight })}
          </div>
        </div>
        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};
