import {useEffect} from "react";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {CostCenter} from "@/api/model/cost_center.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrCheckboxField, HrInputField} from "@/components/hr/shared/form-field.tsx";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';

interface FormValues {
  id?: string;
  code: string;
  name: string;
  description?: string;
  is_active?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: CostCenter;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  code: yup.string().required("Required"),
  name: yup.string().required("Required"),
  description: yup.string().optional(),
  is_active: yup.boolean().optional(),
}).required();

export const CostCenterForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const {handleSubmit, control, formState: {errors}, reset} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {is_active: true},
  });

  const closeModal = () => {
    onClose();
    reset({code: "", name: "", description: "", is_active: true, id: undefined});
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        code: data.code ?? "",
        name: data.name ?? "",
        description: data.description ?? "",
        is_active: data.is_active !== false,
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        is_active: values.is_active !== false,
      };

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.cost_centers, payload);
      }

      await emitEntityCrudSave({
        domain: 'hr',
        table: Tables.cost_centers,
        entityId: data?.id ? String(data.id) : Tables.cost_centers,
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
    <Modal title={data ? t("forms.costCenter.update") : t("forms.costCenter.create")} open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit)}>
        {/*<input type="hidden" {...register("id")} />*/}
        <div className="flex flex-col gap-3 mb-3">
          <div>
            <HrInputField
              name="code"
              control={control}
              label={t("forms.costCenter.code")}
              autoFocus
              error={errors.code?.message}
            />
          </div>
          <div>
            <HrInputField
              name="name"
              control={control}
              label={t("forms.costCenter.name")}
              error={errors.name?.message}
            />
          </div>
          <div>
            <HrInputField
              name="description"
              control={control}
              label={t("forms.costCenter.description")}
            />
          </div>
          <HrCheckboxField
            label={t("forms.costCenter.isActive")}
            name="is_active"
            control={control}
          />
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
