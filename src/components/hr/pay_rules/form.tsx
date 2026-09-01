import {ChangeEvent, useEffect, useMemo, useState} from "react";
import {Controller, useFieldArray, useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {DateValue} from "react-aria-components";
import {LaborPayRule} from "@/api/model/labor_pay_rule.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Employee} from "@/api/model/employee.ts";
import {Department} from "@/api/model/department.ts";
import {Position} from "@/api/model/position.ts";
import {CostCenter} from "@/api/model/cost_center.ts";
import {PublicHoliday} from "@/api/model/public_holiday.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {IconTooltipButton} from "@/components/common/input/icon.tooltip.button.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {
  HrCheckboxField,
  HrDateField,
  HrFormField,
  HrInputField,
  HrStringSelectField,
  HrTimeField,
} from "@/components/hr/shared/form-field.tsx";
import {
  SelectOption,
  enumLocaleKey,
  enumOptions,
  firstFormError,
  toCalendarDateValue,
  toSelectOption,
} from "@/components/hr/shared/form.utils.ts";
import {
  RuleAppliesTo,
  RuleEffectType,
  StackingMode,
} from "@/api/model/hr.types.ts";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {DepartmentForm} from "@/components/hr/departments/form.tsx";
import {PositionForm} from "@/components/hr/positions/form.tsx";
import {CostCenterForm} from "@/components/hr/cost_centers/form.tsx";
import {HolidayForm} from "@/components/hr/holidays/form.tsx";

const STACKING_MODES: StackingMode[] = ["allow", "prevent", "highest_wins", "priority"];
const EFFECT_TYPES: RuleEffectType[] = [
  "multiplier",
  "fixed_bonus",
  "fixed_deduction",
  "percent_bonus",
  "percent_deduction",
];
const APPLIES_TO: RuleAppliesTo[] = ["regular", "overtime", "all_hours"];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

interface EffectFormValue {
  type: RuleEffectType;
  value: number;
  applies_to: RuleAppliesTo;
}

interface FormValues {
  id?: string;
  code: string;
  name: string;
  priority?: number;
  stacking_mode?: StackingMode;
  exclusive?: boolean;
  is_active?: boolean;
  effects: EffectFormValue[];
  employee_ids: SelectOption[];
  department_ids: SelectOption[];
  position_ids: SelectOption[];
  cost_center_ids: SelectOption[];
  holiday_ids: SelectOption[];
  months: SelectOption[];
  days_of_week: number[];
  start_date: DateValue | null;
  end_date: DateValue | null;
  start_time: string;
  end_time: string;
  after_hours_day?: number | null;
  after_hours_week?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: LaborPayRule;
}

const optionSchema = yup.object({
  label: yup.string().required(),
  value: yup.string().required(),
});

const validationSchema = yup.object({
  id: yup.string().optional(),
  code: yup.string().required("Required"),
  name: yup.string().required("Required"),
  priority: yup.number().optional(),
  stacking_mode: yup.string().optional(),
  exclusive: yup.boolean().optional(),
  is_active: yup.boolean().optional(),
  effects: yup.array().of(
    yup.object({
      type: yup.string().required("Required"),
      value: yup.number().typeError("Required").required("Required"),
      applies_to: yup.string().required("Required"),
    }),
  ).min(1, "Required").required("Required"),
  employee_ids: yup.array().of(optionSchema).default([]),
  department_ids: yup.array().of(optionSchema).default([]),
  position_ids: yup.array().of(optionSchema).default([]),
  cost_center_ids: yup.array().of(optionSchema).default([]),
  holiday_ids: yup.array().of(optionSchema).default([]),
  months: yup.array().of(optionSchema).default([]),
  days_of_week: yup.array().of(yup.number()).default([]),
  start_date: yup.mixed().nullable().optional(),
  end_date: yup.mixed().nullable().optional(),
  start_time: yup.string().optional(),
  end_time: yup.string().optional(),
  after_hours_day: yup.number().nullable().optional(),
  after_hours_week: yup.number().nullable().optional(),
}).required();

const emptyDefaults = (): FormValues => ({
  code: "",
  name: "",
  priority: 100,
  stacking_mode: "allow",
  exclusive: false,
  is_active: true,
  effects: [{type: "fixed_bonus", value: 0, applies_to: "all_hours"}],
  employee_ids: [],
  department_ids: [],
  position_ids: [],
  cost_center_ids: [],
  holiday_ids: [],
  months: [],
  days_of_week: [],
  start_date: null,
  end_date: null,
  start_time: "",
  end_time: "",
  after_hours_day: null,
  after_hours_week: null,
  id: undefined,
});

const dateValueToIso = (value?: DateValue | null): string | undefined => {
  if (!value) return undefined;
  return value.toString();
};

const idsToOptions = (
  ids: string[] | undefined,
  options: SelectOption[],
): SelectOption[] => {
  if (!ids?.length) return [];
  return ids
    .map((id) => options.find((o) => o.value === String(id) || o.value.endsWith(`:${id}`))
      ?? options.find((o) => o.value === id)
      ?? {value: String(id), label: String(id)})
    .filter(Boolean);
};

export const PayRuleForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, ["deleted_at = none"], [], 0, 500, []);
  const departmentsHook = useApi<SettingsData<Department>>(Tables.departments, [], [], 0, 500, []);
  const positionsHook = useApi<SettingsData<Position>>(Tables.positions, [], [], 0, 500, []);
  const costCentersHook = useApi<SettingsData<CostCenter>>(Tables.cost_centers, [], [], 0, 500, []);
  const holidaysHook = useApi<SettingsData<PublicHoliday>>(Tables.public_holidays, ["deleted_at = none"], [], 0, 500, []);

  const stackingModeOptions = useMemo(
    () => enumOptions(t, STACKING_MODES, "stackingModes", enumLocaleKey),
    [t],
  );
  const effectTypeOptions = useMemo(
    () => enumOptions(t, EFFECT_TYPES, "effectTypes", enumLocaleKey),
    [t],
  );
  const appliesToOptions = useMemo(
    () => enumOptions(t, APPLIES_TO, "appliesTo", enumLocaleKey),
    [t],
  );
  const monthOptions = useMemo(
    () => MONTHS.map((m) => ({
      value: String(m),
      label: t(`months.${m}`, {defaultValue: String(m)}),
    })),
    [t],
  );

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
  const holidayOptions = useMemo(
    () => (holidaysHook.data?.data ?? []).map((item) => ({
      value: String(item.id),
      label: item.name ?? String(item.id),
    })),
    [holidaysHook.data?.data],
  );

  const {register, handleSubmit, control, watch, setValue, formState: {errors}, reset} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
    defaultValues: emptyDefaults(),
  });

  const {fields, append, remove} = useFieldArray({control, name: "effects"});
  const selectedDays = watch("days_of_week") ?? [];

  const toggleDay = (day: number, checked: boolean) => {
    const next = checked
      ? [...new Set([...selectedDays, day])]
      : selectedDays.filter((d) => d !== day);
    setValue("days_of_week", next, {shouldValidate: true});
  };

  const closeModal = () => {
    onClose();
    reset(emptyDefaults());
  };

  useEffect(() => {
    if (!open) return;

    if (data) {
      const conditions = data.conditions ?? {};
      reset({
        id: data.id,
        code: data.code ?? "",
        name: data.name ?? "",
        priority: data.priority ?? 100,
        stacking_mode: data.stacking_mode ?? "allow",
        exclusive: data.exclusive ?? false,
        is_active: data.is_active !== false,
        effects: (data.effects?.length
          ? data.effects
          : [{type: "fixed_bonus", value: 0, applies_to: "all_hours"}]
        ).map((effect) => ({
          type: effect.type,
          value: Number(effect.value ?? 0),
          applies_to: effect.applies_to ?? "all_hours",
        })),
        employee_ids: idsToOptions(conditions.employee_ids, employeeOptions),
        department_ids: idsToOptions(conditions.department_ids, departmentOptions),
        position_ids: idsToOptions(conditions.position_ids, positionOptions),
        cost_center_ids: idsToOptions(conditions.cost_center_ids, costCenterOptions),
        holiday_ids: idsToOptions(conditions.holiday_ids, holidayOptions),
        months: (conditions.months ?? []).map((m) => ({
          value: String(m),
          label: t(`months.${m}`, {defaultValue: String(m)}),
        })),
        days_of_week: conditions.days_of_week ?? [],
        start_date: toCalendarDateValue(conditions.start_date),
        end_date: toCalendarDateValue(conditions.end_date),
        start_time: conditions.start_time ?? "",
        end_time: conditions.end_time ?? "",
        after_hours_day: conditions.after_hours_day ?? null,
        after_hours_week: conditions.after_hours_week ?? null,
      });
    } else {
      reset(emptyDefaults());
    }
  }, [
    data,
    open,
    reset,
    employeeOptions,
    departmentOptions,
    positionOptions,
    costCenterOptions,
    holidayOptions,
    t,
  ]);

  const buildConditions = (values: FormValues) => {
    const conditions: Record<string, unknown> = {};
    if (values.employee_ids?.length) {
      conditions.employee_ids = values.employee_ids.map((o) => o.value);
    }
    if (values.department_ids?.length) {
      conditions.department_ids = values.department_ids.map((o) => o.value);
    }
    if (values.position_ids?.length) {
      conditions.position_ids = values.position_ids.map((o) => o.value);
    }
    if (values.cost_center_ids?.length) {
      conditions.cost_center_ids = values.cost_center_ids.map((o) => o.value);
    }
    if (values.holiday_ids?.length) {
      conditions.holiday_ids = values.holiday_ids.map((o) => o.value);
    }
    if (values.months?.length) {
      conditions.months = values.months.map((o) => Number(o.value));
    }
    if (values.days_of_week?.length) {
      conditions.days_of_week = values.days_of_week;
    }
    const startDate = dateValueToIso(values.start_date);
    const endDate = dateValueToIso(values.end_date);
    if (startDate) conditions.start_date = startDate;
    if (endDate) conditions.end_date = endDate;
    if (values.start_time?.trim()) conditions.start_time = values.start_time.trim();
    if (values.end_time?.trim()) conditions.end_time = values.end_time.trim();
    if (values.after_hours_day != null && !Number.isNaN(Number(values.after_hours_day))) {
      conditions.after_hours_day = Number(values.after_hours_day);
    }
    if (values.after_hours_week != null && !Number.isNaN(Number(values.after_hours_week))) {
      conditions.after_hours_week = Number(values.after_hours_week);
    }
    return conditions;
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        priority: Number(values.priority ?? 100),
        stacking_mode: values.stacking_mode ?? "allow",
        exclusive: values.exclusive ?? false,
        is_active: values.is_active !== false,
        effects: values.effects.map((effect) => ({
          type: effect.type,
          value: Number(effect.value),
          applies_to: effect.applies_to ?? "all_hours",
        })),
        conditions: buildConditions(values),
      };

      if (values.id) {
        await db.merge(values.id, payload);
      } else {
        await db.create(Tables.labor_pay_rules, payload);
      }

      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const [departmentModal, setDepartmentModal] = useState(false);
  const [positionModal, setPositionModal] = useState(false);
  const [costCenterModal, setCostCenterModal] = useState(false);
  const [holidayModal, setHolidayModal] = useState(false);

  return (
    <>
    <Modal
      title={data ? t("forms.payRule.update") : t("forms.payRule.create")}
      testId="hr-form-pay-rule"
      open={open}
      onClose={closeModal}
      size="xl"
    >
      <form
        onSubmit={handleSubmit(onSubmit, (errs) => {
          const message = firstFormError(errs);
          if (message) toast.error(message);
        })}
        className="flex flex-col gap-4"
      >
        <input type="hidden" {...register("id")} />

        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <HrInputField
                name="code"
                control={control}
                label={t("forms.payRule.code")}
                autoFocus
                error={errors.code?.message}
              />
            </div>
            <div className="flex-1">
              <HrInputField
                name="name"
                control={control}
                label={t("forms.payRule.name")}
                error={errors.name?.message}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <HrInputField
                type="number"
                name="priority"
                control={control}
                label={t("forms.payRule.priority")}
              />
            </div>
            <div className="flex-1">
              <HrStringSelectField
                label={t("forms.payRule.stackingMode")}
                name="stacking_mode"
                control={control}
                options={stackingModeOptions}
                error={errors.stacking_mode?.message}
              />
            </div>
          </div>
          <div className="flex gap-4">
            <HrCheckboxField label={t("forms.payRule.exclusive")} name="exclusive" control={control}/>
            <HrCheckboxField label={t("forms.payRule.isActive")} name="is_active" control={control}/>
          </div>
        </div>

        <fieldset className="border border-neutral-300 rounded-lg p-3 flex flex-col gap-3">
          <legend className="px-1 text-sm font-semibold">{t("forms.payRule.effects")}</legend>
          {errors.effects?.message && (
            <p className="text-sm text-danger-600">{String(errors.effects.message)}</p>
          )}
          {fields.map((field, index) => (
            <div key={field.id} className="flex flex-wrap gap-3 items-end border-b border-neutral-100 pb-3">
              <div className="min-w-[160px] flex-1">
                <HrStringSelectField
                  label={t("forms.payRule.effectType")}
                  name={`effects.${index}.type`}
                  control={control}
                  options={effectTypeOptions}
                  isClearable={false}
                />
              </div>
              <div className="w-28">
                <HrInputField
                  type="number"
                  step="any"
                  name={`effects.${index}.value`}
                  control={control}
                  label={t("forms.payRule.effectValue")}
                />
              </div>
              <div className="min-w-[140px] flex-1">
                <HrStringSelectField
                  label={t("forms.payRule.appliesTo")}
                  name={`effects.${index}.applies_to`}
                  control={control}
                  options={appliesToOptions}
                  isClearable={false}
                />
              </div>
              <IconTooltipButton
                type="button"
                label={t("buttons.delete")}
                variant="danger"
                icon={faTrash}
                disabled={fields.length <= 1}
                onClick={() => remove(index)}
              />
            </div>
          ))}
          <Button
            type="button"
            variant="neutral"
            size="sm"
            icon={faPlus}
            onClick={() => append({type: "fixed_bonus", value: 0, applies_to: "all_hours"})}
          >
            {t("forms.payRule.addEffect")}
          </Button>
        </fieldset>

        <fieldset className="border border-neutral-300 rounded-lg p-3 flex flex-col gap-3">
          <legend className="px-1 text-sm font-semibold">{t("forms.payRule.conditions")}</legend>

          <HrFormField label={t("forms.schedule.department")}>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Controller
                  control={control}
                  name="department_ids"
                  render={({field}) => (
                    <ReactSelect
                      isMulti
                      options={departmentOptions as never}
                      value={field.value}
                      onChange={field.onChange}
                      isClearable
                    />
                  )}
                />
              </div>
              <IconTooltipButton
                type="button"
                label={t("common:actions.add")}
                variant="primary"
                icon={faPlus}
                onClick={() => setDepartmentModal(true)}
              />
            </div>
          </HrFormField>
          <HrFormField label={t("forms.schedule.position")}>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Controller
                  control={control}
                  name="position_ids"
                  render={({field}) => (
                    <ReactSelect
                      isMulti
                      options={positionOptions as never}
                      value={field.value}
                      onChange={field.onChange}
                      isClearable
                    />
                  )}
                />
              </div>
              <IconTooltipButton
                type="button"
                label={t("common:actions.add")}
                variant="primary"
                icon={faPlus}
                onClick={() => setPositionModal(true)}
              />
            </div>
          </HrFormField>
          <HrFormField label={t("forms.schedule.costCenter")}>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Controller
                  control={control}
                  name="cost_center_ids"
                  render={({field}) => (
                    <ReactSelect
                      isMulti
                      options={costCenterOptions as never}
                      value={field.value}
                      onChange={field.onChange}
                      isClearable
                    />
                  )}
                />
              </div>
              <IconTooltipButton
                type="button"
                label={t("common:actions.add")}
                variant="primary"
                icon={faPlus}
                onClick={() => setCostCenterModal(true)}
              />
            </div>
          </HrFormField>
          <HrFormField label={t("forms.adjustment.employee")}>
            <Controller
              control={control}
              name="employee_ids"
              render={({field}) => (
                <ReactSelect
                  isMulti
                  options={employeeOptions as never}
                  value={field.value}
                  onChange={field.onChange}
                  isClearable
                />
              )}
            />
          </HrFormField>
          <HrFormField label={t("tabs.holidays")}>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Controller
                  control={control}
                  name="holiday_ids"
                  render={({field}) => (
                    <ReactSelect
                      isMulti
                      options={holidayOptions as never}
                      value={field.value}
                      onChange={field.onChange}
                      isClearable
                    />
                  )}
                />
              </div>
              <IconTooltipButton
                type="button"
                label={t("common:actions.add")}
                variant="primary"
                icon={faPlus}
                onClick={() => setHolidayModal(true)}
              />
            </div>
          </HrFormField>

          <div className="flex gap-3">
            <div className="flex-1">
              <HrDateField
                label={t("columns.startDate")}
                name="start_date"
                control={control}
              />
            </div>
            <div className="flex-1">
              <HrDateField
                label={t("columns.endDate")}
                name="end_date"
                control={control}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <HrTimeField
                label={t("forms.payRule.startTime")}
                name="start_time"
                control={control}
              />
            </div>
            <div className="flex-1">
              <HrTimeField
                label={t("forms.payRule.endTime")}
                name="end_time"
                control={control}
              />
            </div>
          </div>

          <HrFormField label={t("forms.payRule.daysOfWeek")}>
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

          <HrFormField label={t("forms.payRule.months")}>
            <Controller
              control={control}
              name="months"
              render={({field}) => (
                <ReactSelect
                  isMulti
                  options={monthOptions as never}
                  value={field.value}
                  onChange={field.onChange}
                  isClearable
                />
              )}
            />
          </HrFormField>

          <div className="flex gap-3">
            <div className="flex-1">
              <HrInputField
                type="number"
                step="any"
                name="after_hours_day"
                control={control}
                label={t("forms.payRule.afterHoursDay")}
              />
            </div>
            <div className="flex-1">
              <HrInputField
                type="number"
                step="any"
                name="after_hours_week"
                control={control}
                label={t("forms.payRule.afterHoursWeek")}
              />
            </div>
          </div>
        </fieldset>

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
      {holidayModal && (
        <HolidayForm
          open={true}
          onClose={() => {
            holidaysHook.fetchData();
            setHolidayModal(false);
          }}
        />
      )}
    </>
  );
};
