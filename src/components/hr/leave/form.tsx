import {useEffect, useMemo, useState} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {DateValue} from "react-aria-components";
import {LeaveType} from "@/api/model/leave_type.ts";
import {LeaveRequest} from "@/api/model/leave_request.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Employee} from "@/api/model/employee.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrCheckboxField, HrDateField, HrInputField, HrSelectField} from "@/components/hr/shared/form-field.tsx";
import {
  SelectOption,
  calendarDateToSurreal,
  toCalendarDateValue,
  toRecordId,
  toSelectOption,
} from "@/components/hr/shared/form.utils.ts";
import {createRequest} from "@/lib/labor-engine/leave/leave.service.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';

interface LeaveTypeFormValues {
  id?: string;
  code: string;
  name: string;
  paid?: boolean;
  requires_approval?: boolean;
  max_days_per_year?: number;
  accrual_rate?: number;
  is_active?: boolean;
}

interface LeaveRequestFormValues {
  id?: string;
  employee: SelectOption | null;
  leave_type: SelectOption | null;
  start_date: DateValue | null;
  end_date: DateValue | null;
  days?: number;
  reason?: string;
}

interface LeaveTypeFormProps {
  open: boolean;
  onClose: () => void;
  data?: LeaveType;
}

interface LeaveRequestFormProps {
  open: boolean;
  onClose: () => void;
  data?: LeaveRequest;
}

const leaveTypeSchema = yup.object({
  id: yup.string().optional(),
  code: yup.string().required("Required"),
  name: yup.string().required("Required"),
  paid: yup.boolean().optional(),
  requires_approval: yup.boolean().optional(),
  max_days_per_year: yup.number().optional(),
  accrual_rate: yup.number().optional(),
  is_active: yup.boolean().optional(),
}).required();

const leaveRequestSchema = yup.object({
  id: yup.string().optional(),
  employee: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().required("Required"),
  leave_type: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().required("Required"),
  start_date: yup.mixed().nullable().required("Required"),
  end_date: yup.mixed().nullable().required("Required"),
  days: yup.number().optional(),
  reason: yup.string().optional(),
}).required();

export const LeaveTypeForm = ({open, onClose, data}: LeaveTypeFormProps) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const {handleSubmit, control, reset, formState: {errors}} = useForm({
    resolver: yupResolver(leaveTypeSchema),
    defaultValues: {paid: true, requires_approval: true, is_active: true},
  });

  const closeModal = () => {
    onClose();
    reset({code: "", name: "", paid: true, requires_approval: true, is_active: true, id: undefined});
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        code: data.code ?? "",
        name: data.name ?? "",
        paid: data.paid !== false,
        requires_approval: data.requires_approval !== false,
        max_days_per_year: data.max_days_per_year,
        accrual_rate: data.accrual_rate,
        is_active: data.is_active !== false,
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: LeaveTypeFormValues) => {
    try {
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        paid: values.paid !== false,
        requires_approval: values.requires_approval !== false,
        max_days_per_year: values.max_days_per_year ?? null,
        accrual_rate: values.accrual_rate ?? null,
        is_active: values.is_active !== false,
      };

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.leave_types, payload);
      }

      await emitEntityCrudSave({
        domain: 'hr',
        table: Tables.leave_types,
        entityId: data?.id ? String(data.id) : Tables.leave_types,
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
    <Modal title={data ? t("forms.leave.updateType") : t("forms.leave.createType")} testId="hr-form-leave" open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div>
            <HrInputField
              name="code"
              control={control}
              label={t("forms.leave.typeCode")}
              autoFocus
              error={errors.code?.message}
            />
          </div>
          <div>
            <HrInputField
              name="name"
              control={control}
              label={t("forms.leave.typeName")}
              error={errors.name?.message}
            />
          </div>
          <div>
            <HrInputField
              type="number"
              name="max_days_per_year"
              control={control}
              label={t("forms.leave.maxDaysPerYear")}
            />
          </div>
          <div>
            <HrInputField
              type="number"
              step="0.01"
              name="accrual_rate"
              control={control}
              label={t("forms.leave.accrualRate")}
            />
          </div>
          <HrCheckboxField
            label={t("forms.leave.paid")}
            name="paid"
            control={control}
          />
          <HrCheckboxField
            label={t("forms.leave.requiresApproval")}
            name="requires_approval"
            control={control}
          />
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};

export const LeaveRequestForm = ({open, onClose, data}: LeaveRequestFormProps) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);
  const typesHook = useApi<SettingsData<LeaveType>>(Tables.leave_types, [], [], 0, 500, []);

  const {handleSubmit, control, reset, formState: {errors}} = useForm({
    resolver: yupResolver(leaveRequestSchema),
  });

  const employeeOptions = useMemo(
    () => (employeesHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: `${item.employee_number} — ${item.first_name} ${item.last_name ?? ""}`.trim(),
    })),
    [employeesHook.data?.data],
  );

  const leaveTypeOptions = useMemo(
    () => (typesHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [typesHook.data?.data],
  );

  const closeModal = () => {
    onClose();
    reset({employee: null, leave_type: null, start_date: null, end_date: null, days: undefined, reason: ""});
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        employee: data.employee ? {
          value: String(data.employee.id),
          label: `${data.employee.employee_number} — ${data.employee.first_name} ${data.employee.last_name ?? ""}`.trim(),
        } : null,
        leave_type: toSelectOption(data.leave_type),
        start_date: toCalendarDateValue(data.start_date),
        end_date: toCalendarDateValue(data.end_date),
        days: data.days,
        reason: data.reason ?? "",
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: LeaveRequestFormValues) => {
    try {
      if (data?.id) {
        await db.update(data.id, {
          employee: toRecordId(values.employee?.value),
          leave_type: toRecordId(values.leave_type?.value),
          start_date: calendarDateToSurreal(values.start_date),
          end_date: calendarDateToSurreal(values.end_date),
          days: values.days ?? 0,
          reason: values.reason?.trim() || undefined,
        });
      } else {
        await createRequest(db, {
          employeeId: values.employee!.value,
          leaveTypeId: values.leave_type!.value,
          startDate: calendarDateToSurreal(values.start_date)!,
          endDate: calendarDateToSurreal(values.end_date)!,
          days: values.days ?? 0,
          reason: values.reason?.trim(),
          createdBy: page.user,
        });
      }

      toast.success(t("messages.leaveSubmitted"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const [leaveTypeModal, setLeaveTypeModal] = useState(false);

  return (
    <>
      <Modal title={data ? t("forms.leave.update") : t("forms.leave.create")} testId="hr-form-leave" open={open} onClose={closeModal} size="lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-3 mb-3">
            <HrSelectField
              label={t("forms.leave.employee")}
              name="employee"
              control={control}
              options={employeeOptions}
              isClearable={false}
              error={errors.employee?.message}
            />
            <HrSelectField
              label={t("forms.leave.leaveType")}
              name="leave_type"
              control={control}
              options={leaveTypeOptions}
              isClearable={false}
              error={errors.leave_type?.message}
              onAdd={() => setLeaveTypeModal(true)}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <HrDateField
                  label={t("forms.leave.startDate")}
                  name="start_date"
                  control={control}
                  error={errors.start_date?.message}
                />
              </div>
              <div className="flex-1">
                <HrDateField
                  label={t("forms.leave.endDate")}
                  name="end_date"
                  control={control}
                  error={errors.end_date?.message}
                />
              </div>
            </div>
            <div>
              <HrInputField
                type="number"
                name="days"
                control={control}
                label={t("forms.leave.days")}
                error={errors.days?.message}
              />
            </div>
            <div>
              <HrInputField
                name="reason"
                control={control}
                label={t("forms.leave.reason")}
              />
            </div>
          </div>
          <Button type="submit" variant="primary">{t("buttons.save")}</Button>
        </form>
      </Modal>

      {leaveTypeModal && (
        <LeaveTypeForm
          open
          onClose={() => {
            typesHook.fetchData();
            setLeaveTypeModal(false);
          }}
        />
      )}
    </>
  );
};
