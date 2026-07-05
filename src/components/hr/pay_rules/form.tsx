import {useEffect, useMemo} from "react";
import {useForm} from "react-hook-form";
import {useTranslation} from "react-i18next";
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {LaborPayRule} from "@/api/model/labor_pay_rule.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {HrCheckboxField, HrStringSelectField} from "@/components/hr/shared/form-field.tsx";
import {StackingMode} from "@/api/model/hr.types.ts";
import {enumLocaleKey, enumOptions, firstFormError} from "@/components/hr/shared/form.utils.ts";

const STACKING_MODES: StackingMode[] = ["allow", "prevent", "highest_wins", "priority"];

interface FormValues {
  id?: string;
  code: string;
  name: string;
  priority?: number;
  stacking_mode?: StackingMode;
  exclusive?: boolean;
  is_active?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: LaborPayRule;
}

const validationSchema = yup.object({
  id: yup.string().optional(),
  code: yup.string().required("Required"),
  name: yup.string().required("Required"),
  priority: yup.number().optional(),
  stacking_mode: yup.string().optional(),
  exclusive: yup.boolean().optional(),
  is_active: yup.boolean().optional(),
}).required();

export const PayRuleForm = ({open, onClose, data}: Props) => {
  const {t} = useTranslation("hr");
  const db = useDB();

  const stackingModeOptions = useMemo(
    () => enumOptions(t, STACKING_MODES, "stackingModes", enumLocaleKey),
    [t],
  );

  const {register, handleSubmit, control, formState: {errors}, reset} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {is_active: true, stacking_mode: "allow", exclusive: false, priority: 0},
  });

  const closeModal = () => {
    onClose();
    reset({
      code: "",
      name: "",
      priority: 0,
      stacking_mode: "allow",
      exclusive: false,
      is_active: true,
      id: undefined,
    });
  };

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        code: data.code ?? "",
        name: data.name ?? "",
        priority: data.priority ?? 0,
        stacking_mode: data.stacking_mode ?? "allow",
        exclusive: data.exclusive ?? false,
        is_active: data.is_active !== false,
      });
    } else if (open) {
      reset({
        code: "",
        name: "",
        priority: 0,
        stacking_mode: "allow",
        exclusive: false,
        is_active: true,
        id: undefined,
      });
    }
  }, [data, open, reset]);

  const onSubmit = async (values: FormValues) => {
    try {
      const payload = {
        code: values.code.trim(),
        name: values.name.trim(),
        priority: Number(values.priority ?? 0),
        stacking_mode: values.stacking_mode ?? "allow",
        exclusive: values.exclusive ?? false,
        is_active: values.is_active !== false,
      };

      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        await db.create(Tables.labor_pay_rules, payload);
      }

      toast.success(t("buttons.save"));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal title={data ? t("forms.payRule.update") : t("forms.payRule.create")} open={open} onClose={closeModal} size="lg">
      <form onSubmit={handleSubmit(onSubmit, (errs) => {
        const message = firstFormError(errs);
        if (message) toast.error(message);
      })}>
        {/*<input type="hidden" {...register("id")} />*/}
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input label={t("forms.payRule.code")} {...register("code")} autoFocus error={errors.code?.message}/>
            </div>
            <div className="flex-1">
              <Input label={t("forms.payRule.name")} {...register("name")} error={errors.name?.message}/>
            </div>
          </div>
          <div>
            <Input type="number" label={t("forms.payRule.priority")} {...register("priority", {valueAsNumber: true})}/>
          </div>
          <HrStringSelectField
            label={t("forms.payRule.stackingMode")}
            name="stacking_mode"
            control={control}
            options={stackingModeOptions}
            error={errors.stacking_mode?.message}
          />
          <HrCheckboxField
            label={t("forms.payRule.exclusive")}
            name="exclusive"
            control={control}
          />
          <HrCheckboxField
            label={t("forms.payRule.isActive")}
            name="is_active"
            control={control}
          />
        </div>
        <Button type="submit" variant="primary">{t("buttons.save")}</Button>
      </form>
    </Modal>
  );
};
