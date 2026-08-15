import { Modal } from "@/components/common/react-aria/modal.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { Checkbox } from "@/components/common/input/checkbox.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect, useRef, useState } from "react";
import { User } from "@/api/model/user.ts";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { UserRole } from "@/api/model/user_role.ts";
import { Shift } from "@/api/model/shift.ts";
import { StringRecordId } from "surrealdb";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import _ from "lodash";
import {
  createLinkedEmployee,
  extractFirstRecord,
  generateEmployeeNumber,
} from "@/lib/labor-engine/employee.resolver.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { UserRoleForm } from "@/components/settings/users/roles/role.form.tsx";
import { ShiftForm } from "@/components/settings/users/shifts/shift.form.tsx";

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
  }).nullable().default(null),
  create_employee: yup.boolean().default(true),
  employee_number: yup.string().when('create_employee', {
    is: true,
    then: (schema) => schema.required(i18n.t('validation:required')),
    otherwise: (schema) => schema.nullable(),
  }),
});

export const UserForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const { control, handleSubmit, formState: { errors }, reset, watch, setValue, getValues } = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      login_method: {
        label: "Pin",
        value: "pin",
      },
      create_employee: true,
      employee_number: '',
    },
  });

  const lastAutoEmployeeNumber = useRef('');
  const login = watch('login');
  const createEmployee = watch('create_employee');
  const isCreateMode = !data;

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
      user_shift: null,
      create_employee: true,
      employee_number: '',
    });
    lastAutoEmployeeNumber.current = '';
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
        password: null,
        create_employee: false,
        employee_number: '',
      });
    }
  }, [data, reset]);

  useEffect(() => {
    if (!isCreateMode || !createEmployee || !login) {
      return;
    }

    const current = getValues('employee_number');
    if (current && current !== lastAutoEmployeeNumber.current) {
      return;
    }

    const next = generateEmployeeNumber(login);
    setValue('employee_number', next);
    lastAutoEmployeeNumber.current = next;
  }, [login, createEmployee, isCreateMode, setValue, getValues]);

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

    const displayName = `${values.first_name} ${values.last_name}`;

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

        closeModal();
        toast.success(t('toast:admin.userSaved', { name: displayName }));
      } else {
        const userParams = {
          first_name: vals.first_name,
          last_name: vals.last_name,
          login: vals.login,
          login_method: vals.login_method,
          password: vals.password,
          roles: vals.roles,
          user_role: vals.user_role,
          user_shift: vals.user_shift,
        };

        const result = await db.query(
          `INSERT INTO user (first_name, last_name, login, login_method, password, roles, user_role, user_shift) VALUES ($first_name, $last_name, $login, $login_method, crypto::bcrypt::generate($password), $roles, $user_role, $user_shift) RETURN AFTER`,
          userParams,
        );
        const createdUser = extractFirstRecord<User>(result);
        const userId = recordIdToString(createdUser?.id ?? createdUser);

        if (values.create_employee) {
          if (!userId) {
            closeModal();
            toast.error(t('toast:admin.employeeLinkFailed'));
            toast.success(t('toast:admin.userSaved', { name: displayName }));
            return;
          }

          try {
            await createLinkedEmployee(db, {
              userId,
              employeeNumber: values.employee_number,
              first_name: values.first_name,
              last_name: values.last_name,
            });
            closeModal();
            toast.success(t('toast:admin.userAndEmployeeSaved', { name: displayName }));
          } catch (employeeError) {
            closeModal();
            toast.error(employeeError instanceof Error ? employeeError.message : String(employeeError));
            toast.success(t('toast:admin.userSaved', { name: displayName }));
          }
        } else {
          closeModal();
          toast.success(t('toast:admin.userSaved', { name: displayName }));
        }
      }
    } catch ( e ) {
      toast.error(e instanceof Error ? e.message : String(e));
      console.log(e)
    }
  }

  useEffect(() => {
    if (open) {
      fetchRoles();
      fetchShifts();
    }
  }, [open, fetchRoles, fetchShifts]);

  const [roleModal, setRoleModal] = useState(false);
  const [shiftModal, setShiftModal] = useState(false);

  return (
    <>
      <Modal
        testId="admin-form-user"
        title={data ? t('forms.updateUser', { name: `${data?.first_name} ${data?.last_name}` }) : t('forms.createUser')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 flex-col mb-3">
            <div className="flex-1">
              <InputField name="first_name" control={control} label={t('columns.firstName')} autoFocus error={errors?.first_name?.message}/>
            </div>
            <div className="flex-1">
              <InputField name="last_name" control={control} label={t('columns.lastName')} error={errors?.last_name?.message}/>
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
              <InputField name="login" control={control} label={isPinLogin ? "Pin" : "Username"} error={errors?.login?.message}/>
            </div>
            {!isPinLogin && (
              <div className="flex-1">
                <InputField type="password" name="password" control={control} label={t('forms.password')} error={errors?.password?.message}/>
              </div>
            )}
            <div className="flex gap-2 items-end">
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
              <IconTooltipButton label={t('common:actions.add')} type="button" variant="primary" onClick={() => setRoleModal(true)}><FontAwesomeIcon icon={faPlus}/></IconTooltipButton>
            </div>
            <div className="flex gap-2 items-end">
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
              <IconTooltipButton label={t('common:actions.add')} type="button" variant="primary" onClick={() => setShiftModal(true)}><FontAwesomeIcon icon={faPlus}/></IconTooltipButton>
            </div>

            {isCreateMode && (
              <div className="flex flex-col gap-3 pt-2 border-t border-neutral-200">
                <Controller
                  name="create_employee"
                  control={control}
                  render={({field}) => (
                    <Checkbox
                      label={t('forms.createEmployeeToo')}
                      checked={field.value}
                      onChange={(e) => field.onChange(e.currentTarget.checked)}
                    />
                  )}
                />
                {createEmployee && (
                  <>
                    <p className="text-sm text-neutral-500">{t('forms.createEmployeeHint')}</p>
                    <InputField
                      name="employee_number"
                      control={control}
                      label={t('forms.employeeNumber')}
                      error={errors?.employee_number?.message}
                    />
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
          </div>
        </form>
      </Modal>

      {roleModal && (
        <UserRoleForm
          open={true}
          onClose={() => {
            fetchRoles();
            setRoleModal(false);
          }}
        />
      )}
      {shiftModal && (
        <ShiftForm
          open={true}
          onClose={() => {
            fetchShifts();
            setShiftModal(false);
          }}
        />
      )}
    </>
  )
}
