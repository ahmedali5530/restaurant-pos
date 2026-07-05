import {useEffect, useMemo} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import type {Dayjs} from "dayjs";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Employee} from "@/api/model/employee.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrDateTimeField, HrSelectField} from "@/components/hr/shared/form-field.tsx";
import {SelectOption, dayjsToSurreal, firstFormError} from "@/components/hr/shared/form.utils.ts";
import {createManualEntry} from "@/lib/labor-engine/attendance/attendance.service.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";

interface FormValues {
  employee: SelectOption | null;
  clock_in: Dayjs | null;
  clock_out: Dayjs | null;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const validationSchema = yup.object({
  employee: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().required("Required"),
  clock_in: yup.mixed().nullable().required("Required"),
  clock_out: yup.mixed().nullable().required("Required"),
  notes: yup.string().optional(),
}).required();

export const AttendanceManualForm = ({open, onClose}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);

  const {register, handleSubmit, control, reset, formState: {errors}} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
  });

  const employeeOptions = useMemo(
    () => (employeesHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${item.employee_number} — ${item.first_name} ${item.last_name ?? ""}`.trim(),
    })),
    [employeesHook.data?.data],
  );

  const closeModal = () => {
    onClose();
    reset({employee: null, clock_in: null, clock_out: null, notes: ""});
  };

  useEffect(() => {
    if (!open) {
      reset({employee: null, clock_in: null, clock_out: null, notes: ""});
    }
  }, [open, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!page.user) {
      toast.error(t("messages.requiredFields"));
      return;
    }
    const clockIn = dayjsToSurreal(values.clock_in);
    const clockOut = dayjsToSurreal(values.clock_out);
    if (!clockIn || !clockOut) {
      toast.error(t("messages.requiredFields"));
      return;
    }
    try {
      await createManualEntry(db, {
        user: page.user,
        employeeId: values.employee!.value,
        clockIn,
        clockOut,
        notes: values.notes?.trim(),
      });
      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal title={t("buttons.manualEntry")} open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        <div className="flex flex-col gap-3 mb-3">
          <HrSelectField
            label={t("forms.leave.employee")}
            name="employee"
            control={control}
            options={employeeOptions}
            isClearable={false}
            error={errors.employee?.message}
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <HrDateTimeField
                label={t("columns.clockIn")}
                name="clock_in"
                control={control}
                error={errors.clock_in?.message}
              />
            </div>
            <div className="flex-1">
              <HrDateTimeField
                label={t("columns.clockOut")}
                name="clock_out"
                control={control}
                error={errors.clock_out?.message}
              />
            </div>
          </div>
          <div>
            <Input label={t("columns.notes")} {...register("notes")}/>
          </div>
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
