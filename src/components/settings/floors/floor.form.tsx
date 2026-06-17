import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useMemo,  useEffect  } from "react";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import { Floor } from "@/api/model/floor.ts";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Floor
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  priority: yup.string().required(i18n.t('validation:required')),
  background: yup.string(),
  color: yup.string(),
});

export const FloorForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      priority: null,
      background: null,
      color: null,
    });
  }

  useEffect(() => {
    if( data ) {
      reset({
        ...data,
        name: data.name,
        priority: data.priority.toString(),
        background: data.background,
        color: data.color,
      });
    }
  }, [data]);

  const db = useDB();

  const { register, control, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: yupResolver(validationSchema)
  });

  const onSubmit = async (values: any) => {
    const vals = {...values};
    vals.priority = parseInt(vals.priority);

    try {
      if( data?.id ) {
        await db.update(data.id, {
          ...vals
        })
      } else {
        await db.create(Tables.floors, {
          ...vals
        });
      }

      closeModal();
      toast.success(t('toast:admin.floorSaved', { name: values.name }));
    } catch ( e ) {
      toast.error(e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        title={data ? t('forms.updateFloor', { name: data?.name }) : t('forms.createFloor')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input label={t('forms.nameOfTable')} {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>
          </div>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input type="color" label={t('forms.backgroundColor')} {...register('background')}
                     error={errors?.background?.message}/>
            </div>
            <div className="flex-1">
              <Input type="color" label={t('forms.fontColor')} {...register('color')} error={errors?.color?.message}/>
            </div>
          </div>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Controller
                render={({ field }) => (
                  <Input
                    type="number"
                    label={t('columns.priority')}
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

          <div>
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
