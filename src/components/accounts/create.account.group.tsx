import {FC, useEffect, useState} from "react";
import {Controller, useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import * as yup from "yup";
import {StringRecordId} from "surrealdb";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import i18n from "@/lib/i18n.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {AccountGroup} from "@/api/model/account.group.ts";
import {LabelValue} from "@/api/model/common.ts";
import {
  defaultNormalBalanceForHead,
  HEAD_TYPE_OPTIONS,
  NORMAL_BALANCE_OPTIONS,
} from "@/components/accounts/account.constants.ts";
import type {AccountHeadType} from "@/api/model/account.ts";

interface CreateAccountGroupProps {
  addModal: boolean;
  operation?: "create" | "update";
  entity?: AccountGroup;
  onClose?: () => void;
}

const ValidationSchema = yup.object({
  code: yup.string().required(i18n.t('validation:required')),
  name: yup.string().required(i18n.t('validation:required')),
  head_type: yup.object().required(i18n.t('validation:required')),
  normal_balance: yup.object().required(i18n.t('validation:required')),
  notes: yup.string().nullable().optional(),
}).required();

export const CreateAccountGroup: FC<CreateAccountGroupProps> = ({
  addModal,
  operation,
  entity,
  onClose,
}) => {
  const {t} = useTranslation('accounts');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const db = useDB();

  const {register, handleSubmit, control, reset, watch, setValue, formState: {errors}} = useForm({
    resolver: yupResolver(ValidationSchema),
  });

  const watchedHeadType = watch("head_type") as LabelValue | undefined;

  useEffect(() => {
    setModal(addModal);
  }, [addModal]);

  useEffect(() => {
    if (!entity) {
      reset({
        code: "",
        name: "",
        notes: "",
        head_type: HEAD_TYPE_OPTIONS[0],
        normal_balance: NORMAL_BALANCE_OPTIONS[0],
      });
      return;
    }

    reset({
      code: entity.code,
      name: entity.name,
      notes: entity.notes || "",
      head_type: HEAD_TYPE_OPTIONS.find((item) => item.value === entity.head_type),
      normal_balance: NORMAL_BALANCE_OPTIONS.find((item) => item.value === entity.normal_balance),
    });
  }, [entity, reset]);

  useEffect(() => {
    if (!watchedHeadType?.value || operation === "update") {
      return;
    }
    const defaultBalance = defaultNormalBalanceForHead(watchedHeadType.value as AccountHeadType);
    setValue(
      "normal_balance",
      NORMAL_BALANCE_OPTIONS.find((item) => item.value === defaultBalance)
    );
  }, [watchedHeadType?.value, operation, setValue]);

  const onModalClose = () => {
    onClose?.();
  };

  const saveGroup = async (values: any) => {
    setSaving(true);
    try {
      const payload = {
        code: values.code,
        name: values.name,
        head_type: values.head_type.value,
        normal_balance: values.normal_balance.value,
        notes: values.notes || null,
      };

      if (entity?.id) {
        await db.merge(new StringRecordId(entity.id.toString()), payload);
      } else {
        await db.insert(Tables.account_groups, {
          ...payload,
          is_active: true,
        });
      }

      onModalClose();
    } catch (error: any) {
      toast.error(error?.message || t('messages.saveGroupFailed'));
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={modal}
      onClose={onModalClose}
      size="sm"
      title={operation === "update" ? t('forms.updateAccountGroup') : t('forms.createAccountGroup')}
    >
      <form onSubmit={handleSubmit(saveGroup)} className="mb-5">
        <div className="grid grid-cols-1 gap-4 mb-3">
          <div>
            <Input {...register("code")} id="group_code" className="w-full" label={t('columns.code')} error={errors.code?.message}/>
          </div>
          <div>
            <Input {...register("name")} id="group_name" className="w-full" label={t('columns.name')} error={errors.name?.message}/>
          </div>
          <div>
            <label htmlFor="head_type">{t('columns.mainHead')}</label>
            <Controller
              name="head_type"
              control={control}
              render={({field}) => (
                <ReactSelect
                  {...field}
                  options={HEAD_TYPE_OPTIONS}
                  className={errors.head_type ? "rs-__error" : ""}
                />
              )}
            />
            {errors.head_type && (
              <div className="text-danger-500 text-sm">{errors.head_type.message as string}</div>
            )}
          </div>
          <div>
            <label htmlFor="group_normal_balance">{t('forms.normalBalance')}</label>
            <Controller
              name="normal_balance"
              control={control}
              render={({field}) => (
                <ReactSelect
                  {...field}
                  options={NORMAL_BALANCE_OPTIONS}
                  className={errors.normal_balance ? "rs-__error" : ""}
                />
              )}
            />
            {errors.normal_balance && (
              <div className="text-danger-500 text-sm">{errors.normal_balance.message as string}</div>
            )}
          </div>
          <div>
            <Input {...register("notes")} id="group_notes" className="w-full" label={t('forms.notes')}/>
          </div>
          <div>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? t('forms.saving') : operation === "update" ? t('forms.updateGroup') : t('forms.createGroup')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
