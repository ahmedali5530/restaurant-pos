import {useEffect} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import type {Dayjs} from "dayjs";
import {WorkSchedule} from "@/api/model/work_schedule.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrDateTimeField, HrInputField} from "@/components/hr/shared/form-field.tsx";
import {dayjsToSurreal, firstFormError, toDayjsDateTime} from "@/components/hr/shared/form.utils.ts";
import {useDB} from "@/api/db/db.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {createSchedule, updateSchedule} from "@/lib/labor-engine/scheduling/schedule.service.ts";

interface FormValues {
  id?: string;
  name: string;
  period_start: Dayjs | null;
  period_end: Dayjs | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: WorkSchedule;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  name: yup.string().required("Required"),
  period_start: yup.mixed().nullable().required("Required"),
  period_end: yup.mixed().nullable().required("Required"),
}).required();

export const ScheduleForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const [page] = useAtom(appPage);

  const {register, handleSubmit, control, reset, formState: {errors}} = useForm<FormValues>({
    resolver: yupResolver(validationSchema) as never,
  });

  const closeModal = () => {
    onClose();
    reset({name: "", period_start: null, period_end: null, id: undefined});
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        name: data.name ?? "",
        period_start: toDayjsDateTime(data.period_start),
        period_end: toDayjsDateTime(data.period_end),
      });
    } else if (open) {
      reset({name: "", period_start: null, period_end: null, id: undefined});
    }
  }, [data, open, reset]);

  const onSubmit = async (values: FormValues) => {
    const periodStart = dayjsToSurreal(values.period_start);
    const periodEnd = dayjsToSurreal(values.period_end);
    if (!periodStart || !periodEnd) {
      toast.error(t("messages.requiredFields"));
      return;
    }

    try {
      if (values.id) {
        await updateSchedule(db, {
          scheduleId: values.id,
          name: values.name.trim(),
          periodStart,
          periodEnd,
          changedBy: page.user,
        });
      } else {
        await createSchedule(db, {
          name: values.name.trim(),
          periodStart,
          periodEnd,
          createdBy: page.user,
        });
      }

      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal title={data ? t("forms.schedule.update") : t("forms.schedule.create")} open={open} onClose={closeModal} size="lg">
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
              label={t("forms.schedule.name")}
              autoFocus
              error={errors.name?.message}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <HrDateTimeField
                label={t("forms.schedule.periodStart")}
                name="period_start"
                control={control}
                error={errors.period_start?.message}
              />
            </div>
            <div className="flex-1">
              <HrDateTimeField
                label={t("forms.schedule.periodEnd")}
                name="period_end"
                control={control}
                error={errors.period_end?.message}
              />
            </div>
          </div>
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
