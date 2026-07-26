import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { UserRole } from "@/api/model/user_role.ts";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
import { TableComponent } from "@/components/common/table/table.tsx";
import { UserRoleForm } from "@/components/settings/users/roles/role.form.tsx";
import { RoleModulesModal } from "@/components/settings/users/roles/role.modules.modal.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";

export const AdminUserRoles = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<UserRole>>(Tables.user_roles, ["deleted_at = none"], ["name asc"]);
  const db = useDB();
  const { protectAction } = useSecurity();
  const [data, setData] = useState<UserRole>();
  const [formModal, setFormModal] = useState(false);
  const [modulesRole, setModulesRole] = useState<UserRole>();

  const columnHelper = createColumnHelper<UserRole>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name'),
    }),
    columnHelper.accessor("roles", {
      header: t('columns.modules'),
      enableColumnFilter: false,
      enableSorting: false,
      cell: (info) => {
        const count = info.getValue()?.length ?? 0;
        return (
          <Button
            variant="primary"
            size="sm"
            flat
            icon={faEye}
            disabled={count === 0}
            onClick={() => setModulesRole(info.row.original)}
          >
            {t('forms.moduleCount', { count })}
          </Button>
        );
      },
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <div className="flex gap-3 items-center">
          <IconTooltipButton label={t('common:actions.edit')}
            variant="primary"
            onClick={() => {
              protectAction(() => {
                setData(info.row.original);
                setFormModal(true);
              }, {
                module: 'admin.roles.update',
                description: getAccessRuleChildLabel('admin.roles.update'),
              });
            }}
          ><FontAwesomeIcon icon={faPencil} /></IconTooltipButton>
          <div className="separator"></div>
          <DeleteConfirm
            message={t('delete.role', { name: info.row.original.name })}
            onConfirm={() => protectAction(() => deleteItem(info.row.original.id), {
              module: 'admin.roles.delete',
              description: getAccessRuleChildLabel('admin.roles.delete'),
            })}
          />
        </div>
      ),
    }),
  ];

  const deleteItem = async (id: string) => {
    await executeSettingsDelete({
      db,
      id,
      entityLabel: t('entities.role'),
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.users} WHERE user_role = $idRecord GROUP ALL`
        }
      ],
      onAfter: async () => {
        loadHook.fetchData();
      }
    });
  };

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={loadHook}
        loaderLineItems={columns.length}
        buttons={[
          <Button
            variant="primary"
            onClick={() => {
              protectAction(() => {
                setData(undefined);
                setFormModal(true);
              }, {
                module: 'admin.roles.create',
                description: getAccessRuleChildLabel('admin.roles.create'),
              });
            }}
            icon={faPlus}
          >
            Role
          </Button>,
        ]}
      />
      <UserRoleForm
        open={formModal}
        data={data}
        onClose={() => {
          setFormModal(false);
          setData(undefined);
          loadHook.fetchData();
        }}
      />
      <RoleModulesModal
        open={!!modulesRole}
        roleName={modulesRole?.name ?? ""}
        modules={modulesRole?.roles ?? []}
        onClose={() => setModulesRole(undefined)}
      />
    </>
  );
};
