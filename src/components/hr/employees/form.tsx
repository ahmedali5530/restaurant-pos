import {useEffect, useMemo, useState} from "react";
import {useForm, Controller} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {DateValue} from "react-aria-components";
import {Employee} from "@/api/model/employee.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Department} from "@/api/model/department.ts";
import {Position} from "@/api/model/position.ts";
import {CostCenter} from "@/api/model/cost_center.ts";
import {User} from "@/api/model/user.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrDateField, HrFormField, HrInputField, HrSelectField} from "@/components/hr/shared/form-field.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {
  SelectOption,
  calendarDateToSurreal,
  firstFormError,
  toCalendarDateValue,
  toRecordId,
  toSelectOption,
} from "@/components/hr/shared/form.utils.ts";
import {EmploymentStatus, EmploymentType} from "@/api/model/hr.types.ts";
import {DepartmentForm} from "@/components/hr/departments/form.tsx";
import {PositionForm} from "@/components/hr/positions/form.tsx";
import {CostCenterForm} from "@/components/hr/cost_centers/form.tsx";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';

interface FormValues {
  id?: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  user?: SelectOption | null;
  department?: SelectOption | null;
  position?: SelectOption | null;
  cost_center?: SelectOption | null;
  manager?: SelectOption | null;
  employment_status?: EmploymentStatus;
  employment_type?: EmploymentType;
  hire_date?: DateValue | null;
  termination_date?: DateValue | null;
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: Employee;
}

const optionSchema = yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().optional();

const validationSchema = yup.object({
  id: yup.string().optional(),
  employee_number: yup.string().required("Required"),
  first_name: yup.string().required("Required"),
  last_name: yup.string().required("Required"),
  user: optionSchema,
  department: optionSchema,
  position: optionSchema,
  cost_center: optionSchema,
  manager: optionSchema,
  employment_status: yup.string().optional(),
  employment_type: yup.string().optional(),
  hire_date: yup.mixed().nullable().optional(),
  termination_date: yup.mixed().nullable().optional(),
  notes: yup.string().optional(),
}).required();

const employmentStatusOptions = (t: (key: string) => string): SelectOption[] => [
  {value: "active", label: t("status.employment.active")},
  {value: "inactive", label: t("status.employment.inactive")},
  {value: "terminated", label: t("status.employment.terminated")},
  {value: "on_leave", label: t("status.employment.onLeave")},
  {value: "suspended", label: t("status.employment.suspended")},
];

const employmentTypeOptions = (t: (key: string) => string): SelectOption[] => [
  {value: "hourly", label: t("employmentTypes.hourly")},
  {value: "monthly_salary", label: t("employmentTypes.monthlySalary")},
  {value: "weekly_salary", label: t("employmentTypes.weeklySalary")},
  {value: "daily_wage", label: t("employmentTypes.dailyWage")},
  {value: "contract", label: t("employmentTypes.contract")},
  {value: "commission", label: t("employmentTypes.commission")},
  {value: "mixed", label: t("employmentTypes.mixed")},
];

export const EmployeeForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const usersHook = useApi<SettingsData<User>>(Tables.users, [], [], 0, 500, []);
  const departmentsHook = useApi<SettingsData<Department>>(Tables.departments, [], [], 0, 500, []);
  const positionsHook = useApi<SettingsData<Position>>(Tables.positions, [], [], 0, 500, []);
  const costCentersHook = useApi<SettingsData<CostCenter>>(Tables.cost_centers, [], [], 0, 500, []);
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);

  const {handleSubmit, control, formState: {errors}, reset} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
    defaultValues: {employment_status: "active", employment_type: "hourly"},
  });

  const userOptions = useMemo(
    () => (usersHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${item.first_name} ${item.last_name ?? ""}`.trim() || item.login,
    })),
    [usersHook.data?.data],
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

  const managerOptions = useMemo(
    () => (employeesHook.data?.data ?? [])
      .filter((item) => item.id !== data?.id)
      .map((item) => ({
        value: String(item.id),
        label: `${item.employee_number} — ${item.first_name} ${item.last_name ?? ""}`.trim(),
      })),
    [employeesHook.data?.data, data?.id],
  );

  const statusOptions = useMemo(() => employmentStatusOptions(t), [t]);
  const typeOptions = useMemo(() => employmentTypeOptions(t), [t]);

  const closeModal = () => {
    onClose();
    reset({
      employee_number: "",
      first_name: "",
      last_name: "",
      user: null,
      department: null,
      position: null,
      cost_center: null,
      manager: null,
      employment_status: "active",
      employment_type: "hourly",
      hire_date: null,
      termination_date: null,
      notes: "",
      id: undefined,
    });
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        employee_number: data.employee_number ?? "",
        first_name: data.first_name ?? "",
        last_name: data.last_name ?? "",
        user: data.user ? {
          value: String(data.user.id),
          label: `${data.user.first_name} ${data.user.last_name ?? ""}`.trim() || data.user.login,
        } : null,
        department: toSelectOption(data.department),
        position: toSelectOption(data.position),
        cost_center: toSelectOption(data.cost_center),
        manager: data.manager ? {
          value: String(data.manager.id),
          label: `${data.manager.employee_number} — ${data.manager.first_name} ${data.manager.last_name ?? ""}`.trim(),
        } : null,
        employment_status: data.employment_status ?? "active",
        employment_type: data.employment_type ?? "hourly",
        hire_date: toCalendarDateValue(data.hire_date),
        termination_date: toCalendarDateValue(data.termination_date),
        notes: data.notes ?? "",
      });
    } else if (open) {
      reset({
        employee_number: "",
        first_name: "",
        last_name: "",
        user: null,
        department: null,
        position: null,
        cost_center: null,
        manager: null,
        employment_status: "active",
        employment_type: "hourly",
        hire_date: null,
        termination_date: null,
        notes: "",
        id: undefined,
      });
    }
  }, [data, open, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        employee_number: values.employee_number.trim(),
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        user: toRecordId(values.user?.value) ?? null,
        department: toRecordId(values.department?.value) ?? null,
        position: toRecordId(values.position?.value) ?? null,
        cost_center: toRecordId(values.cost_center?.value) ?? null,
        manager: toRecordId(values.manager?.value) ?? null,
        employment_status: values.employment_status ?? "active",
        employment_type: values.employment_type ?? "hourly",
        hire_date: calendarDateToSurreal(values.hire_date),
        termination_date: calendarDateToSurreal(values.termination_date),
        notes: values.notes?.trim() || undefined,
      };

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.employees, payload);
      }

      await emitEntityCrudSave({
        domain: 'hr',
        table: Tables.employees,
        entityId: data?.id ? String(data.id) : Tables.employees,
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

  const [departmentModal, setDepartmentModal] = useState(false);
  const [positionModal, setPositionModal] = useState(false);
  const [costCenterModal, setCostCenterModal] = useState(false);

  return (
    <>
      <Modal title={data ? t("forms.employee.update") : t("forms.employee.create")} testId="hr-form-employee" open={open} onClose={closeModal} size="lg">
        <form onSubmit={handleSubmit(onSubmit, (errs) => {
          const message = firstFormError(errs);
          if (message) toast.error(message);
        })}>
          {/*<input type="hidden" {...register("id")} />*/}
          <div className="flex flex-col gap-3 mb-3">
            <HrInputField
              name="employee_number"
              control={control}
              label={t("forms.employee.employeeNumber")}
              autoFocus
              error={errors.employee_number?.message}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <HrInputField
                  name="first_name"
                  control={control}
                  label={t("forms.employee.firstName")}
                  error={errors.first_name?.message}
                />
              </div>
              <div className="flex-1">
                <HrInputField
                  name="last_name"
                  control={control}
                  label={t("forms.employee.lastName")}
                  error={errors.last_name?.message}
                />
              </div>
            </div>
            <HrSelectField
              label={t("forms.employee.linkedUser")}
              name="user"
              control={control}
              options={userOptions}
              error={errors.user?.message}
            />
            <HrSelectField
              label={t("forms.employee.department")}
              name="department"
              control={control}
              options={departmentOptions}
              error={errors.department?.message}
              onAdd={() => setDepartmentModal(true)}
            />
            <HrSelectField
              label={t("forms.employee.position")}
              name="position"
              control={control}
              options={positionOptions}
              error={errors.position?.message}
              onAdd={() => setPositionModal(true)}
            />
            <HrSelectField
              label={t("forms.employee.costCenter")}
              name="cost_center"
              control={control}
              options={costCenterOptions}
              error={errors.cost_center?.message}
              onAdd={() => setCostCenterModal(true)}
            />
            <HrSelectField
              label={t("forms.employee.manager")}
              name="manager"
              control={control}
              options={managerOptions}
              error={errors.manager?.message}
            />
            <HrFormField label={t("forms.employee.employmentStatus")} error={errors.employment_status?.message}>
              <Controller
                control={control}
                name="employment_status"
                render={({field}) => (
                  <ReactSelect
                    options={statusOptions}
                    value={statusOptions.find((o) => o.value === field.value) ?? null}
                    onChange={(opt) => field.onChange((opt as SelectOption | null)?.value)}
                    isClearable={false}
                  />
                )}
              />
            </HrFormField>
            <HrFormField label={t("forms.employee.employmentType")} error={errors.employment_type?.message}>
              <Controller
                control={control}
                name="employment_type"
                render={({field}) => (
                  <ReactSelect
                    options={typeOptions}
                    value={typeOptions.find((o) => o.value === field.value) ?? null}
                    onChange={(opt) => field.onChange((opt as SelectOption | null)?.value)}
                    isClearable={false}
                  />
                )}
              />
            </HrFormField>
            <div className="flex gap-3">
              <div className="flex-1">
                <HrDateField
                  label={t("forms.employee.hireDate")}
                  name="hire_date"
                  control={control}
                  error={errors.hire_date?.message}
                />
              </div>
              <div className="flex-1">
                <HrDateField
                  label={t("forms.employee.terminationDate")}
                  name="termination_date"
                  control={control}
                  error={errors.termination_date?.message}
                />
              </div>
            </div>
            <HrInputField
              name="notes"
              control={control}
              label={t("forms.employee.notes")}
            />
          </div>
          <Button type="submit" variant="primary">{t("buttons.save")}</Button>
        </form>
      </Modal>

      {departmentModal && (
        <DepartmentForm
          open={true}
          onClose={() => {
            departmentsHook.fetchData();
            setDepartmentModal(false);
          }}
        />
      )}
      {positionModal && (
        <PositionForm
          open={true}
          onClose={() => {
            positionsHook.fetchData();
            setPositionModal(false);
          }}
        />
      )}
      {costCenterModal && (
        <CostCenterForm
          open={true}
          onClose={() => {
            costCentersHook.fetchData();
            setCostCenterModal(false);
          }}
        />
      )}
    </>
  );
};
