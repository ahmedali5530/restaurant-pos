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
  data: Table[]
}

const validationSchema = yup.object({
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

export const TableBulkForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const defaultValues = {
    background: "#ffffff",
    color: "#000000",
    floor: null,
    categories: [],
    order_types: [],
    payment_types: [],
    ask_for_covers: false,
  };

  const closeModal = () => {
    onClose();
  }

  const db = useDB();

  const { register, control, handleSubmit, formState: {errors}, reset } = useForm({
    resolver: yupResolver(validationSchema),
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
    if (!data?.length) {
      toast.error(t('toast:admin.noTablesSelected'));
      return;
    }

    const payload = {...values};

    if(payload.floor){
      payload.floor = new StringRecordId(payload.floor.value);
    }
    if(payload.categories){
      payload.categories = payload.categories.map(item => new StringRecordId(item.value));
    }
    if(payload.order_types){
      payload.order_types = payload.order_types.map(item => new StringRecordId(item.value));
    }
    if(payload.payment_types){
      payload.payment_types = payload.payment_types.map(item => new StringRecordId(item.value));
    }

    try {
      await Promise.all(
        data.map((table) => db.merge(table.id, payload))
      );

      closeModal();
      onClose();
      toast.success(t('toast:admin.tablesBulkUpdated', { count: data.length }));
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
        title={t('forms.bulkUpdateTables', { count: data?.length || 0 })}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
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
              <Input type="color" label={t('forms.frontColor')} {...register('color')} error={errors?.color?.message}/>
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
