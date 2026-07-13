import {useEffect, useMemo, useState} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {useAtom} from "jotai";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {PayrollPeriod} from "@/api/model/payroll_period.ts";
import {PayrollRun} from "@/api/model/payroll_run.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrSelectField} from "@/components/hr/shared/form-field.tsx";
import {
  SelectOption,
  firstFormError,
  toSelectOption,
} from "@/components/hr/shared/form.utils.ts";
import {generatePreview} from "@/lib/labor-engine/payroll/run.service.ts";
import {appPage} from "@/store/jotai.ts";
import {toRecordId} from "@/lib/utils.ts";
import {PayrollPeriodForm} from "@/components/hr/payroll_periods/form.tsx";

interface FormValues {
  payroll_period: SelectOption | null;
  run_number: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const validationSchema = yup.object({
  payroll_period: yup
    .object({label: yup.string().required(), value: yup.string().required()})
    .nullable()
    .required("Required"),
  run_number: yup.number().typeError("Required").min(1).required("Required"),
}).required();

export const PayrollRunForm = ({open, onClose, onSuccess}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);

  const periodsHook = useApi<SettingsData<PayrollPeriod>>(
    Tables.payroll_periods,
    ["status = 'open'"],
    ["start_date DESC"],
    0,
    500,
    [],
  );

  const {register, handleSubmit, control, reset, watch, setValue, formState: {errors}} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
    defaultValues: {payroll_period: null, run_number: 1},
  });

  const selectedPeriod = watch("payroll_period");

  const periodOptions = useMemo(
    () => (periodsHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [periodsHook.data?.data],
  );

  useEffect(() => {
    if (!open) return;
    reset({payroll_period: null, run_number: 1});
  }, [open, reset]);

  useEffect(() => {
    if (!open || !selectedPeriod?.value) return;

    let cancelled = false;
    const loadNextRunNumber = async () => {
      const [rows] = await db.query<PayrollRun[]>(
        `SELECT run_number FROM ONLY $periodId`,
        {periodId: toRecordId(selectedPeriod.value)},
      );
      const maxRun = Number(rows?.run_number ?? 0);
      if (!cancelled) {
        setValue("run_number", Number.isFinite(maxRun) ? maxRun + 1 : 1);
      }
    };

    void loadNextRunNumber();
    return () => {
      cancelled = true;
    };
  }, [open, selectedPeriod?.value, setValue]);

  const closeModal = () => {
    onClose();
    reset({payroll_period: null, run_number: 1});
  };

  const onSubmit = async (values: FormValues) => {
    if (!page.user) {
      toast.error(t("messages.requiredFields"));
      return;
    }
    try {
      await generatePreview(db, {
        payrollPeriodId: values.payroll_period!.value,
        generatedBy: page.user,
        runNumber: Number(values.run_number) || 1,
      });
      toast.success(t("messages.payrollGenerated"));
      onSuccess();
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const [payrollPeriodModal, setPayrollPeriodModal] = useState(false);

  return (
    <>
      <Modal title={t("buttons.runPayroll")} open={open} onClose={closeModal}>
        <form
          onSubmit={handleSubmit(onSubmit, (errs) => {
            const message = firstFormError(errs);
            if (message) toast.error(message);
          })}
        >
          <div className="flex flex-col gap-3 mb-3">
            <HrSelectField
              label={t("tabs.payrollPeriods")}
              name="payroll_period"
              control={control}
              options={periodOptions}
              isClearable={false}
              error={errors.payroll_period?.message}
              onAdd={() => setPayrollPeriodModal(true)}
            />
            <div>
              <Input
                type="number"
                label={t("columns.runNumber")}
                {...register("run_number", {valueAsNumber: true})}
                error={errors.run_number?.message}
              />
            </div>
          </div>
          <Button type="submit" variant="primary">{t("payroll.generate")}</Button>
        </form>
      </Modal>

      {payrollPeriodModal && (
        <PayrollPeriodForm
          open
          onClose={() => {
            periodsHook.fetchData();
            setPayrollPeriodModal(false);
          }}
        />
      )}
    </>
  );
};
