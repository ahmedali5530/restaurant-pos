import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Menu } from "@/api/model/menu.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import React, { useMemo,  useEffect } from "react";
import { Switch } from "@/components/common/input/switch.tsx";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import { nowSurrealDateTime, toJsDate, toSurrealDateTime } from "@/lib/datetime.ts";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Menu
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  start_from: yup.string().nullable(),
  end_time: yup.string().nullable(),
  ends_on_next_day: yup.boolean(),
  active: yup.boolean()
});

export const MenuForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  // Helper function to convert Date to time string (HH:mm)
  const dateToTimeString = (date: unknown): string | null => {
    if (!date) return null;
    const dateObj = toJsDate(date as any);
    if (isNaN(dateObj.getTime())) return null;
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Helper function to convert time string (HH:mm) to Date (using today's date)
  const timeStringToDate = (timeString: string | null | undefined) => {
    if (!timeString) return null;
    const [hours, minutes] = timeString.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return null;
    const date = toJsDate(nowSurrealDateTime());
    date.setHours(hours, minutes, 0, 0);
    return toSurrealDateTime(date);
  };

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      start_from: null,
      end_time: null,
      ends_on_next_day: false,
      active: false
    });
  }

  const { register, control, handleSubmit, formState: {errors}, reset } = useForm({
    resolver: yupResolver(validationSchema)
  });

  useEffect(() => {
    if(data){
      reset({
        ...data,
        name: data.name,
        start_from: dateToTimeString(data.start_from),
        end_time: dateToTimeString(data.end_time),
        ends_on_next_day: data.ends_on_next_day || false,
        active: data.active !== undefined ? data.active : true,
      });
    }
  }, [data, reset]);

  const db = useDB();



  const onSubmit = async (values: any) => {
    const vals = {...values};
    
    // Convert time strings to Date objects
    if(vals.start_from) {
      vals.start_from = timeStringToDate(vals.start_from);
    }
    if(vals.end_time) {
      vals.end_time = timeStringToDate(vals.end_time);
    }

    try {
      if(data?.id){
        await db.merge(data.id, {
          name: vals.name,
          start_from: vals.start_from,
          end_time: vals.end_time,
          ends_on_next_day: vals.ends_on_next_day,
          active: vals.active !== undefined ? vals.active : true
        })
      }else{
        await db.create(Tables.menus, {
          name: vals.name,
          start_from: vals.start_from,
          end_time: vals.end_time,
          ends_on_next_day: vals.ends_on_next_day,
          active: vals.active !== undefined ? vals.active : true,
          items: []
        });
      }

      closeModal();
      toast.success(t('toast:admin.menuSaved', { name: values.name }));
    }catch(e){
      toast.error(e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        title={data ? t('forms.updateMenu', { name: data?.name }) : t('forms.createMenu')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input label={t('columns.name')} {...register('name')} autoFocus error={errors?.name?.message} />
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Controller
                name="start_from"
                control={control}
                render={({field}) => (
                  <Input
                    type="time"
                    label={t('columns.startTime')}
                    value={field.value || ''}
                    onChange={field.onChange}
                    error={errors?.start_from?.message}
                  />
                )}
              />
            </div>
            <div className="flex-1">
              <Controller
                name="end_time"
                control={control}
                render={({field}) => (
                  <Input
                    type="time"
                    label={t('columns.endTime')}
                    value={field.value || ''}
                    onChange={field.onChange}
                    error={errors?.end_time?.message}
                  />
                )}
              />
            </div>
          </div>
          <div className="mb-3">
            <div className="flex-1">
              <Controller
                name={`ends_on_next_day`}
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value || false} onChange={field.onChange}>
                    Ends on next day
                  </Switch>
                )}
              />
            </div>
          </div>
          <div className="mb-3">
            <div className="flex-1">
              <Controller
                name={`active`}
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value !== undefined ? field.value : true} onChange={field.onChange}>
                    Active
                  </Switch>
                )}
              />
            </div>
          </div>
          <div>
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

