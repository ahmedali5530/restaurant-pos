import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input, InputError } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useMemo,  useEffect  } from "react";
import { Discount, DiscountType } from "@/api/model/discount.ts";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Discount
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  type: yup.object().shape({
    label: yup.string(),
    value: yup.string()
  }).default(undefined).required('This is required'),
  min_rate: yup.number().required(i18n.t('validation:required')),
  max_rate: yup.number().required(i18n.t('validation:required')),
  max_cap: yup.number().nullable(),
  priority: yup.string().required(i18n.t('validation:required')),
});

export const DiscountForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      min_rate: null,
      max_rate: null,
      max_cap: null,
      type: null,
      priority: null
    });
  }

  useEffect(() => {
    if( data ) {
      reset({
        ...data,
        name: data.name,
        min_rate: data.min_rate,
        max_rate: data.max_rate,
        max_cap: data.max_cap,
        type: { label: data?.type, value: data?.type },
        priority: data.priority.toString()
      });
    }
  }, [data]);

  const db = useDB();

  const { register, control, handleSubmit, formState: { errors }, reset, watch } = useForm({
    resolver: yupResolver(validationSchema)
  });

  const onSubmit = async (values: any) => {
    const vals = { ...values };
    vals.priority = parseInt(vals.priority);
    if(vals.type){
      vals.type = vals.type.value;
    }

    try {
      if( data?.id ) {
        await db.update(data.id, {
          ...vals
        })
      } else {
        await db.create(Tables.discounts, {
          ...vals
        });
      }

      closeModal();
      toast.success(t('toast:admin.discountSaved', { name: values.name }));
    } catch ( e ) {
      toast.error(e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        title={data ? t('forms.updateDiscount', { name: data?.name }) : t('forms.createDiscount')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 flex-col mb-3">
            <div className="flex-1">
              <Input label={t('columns.name')} {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>
            <div className="flex-1">
              <label htmlFor="">Type</label>
              <Controller
                render={({ field }) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={['Fixed', 'Percent'].map(item => ({
                      label: item,
                      value: item
                    }))}
                  />
                )}
                name="type"
                control={control}
              />
              <InputError error={errors?.type?.message}/>
            </div>
            {watch('type')?.value === DiscountType.Percent && (
              <div className="flex-1">
                <Controller
                  render={({ field }) => (
                    <Input
                      label={t('columns.maxDiscountCap')}
                      value={field.value}
                      onChange={field.onChange}
                      error={errors?.max_cap?.message}
                    />
                  )}
                  name="max_cap"
                  control={control}
                />
              </div>
            )}
            <div className="flex-1">
              <Controller
                render={({ field }) => (
                  <Input
                    label={`Min ${watch('type')?.value === DiscountType.Percent ? '%' : 'rate'}`}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors?.min_rate?.message}
                  />
                )}
                name="min_rate"
                control={control}
              />
            </div>

            <div className="flex-1">
              <Controller
                render={({ field }) => (
                  <Input
                    label={`Max ${watch('type')?.value === DiscountType.Percent ? '%' : 'rate'}`}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors?.max_rate?.message}
                  />
                )}
                name="max_rate"
                control={control}
              />
            </div>

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
