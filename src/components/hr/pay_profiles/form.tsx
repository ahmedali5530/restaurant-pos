import {useEffect, useMemo} from "react";
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
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrDateField, HrSelectField, HrStringSelectField} from "@/components/hr/shared/form-field.tsx";
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

const PAY_TYPES: PayType[] = ["hourly", "monthly_salary", "weekly_salary", "daily_wage", "contract", "commission", "mixed"];

interface FormValues {
  id?: string;
  employee: SelectOption | null;
  pay_type: PayType;
  base_rate: number;
  currency?: string;
  effective_from: DateValue | null;
  effective_to?: DateValue | null;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: EmployeePayProfile;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  employee: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().required("Required"),
  pay_type: yup.string().required("Required"),
  base_rate: yup.number().typeError("Required").required("Required"),
  currency: yup.string().optional(),
  effective_from: yup.mixed().nullable().required("Required"),
  effective_to: yup.mixed().nullable().optional(),
  notes: yup.string().optional(),
}).required();

export const PayProfileForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);

  const {register, handleSubmit, control, formState: {errors}, reset} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {pay_type: "hourly", currency: "USD"},
  });

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
    reset({
      employee: null,
      pay_type: "hourly",
      base_rate: 0,
      currency: "USD",
      effective_from: null,
      effective_to: null,
      notes: "",
      id: undefined,
    });
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
        currency: data.currency ?? "USD",
        effective_from: toCalendarDateValue(data.effective_from),
        effective_to: toCalendarDateValue(data.effective_to),
        notes: data.notes ?? "",
      });
    } else if (open) {
      reset({
        employee: null,
        pay_type: "hourly",
        base_rate: 0,
        currency: "USD",
        effective_from: null,
        effective_to: null,
        notes: "",
        id: undefined,
      });
    }
  }, [data, open, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        employee: toRecordId(values.employee?.value),
        pay_type: values.pay_type,
        base_rate: Number(values.base_rate),
        currency: values.currency?.trim() || "USD",
        effective_from: calendarDateToSurreal(values.effective_from),
        effective_to: calendarDateToSurreal(values.effective_to),
        notes: values.notes?.trim() || undefined,
      };

      if (data?.id) {
        await db.update(data?.id, payload);
      } else {
        await db.create(Tables.employee_pay_profiles, payload);
      }

      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal title={data ? t("forms.payProfile.update") : t("forms.payProfile.create")} open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        {/*<input type="hidden" {...register("id")} />*/}
        <div className="flex flex-col gap-3 mb-3">
          <HrSelectField
            label={t("forms.payProfile.employee")}
            name="employee"
            control={control}
            options={employeeOptions}
            isClearable={false}
            error={errors.employee?.message}
          />
          <HrStringSelectField
            label={t("forms.payProfile.payType")}
            name="pay_type"
            control={control}
            options={payTypeOptions}
            error={errors.pay_type?.message}
          />
          <div>
            <Input type="number" step="0.01" label={t("forms.payProfile.baseRate")} {...register("base_rate", {valueAsNumber: true})} error={errors.base_rate?.message}/>
          </div>
          <div>
            <Input label={t("forms.payProfile.currency")} {...register("currency")}/>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <HrDateField
                label={t("forms.payProfile.effectiveFrom")}
                name="effective_from"
                control={control}
                error={errors.effective_from?.message}
              />
            </div>
            <div className="flex-1">
              <HrDateField
                label={t("forms.payProfile.effectiveTo")}
                name="effective_to"
                control={control}
                error={errors.effective_to?.message}
              />
            </div>
          </div>
          <div>
            <Input label={t("forms.payProfile.notes")} {...register("notes")}/>
          </div>
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
