import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Category } from "@/api/model/category.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import React, { useMemo,  useEffect } from "react";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import {Switch} from "@/components/common/input/switch.tsx";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Category
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  priority: yup.string().required(i18n.t('validation:required')).typeError(i18n.t('validation:mustBeNumber')),
  show_in_menu: yup.boolean()
});

export const CategoryForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      priority: null,
      show_in_menu: null
    });
  }

  useEffect(() => {
    if(data){
      reset({
        ...data,
        name: data.name,
        priority: data.priority.toString(),
        show_in_menu: data.show_in_menu,
      });
    }
  }, [data]);

  const db = useDB();

  const { register, control, handleSubmit, formState: {errors}, reset } = useForm({
    resolver: yupResolver(validationSchema)
  });

  const onSubmit = async (values: any) => {
    const vals = {...values};
    vals.priority = parseInt(vals.priority);

    try {
      if(data?.id){
        await db.update(data.id, {
          ...vals
        })
      }else{
        await db.create(Tables.categories, {
          ...vals
        });
      }

      closeModal();
      toast.success(t('toast:admin.categorySaved', { name: values.name }));
    }catch(e){
      toast.error(e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        title={data ? t('forms.updateCategory', { name: data?.name }) : t('forms.createCategory')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input label={t('forms.nameOfCategory')} {...register('name')} autoFocus error={errors?.name?.message} />
            </div>
            <div className="flex-1">
              <Controller
                render={({field}) => (
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
          <div className="mb-3">
            <div className="flex-1">
              <Controller
                name={`show_in_menu`}
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onChange={field.onChange}>
                    Show this category in menu
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
