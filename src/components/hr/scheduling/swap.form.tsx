import {useEffect, useMemo} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {Tables} from "@/api/db/tables.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {ScheduledShift} from "@/api/model/scheduled_shift.ts";
import {Employee} from "@/api/model/employee.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrSelectField} from "@/components/hr/shared/form-field.tsx";
import {SelectOption, firstFormError, formatDisplayDate, entityLabel} from "@/components/hr/shared/form.utils.ts";
import {useDB} from "@/api/db/db.ts";
import {requestSwap} from "@/lib/labor-engine/scheduling/swap.service.ts";

interface FormValues {
  scheduled_shift: SelectOption | null;
  requesting_employee: SelectOption | null;
  target_employee?: SelectOption | null;
  proposed_shift?: SelectOption | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const optionSchema = yup.object({label: yup.string().required(), value: yup.string().required()}).nullable();

const validationSchema = yup.object({
  scheduled_shift: optionSchema.required("Required"),
  requesting_employee: optionSchema.required("Required"),
  target_employee: optionSchema.optional(),
  proposed_shift: optionSchema.optional(),
}).required();

export const SwapRequestForm = ({open, onClose}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const shiftsHook = useApi<SettingsData<ScheduledShift>>(
    Tables.scheduled_shifts,
    ["status != 'cancelled'"],
    ["start_at DESC"],
    0,
    500,
    ["employee", "work_schedule"],
  );
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);

  const {handleSubmit, control, reset, formState: {errors}} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
  });

  const shiftOptions = useMemo(
    () => (shiftsHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${entityLabel(item.employee)} — ${formatDisplayDate(item.start_at)}`,
    })),
    [shiftsHook.data?.data],
  );

  const employeeOptions = useMemo(
    () => (employeesHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${item.employee_number} — ${item.first_name} ${item.last_name ?? ""}`.trim(),
    })),
    [employeesHook.data?.data],
  );

  const closeModal = () => {
    onClose();
    reset({
      scheduled_shift: null,
      requesting_employee: null,
      target_employee: null,
      proposed_shift: null,
    });
  };

  useEffect(() => {
    if (!open) {
      reset({
        scheduled_shift: null,
        requesting_employee: null,
        target_employee: null,
        proposed_shift: null,
      });
    }
  }, [open, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!values.scheduled_shift?.value || !values.requesting_employee?.value) {
      toast.error(t("messages.requiredFields"));
      return;
    }

    try {
      await requestSwap(db, {
        scheduledShiftId: values.scheduled_shift.value,
        requestingEmployeeId: values.requesting_employee.value,
        targetEmployeeId: values.target_employee?.value,
        proposedShiftId: values.proposed_shift?.value,
      });

      toast.success(t("messages.swapRequested"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal title={t("forms.swap.create")} open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        <div className="flex flex-col gap-3 mb-3">
          <HrSelectField
            label={t("forms.swap.scheduledShift")}
            name="scheduled_shift"
            control={control}
            options={shiftOptions}
            isClearable={false}
            error={errors.scheduled_shift?.message}
          />
          <HrSelectField
            label={t("forms.swap.requestingEmployee")}
            name="requesting_employee"
            control={control}
            options={employeeOptions}
            isClearable={false}
            error={errors.requesting_employee?.message}
          />
          <HrSelectField
            label={t("forms.swap.targetEmployee")}
            name="target_employee"
            control={control}
            options={employeeOptions}
            error={errors.target_employee?.message}
          />
          <HrSelectField
            label={t("forms.swap.proposedShift")}
            name="proposed_shift"
            control={control}
            options={shiftOptions}
            error={errors.proposed_shift?.message}
          />
        </div>
        <Button type="submit" variant="primary">{t("buttons.requestSwap")}</Button>
      </form>
    </Modal>
  );
};
