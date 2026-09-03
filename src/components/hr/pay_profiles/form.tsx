import {ChangeEvent, useEffect, useMemo} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {DateValue} from "react-aria-components";
import {EmployeePayProfile} from "@/api/model/employee_pay_profile.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Employee} from "@/api/model/employee.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {
  HrDateField,
  HrFormField,
  HrInputField,
  HrSelectField,
  HrStringSelectField,
} from "@/components/hr/shared/form-field.tsx";
import {
  SelectOption,
  calendarDateToSurreal,
  enumLocaleKey,
  enumOptions,
  firstFormError,
  toCalendarDateValue,
  toRecordId,
} from "@/components/hr/shared/form.utils.ts";
import {PayType} from "@/api/model/hr.types.ts";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';
import {
  isHourlyLikePayType,
  isWorkDaysPayType,
} from "@/lib/labor-engine/calculations/work-days.calculations.ts";

const PAY_TYPES: PayType[] = ["hourly", "monthly_salary", "weekly_salary", "daily_wage", "contract", "commission", "mixed"];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

interface FormValues {
  id?: string;
  employee: SelectOption | null;
  pay_type: PayType;
  base_rate: number;
  expected_work_days?: number | null;
  work_weekdays: number[];
  maximum_hours_per_day?: number | null;
  maximum_hours_per_week?: number | null;
  effective_from: DateValue | null;
  effective_to?: DateValue | null;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: EmployeePayProfile;
}

const emptyForm = {
  employee: null,
  pay_type: "hourly" as PayType,
  base_rate: 0,
  expected_work_days: undefined,
  work_weekdays: [] as number[],
  maximum_hours_per_day: undefined,
  maximum_hours_per_week: undefined,
  effective_from: null,
  effective_to: null,
  notes: "",
  id: undefined,
};

const validationSchema = yup.object({
  id: yup.string().optional(),
  employee: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().required("Required"),
  pay_type: yup.string().required("Required"),
  base_rate: yup.number().typeError("Required").required("Required"),
  expected_work_days: yup.number().transform((value, original) => (original === '' || original === null || Number.isNaN(value) ? null : value)).nullable().optional(),
  work_weekdays: yup.array().of(yup.number()).optional(),
  maximum_hours_per_day: yup.number().transform((value, original) => (original === '' || original === null || Number.isNaN(value) ? null : value)).nullable().optional(),
  maximum_hours_per_week: yup.number().transform((value, original) => (original === '' || original === null || Number.isNaN(value) ? null : value)).nullable().optional(),
  effective_from: yup.mixed().nullable().required("Required"),
  effective_to: yup.mixed().nullable().optional(),
  notes: yup.string().optional(),
}).required();

const baseRateLabelKey = (payType?: string) => {
  if (payType === "hourly") return "forms.payProfile.baseRateHourly";
  if (payType === "daily_wage") return "forms.payProfile.baseRateDaily";
  if (payType === "commission" || payType === "mixed") return "forms.payProfile.baseRateHourly";
  return "forms.payProfile.baseRatePeriod";
};

const baseRateHelpKey = (payType?: string) => {
  if (payType === "hourly") return "forms.payProfile.baseRateHelpHourly";
  if (payType === "daily_wage") return "forms.payProfile.baseRateHelpDaily";
  if (payType === "monthly_salary") return "forms.payProfile.baseRateHelpMonthly";
  if (payType === "weekly_salary") return "forms.payProfile.baseRateHelpWeekly";
  if (payType === "contract") return "forms.payProfile.baseRateHelpContract";
  if (payType === "commission") return "forms.payProfile.baseRateHelpCommission";
  if (payType === "mixed") return "forms.payProfile.baseRateHelpMixed";
  return "forms.payProfile.baseRateHelpHourly";
};

export const PayProfileForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);

  const {handleSubmit, control, formState: {errors}, reset, watch, setValue} = useForm<any>({
    resolver: yupResolver(validationSchema) as any,
    defaultValues: emptyForm,
  });

  const payType = watch("pay_type");
  const selectedDays = (watch("work_weekdays") ?? []) as number[];
  const showWorkDays = isWorkDaysPayType(payType);
  const showHourlyFields = isHourlyLikePayType(payType);

  const employeeOptions = useMemo(
    () => (employeesHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${item.employee_number} — ${item.first_name} ${item.last_name ?? ""}`.trim(),
    })),
    [employeesHook.data?.data],
  );

  const payTypeOptions = useMemo(
    () => enumOptions(t, PAY_TYPES, "employmentTypes", enumLocaleKey),
    [t],
  );

  const closeModal = () => {
    onClose();
    reset(emptyForm);
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        employee: data.employee ? {
          value: String(data.employee.id),
          label: `${data.employee.employee_number} — ${data.employee.first_name} ${data.employee.last_name ?? ""}`.trim(),
        } : null,
        pay_type: data.pay_type,
        base_rate: data.base_rate,
        expected_work_days: data.expected_work_days ?? undefined,
        work_weekdays: Array.isArray(data.work_weekdays)
          ? data.work_weekdays.map(day => Number(day))
          : [],
        maximum_hours_per_day: data.maximum_hours_per_day ?? undefined,
        maximum_hours_per_week: data.maximum_hours_per_week ?? undefined,
        effective_from: toCalendarDateValue(data.effective_from),
        effective_to: toCalendarDateValue(data.effective_to),
        notes: data.notes ?? "",
      });
    } else if (open) {
      reset(emptyForm);
    }
  }, [data, open, reset]);

  const toggleDay = (day: number, checked: boolean) => {
    const next = checked
      ? [...selectedDays, day].sort((a, b) => a - b)
      : selectedDays.filter((value) => value !== day);
    setValue("work_weekdays", next, {shouldDirty: true});
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        employee: toRecordId(values.employee?.value),
        pay_type: values.pay_type,
        base_rate: Number(values.base_rate),
        expected_work_days: values.expected_work_days
          ? Number(values.expected_work_days)
          : null,
        work_weekdays: values.work_weekdays ?? [],
        maximum_hours_per_day: values.maximum_hours_per_day
          ? Number(values.maximum_hours_per_day)
          : null,
        maximum_hours_per_week: values.maximum_hours_per_week
          ? Number(values.maximum_hours_per_week)
          : null,
        effective_from: calendarDateToSurreal(values.effective_from),
        effective_to: calendarDateToSurreal(values.effective_to),
        notes: values.notes?.trim() || undefined,
      };

      if (data?.id) {
        await db.update(data?.id, payload);
      } else {
        await db.create(Tables.employee_pay_profiles, payload);
      }

      await emitEntityCrudSave({
        domain: 'hr',
        table: Tables.employee_pay_profiles,
        entityId: data?.id ? String(data.id) : Tables.employee_pay_profiles,
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
    <Modal title={data ? t("forms.payProfile.update") : t("forms.payProfile.create")} testId="hr-form-pay-profile" open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        <div className="flex flex-col gap-3 mb-3">
          <HrSelectField
            label={t("forms.payProfile.employee")}
            name="employee"
            control={control}
            options={employeeOptions}
            isClearable={false}
            error={typeof errors.employee?.message === "string" ? errors.employee.message : undefined}
          />
          <HrStringSelectField
            label={t("forms.payProfile.payType")}
            name="pay_type"
            control={control}
            options={payTypeOptions}
            error={typeof errors.pay_type?.message === "string" ? errors.pay_type.message : undefined}
          />
          <div>
            <HrInputField
              type="number"
              step="0.01"
              name="base_rate"
              control={control}
              label={t(baseRateLabelKey(payType))}
                  error={typeof errors.base_rate?.message === "string" ? errors.base_rate.message : undefined}
            />
            <p className="text-xs text-neutral-500 mt-1">{t(baseRateHelpKey(payType))}</p>
          </div>
          {showWorkDays && (
            <>
              <div>
                <HrInputField
                  type="number"
                  step="1"
                  name="expected_work_days"
                  control={control}
                  label={t("forms.payProfile.expectedWorkDays")}
                  error={typeof errors.expected_work_days?.message === "string" ? errors.expected_work_days.message : undefined}
                />
                <p className="text-xs text-neutral-500 mt-1">{t("forms.payProfile.expectedWorkDaysHelp")}</p>
              </div>
              <HrFormField label={t("forms.payProfile.workWeekdays")}>
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map((day) => (
                    <Checkbox
                      key={day}
                      checked={selectedDays.includes(day)}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => toggleDay(day, e.target.checked)}
                      label={t(`scheduling.weekdays.${day}`)}
                    />
                  ))}
                </div>
                <p className="text-xs text-neutral-500 mt-1">{t("forms.payProfile.workWeekdaysHelp")}</p>
              </HrFormField>
            </>
          )}
          {showHourlyFields && (
            <div className="flex gap-3">
              <div className="flex-1">
                <HrInputField
                  type="number"
                  step="0.01"
                  name="maximum_hours_per_day"
                  control={control}
                  label={t("forms.payProfile.maxHoursPerDay")}
                />
              </div>
              <div className="flex-1">
                <HrInputField
                  type="number"
                  step="0.01"
                  name="maximum_hours_per_week"
                  control={control}
                  label={t("forms.payProfile.maxHoursPerWeek")}
                />
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1">
              <HrDateField
                label={t("forms.payProfile.effectiveFrom")}
                name="effective_from"
                control={control}
                error={typeof errors.effective_from?.message === "string" ? errors.effective_from.message : undefined}
              />
            </div>
            <div className="flex-1">
              <HrDateField
                label={t("forms.payProfile.effectiveTo")}
                name="effective_to"
                control={control}
                error={typeof errors.effective_to?.message === "string" ? errors.effective_to.message : undefined}
              />
            </div>
          </div>
          <div>
            <HrInputField
              name="notes"
              control={control}
              label={t("forms.payProfile.notes")}
            />
          </div>
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
