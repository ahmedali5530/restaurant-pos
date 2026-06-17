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
import { Tax } from "@/api/model/tax.ts";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Tax
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  rate: yup.number().required(i18n.t('validation:required')),
  priority: yup.string().required(i18n.t('validation:required')),
});

export const TaxForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      rate: null,
      priority: null
    });
  }

  useEffect(() => {
    if( data ) {
      reset({
        ...data,
        name: data.name,
        rate: data.rate,
        priority: data.priority.toString()
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
        await db.create(Tables.taxes, {
          ...vals
        });
      }

      closeModal();
      toast.success(t('toast:admin.taxSaved', { name: values.name }));
    } catch ( e ) {
      toast.error(e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        title={data ? t('forms.updateTax', { name: data?.name }) : t('forms.createTax')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 flex-col mb-3">
            <div className="flex-1">
              <Input label={t('columns.name')} {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>
            <div className="flex-1">
              <Controller
                render={({ field }) => (
                  <Input
                    label={t('columns.ratePercent')}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors?.rate?.message}
                  />
                )}
                name="rate"
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
