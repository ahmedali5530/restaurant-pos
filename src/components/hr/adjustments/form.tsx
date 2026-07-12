import {useEffect, useMemo} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {DateValue} from "react-aria-components";
import {LaborAdjustment} from "@/api/model/labor_adjustment.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Employee} from "@/api/model/employee.ts";
import {PayrollPeriod} from "@/api/model/payroll_period.ts";
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
  toSelectOption,
} from "@/components/hr/shared/form.utils.ts";
import {LaborAdjustmentType} from "@/api/model/hr.types.ts";

const ADJUSTMENT_TYPES: LaborAdjustmentType[] = [
  "bonus", "penalty", "allowance", "reimbursement", "advance", "loan", "correction", "deduction",
];

interface FormValues {
  id?: string;
  employee: SelectOption | null;
  payroll_period?: SelectOption | null;
  type: LaborAdjustmentType;
  amount: number;
  currency?: string;
  description?: string;
  effective_date: DateValue | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: LaborAdjustment;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  employee: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().required("Required"),
  payroll_period: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().optional(),
  type: yup.string().required("Required"),
  amount: yup.number().typeError("Required").required("Required"),
  currency: yup.string().optional(),
  description: yup.string().optional(),
  effective_date: yup.mixed().nullable().required("Required"),
}).required();

export const AdjustmentForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);
  const periodsHook = useApi<SettingsData<PayrollPeriod>>(Tables.payroll_periods, [], [], 0, 500, []);

  const {register, handleSubmit, control, reset, formState: {errors}} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {type: "bonus", currency: "USD"},
  });

  const employeeOptions = useMemo(
    () => (employeesHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${item.employee_number} — ${item.first_name} ${item.last_name ?? ""}`.trim(),
    })),
    [employeesHook.data?.data],
  );

  const periodOptions = useMemo(
    () => (periodsHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [periodsHook.data?.data],
  );

  const adjustmentTypeOptions = useMemo(
    () => enumOptions(t, ADJUSTMENT_TYPES, "adjustmentTypes", enumLocaleKey),
    [t],
  );

  const closeModal = () => {
    onClose();
    reset({
      employee: null,
      payroll_period: null,
      type: "bonus",
      amount: 0,
      currency: "USD",
      description: "",
      effective_date: null,
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
        payroll_period: toSelectOption(data.payroll_period),
        type: data.type,
        amount: data.amount,
        currency: data.currency ?? "USD",
        description: data.description ?? "",
        effective_date: toCalendarDateValue(data.effective_date),
      });
    } else if (open) {
      reset({
        employee: null,
        payroll_period: null,
        type: "bonus",
        amount: 0,
        currency: "USD",
        description: "",
        effective_date: null,
        id: undefined,
      });
    }
  }, [data, open, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        employee: toRecordId(values.employee?.value),
        payroll_period: toRecordId(values.payroll_period?.value) ?? null,
        type: values.type,
        amount: Number(values.amount),
        currency: values.currency?.trim() || "USD",
        description: values.description?.trim() || undefined,
        effective_date: calendarDateToSurreal(values.effective_date),
        status: "approved",
      };

      if (values.id) {
        await db.merge(values.id, payload);
      } else {
        await db.create(Tables.labor_adjustments, payload);
      }

      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal title={data ? t("forms.adjustment.update") : t("forms.adjustment.create")} open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        <input type="hidden" {...register("id")} />
        <div className="flex flex-col gap-3 mb-3">
          <HrSelectField
            label={t("forms.adjustment.employee")}
            name="employee"
            control={control}
            options={employeeOptions}
            isClearable={false}
            error={errors.employee?.message}
          />
          <HrSelectField
            label={t("forms.adjustment.payrollPeriod")}
            name="payroll_period"
            control={control}
            options={periodOptions}
            error={errors.payroll_period?.message}
          />
          <HrStringSelectField
            label={t("forms.adjustment.type")}
            name="type"
            control={control}
            options={adjustmentTypeOptions}
            error={errors.type?.message}
          />
          <p className="text-sm text-neutral-600">{t("forms.adjustment.signHint")}</p>
          <div>
            <Input type="number" step="0.01" label={t("forms.adjustment.amount")} {...register("amount", {valueAsNumber: true})} error={errors.amount?.message}/>
          </div>
          <div>
            <Input label={t("forms.adjustment.currency")} {...register("currency")}/>
          </div>
          <HrDateField
            label={t("forms.adjustment.effectiveDate")}
            name="effective_date"
            control={control}
            error={errors.effective_date?.message}
          />
          <div>
            <Input label={t("forms.adjustment.description")} {...register("description")}/>
          </div>
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
