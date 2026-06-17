import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { UserRole } from "@/api/model/user_role.ts";
import { Button } from "@/components/common/input/button.tsx";
import { TableComponent } from "@/components/common/table/table.tsx";
import { UserRoleForm } from "@/components/settings/users/roles/role.form.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {useTranslation} from 'react-i18next';
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

export const AdminUserRoles = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<UserRole>>(Tables.user_roles, ["deleted_at = none"], ["name asc"]);
  const db = useDB();
  const [data, setData] = useState<UserRole>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<UserRole>();

  const columns: any = [
    columnHelper.accessor("name", {
      header: t('columns.name'),
    }),
    columnHelper.accessor("roles", {
      header: t('columns.modules'),
      enableColumnFilter: false,
      cell: (info) => (
        <div className="flex gap-2 flex-wrap">
          {info.getValue()?.map((item, index) => (
            <span className="tag" key={`${item}-${index}`}>{item}</span>
          ))}
        </div>
      ),
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => (
        <div className="flex gap-3 items-center">
          <Button
            variant="primary"
            onClick={() => {
              setData(info.row.original);
              setFormModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPencil} />
          </Button>
          <div className="separator"></div>
          <DeleteConfirm
            message={t('delete.role', { name: info.row.original.name })}
            onConfirm={() => deleteItem(info.row.original.id)}
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
              setFormModal(true);
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
    </>
  );
};
