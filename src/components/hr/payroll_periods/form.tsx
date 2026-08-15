import {useEffect, useMemo} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {DateValue} from "react-aria-components";
import {PayrollPeriod} from "@/api/model/payroll_period.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrDateField, HrInputField, HrStringSelectField} from "@/components/hr/shared/form-field.tsx";
import {
  calendarDateToSurreal,
  enumLocaleKey,
  enumOptions,
  firstFormError,
  toCalendarDateValue,
} from "@/components/hr/shared/form.utils.ts";
import {PayrollPeriodStatus, PayrollPeriodType} from "@/api/model/hr.types.ts";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';

const PERIOD_TYPES: PayrollPeriodType[] = ["weekly", "biweekly", "monthly", "custom"];
const PERIOD_STATUSES: PayrollPeriodStatus[] = ["open", "locked", "closed", "paid"];

interface FormValues {
  id?: string;
  name: string;
  period_type?: PayrollPeriodType;
  start_date: DateValue | null;
  end_date: DateValue | null;
  status?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: PayrollPeriod;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  name: yup.string().required("Required"),
  period_type: yup.string().optional(),
  start_date: yup.mixed().nullable().required("Required"),
  end_date: yup.mixed().nullable().required("Required"),
  status: yup.string().optional(),
}).required();

export const PayrollPeriodForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const {handleSubmit, control, reset, formState: {errors}} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {period_type: "monthly", status: "open"},
  });

  const periodTypeOptions = useMemo(
    () => enumOptions(t, PERIOD_TYPES, "periodTypes", enumLocaleKey),
    [t],
  );

  const periodStatusOptions = useMemo(
    () => enumOptions(t, PERIOD_STATUSES, "status.payroll"),
    [t],
  );

  const closeModal = () => {
    onClose();
    reset({name: "", period_type: "monthly", start_date: null, end_date: null, status: "open", id: undefined});
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        name: data.name ?? "",
        period_type: data.period_type ?? "monthly",
        start_date: toCalendarDateValue(data.start_date),
        end_date: toCalendarDateValue(data.end_date),
        status: data.status ?? "open",
      });
    } else if (open) {
      reset({name: "", period_type: "monthly", start_date: null, end_date: null, status: "open", id: undefined});
    }
  }, [data, open, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        name: values.name.trim(),
        period_type: values.period_type ?? "monthly",
        start_date: calendarDateToSurreal(values.start_date),
        end_date: calendarDateToSurreal(values.end_date),
        status: values.status ?? "open",
      };

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.payroll_periods, payload);
      }

      await emitEntityCrudSave({
        domain: 'hr',
        table: Tables.payroll_periods,
        entityId: data?.id ? String(data.id) : Tables.payroll_periods,
        isUpdate: Boolean(data?.id),
        after: payload,
        source: 'entity-form',
      });

      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal title={data ? t("forms.payroll.updatePeriod") : t("forms.payroll.createPeriod")} testId="hr-form-payroll-period" open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        {/*<input type="hidden" {...register("id")} />*/}
        <div className="flex flex-col gap-3 mb-3">
          <div>
            <HrInputField
              name="name"
              control={control}
              label={t("forms.payroll.periodName")}
              autoFocus
              error={errors.name?.message}
            />
          </div>
          <HrStringSelectField
            label={t("forms.payroll.periodType")}
            name="period_type"
            control={control}
            options={periodTypeOptions}
            error={errors.period_type?.message}
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <HrDateField
                label={t("forms.payroll.startDate")}
                name="start_date"
                control={control}
                error={errors.start_date?.message}
              />
            </div>
            <div className="flex-1">
              <HrDateField
                label={t("forms.payroll.endDate")}
                name="end_date"
                control={control}
                error={errors.end_date?.message}
              />
            </div>
          </div>
          <HrStringSelectField
            label={t("columns.status")}
            name="status"
            control={control}
            options={periodStatusOptions}
            error={errors.status?.message}
          />
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
