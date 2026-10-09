import {ChangeEvent, useEffect, useMemo} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {DateValue} from "react-aria-components";
import {EmployeePayProfile} from "@/api/model/employee_pay_profile.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Employee} from "@/api/model/employee.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {
  HrDateField,
  HrFormField,
  HrInputField,
  HrSelectField,
  HrStringSelectField,
  HrTimeField,
} from "@/components/hr/shared/form-field.tsx";
import {
  SelectOption,
  calendarDateToSurreal,
  enumLocaleKey,
  enumOptions,
  firstFormError,
  toCalendarDateValue,
  toRecordId,
} from "@/components/hr/shared/form.utils.ts";
import {PayType} from "@/api/model/hr.types.ts";
import {LaborPolicy} from "@/api/model/labor_policy.ts";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';
import {
  isHourlyLikePayType,
  isWorkDaysPayType,
} from "@/lib/labor-engine/calculations/work-days.calculations.ts";
import {
  DEFAULT_DAILY_OT_THRESHOLD_HOURS,
  DEFAULT_NIGHT_END_TIME,
  DEFAULT_NIGHT_MULTIPLIER,
  DEFAULT_NIGHT_START_TIME,
  DEFAULT_OT_MULTIPLIER,
} from "@/lib/labor-engine/constants.ts";

const PAY_TYPES: PayType[] = ["hourly", "monthly_salary", "weekly_salary", "daily_wage", "contract", "commission", "mixed"];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

// A free-text currency field let someone save "LY" and crash every page that
// formats this profile's amounts (Intl.NumberFormat throws on an unknown
// code, with no error boundary above it) — restrict to real ISO 4217 codes.
// tsconfig targets ES2020, which predates Intl.supportedValuesOf's types.
const intlWithSupportedValues = Intl as typeof Intl & {supportedValuesOf?: (key: string) => string[]};
const CURRENCY_OPTIONS = (
  intlWithSupportedValues.supportedValuesOf?.("currency") ?? ["USD", "IDR", "EUR", "GBP"]
).map((code) => ({value: code, label: code}));

// A threshold this high means "never reached" for any real shift — the
// calculation engine (hours.calculations.ts) has no explicit on/off switch,
// so "disabled" is represented the same way a very generous policy would be.
const OT_DISABLED_THRESHOLD_HOURS = 999999;
// multiplier 1 means "no extra pay for night hours" — the engine still
// buckets them as night hours (for reporting) but the premium is $0.
const NIGHT_DISABLED_MULTIPLIER = 1;

type PolicyMode = "default" | "custom" | "disabled";

const POLICY_MODES: PolicyMode[] = ["default", "custom", "disabled"];

const overtimeModeFromPolicy = (policy?: LaborPolicy): PolicyMode => {
  if (!policy) return "default";
  const threshold = policy.config?.threshold_hours;
  return threshold != null && threshold >= OT_DISABLED_THRESHOLD_HOURS ? "disabled" : "custom";
};

const nightModeFromPolicy = (policy?: LaborPolicy): PolicyMode => {
  if (!policy) return "default";
  const multiplier = policy.config?.multiplier;
  return multiplier != null && multiplier <= 1 ? "disabled" : "custom";
};

const randomPolicyCode = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();

interface FormValues {
  id?: string;
  employee: SelectOption | null;
  pay_type: PayType;
  base_rate: number;
  currency: string;
  expected_work_days?: number | null;
  work_weekdays: number[];
  maximum_hours_per_day?: number | null;
  maximum_hours_per_week?: number | null;
  effective_from: DateValue | null;
  effective_to?: DateValue | null;
  notes?: string;
  overtime_mode: PolicyMode;
  overtime_threshold_hours?: number | null;
  overtime_multiplier?: number | null;
  night_mode: PolicyMode;
  night_start_time?: string | null;
  night_end_time?: string | null;
  night_multiplier?: number | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: EmployeePayProfile;
}

const emptyForm = {
  employee: null,
  pay_type: "hourly" as PayType,
  base_rate: 0,
  // The employee_pay_profile schema itself defaults currency to 'USD'
  // regardless of the store's actual operating currency — default the form
  // to VITE_CURRENCY instead so new profiles don't silently inherit that.
  currency: (import.meta.env.VITE_CURRENCY as string) || "USD",
  expected_work_days: undefined,
  work_weekdays: [] as number[],
  maximum_hours_per_day: undefined,
  maximum_hours_per_week: undefined,
  effective_from: null,
  effective_to: null,
  notes: "",
  id: undefined,
  overtime_mode: "default" as PolicyMode,
  overtime_threshold_hours: DEFAULT_DAILY_OT_THRESHOLD_HOURS,
  overtime_multiplier: DEFAULT_OT_MULTIPLIER,
  night_mode: "default" as PolicyMode,
  night_start_time: DEFAULT_NIGHT_START_TIME,
  night_end_time: DEFAULT_NIGHT_END_TIME,
  night_multiplier: DEFAULT_NIGHT_MULTIPLIER,
};

const validationSchema = yup.object({
  id: yup.string().optional(),
  employee: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().required("Required"),
  pay_type: yup.string().required("Required"),
  base_rate: yup.number().typeError("Required").required("Required"),
  currency: yup.string().optional(),
  expected_work_days: yup.number().transform((value, original) => (original === '' || original === null || Number.isNaN(value) ? null : value)).nullable().optional(),
  work_weekdays: yup.array().of(yup.number()).optional(),
  maximum_hours_per_day: yup.number().transform((value, original) => (original === '' || original === null || Number.isNaN(value) ? null : value)).nullable().optional(),
  maximum_hours_per_week: yup.number().transform((value, original) => (original === '' || original === null || Number.isNaN(value) ? null : value)).nullable().optional(),
  effective_from: yup.mixed().nullable().required("Required"),
  effective_to: yup.mixed().nullable().optional(),
  notes: yup.string().optional(),
  overtime_mode: yup.string().oneOf(POLICY_MODES).required(),
  overtime_threshold_hours: yup.number().transform((value, original) => (original === '' || original === null || Number.isNaN(value) ? null : value)).nullable().optional(),
  overtime_multiplier: yup.number().transform((value, original) => (original === '' || original === null || Number.isNaN(value) ? null : value)).nullable().optional(),
  night_mode: yup.string().oneOf(POLICY_MODES).required(),
  night_start_time: yup.string().nullable().optional(),
  night_end_time: yup.string().nullable().optional(),
  night_multiplier: yup.number().transform((value, original) => (original === '' || original === null || Number.isNaN(value) ? null : value)).nullable().optional(),
}).required();

const baseRateLabelKey = (payType?: string) => {
  if (payType === "hourly") return "forms.payProfile.baseRateHourly";
  if (payType === "daily_wage") return "forms.payProfile.baseRateDaily";
  if (payType === "commission" || payType === "mixed") return "forms.payProfile.baseRateHourly";
  return "forms.payProfile.baseRatePeriod";
};

const baseRateHelpKey = (payType?: string) => {
  if (payType === "hourly") return "forms.payProfile.baseRateHelpHourly";
  if (payType === "daily_wage") return "forms.payProfile.baseRateHelpDaily";
  if (payType === "monthly_salary") return "forms.payProfile.baseRateHelpMonthly";
  if (payType === "weekly_salary") return "forms.payProfile.baseRateHelpWeekly";
  if (payType === "contract") return "forms.payProfile.baseRateHelpContract";
  if (payType === "commission") return "forms.payProfile.baseRateHelpCommission";
  if (payType === "mixed") return "forms.payProfile.baseRateHelpMixed";
  return "forms.payProfile.baseRateHelpHourly";
};

export const PayProfileForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const employeesHook = useApi<SettingsData<Employee>>(Tables.employees, [], [], 0, 500, []);

  const {handleSubmit, control, formState: {errors}, reset, watch, setValue} = useForm<any>({
    resolver: yupResolver(validationSchema) as any,
    defaultValues: emptyForm,
  });

  const payType = watch("pay_type");
  const selectedDays = (watch("work_weekdays") ?? []) as number[];
  const showWorkDays = isWorkDaysPayType(payType);
  const showHourlyFields = isHourlyLikePayType(payType);
  const overtimeMode = watch("overtime_mode") as PolicyMode;
  const nightMode = watch("night_mode") as PolicyMode;

  const policyModeOptions = useMemo(
    () => POLICY_MODES.map((mode) => ({
      value: mode,
      label: t(`forms.payProfile.policyMode.${mode}`, {
        defaultValue: mode === "default" ? "Use default" : mode === "custom" ? "Custom" : "Disabled",
      }),
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

  const payTypeOptions = useMemo(
    () => enumOptions(t, PAY_TYPES, "employmentTypes", enumLocaleKey),
    [t],
  );

  const closeModal = () => {
    onClose();
    reset(emptyForm);
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        employee: data.employee ? {
          value: String(data.employee.id),
          label: `${data.employee.employee_number} — ${data.employee.first_name} ${data.employee.last_name ?? ""}`.trim(),
        } : null,
        pay_type: data.pay_type,
        base_rate: data.base_rate,
        currency: data.currency || (import.meta.env.VITE_CURRENCY as string) || "USD",
        expected_work_days: data.expected_work_days ?? undefined,
        work_weekdays: Array.isArray(data.work_weekdays)
          ? data.work_weekdays.map(day => Number(day))
          : [],
        maximum_hours_per_day: data.maximum_hours_per_day ?? undefined,
        maximum_hours_per_week: data.maximum_hours_per_week ?? undefined,
        effective_from: toCalendarDateValue(data.effective_from),
        effective_to: toCalendarDateValue(data.effective_to),
        notes: data.notes ?? "",
        overtime_mode: overtimeModeFromPolicy(data.overtime_policy),
        overtime_threshold_hours: data.overtime_policy?.config?.threshold_hours ?? DEFAULT_DAILY_OT_THRESHOLD_HOURS,
        overtime_multiplier: data.overtime_policy?.config?.multiplier ?? DEFAULT_OT_MULTIPLIER,
        night_mode: nightModeFromPolicy(data.night_policy),
        night_start_time: data.night_policy?.config?.start_time ?? DEFAULT_NIGHT_START_TIME,
        night_end_time: data.night_policy?.config?.end_time ?? DEFAULT_NIGHT_END_TIME,
        night_multiplier: data.night_policy?.config?.multiplier ?? DEFAULT_NIGHT_MULTIPLIER,
      });
    } else if (open) {
      reset(emptyForm);
    }
  }, [data, open, reset]);

  const toggleDay = (day: number, checked: boolean) => {
    const next = checked
      ? [...selectedDays, day].sort((a, b) => a - b)
      : selectedDays.filter((value) => value !== day);
    setValue("work_weekdays", next, {shouldDirty: true});
  };

  // Overtime/night premium live as separate labor_policy records the pay
  // profile links to — "default" means no link (engine falls back to its
  // hardcoded defaults), "custom"/"disabled" upsert one dedicated record per
  // profile so it doesn't collide with other employees' overrides.
  const resolvePolicyLink = async (
    existingPolicy: LaborPolicy | undefined,
    mode: PolicyMode,
    config: Record<string, unknown>,
    policyType: string,
    codePrefix: string,
    name: string,
  ): Promise<string | null> => {
    // Only a record this form created carries the generated `OT_`/`NIGHT_`
    // prefix. A profile can also be linked to a seeded/global labor_policy;
    // updating that in place would silently rewrite it for every other
    // profile that references it, so only reuse records we own.
    const isOwned = Boolean(existingPolicy?.code?.startsWith(`${codePrefix}_`));

    if (mode === "default") {
      // Unlink. Deactivate an owned override so it doesn't linger as an
      // active, selectable policy; never touch seeded/global records.
      if (existingPolicy?.id && isOwned) {
        await db.merge(existingPolicy.id, {is_active: false});
      }
      return null;
    }

    if (existingPolicy?.id && isOwned) {
      await db.update(existingPolicy.id, {config, is_active: true});
      return String(existingPolicy.id);
    }

    const [created] = await db.create(Tables.labor_policies, {
      code: randomPolicyCode(codePrefix),
      name,
      policy_type: policyType,
      config,
      is_active: true,
    });
    return String(created.id);
  };

  const onSubmit = async (values: FormValues) => {
    try {
      const employeeLabel = values.employee?.label ?? "";

      const overtimeConfig = values.overtime_mode === "disabled"
        ? {threshold_hours: OT_DISABLED_THRESHOLD_HOURS, multiplier: 1}
        : {
            threshold_hours: Number(values.overtime_threshold_hours ?? DEFAULT_DAILY_OT_THRESHOLD_HOURS),
            multiplier: Number(values.overtime_multiplier ?? DEFAULT_OT_MULTIPLIER),
          };
      const nightConfig = values.night_mode === "disabled"
        ? {start_time: DEFAULT_NIGHT_START_TIME, end_time: DEFAULT_NIGHT_END_TIME, multiplier: NIGHT_DISABLED_MULTIPLIER}
        : {
            start_time: values.night_start_time || DEFAULT_NIGHT_START_TIME,
            end_time: values.night_end_time || DEFAULT_NIGHT_END_TIME,
            multiplier: Number(values.night_multiplier ?? DEFAULT_NIGHT_MULTIPLIER),
          };

      const overtimePolicyId = await resolvePolicyLink(
        data?.overtime_policy, values.overtime_mode, overtimeConfig, "overtime", "OT",
        `Overtime override — ${employeeLabel}`.trim(),
      );
      const nightPolicyId = await resolvePolicyLink(
        data?.night_policy, values.night_mode, nightConfig, "night", "NIGHT",
        `Night premium override — ${employeeLabel}`.trim(),
      );

      const payload = {
        employee: toRecordId(values.employee?.value),
        pay_type: values.pay_type,
        base_rate: Number(values.base_rate),
        currency: values.currency?.trim().toUpperCase() || (import.meta.env.VITE_CURRENCY as string) || "USD",
        expected_work_days: values.expected_work_days
          ? Number(values.expected_work_days)
          : null,
        work_weekdays: values.work_weekdays ?? [],
        maximum_hours_per_day: values.maximum_hours_per_day
          ? Number(values.maximum_hours_per_day)
          : null,
        maximum_hours_per_week: values.maximum_hours_per_week
          ? Number(values.maximum_hours_per_week)
          : null,
        effective_from: calendarDateToSurreal(values.effective_from),
        effective_to: calendarDateToSurreal(values.effective_to),
        notes: values.notes?.trim() || undefined,
        overtime_policy: overtimePolicyId ? toRecordId(overtimePolicyId) : null,
        night_policy: nightPolicyId ? toRecordId(nightPolicyId) : null,
      };

      if (data?.id) {
        await db.update(data?.id, payload);
      } else {
        await db.create(Tables.employee_pay_profiles, payload);
      }

      await emitEntityCrudSave({
        domain: 'hr',
        table: Tables.employee_pay_profiles,
        entityId: data?.id ? String(data.id) : Tables.employee_pay_profiles,
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
    <Modal title={data ? t("forms.payProfile.update") : t("forms.payProfile.create")} testId="hr-form-pay-profile" open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        <div className="flex flex-col gap-3 mb-3">
          <HrSelectField
            label={t("forms.payProfile.employee")}
            name="employee"
            control={control}
            options={employeeOptions}
            isClearable={false}
            error={typeof errors.employee?.message === "string" ? errors.employee.message : undefined}
          />
          <HrStringSelectField
            label={t("forms.payProfile.payType")}
            name="pay_type"
            control={control}
            options={payTypeOptions}
            error={typeof errors.pay_type?.message === "string" ? errors.pay_type.message : undefined}
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <HrInputField
                type="number"
                step="0.01"
                name="base_rate"
                control={control}
                label={t(baseRateLabelKey(payType))}
                error={typeof errors.base_rate?.message === "string" ? errors.base_rate.message : undefined}
              />
              <p className="text-xs text-muted mt-1">{t(baseRateHelpKey(payType))}</p>
            </div>
            <div className="w-40">
              <HrStringSelectField
                name="currency"
                control={control}
                label={t("forms.payProfile.currency", {defaultValue: "Currency"})}
                options={CURRENCY_OPTIONS}
                isClearable={false}
              />
            </div>
          </div>
          {showWorkDays && (
            <>
              <div>
                <HrInputField
                  type="number"
                  step="1"
                  name="expected_work_days"
                  control={control}
                  label={t("forms.payProfile.expectedWorkDays")}
                  error={typeof errors.expected_work_days?.message === "string" ? errors.expected_work_days.message : undefined}
                />
                <p className="text-xs text-muted mt-1">{t("forms.payProfile.expectedWorkDaysHelp")}</p>
              </div>
              <HrFormField label={t("forms.payProfile.workWeekdays")}>
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
                <p className="text-xs text-muted mt-1">{t("forms.payProfile.workWeekdaysHelp")}</p>
              </HrFormField>
            </>
          )}
          {showHourlyFields && (
            <div className="flex gap-3">
              <div className="flex-1">
                <HrInputField
                  type="number"
                  step="0.01"
                  name="maximum_hours_per_day"
                  control={control}
                  label={t("forms.payProfile.maxHoursPerDay")}
                />
              </div>
              <div className="flex-1">
                <HrInputField
                  type="number"
                  step="0.01"
                  name="maximum_hours_per_week"
                  control={control}
                  label={t("forms.payProfile.maxHoursPerWeek")}
                />
              </div>
            </div>
          )}
          <HrFormField label={t("forms.payProfile.overtimeSection", {defaultValue: "Overtime"})}>
            <p className="text-xs text-muted mb-1">
              {t("forms.payProfile.overtimeSectionHelp", {
                defaultValue: `By default, hours past ${DEFAULT_DAILY_OT_THRESHOLD_HOURS}/day are paid at ${DEFAULT_OT_MULTIPLIER}x. Override or turn this off for this employee only.`,
              })}
            </p>
            <HrStringSelectField
              name="overtime_mode"
              control={control}
              options={policyModeOptions}
              isClearable={false}
            />
            {overtimeMode === "custom" && (
              <div className="flex gap-3 mt-2">
                <div className="flex-1">
                  <HrInputField
                    type="number"
                    step="0.5"
                    name="overtime_threshold_hours"
                    control={control}
                    label={t("forms.payProfile.overtimeThreshold", {defaultValue: "Daily threshold (hours)"})}
                  />
                </div>
                <div className="flex-1">
                  <HrInputField
                    type="number"
                    step="0.05"
                    name="overtime_multiplier"
                    control={control}
                    label={t("forms.payProfile.overtimeMultiplier", {defaultValue: "Multiplier"})}
                  />
                </div>
              </div>
            )}
          </HrFormField>
          <HrFormField label={t("forms.payProfile.nightPremiumSection", {defaultValue: "Night-shift premium"})}>
            <p className="text-xs text-muted mb-1">
              {t("forms.payProfile.nightPremiumSectionHelp", {
                defaultValue: `By default, hours worked between ${DEFAULT_NIGHT_START_TIME}–${DEFAULT_NIGHT_END_TIME} get an extra ${Math.round((DEFAULT_NIGHT_MULTIPLIER - 1) * 100)}%. Override or turn this off for this employee only.`,
              })}
            </p>
            <HrStringSelectField
              name="night_mode"
              control={control}
              options={policyModeOptions}
              isClearable={false}
            />
            {nightMode === "custom" && (
              <div className="flex gap-3 mt-2">
                <div className="flex-1">
                  <HrTimeField
                    label={t("forms.payProfile.nightStart", {defaultValue: "Start time"})}
                    name="night_start_time"
                    control={control}
                  />
                </div>
                <div className="flex-1">
                  <HrTimeField
                    label={t("forms.payProfile.nightEnd", {defaultValue: "End time"})}
                    name="night_end_time"
                    control={control}
                  />
                </div>
                <div className="flex-1">
                  <HrInputField
                    type="number"
                    step="0.05"
                    name="night_multiplier"
                    control={control}
                    label={t("forms.payProfile.nightMultiplier", {defaultValue: "Multiplier"})}
                  />
                </div>
              </div>
            )}
          </HrFormField>
          <div className="flex gap-3">
            <div className="flex-1">
              <HrDateField
                label={t("forms.payProfile.effectiveFrom")}
                name="effective_from"
                control={control}
                error={typeof errors.effective_from?.message === "string" ? errors.effective_from.message : undefined}
              />
            </div>
            <div className="flex-1">
              <HrDateField
                label={t("forms.payProfile.effectiveTo")}
                name="effective_to"
                control={control}
                error={typeof errors.effective_to?.message === "string" ? errors.effective_to.message : undefined}
              />
            </div>
          </div>
          <div>
            <HrInputField
              name="notes"
              control={control}
              label={t("forms.payProfile.notes")}
            />
          </div>
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
