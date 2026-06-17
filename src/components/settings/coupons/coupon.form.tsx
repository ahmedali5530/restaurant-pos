import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Controller, useForm} from "react-hook-form";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toast} from "sonner";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {useEffect} from "react";
import {Coupon, CouponType, WeekDay} from "@/api/model/coupon.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {DateTime} from "luxon";
import {nowSurrealDateTime, toJsDate, toLuxonDateTime, toSurrealDateTime} from "@/lib/datetime.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  data?: Coupon;
}

const weekDayOptions: { label: string; value: WeekDay }[] = [
  {label: "Mon", value: "mon"},
  {label: "Tue", value: "tue"},
  {label: "Wed", value: "wed"},
  {label: "Thu", value: "thu"},
  {label: "Fri", value: "fri"},
  {label: "Sat", value: "sat"},
  {label: "Sun", value: "sun"},
];

const validationSchema = yup.object({
  code: yup.string().required(i18n.t('validation:required')),
  description: yup.string().nullable(),
  coupon_type: yup
    .object({
      label: yup.string(),
      value: yup.mixed<CouponType>(),
    })
    .required(i18n.t('validation:required')),
  discount_type: yup
    .object({
      label: yup.string(),
      value: yup.string(),
    })
    .required(i18n.t('validation:required')),
  discount_value: yup
    .number()
    .typeError(i18n.t('validation:mustBeNumber'))
    .required(i18n.t('validation:required')),
  min_order_amount: yup
    .number()
    .typeError(i18n.t('validation:mustBeNumber'))
    .nullable(),
  max_discount_amount: yup
    .number()
    .typeError(i18n.t('validation:mustBeNumber'))
    .nullable(),
  usage_limit: yup.number().typeError(i18n.t('validation:mustBeNumber')).nullable(),
  usage_limit_per_user: yup
    .number()
    .typeError(i18n.t('validation:mustBeNumber'))
    .nullable(),
  priority: yup
    .string()
    .required(i18n.t('validation:required')),
  valid_days: yup.array().of(
    yup.object({
      label: yup.string(),
      value: yup.mixed<WeekDay>(),
    })
  ),
  stackable: yup.boolean().default(false),
  first_order_only: yup.boolean().default(false),
  is_active: yup.boolean().default(true),
  start_time: yup.string().nullable(),
  end_time: yup.string().nullable(),
  start_date: yup.string().nullable(),
  end_date: yup.string().nullable(),
});

export const CouponForm = ({ open, onClose, data }: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);
  const db = useDB();

  const {
    register,
    control,
    handleSubmit,
    formState: {errors},
    reset,
  } = useForm({
    resolver: yupResolver(validationSchema),
  });

  const closeModal = () => {
    onClose();
    reset({});
  };

  useEffect(() => {
    if (data) {
      const startDateString = data.start_date ? toLuxonDateTime(data.start_date).toFormat("yyyy-LL-dd'T'HH:mm") : undefined;
      const endDateString = data.end_date ? toLuxonDateTime(data.end_date).toFormat("yyyy-LL-dd'T'HH:mm") : undefined;
      const startTimeString = data.start_time ? toLuxonDateTime(data.start_time).toFormat("HH:mm") : undefined;
      const endTimeString = data.end_time ? toLuxonDateTime(data.end_time).toFormat("HH:mm") : undefined;
      reset({
        ...data,
        start_date: startDateString,
        end_date: endDateString,
        start_time: startTimeString,
        end_time: endTimeString,
        coupon_type: data.coupon_type
          ? {label: data.coupon_type, value: data.coupon_type}
          : undefined,
        discount_type: data.discount_type
          ? {label: data.discount_type, value: data.discount_type}
          : undefined,
        valid_days: (data.valid_days || []).map((d) => ({
          label: d,
          value: d,
        })),
        priority: data.priority.toString()
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: any) => {
    const vals = {...values};

    if (vals.coupon_type) {
      vals.coupon_type = vals.coupon_type.value;
    }
    if (vals.discount_type) {
      vals.discount_type = vals.discount_type.value;
    }
    if (Array.isArray(vals.valid_days)) {
      vals.valid_days = vals.valid_days.map(
        (item: { value: WeekDay }) => item.value
      );
    }

    // Normalize date/time fields to Surreal DateTime before sending to DB
    const toDateTime = (input?: string | null) => {
      if (!input) return undefined;
      const dt = DateTime.fromISO(input);
      return dt.isValid ? toSurrealDateTime(dt) : undefined;
    };

    const toTimeOfDayDate = (input?: string | null) => {
      if (!input) return undefined;
      const [hh, mm] = input.split(":").map((v) => Number(v) || 0);
      const dt = DateTime.now().set({hour: hh, minute: mm, second: 0, millisecond: 0});
      return toSurrealDateTime(dt);
    };

    vals.start_date = toDateTime(vals.start_date);
    vals.end_date = toDateTime(vals.end_date);
    vals.start_time = toTimeOfDayDate(vals.start_time);
    vals.end_time = toTimeOfDayDate(vals.end_time);

    vals.priority = Number(vals.priority);

    try {
      if (data?.id) {
        await db.update(data.id, {
          ...vals,
          updated_at: nowSurrealDateTime(),
        });
      } else {
        const now = nowSurrealDateTime();
        await db.create(Tables.coupons, {
          ...vals,
          used_count: 0,
          created_at: now,
          updated_at: now,
        });
      }

      closeModal();
      toast.success(t('toast:admin.couponSaved', { code: values.code }));
    } catch (e) {
      toast.error(e);
      // eslint-disable-next-line no-console
      console.log(e);
    }
  };

  return (
    <Modal
      title={data ? t('forms.updateCoupon', { code: data.code }) : t('forms.createCoupon')}
      open={open}
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex flex-col gap-3">
            <Controller
              name="code"
              control={control}
              render={({field}) => (
                <div>
                  <Input
                    label={t('columns.code')}
                    autoFocus
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={errors?.code?.message as string}
                  />
                </div>
              )}
            />
            <Controller
              name="description"
              control={control}
              render={({field}) => (
                <div>
                  <Input
                    label={t('columns.description')}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={errors?.description?.message as string}
                  />
                </div>
              )}
            />
            <div>
              <label>Coupon type</label>
              <Controller
                name="coupon_type"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={(["order", "product", "shipping"] as CouponType[]).map(
                      (item) => ({
                        label: item,
                        value: item,
                      })
                    )}
                  />
                )}
              />
              <InputError error={errors?.coupon_type?.message as string}/>
            </div>
            <div>
              <label>Discount type</label>
              <Controller
                name="discount_type"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={["fixed", "percent"].map((item) => ({
                      label: item,
                      value: item,
                    }))}
                  />
                )}
              />
              <InputError error={errors?.discount_type?.message as string}/>
            </div>
            <Controller
              name="discount_value"
              control={control}
              render={({field}) => (
                <div>
                  <Input
                    type="number"
                    label={t('forms.discountValue')}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={errors?.discount_value?.message as string}
                  />
                </div>
              )}
            />
            <Controller
              name="min_order_amount"
              control={control}
              render={({field}) => (
                <div>
                  <Input
                    type="number"
                    label={t('forms.minOrderAmount')}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={errors?.min_order_amount?.message as string}
                  />
                </div>
              )}
            />
            <Controller
              name="max_discount_amount"
              control={control}
              render={({field}) => (
                <div>
                  <Input
                    type="number"
                    label={t('forms.maxDiscountAmount')}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={errors?.max_discount_amount?.message as string}
                  />
                </div>
              )}
            />
            <Controller
              name="usage_limit"
              control={control}
              render={({field}) => (
                <div>
                  <Input
                    type="number"
                    label={t('forms.usageLimitOverall')}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={errors?.usage_limit?.message as string}
                  />
                </div>
              )}
            />
            <Controller
              name="usage_limit_per_user"
              control={control}
              render={({field}) => (
                <div>
                  <Input
                    type="number"
                    label={t('forms.usageLimitPerUser')}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={errors?.usage_limit_per_user?.message as string}
                  />
                </div>
              )}
            />
          </div>
          <div className="flex flex-col gap-3">
            <Controller
              name="priority"
              control={control}
              render={({field}) => (
                <div>
                  <Input
                    type="number"
                    label={t('columns.priority')}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    error={errors?.priority?.message as string}
                  />
                </div>
              )}
            />
            <div>
              <label>Valid days</label>
              <Controller
                name="valid_days"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    isMulti
                    value={field.value}
                    onChange={field.onChange}
                    options={weekDayOptions}
                  />
                )}
              />
              <InputError error={errors?.valid_days?.message as string}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="start_time"
                control={control}
                render={({field}) => {
                  const value = field.value
                    ? typeof field.value === "string"
                      ? field.value
                      : toJsDate(field.value as any).toTimeString().slice(0, 5)
                    : "";
                  return (
                    <div>
                      <Input
                        type="time"
                        label={t('columns.startTime')}
                        value={value}
                        onChange={field.onChange}
                        error={errors?.start_time?.message as string}
                      />
                    </div>
                  );
                }}
              />
              <Controller
                name="end_time"
                control={control}
                render={({field}) => {
                  const value = field.value
                    ? typeof field.value === "string"
                      ? field.value
                      : toJsDate(field.value as any).toTimeString().slice(0, 5)
                    : "";
                  return (
                    <div>
                      <Input
                        type="time"
                        label={t('columns.endTime')}
                        value={value}
                        onChange={field.onChange}
                        error={errors?.end_time?.message as string}
                      />
                    </div>
                  );
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="start_date"
                control={control}
                render={({field}) => {
                  const value = field.value
                    ? typeof field.value === "string"
                      ? field.value
                      : toJsDate(field.value as any).toISOString().slice(0, 16)
                    : "";
                  return (
                    <div>
                      <Input
                        type="datetime-local"
                        label={t('forms.startDate')}
                        value={value}
                        onChange={field.onChange}
                        error={errors?.start_date?.message as string}
                      />
                    </div>
                  );
                }}
              />
              <Controller
                name="end_date"
                control={control}
                render={({field}) => {
                  const value = field.value
                    ? typeof field.value === "string"
                      ? field.value
                      : toJsDate(field.value as any).toISOString().slice(0, 16)
                    : "";
                  return (
                    <div>
                      <Input
                        type="datetime-local"
                        label={t('forms.endDate')}
                        value={value}
                        onChange={field.onChange}
                        error={errors?.end_date?.message as string}
                      />
                    </div>
                  );
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" {...register("stackable")} id="stackable"/>
              <label htmlFor="stackable">Stackable with other discounts</label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                {...register("first_order_only")}
                id="first_order_only"
              />
              <label htmlFor="first_order_only">First order only</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" {...register("is_active")} id="is_active"/>
              <label htmlFor="is_active">Active</label>
            </div>
          </div>
        </div>
        <div>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
};

