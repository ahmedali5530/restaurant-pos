import {useEffect, useMemo, useState} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import type {Dayjs} from "dayjs";
import {ScheduledShift} from "@/api/model/scheduled_shift.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Employee} from "@/api/model/employee.ts";
import {WorkSchedule} from "@/api/model/work_schedule.ts";
import {Department} from "@/api/model/department.ts";
import {Position} from "@/api/model/position.ts";
import {CostCenter} from "@/api/model/cost_center.ts";
import {Shift} from "@/api/model/shift.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrDateTimeField, HrInputField, HrSelectField} from "@/components/hr/shared/form-field.tsx";
import {
  SelectOption,
  dayjsToSurreal,
  firstFormError,
  toDayjsDateTime,
  toSelectOption,
} from "@/components/hr/shared/form.utils.ts";
import {
  createScheduledShift,
  updateScheduledShift,
} from "@/lib/labor-engine/scheduling/schedule.service.ts";
import {ScheduleForm} from "@/components/hr/scheduling/schedule.form.tsx";
import {ShiftForm} from "@/components/settings/users/shifts/shift.form.tsx";
import {DepartmentForm} from "@/components/hr/departments/form.tsx";
import {PositionForm} from "@/components/hr/positions/form.tsx";
import {CostCenterForm} from "@/components/hr/cost_centers/form.tsx";

interface FormValues {
  id?: string;
  work_schedule: SelectOption | null;
  employee: SelectOption | null;
  shift_template?: SelectOption | null;
  department?: SelectOption | null;
  position?: SelectOption | null;
  cost_center?: SelectOption | null;
  start_at: Dayjs | null;
  end_at: Dayjs | null;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: ScheduledShift;
  defaultSchedule?: WorkSchedule;
}

const optionSchema = yup.object({label: yup.string().required(), value: yup.string().required()}).nullable();

const validationSchema = yup.object({
  id: yup.string().optional(),
  work_schedule: optionSchema.required("Required"),
  employee: optionSchema.required("Required"),
  shift_template: optionSchema.optional(),
  department: optionSchema.optional(),
  position: optionSchema.optional(),
  cost_center: optionSchema.optional(),
  start_at: yup.mixed().nullable().required("Required"),
  end_at: yup.mixed().nullable().required("Required"),
  notes: yup.string().optional(),
}).required();

export const ScheduledShiftForm = ({open, onClose, data, defaultSchedule}: Props) => {
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
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);
  const departmentsHook = useApi<SettingsData<Department>>(Tables.departments, [], [], 0, 500, []);
  const positionsHook = useApi<SettingsData<Position>>(Tables.positions, [], [], 0, 500, []);
  const costCentersHook = useApi<SettingsData<CostCenter>>(Tables.cost_centers, [], [], 0, 500, []);
  const shiftsHook = useApi<SettingsData<Shift>>(Tables.shifts, ["deleted_at = none"], ["name asc"], 0, 500, []);

  const {register, handleSubmit, control, reset, formState: {errors}} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
  });

  const scheduleOptions = useMemo(() => {
    const fromApi = (schedulesHook.data?.data ?? [])
      .map((item) => toSelectOption(item))
      .filter(Boolean) as SelectOption[];
    if (data?.work_schedule) {
      const current = toSelectOption(data.work_schedule);
      if (current && !fromApi.some(o => o.value === current.value)) {
        return [current, ...fromApi];
      }
    }
    return fromApi;
  }, [schedulesHook.data?.data, data?.work_schedule]);

  const employeeOptions = useMemo(
    () => (employeesHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${item.employee_number} — ${item.first_name} ${item.last_name ?? ""}`.trim(),
    })),
    [employeesHook.data?.data],
  );

  const departmentOptions = useMemo(
    () => (departmentsHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [departmentsHook.data?.data],
  );

  const positionOptions = useMemo(
    () => (positionsHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [positionsHook.data?.data],
  );

  const costCenterOptions = useMemo(
    () => (costCentersHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [costCentersHook.data?.data],
  );

  const shiftTemplateOptions = useMemo(
    () => (shiftsHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: item.name,
    })),
    [shiftsHook.data?.data],
  );

  const closeModal = () => {
    onClose();
    reset({
      work_schedule: null,
      employee: null,
      shift_template: null,
      department: null,
      position: null,
      cost_center: null,
      start_at: null,
      end_at: null,
      notes: "",
      id: undefined,
    });
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        work_schedule: toSelectOption(data.work_schedule),
        employee: data.employee ? {
          value: String(data.employee.id),
          label: `${data.employee.employee_number} — ${data.employee.first_name} ${data.employee.last_name ?? ""}`.trim(),
        } : null,
        shift_template: data.shift_template ? {
          value: String(data.shift_template.id),
          label: data.shift_template.name,
        } : null,
        department: toSelectOption(data.department),
        position: toSelectOption(data.position),
        cost_center: toSelectOption(data.cost_center),
        start_at: toDayjsDateTime(data.start_at),
        end_at: toDayjsDateTime(data.end_at),
        notes: data.notes ?? "",
      });
    } else if (open) {
      reset({
        work_schedule: defaultSchedule ? toSelectOption(defaultSchedule) : null,
        employee: null,
        shift_template: null,
        department: null,
        position: null,
        cost_center: null,
        start_at: null,
        end_at: null,
        notes: "",
        id: undefined,
      });
    }
  }, [data, defaultSchedule, open, reset]);

  const onSubmit = async (values: FormValues) => {
    const startAt = dayjsToSurreal(values.start_at);
    const endAt = dayjsToSurreal(values.end_at);
    if (!startAt || !endAt || !values.work_schedule?.value || !values.employee?.value) {
      toast.error(t("messages.requiredFields"));
      return;
    }

    try {
      const params = {
        workScheduleId: values.work_schedule.value,
        employeeId: values.employee.value,
        startAt,
        endAt,
        shiftTemplateId: values.shift_template?.value,
        departmentId: values.department?.value,
        positionId: values.position?.value,
        costCenterId: values.cost_center?.value,
        notes: values.notes?.trim(),
      };

      const result = values.id
        ? await updateScheduledShift(db, { shiftId: values.id, ...params })
        : await createScheduledShift(db, params);

      if (!result.shift?.id) {
        const message = result.conflicts.map(c => c.message).join('; ');
        toast.error(message || t("scheduling.conflictDescription"));
        return;
      }

      if (result.conflicts.length > 0) {
        toast.warning(result.conflicts.map(c => c.message).join('; '));
      }

      toast.success(t("messages.shiftCreated"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const [scheduleModal, setScheduleModal] = useState(false);
  const [shiftTemplateModal, setShiftTemplateModal] = useState(false);
  const [departmentModal, setDepartmentModal] = useState(false);
  const [positionModal, setPositionModal] = useState(false);
  const [costCenterModal, setCostCenterModal] = useState(false);

  return (
    <>
      <Modal
        title={data ? t("buttons.update") : t("scheduling.addShift")}
        open={open}
        onClose={closeModal}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit, (errs) => {
          const message = firstFormError(errs);
          if (message) toast.error(message);
        })}>
          <input type="hidden" {...register("id")} />
          <div className="flex flex-col gap-3 mb-3">
            <HrSelectField
              label={t("forms.schedule.workSchedule")}
              name="work_schedule"
              control={control}
              options={scheduleOptions}
              isClearable={false}
              isLoading={schedulesHook.isLoading}
              error={errors.work_schedule?.message}
              onAdd={() => setScheduleModal(true)}
            />
            <HrSelectField
              label={t("forms.schedule.employee")}
              name="employee"
              control={control}
              options={employeeOptions}
              isClearable={false}
              error={errors.employee?.message}
            />
            <HrSelectField
              label={t("forms.schedule.shiftTemplate")}
              name="shift_template"
              control={control}
              options={shiftTemplateOptions}
              error={errors.shift_template?.message}
              onAdd={() => setShiftTemplateModal(true)}
            />
            <HrSelectField
              label={t("forms.schedule.department")}
              name="department"
              control={control}
              options={departmentOptions}
              error={errors.department?.message}
              onAdd={() => setDepartmentModal(true)}
            />
            <HrSelectField
              label={t("forms.schedule.position")}
              name="position"
              control={control}
              options={positionOptions}
              error={errors.position?.message}
              onAdd={() => setPositionModal(true)}
            />
            <HrSelectField
              label={t("forms.schedule.costCenter")}
              name="cost_center"
              control={control}
              options={costCenterOptions}
              error={errors.cost_center?.message}
              onAdd={() => setCostCenterModal(true)}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <HrDateTimeField
                  label={t("forms.schedule.startAt")}
                  name="start_at"
                  control={control}
                  error={errors.start_at?.message}
                />
              </div>
              <div className="flex-1">
                <HrDateTimeField
                  label={t("forms.schedule.endAt")}
                  name="end_at"
                  control={control}
                  error={errors.end_at?.message}
                />
              </div>
            </div>
            <div>
              <HrInputField
                name="notes"
                control={control}
                label={t("forms.schedule.notes")}
              />
            </div>
          </div>
          <Button type="submit" variant="primary">{t("buttons.save")}</Button>
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
      {shiftTemplateModal && (
        <ShiftForm
          open
          onClose={() => {
            shiftsHook.fetchData();
            setShiftTemplateModal(false);
          }}
        />
      )}
      {departmentModal && (
        <DepartmentForm
          open
          onClose={() => {
            departmentsHook.fetchData();
            setDepartmentModal(false);
          }}
        />
      )}
      {positionModal && (
        <PositionForm
          open
          onClose={() => {
            positionsHook.fetchData();
            setPositionModal(false);
          }}
        />
      )}
      {costCenterModal && (
        <CostCenterForm
          open
          onClose={() => {
            costCentersHook.fetchData();
            setCostCenterModal(false);
          }}
        />
      )}
    </>
  );
};
