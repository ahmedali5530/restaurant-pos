import {useEffect, useMemo} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {EmployeePerformanceNote} from "@/api/model/employee_performance_note.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Employee} from "@/api/model/employee.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrCheckboxField, HrSelectField, HrStringSelectField} from "@/components/hr/shared/form-field.tsx";
import {SelectOption, enumLocaleKey, enumOptions, firstFormError, toRecordId, toUserRecordId} from "@/components/hr/shared/form.utils.ts";
import {PerformanceNoteSeverity, PerformanceNoteType} from "@/api/model/hr.types.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {nowSurrealDateTime} from "@/lib/datetime.ts";

const PERFORMANCE_TYPES: PerformanceNoteType[] = ["warning", "compliment", "review", "incident"];
const PERFORMANCE_SEVERITIES: PerformanceNoteSeverity[] = ["low", "medium", "high", "critical"];

interface FormValues {
  id?: string;
  employee: SelectOption | null;
  type: PerformanceNoteType;
  title: string;
  content: string;
  severity?: PerformanceNoteSeverity | "";
  visible_to_employee?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: EmployeePerformanceNote;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  employee: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().required("Required"),
  type: yup.string().required("Required"),
  title: yup.string().required("Required"),
  content: yup.string().required("Required"),
  severity: yup.string().optional(),
  visible_to_employee: yup.boolean().optional(),
}).required();

export const PerformanceForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);

  const {register, handleSubmit, control, reset, formState: {errors}} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {type: "review", visible_to_employee: false},
  });

  const employeeOptions = useMemo(
    () => (employeesHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${item.employee_number} — ${item.first_name} ${item.last_name ?? ""}`.trim(),
    })),
    [employeesHook.data?.data],
  );

  const performanceTypeOptions = useMemo(
    () => enumOptions(t, PERFORMANCE_TYPES, "performanceTypes", enumLocaleKey),
    [t],
  );

  const severityOptions = useMemo(
    () => enumOptions(t, PERFORMANCE_SEVERITIES, "severities"),
    [t],
  );

  const closeModal = () => {
    onClose();
    reset({
      employee: null,
      type: "review",
      title: "",
      content: "",
      severity: "",
      visible_to_employee: false,
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
        type: data.type,
        title: data.title ?? "",
        content: data.content ?? "",
        severity: data.severity ?? "",
        visible_to_employee: data.visible_to_employee ?? false,
      });
    } else if (open) {
      reset({
        employee: null,
        type: "review",
        title: "",
        content: "",
        severity: "",
        visible_to_employee: false,
        id: undefined,
      });
    }
  }, [data, open, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        employee: toRecordId(values.employee?.value),
        type: values.type,
        title: values.title.trim(),
        content: values.content.trim(),
        severity: values.severity?.trim() || undefined,
        visible_to_employee: values.visible_to_employee ?? false,
        created_by: toUserRecordId(page.user),
        created_at: nowSurrealDateTime(),
      };

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.employee_performance_notes, payload);
      }

      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal title={data ? t("forms.performance.update") : t("forms.performance.create")} open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        {/*<input type="hidden" {...register("id")} />*/}
        <div className="flex flex-col gap-3 mb-3">
          <HrSelectField
            label={t("forms.performance.employee")}
            name="employee"
            control={control}
            options={employeeOptions}
            isClearable={false}
            error={errors.employee?.message}
          />
          <HrStringSelectField
            label={t("forms.performance.type")}
            name="type"
            control={control}
            options={performanceTypeOptions}
            error={errors.type?.message}
          />
          <div>
            <Input label={t("forms.performance.title")} {...register("title")} error={errors.title?.message}/>
          </div>
          <div>
            <Input label={t("forms.performance.content")} {...register("content")} error={errors.content?.message}/>
          </div>
          <HrStringSelectField
            label={t("forms.performance.severity")}
            name="severity"
            control={control}
            options={severityOptions}
            isClearable
            error={errors.severity?.message}
          />
          <HrCheckboxField
            label={t("forms.performance.visibleToEmployee")}
            name="visible_to_employee"
            control={control}
          />
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
