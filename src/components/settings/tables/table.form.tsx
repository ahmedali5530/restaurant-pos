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
import { Table } from "@/api/model/table.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Category } from "@/api/model/category.ts";
import { PaymentType } from "@/api/model/payment_type.ts";
import { OrderType } from "@/api/model/order_type.ts";
import { Floor } from "@/api/model/floor.ts";
import { Switch } from "@/components/common/input/switch.tsx";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import { StringRecordId } from "surrealdb";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Table
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  number: yup.string().required(i18n.t('validation:required')),
  priority: yup.string().required(i18n.t('validation:required')),
  background: yup.string().required(i18n.t('validation:required')),
  color: yup.string().required(i18n.t('validation:required')),
  floor: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).default(undefined).required('This is required'),
  categories: yup.array(yup.object({
    label: yup.string(),
    value: yup.string()
  })),
  order_types: yup.array(yup.object({
    label: yup.string(),
    value: yup.string()
  })),
  payment_types: yup.array(yup.object({
    label: yup.string(),
    value: yup.string()
  })),
  ask_for_covers: yup.boolean().default(true),
});

export const TableForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      number: null,
      priority: null,
      background: null,
      color: null,
      floor: null,
      categories: [],
      order_types: [],
      payment_types: [],
      ask_for_covers: false,
    });
  }

  useEffect(() => {
    if(data){
      reset({
        ...data,
        name: data.name,
        number: data.number,
        priority: data.priority.toString(),
        background: data.background,
        color: data.color,
        floor: (data?.floor ? {label: data?.floor?.name, value: data?.floor?.id} : null),
        categories: data?.categories?.map(item => ({
          label: item.name,
          value: item.id
        })),
        order_types: data?.order_types?.map(item => ({
          label: item.name,
          value: item.id
        })),
        payment_types: data?.payment_types?.map(item => ({
          label: item.name,
          value: item.id
        })),
      });
    }
  }, [data]);

  const db = useDB();

  const { register, control, handleSubmit, formState: {errors}, reset } = useForm({
    resolver: yupResolver(validationSchema)
  });

  const {
    data: categories,
    fetchData: fetchCategories,
    isFetching: loadingCategories
  } = useApi<SettingsData<Category>>(Tables.categories, [], [], 0, 99999, [], {
    enabled: false
  });

  const {
    data: paymentTypes,
    fetchData: fetchPaymentTypes,
    isFetching: loadingPaymentTypes
  } = useApi<SettingsData<PaymentType>>(Tables.payment_types, [], [], 0, 99999, [], {
    enabled: false
  });

  const {
    data: orderTypes,
    fetchData: fetchOrderTypes,
    isFetching: loadingOrderTypes
  } = useApi<SettingsData<OrderType>>(Tables.order_types, [], [], 0, 99999, [], {
    enabled: false
  });

  const {
    data: floors,
    fetchData: fetchFloors,
    isFetching: loadingFloors
  } = useApi<SettingsData<Floor>>(Tables.floors, [], [], 0, 99999, [], {
    enabled: false
  });

  const onSubmit = async (values: any) => {
    const val = {...values};

    val.priority = parseInt(val.priority);
    if(val.floor){
      val.floor = new StringRecordId(val.floor.value);
    }
    if(val.categories){
      val.categories = val.categories.map(item => new StringRecordId(item.value));
    }
    if(val.order_types){
      val.order_types = val.order_types.map(item => new StringRecordId(item.value));
    }
    if(val.payment_types){
      val.payment_types = val.payment_types.map(item => new StringRecordId(item.value));
    }

    try {
      if(data?.id){
        await db.update(data.id, {
          ...val
        })
      }else{
        await db.create(Tables.tables, {
          ...val
        });
      }

      closeModal();
      toast.success(t('toast:admin.tableSaved', { name: `${values.name}${values.number}` }));
    }catch(e){
      toast.error(e);
      console.log(e)
    }
  }

  useEffect(() => {
    if(open){
      fetchFloors();
      fetchCategories();
      fetchPaymentTypes();
      fetchOrderTypes();
    }
  }, [open]);

  return (
    <>
      <Modal
        title={data ? t('forms.updateTable', { name: `${data?.name}${data?.number}` }) : t('forms.createTable')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input label={t('forms.nameOfTable')} {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>
            <div className="flex-1">
              <Input label={t('forms.numberOfTable')} {...register('number')} error={errors?.number?.message}/>
            </div>
          </div>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Controller
                name="ask_for_covers"
                control={control}
                render={({field}) => (
                  <Switch checked={field.value} onChange={field.onChange}>
                    Ask for number of covers
                  </Switch>
                )}
              />
            </div>
          </div>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input type="color" label={t('forms.backgroundColor')} {...register('background')}
                     error={errors?.background?.message}/>
            </div>
            <div className="flex-1">
              <Input type="color" label={t('forms.fontColor')} {...register('color')} error={errors?.background?.message}/>
            </div>
          </div>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label htmlFor="">{t('columns.floor')}</label>
              <Controller
                render={({ field }) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={floors?.data?.map(item => ({
                      label: item.name,
                      value: item.id
                    }))}
                    isLoading={loadingFloors}
                  />
                )}
                name="floor"
                control={control}
              />
              <InputError error={errors?.floor?.message} />
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
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label htmlFor="">{t('columns.categories')}</label>
              <Controller
                render={({ field }) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={categories?.data?.map(item => ({
                      label: item.name,
                      value: item.id
                    }))}
                    isMulti
                    isLoading={loadingCategories}
                  />
                )}
                name="categories"
                control={control}
              />
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label htmlFor="">{t('columns.orderTypes')}</label>
              <Controller
                render={({ field }) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={orderTypes?.data?.map(item => ({
                      label: item.name,
                      value: item.id
                    }))}
                    isMulti
                    isLoading={loadingOrderTypes}
                  />
                )}
                name="order_types"
                control={control}
              />
            </div>
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label htmlFor="">{t('columns.paymentTypes')}</label>
              <Controller
                render={({ field }) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={paymentTypes?.data?.map(item => ({
                      label: item.name,
                      value: item.id
                    }))}
                    isMulti
                    isLoading={loadingPaymentTypes}
                  />
                )}
                name="payment_types"
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
