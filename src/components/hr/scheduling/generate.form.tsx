import {useEffect, useMemo, useState} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {WorkSchedule} from "@/api/model/work_schedule.ts";
import {ScheduleTemplate} from "@/api/model/schedule_template.ts";
import {Employee} from "@/api/model/employee.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrSelectField, HrFormField} from "@/components/hr/shared/form-field.tsx";
import {Controller} from "react-hook-form";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {SelectOption, firstFormError, toSelectOption} from "@/components/hr/shared/form.utils.ts";
import {generateShiftsFromTemplate} from "@/lib/labor-engine/scheduling/template.service.ts";
import {ScheduleForm} from "@/components/hr/scheduling/schedule.form.tsx";
import {ScheduleTemplateForm} from "@/components/hr/scheduling/template.form.tsx";

interface FormValues {
  work_schedule: SelectOption | null;
  template: SelectOption | null;
  employees: SelectOption[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const optionSchema = yup.object({label: yup.string().required(), value: yup.string().required()}).nullable();

const validationSchema = yup.object({
  work_schedule: optionSchema.required("Required"),
  template: optionSchema.required("Required"),
  employees: yup.array().of(
    yup.object({label: yup.string().required(), value: yup.string().required()}),
  ).min(1, "Required").required("Required"),
}).required();

export const GenerateScheduleForm = ({open, onClose}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const schedulesHook = useApi<SettingsData<WorkSchedule>>(
    Tables.work_schedules,
    ["status = 'draft'"],
    ["period_start DESC"],
    0,
    500,
    [],
  );
  const templatesHook = useApi<SettingsData<ScheduleTemplate>>(
    Tables.schedule_templates,
    ["is_active = true"],
    ["name asc"],
    0,
    500,
    [],
  );
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);

  const {handleSubmit, control, reset, formState: {errors}} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
    defaultValues: {work_schedule: null, template: null, employees: []},
  });

  const scheduleOptions = useMemo(
    () => (schedulesHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [schedulesHook.data?.data],
  );

  const templateOptions = useMemo(
    () => (templatesHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [templatesHook.data?.data],
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
    reset({work_schedule: null, template: null, employees: []});
  };

  useEffect(() => {
    if (!open) {
      reset({work_schedule: null, template: null, employees: []});
    }
  }, [open, reset]);

  const onSubmit = async (values: FormValues) => {
    if (!values.work_schedule?.value || !values.template?.value || values.employees.length === 0) {
      toast.error(t("messages.requiredFields"));
      return;
    }

    try {
      const result = await generateShiftsFromTemplate(db, {
        workScheduleId: values.work_schedule.value,
        templateId: values.template.value,
        employeeIds: values.employees.map(e => e.value),
      });

      toast.success(t("scheduling.shiftsGenerated", {created: result.created, skipped: result.skipped}));
      if (result.conflicts.length > 0) {
        toast.warning(t("scheduling.conflictsDetected"));
      }
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const [scheduleModal, setScheduleModal] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);

  return (
    <>
      <Modal title={t("forms.generateSchedule.title")} open={open} onClose={closeModal} size="lg">
        <form onSubmit={handleSubmit(onSubmit, (errs) => {
          const message = firstFormError(errs);
          if (message) toast.error(message);
        })}>
          <div className="flex flex-col gap-3 mb-3">
            <HrSelectField
              label={t("forms.generateSchedule.schedule")}
              name="work_schedule"
              control={control}
              options={scheduleOptions}
              isClearable={false}
              error={errors.work_schedule?.message}
              onAdd={() => setScheduleModal(true)}
            />
            <HrSelectField
              label={t("forms.generateSchedule.template")}
              name="template"
              control={control}
              options={templateOptions}
              isClearable={false}
              error={errors.template?.message}
              onAdd={() => setTemplateModal(true)}
            />
            <HrFormField label={t("forms.generateSchedule.employees")} error={errors.employees?.message as string | undefined}>
              <Controller
                control={control}
                name="employees"
                render={({field}) => (
                  <ReactSelect
                    isMulti
                    options={employeeOptions as never}
                    value={field.value as never}
                    onChange={(opts) => field.onChange((opts as SelectOption[] | null) ?? [])}
                  />
                )}
              />
            </HrFormField>
          </div>
          <Button type="submit" variant="primary">{t("buttons.generate")}</Button>
        </form>
      </Modal>

      {scheduleModal && (
        <ScheduleForm
          open
          onClose={() => {
            schedulesHook.fetchData();
            setScheduleModal(false);
          }}
        />
      )}
      {templateModal && (
        <ScheduleTemplateForm
          open
          onClose={() => {
            templatesHook.fetchData();
            setTemplateModal(false);
          }}
        />
      )}
    </>
  );
};
