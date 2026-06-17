import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useMemo,  useEffect  } from "react";
import { User } from "@/api/model/user.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { UserRole } from "@/api/model/user_role.ts";
import { Shift } from "@/api/model/shift.ts";
import { StringRecordId } from "surrealdb";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import _ from "lodash";

interface Props {
  open: boolean
  onClose: () => void;
  data?: User
}

const validationSchema = yup.object({
  login_method: yup.object({
    label: yup.string().required(),
    value: yup.string().required(),
  }).required(i18n.t('validation:required')),
  first_name: yup.string().required(i18n.t('validation:required')),
  last_name: yup.string().required(i18n.t('validation:required')),
  login: yup
    .string()
    .required(i18n.t('validation:required'))
    .when("login_method.value", {
      is: "pin",
      then: (schema) =>
        schema.matches(/^\d{4}$/, "PIN must be exactly 4 digits only."),
    }),
  password: yup.string().nullable(),
  user_role: yup.object({
    label: yup.string(),
    value: yup.string(),
  }).nullable().required('This is required'),
  user_shift: yup.object({
    label: yup.string(),
    value: yup.string(),
  }).nullable().default(null)
});

export const UserForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const { register, control, handleSubmit, formState: { errors }, reset, watch } = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      login_method: {
        label: "Pin",
        value: "pin",
      },
    },
  });

  const closeModal = () => {
    onClose();
    reset({
      login_method: {
        label: "Pin",
        value: "pin",
      },
      first_name: null,
      last_name: null,
      login: null,
      password: null,
      user_role: null,
      user_shift: null
    });
  }

  useEffect(() => {
    if( data ) {
      reset({
        ...data,
        login_method: {
          label: ((data.login_method || "pin") === "form" ? "Form" : "Pin"),
          value: (data.login_method || "pin"),
        },
        first_name: data.first_name,
        last_name: data.last_name,
        login: data.login,
        user_role: data?.user_role ? {
          label: data.user_role.name,
          value: data.user_role.id,
        } : null,
        user_shift: (data as any)?.user_shift ? {
          label: (data as any)?.user_shift?.name,
          value: (data as any)?.user_shift?.id,
        } : null,
        password: null
      });
    }
  }, [data, reset]);

  const db = useDB();
  const {
    data: roleData,
    fetchData: fetchRoles,
  } = useApi<SettingsData<UserRole>>(Tables.user_roles, [], ["name asc"], 0, 99999, [], {
    enabled: false,
  });
  const {
    data: shiftData,
    fetchData: fetchShifts,
  } = useApi<SettingsData<Shift>>(Tables.shifts, [], ["name asc"], 0, 99999, [], {
    enabled: false,
  });
  const selectedLoginMethod = watch("login_method");
  const isPinLogin = selectedLoginMethod?.value !== "form";

  const onSubmit = async (values: any) => {
    const vals = { ...values };
    const selectedRoleId = values.user_role?.value;
    const selectedRole = (roleData?.data || []).find((item) => item.id === selectedRoleId);
    const selectedRoleModules = _.uniq(selectedRole?.roles || []);

    vals.user_role = selectedRoleId ? new StringRecordId(selectedRoleId) : null;
    vals.roles = selectedRoleModules;
    vals.user_shift = values.user_shift?.value ? new StringRecordId(values.user_shift.value) : null;
    vals.login_method = values.login_method.value;

    if (vals.login_method === "pin") {
      vals.password = vals.login;
    }

    if(vals.login_method === "form" && !vals.id && !vals.password){
      toast.error(t('toast:admin.passwordRequired'));
      return;
    }

    try {
      if( data?.id ) {
        if (vals.login_method === "pin") {
          await db.query(`UPDATE ${data.id} set first_name = $first_name, last_name = $last_name, login = $login, login_method = $login_method, password = crypto::bcrypt::generate($password), roles = $roles, user_role = $user_role, user_shift = $user_shift`, {
            ...vals
          });
        } else if (vals.password) {
          await db.query(`UPDATE ${data.id} set first_name = $first_name, last_name = $last_name, login = $login, login_method = $login_method, password = crypto::bcrypt::generate($password), roles = $roles, user_role = $user_role, user_shift = $user_shift`, {
            ...vals
          });
        } else {
          await db.query(`UPDATE ${data.id} set first_name = $first_name, last_name = $last_name, login = $login, login_method = $login_method, roles = $roles, user_role = $user_role, user_shift = $user_shift`, {
            ...vals
          });
        }
      } else {
        await db.query(`INSERT INTO user (first_name, last_name, login, login_method, password, roles, user_role, user_shift) values ($first_name, $last_name, $login, $login_method, crypto::bcrypt::generate($password), $roles, $user_role, $user_shift)`, {
          ...vals
        });
      }

      closeModal();
      toast.success(t('toast:admin.userSaved', { name: `${values.first_name} ${values.last_name}` }));
    } catch ( e ) {
      toast.error(e);
      console.log(e)
    }
  }

  useEffect(() => {
    if (open) {
      fetchRoles();
      fetchShifts();
    }
  }, [open, fetchRoles, fetchShifts]);

  console.log(errors);

  return (
    <>
      <Modal
        title={data ? t('forms.updateUser', { name: `${data?.first_name} ${data?.last_name}` }) : t('forms.createUser')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 flex-col mb-3">
            <div className="flex-1">
              <Input label={t('columns.firstName')} {...register('first_name')} autoFocus error={errors?.first_name?.message}/>
            </div>
            <div className="flex-1">
              <Input label={t('columns.lastName')} {...register('last_name')} error={errors?.last_name?.message}/>
            </div>
            <div className="flex-1">
              <label htmlFor="login_method">Login method</label>
              <Controller
                name="login_method"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { label: "Pin", value: "pin" },
                      { label: "Form", value: "form" },
                    ]}
                  />
                )}
              />
            </div>
            <div className="flex-1">
              <Input label={isPinLogin ? "Pin" : "Username"} {...register('login')} error={errors?.login?.message}/>
            </div>
            {!isPinLogin && (
              <div className="flex-1">
                <Input type="password" label={t('forms.password')} {...register('password')} error={errors?.password?.message}/>
              </div>
            )}
            <div className="flex-1">
              <label htmlFor="user_role">Role</label>
              <Controller
                name="user_role"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={(roleData?.data || []).map(item => ({
                      label: item.name,
                      value: item.id
                    }))}
                  />
                )}
              />
              <span className="text-danger-600 text-sm">{errors?.user_role?.message as string}</span>
            </div>
            <div className="flex-1">
              <label htmlFor="user_shift">Shift</label>
              <Controller
                name="user_shift"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={(shiftData?.data || []).map(item => ({
                      label: item.name,
                      value: item.id
                    }))}
                    isClearable
                  />
                )}
              />
            </div>
          </div>

          <div>
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
