import {useEffect, useMemo, useState} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {Position} from "@/api/model/position.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Department} from "@/api/model/department.ts";
import {CostCenter} from "@/api/model/cost_center.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrCheckboxField, HrInputField, HrSelectField} from "@/components/hr/shared/form-field.tsx";
import {SelectOption, toRecordId, toSelectOption} from "@/components/hr/shared/form.utils.ts";
import {DepartmentForm} from "@/components/hr/departments/form.tsx";
import {CostCenterForm} from "@/components/hr/cost_centers/form.tsx";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';

interface FormValues {
  id?: string;
  code: string;
  name: string;
  department?: SelectOption | null;
  default_cost_center?: SelectOption | null;
  is_active?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: Position;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  code: yup.string().required("Required"),
  name: yup.string().required("Required"),
  department: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().optional(),
  default_cost_center: yup.object({label: yup.string().required(), value: yup.string().required()}).nullable().optional(),
  is_active: yup.boolean().optional(),
}).required();

export const PositionForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();
  const departmentsHook = useApi<SettingsData<Department>>(Tables.departments, [], [], 0, 500, []);
  const costCentersHook = useApi<SettingsData<CostCenter>>(Tables.cost_centers, [], [], 0, 500, []);

  const {handleSubmit, control, formState: {errors}, reset} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {is_active: true},
  });

  const departmentOptions = useMemo(
    () => (departmentsHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [departmentsHook.data?.data],
  );

  const costCenterOptions = useMemo(
    () => (costCentersHook.data?.data ?? []).map((item) => toSelectOption(item)).filter(Boolean) as SelectOption[],
    [costCentersHook.data?.data],
  );

  const closeModal = () => {
    onClose();
    reset({code: "", name: "", department: null, default_cost_center: null, is_active: true, id: undefined});
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        code: data.code ?? "",
        name: data.name ?? "",
        department: toSelectOption(data.department),
        default_cost_center: toSelectOption(data.default_cost_center),
        is_active: data.is_active !== false,
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        department: toRecordId(values.department?.value) ?? null,
        default_cost_center: toRecordId(values.default_cost_center?.value) ?? null,
        is_active: values.is_active !== false,
      };

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.positions, payload);
      }

      await emitEntityCrudSave({
        domain: 'hr',
        table: Tables.positions,
        entityId: data?.id ? String(data.id) : Tables.positions,
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
  const [costCenterModal, setCostCenterModal] = useState(false);

  return (
    <>
      <Modal title={data ? t("forms.position.update") : t("forms.position.create")} open={open} onClose={closeModal} size="lg">
        <form onSubmit={handleSubmit(onSubmit)}>
          {/*<input type="hidden" {...register("id")} />*/}
          <div className="flex flex-col gap-3 mb-3">
            <div>
              <HrInputField
                name="code"
                control={control}
                label={t("forms.position.code")}
                autoFocus
                error={errors.code?.message}
              />
            </div>
            <div>
              <HrInputField
                name="name"
                control={control}
                label={t("forms.position.name")}
                error={errors.name?.message}
              />
            </div>
            <HrSelectField
              label={t("forms.position.department")}
              name="department"
              control={control}
              options={departmentOptions}
              error={errors.department?.message}
              onAdd={() => setDepartmentModal(true)}
            />
            <HrSelectField
              label={t("forms.position.defaultCostCenter")}
              name="default_cost_center"
              control={control}
              options={costCenterOptions}
              error={errors.default_cost_center?.message}
              onAdd={() => setCostCenterModal(true)}
            />
            <HrCheckboxField
              label={t("forms.position.isActive")}
              name="is_active"
              control={control}
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
