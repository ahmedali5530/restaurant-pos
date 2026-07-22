import {useEffect, useMemo, useState} from "react";
import {Controller, useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {ScheduleTemplate} from "@/api/model/schedule_template.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Department} from "@/api/model/department.ts";
import {Position} from "@/api/model/position.ts";
import {CostCenter} from "@/api/model/cost_center.ts";
import {Shift} from "@/api/model/shift.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {HrCheckboxField, HrFormField, HrInputField, HrSelectField, HrTimeField} from "@/components/hr/shared/form-field.tsx";
import {SelectOption, firstFormError, toRecordId, toSelectOption} from "@/components/hr/shared/form.utils.ts";
import {ChangeEvent} from "react";
import {ShiftForm} from "@/components/settings/users/shifts/shift.form.tsx";
import {DepartmentForm} from "@/components/hr/departments/form.tsx";
import {PositionForm} from "@/components/hr/positions/form.tsx";
import {CostCenterForm} from "@/components/hr/cost_centers/form.tsx";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

interface FormValues {
  id?: string;
  name: string;
  shift_template?: SelectOption | null;
  department?: SelectOption | null;
  position?: SelectOption | null;
  cost_center?: SelectOption | null;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  break_minutes?: number;
  is_active?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: ScheduleTemplate;
}

const optionSchema = yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().optional();

const validationSchema = yup.object({
  id: yup.string().optional(),
  name: yup.string().required("Required"),
  shift_template: optionSchema,
  department: optionSchema,
  position: optionSchema,
  cost_center: optionSchema,
  days_of_week: yup.array().of(yup.number()).min(1, "Required").required("Required"),
  start_time: yup.string().required("Required"),
  end_time: yup.string().required("Required"),
  break_minutes: yup.number().optional(),
  is_active: yup.boolean().optional(),
}).required();

export const ScheduleTemplateForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const departmentsHook = useApi<SettingsData<Department>>(Tables.departments, [], [], 0, 500, []);
  const positionsHook = useApi<SettingsData<Position>>(Tables.positions, [], [], 0, 500, []);
  const costCentersHook = useApi<SettingsData<CostCenter>>(Tables.cost_centers, [], [], 0, 500, []);
  const shiftsHook = useApi<SettingsData<Shift>>(Tables.shifts, ["deleted_at = none"], ["name asc"], 0, 500, []);

  const {register, handleSubmit, control, reset, watch, setValue, formState: {errors}} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
    defaultValues: {days_of_week: [1, 2, 3, 4, 5], start_time: "09:00", end_time: "17:00", is_active: true},
  });

  const selectedDays = watch("days_of_week") ?? [];

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
    () => (shiftsHook.data?.data ?? []).map((item) => ({value: String(item.id), label: item.name})),
    [shiftsHook.data?.data],
  );

  const toggleDay = (day: number, checked: boolean) => {
    const next = checked
      ? [...new Set([...selectedDays, day])]
      : selectedDays.filter(d => d !== day);
    setValue("days_of_week", next, {shouldValidate: true});
  };

  const closeModal = () => {
    onClose();
    reset({
      name: "",
      shift_template: null,
      department: null,
      position: null,
      cost_center: null,
      days_of_week: [1, 2, 3, 4, 5],
      start_time: "09:00",
      end_time: "17:00",
      break_minutes: undefined,
      is_active: true,
      id: undefined,
    });
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        name: data.name ?? "",
        shift_template: data.shift_template ? {
          value: String(data.shift_template.id),
          label: data.shift_template.name,
        } : null,
        department: toSelectOption(data.department),
        position: toSelectOption(data.position),
        cost_center: toSelectOption(data.cost_center),
        days_of_week: data.days_of_week ?? [],
        start_time: data.start_time ?? "09:00",
        end_time: data.end_time ?? "17:00",
        break_minutes: data.break_minutes,
        is_active: data.is_active !== false,
      });
    } else if (open) {
      reset({
        name: "",
        shift_template: null,
        department: null,
        position: null,
        cost_center: null,
        days_of_week: [1, 2, 3, 4, 5],
        start_time: "09:00",
        end_time: "17:00",
        break_minutes: undefined,
        is_active: true,
        id: undefined,
      });
    }
  }, [data, open, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        name: values.name.trim(),
        shift_template: toRecordId(values.shift_template?.value) ?? null,
        department: toRecordId(values.department?.value) ?? null,
        position: toRecordId(values.position?.value) ?? null,
        cost_center: toRecordId(values.cost_center?.value) ?? null,
        days_of_week: values.days_of_week,
        start_time: values.start_time,
        end_time: values.end_time,
        break_minutes: values.break_minutes ?? null,
        is_active: values.is_active !== false,
      };

      if (values.id) {
        await db.update(values.id, payload);
      } else {
        await db.create(Tables.schedule_templates, payload);
      }

      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const [shiftTemplateModal, setShiftTemplateModal] = useState(false);
  const [departmentModal, setDepartmentModal] = useState(false);
  const [positionModal, setPositionModal] = useState(false);
  const [costCenterModal, setCostCenterModal] = useState(false);

  return (
    <>
      <Modal title={data ? t("forms.scheduleTemplate.update") : t("forms.scheduleTemplate.create")} open={open} onClose={closeModal} size="lg">
        <form onSubmit={handleSubmit(onSubmit, (errs) => {
          const message = firstFormError(errs);
          if (message) toast.error(message);
        })}>
          <input type="hidden" {...register("id")} />
          <div className="flex flex-col gap-3 mb-3">
            <div>
              <HrInputField
                name="name"
                control={control}
                label={t("forms.scheduleTemplate.name")}
                autoFocus
                error={errors.name?.message}
              />
            </div>
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
            <HrFormField label={t("forms.scheduleTemplate.daysOfWeek")} error={errors.days_of_week?.message as string | undefined}>
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
            </HrFormField>
            <div className="flex gap-3">
              <div className="flex-1">
                <HrTimeField
                  label={t("forms.scheduleTemplate.startTime")}
                  name="start_time"
                  control={control}
                  error={errors.start_time?.message}
                />
              </div>
              <div className="flex-1">
                <HrTimeField
                  label={t("forms.scheduleTemplate.endTime")}
                  name="end_time"
                  control={control}
                  error={errors.end_time?.message}
                />
              </div>
            </div>
            <div>
              <Controller
                render={({field}) => (
                  <Input
                    type="number"
                    label={t("forms.scheduleTemplate.breakMinutes")}
                    onChange={field.onChange}
                    value={field.value}
                  />
                )}
                name="break_minutes"
                rules={{valueAsNumber: true}}
                control={control}
              />

            </div>
            <HrCheckboxField
              label={t("forms.holiday.isActive")}
              name="is_active"
              control={control}
            />
          </div>
          <Button type="submit" variant="primary">{t("buttons.save")}</Button>
        </form>
      </Modal>

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
