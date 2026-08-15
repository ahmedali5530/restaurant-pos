import {useEffect} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {DateValue} from "react-aria-components";
import {PublicHoliday} from "@/api/model/public_holiday.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrCheckboxField, HrDateField, HrInputField} from "@/components/hr/shared/form-field.tsx";
import {calendarDateToSurreal, toCalendarDateValue} from "@/components/hr/shared/form.utils.ts";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';

interface FormValues {
  id?: string;
  name: string;
  date: DateValue | null;
  country_code?: string;
  is_recurring?: boolean;
  is_active?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: PublicHoliday;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  name: yup.string().required("Required"),
  date: yup.mixed().nullable().required("Required"),
  country_code: yup.string().optional(),
  is_recurring: yup.boolean().optional(),
  is_active: yup.boolean().optional(),
}).required();

export const HolidayForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const {handleSubmit, control, reset, formState: {errors}} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {is_recurring: false, is_active: true},
  });

  const closeModal = () => {
    onClose();
    reset({name: "", date: null, country_code: "", is_recurring: false, is_active: true, id: undefined});
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        name: data.name ?? "",
        date: toCalendarDateValue(data.date),
        country_code: data.country_code ?? "",
        is_recurring: data.is_recurring ?? false,
        is_active: data.is_active !== false,
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        name: values.name.trim(),
        date: calendarDateToSurreal(values.date),
        country_code: values.country_code?.trim() || undefined,
        is_recurring: values.is_recurring ?? false,
        is_active: values.is_active !== false,
      };

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.public_holidays, payload);
      }

      await emitEntityCrudSave({
        domain: 'hr',
        table: Tables.public_holidays,
        entityId: data?.id ? String(data.id) : Tables.public_holidays,
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
    <Modal title={data ? t("forms.holiday.update") : t("forms.holiday.create")} testId="hr-form-holiday" open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div>
            <HrInputField
              name="name"
              control={control}
              label={t("forms.holiday.name")}
              autoFocus
              error={errors.name?.message}
            />
          </div>
          <HrDateField
            label={t("forms.holiday.date")}
            name="date"
            control={control}
            error={errors.date?.message}
          />
          <div>
            <HrInputField
              name="country_code"
              control={control}
              label={t("forms.holiday.countryCode")}
            />
          </div>
          <HrCheckboxField
            label={t("forms.holiday.isRecurring")}
            name="is_recurring"
            control={control}
          />
          <HrCheckboxField
            label={t("forms.holiday.isActive")}
            name="is_active"
            control={control}
          />
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
