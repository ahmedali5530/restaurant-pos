import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { StringRecordId } from "surrealdb";
import { toast } from "sonner";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { Switch } from "@/components/common/input/switch.tsx";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Extra } from "@/api/model/extra.ts";
import { PaymentType } from "@/api/model/payment_type.ts";
import { OrderType } from "@/api/model/order_type.ts";
import { Table } from "@/api/model/table.ts";

interface Props {
  open: boolean
  onClose: () => void
  data?: Extra
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  value: yup.number().required(i18n.t('validation:required')).typeError(i18n.t('validation:mustBeNumber')),
  payment_types: yup.array(yup.object({
    label: yup.string(),
    value: yup.string(),
  })).default([]),
  order_types: yup.array(yup.object({
    label: yup.string(),
    value: yup.string(),
  })).default([]),
  tables: yup.array(yup.object({
    label: yup.string(),
    value: yup.string(),
  })).default([]),
  delivery: yup.boolean().default(false),
  apply_to_all: yup.boolean().default(false),
});

export const ExtraForm = ({ open, onClose, data }: Props) => {
  const db = useDB();
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const {
    data: paymentTypes,
    fetchData: fetchPaymentTypes,
  } = useApi<SettingsData<PaymentType>>(Tables.payment_types, [], ["priority asc"], 0, 99999, [], {
    enabled: false,
  });

  const {
    data: orderTypes,
    fetchData: fetchOrderTypes,
  } = useApi<SettingsData<OrderType>>(Tables.order_types, [], ["priority asc"], 0, 99999, [], {
    enabled: false,
  });

  const {
    data: tables,
    fetchData: fetchTables,
  } = useApi<SettingsData<Table>>(Tables.tables, [], ["priority asc"], 0, 99999, [], {
    enabled: false,
  });

  const { register, control, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: yupResolver(validationSchema),
  });

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      value: null,
      payment_types: [],
      order_types: [],
      tables: [],
      delivery: false,
      apply_to_all: false,
    });
  };

  useEffect(() => {
    if (data) {
      reset({
        ...data,
        name: data.name,
        value: data.value,
        payment_types: data.payment_types?.map(item => ({
          label: item.name,
          value: item.id.toString(),
        })) || [],
        order_types: data.order_types?.map(item => ({
          label: item.name,
          value: item.id.toString(),
        })) || [],
        tables: data.tables?.map(item => ({
          label: `${item.name}${item.number}`,
          value: item.id.toString(),
        })) || [],
        delivery: !!data.delivery,
        apply_to_all: !!data.apply_to_all,
      });
    }
  }, [data, reset]);

  useEffect(() => {
    if (open) {
      fetchPaymentTypes();
      fetchOrderTypes();
      fetchTables();
    }
  }, [open, fetchPaymentTypes, fetchOrderTypes, fetchTables]);

  const onSubmit = async (values: any) => {
    const val = { ...values };
    val.value = Number(values.value);

    if (values.payment_types) {
      val.payment_types = values.payment_types.map(item => new StringRecordId(item.value));
    }
    if (values.order_types) {
      val.order_types = values.order_types.map(item => new StringRecordId(item.value));
    }
    if (values.tables) {
      val.tables = values.tables.map(item => new StringRecordId(item.value));
    }

    try {
      if (data?.id) {
        await db.update(data.id, val);
      } else {
        await db.create(Tables.extras, val);
      }

      closeModal();
      toast.success(t('toast:admin.extraSaved', { name: values.name }));
    } catch (e) {
      toast.error(e);
      console.log(e);
    }
  };

  return (
    <Modal
      title={data ? t('forms.updateExtra', { name: data?.name }) : t('forms.createExtra')}
      open={open}
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <Input label={t('columns.name')} {...register("name")} autoFocus error={errors?.name?.message} />
          </div>
          <div className="flex-1">
            <Controller
              render={({ field }) => (
                <Input
                  type="number"
                  label={t('columns.value')}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors?.value?.message}
                />
              )}
              name="value"
              control={control}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-3">
          <div className="flex-1">
            <label>{t('columns.paymentTypes')}</label>
            <Controller
              render={({ field }) => (
                <ReactSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={paymentTypes?.data?.map(item => ({
                    label: item.name,
                    value: item.id.toString(),
                  }))}
                  isMulti
                />
              )}
              name="payment_types"
              control={control}
            />
          </div>
          <div className="flex-1">
            <label>{t('columns.orderTypes')}</label>
            <Controller
              render={({ field }) => (
                <ReactSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={orderTypes?.data?.map(item => ({
                    label: item.name,
                    value: item.id.toString(),
                  }))}
                  isMulti
                />
              )}
              name="order_types"
              control={control}
            />
          </div>
          <div className="flex-1">
            <label>{t('columns.tables')}</label>
            <Controller
              render={({ field }) => (
                <ReactSelect
                  value={field.value}
                  onChange={field.onChange}
                  options={tables?.data?.map(item => ({
                    label: `${item.name}${item.number}`,
                    value: item.id.toString(),
                  }))}
                  isMulti
                />
              )}
              name="tables"
              control={control}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-5">
          <Controller
            name="delivery"
            control={control}
            render={({ field }) => (
              <Switch checked={field.value} onChange={field.onChange}>
                {t('forms.deliveryOnly')}
              </Switch>
            )}
          />
          <Controller
            name="apply_to_all"
            control={control}
            render={({ field }) => (
              <Switch checked={field.value} onChange={field.onChange}>
                {t('forms.applyToAllSwitch')}
              </Switch>
            )}
          />
        </div>

        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};
