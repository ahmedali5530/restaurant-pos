import {FC, useEffect, useMemo, useState} from "react";
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
import {Account} from "@/api/model/account.ts";
import {LabelValue} from "@/api/model/common.ts";
import {AccountGroup} from "@/api/model/account.group.ts";
import {NORMAL_BALANCE_OPTIONS} from "@/components/accounts/account.constants.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";

interface CreateAccountProps {
  addModal: boolean;
  operation?: "create" | "update";
  entity?: Account;
  allAccounts: Account[];
  onClose?: () => void;
}

const ValidationSchema = yup.object({
  code: yup.string().required(i18n.t('validation:required')),
  name: yup.string().required(i18n.t('validation:required')),
  group: yup.object().required(i18n.t('validation:required')),
  normal_balance: yup.object().required(i18n.t('validation:required')),
  notes: yup.string().nullable().optional(),
  parent: yup.object().nullable().optional(),
}).required();

export const CreateAccount: FC<CreateAccountProps> = ({
  addModal,
  operation,
  entity,
  allAccounts,
  onClose,
}) => {
  const {t} = useTranslation('accounts');
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const db = useDB();

  const groupsHook = useApi<SettingsData<AccountGroup>>(
    Tables.account_groups,
    [],
    ["code ASC"],
    0,
    9999,
  );

  const {register, handleSubmit, control, reset, watch, setValue, formState: {errors}} = useForm({
    resolver: yupResolver(ValidationSchema),
  });

  const watchedGroup = watch("group") as LabelValue | null | undefined;

  useEffect(() => {
    setModal(addModal);
  }, [addModal]);

  useEffect(() => {
    const groups = groupsHook.data?.data || [];
    if (!entity) {
      reset({
        code: "",
        name: "",
        notes: "",
        group: groups[0] ? {
          label: `${groups[0].code} - ${groups[0].name} (${groups[0].head_type})`,
          value: groups[0].id.toString(),
        } : null,
        normal_balance: groups[0]
          ? NORMAL_BALANCE_OPTIONS.find((item) => item.value === groups[0].normal_balance)
          : NORMAL_BALANCE_OPTIONS[0],
        parent: null,
      });
      return;
    }

    reset({
      code: entity.code,
      name: entity.name,
      notes: entity.notes || "",
      group: entity.group ? {
        label: `${entity.group.code} - ${entity.group.name} (${entity.group.head_type})`,
        value: entity.group.id.toString(),
      } : null,
      normal_balance: NORMAL_BALANCE_OPTIONS.find((item) => item.value === entity.normal_balance),
      parent: entity.parent ? {
        label: `${entity.parent.code} - ${entity.parent.name}`,
        value: entity.parent.id.toString(),
      } : null,
    });
  }, [entity, reset, groupsHook.data?.data]);

  useEffect(() => {
    if (!watchedGroup?.value) {
      return;
    }
    const selected = (groupsHook.data?.data || []).find(
      (g) => g.id.toString() === watchedGroup.value
    );
    if (selected) {
      setValue(
        "normal_balance",
        NORMAL_BALANCE_OPTIONS.find((item) => item.value === selected.normal_balance)
      );
    }
  }, [watchedGroup?.value, groupsHook.data?.data, setValue]);

  const groupOptions = useMemo(() => {
    return (groupsHook.data?.data || []).map((item) => ({
      label: `${item.code} - ${item.name} (${item.head_type})`,
      value: item.id.toString(),
    }));
  }, [groupsHook.data?.data]);

  const parentOptions = useMemo(() => {
    return allAccounts
      .filter((item) => entity?.id ? item.id.toString() !== entity.id.toString() : true)
      .map((item) => ({
        label: `${item.code} - ${item.name}`,
        value: item.id.toString(),
      }));
  }, [allAccounts, entity?.id]);

  const onModalClose = () => {
    onClose?.();
  };

  const saveAccount = async (values: any) => {
    setSaving(true);
    try {
      const selectedGroup = (groupsHook.data?.data || []).find(
        (g) => g.id.toString() === values.group.value
      );

      const payload = {
        code: values.code,
        name: values.name,
        group: new StringRecordId(values.group.value),
        normal_balance: values.normal_balance.value,
        notes: values.notes || null,
        parent: values.parent ? new StringRecordId(values.parent.value) : null,
        account_type: selectedGroup?.head_type || null,
      };

      if (entity?.id) {
        await db.merge(new StringRecordId(entity.id.toString()), payload);
      } else {
        await db.insert(Tables.accounts, {
          ...payload,
          is_active: true,
        });
      }

      onModalClose();
    } catch (error: any) {
      toast.error(error?.message || t('messages.saveAccountFailed'));
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
      title={operation === "update" ? t('forms.updateAccount') : t('forms.createAccount')}
    >
      <form onSubmit={handleSubmit(saveAccount)} className="mb-5">
        <div className="grid grid-cols-1 gap-4 mb-3">
          <div>
            <Input {...register("code")} id="account_code" className="w-full" label={t('columns.code')} error={errors.code?.message}/>
          </div>
          <div>
            <Input {...register("name")} id="account_name" className="w-full" label={t('columns.name')} error={errors.name?.message}/>
          </div>
          <div>
            <label htmlFor="account_group">{t('columns.group')}</label>
            <Controller
              name="group"
              control={control}
              render={({field}) => (
                <ReactSelect
                  {...field}
                  options={groupOptions}
                  className={errors.group ? "rs-__error" : ""}
                  placeholder={groupOptions.length ? t('forms.selectGroup') : t('forms.createGroupFirst')}
                />
              )}
            />
            {errors.group && (
              <div className="text-danger-500 text-sm">{errors.group.message as string}</div>
            )}
            {groupOptions.length === 0 && (
              <p className="text-warning-700 text-sm mt-1">{t('forms.createGroupsBeforeAccounts')}</p>
            )}
          </div>
          <div>
            <label htmlFor="normal_balance">{t('forms.normalBalance')}</label>
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
            <label htmlFor="parent_account">{t('forms.parentAccount')}</label>
            <Controller
              name="parent"
              control={control}
              render={({field}) => (
                <ReactSelect
                  {...field}
                  isClearable={true}
                  options={parentOptions}
                  className={errors.parent ? "rs-__error" : ""}
                />
              )}
            />
          </div>
          <div>
            <Input {...register("notes")} id="account_notes" className="w-full" label={t('forms.notes')}/>
          </div>
          <div>
            <Button variant="primary" type="submit" disabled={saving || groupOptions.length === 0}>
              {saving ? t('forms.saving') : operation === "update" ? t('forms.updateAccountBtn') : t('forms.createAccountBtn')}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
