import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPencil, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TableComponent } from "@/components/common/table/table.tsx";
import { User } from "@/api/model/user.ts";
import { UserForm } from "@/components/settings/users/user.form.tsx";
import { TabList, Tabs } from "react-aria-components";
import { Tab, TabPanel } from "@/components/common/react-aria/tabs";
import { AdminUserRoles } from "@/components/settings/users/roles";
import { AdminShifts } from "@/components/settings/users/shifts";
import { shiftDisplayTime } from "@/lib/shift.utils.ts";
import { AdminTipDistribution } from "@/components/settings/users/tip_distribution";
import {useSecurity} from "@/hooks/useSecurity.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {useDB} from "@/api/db/db.ts";
import {executeSettingsDelete} from "@/lib/settings-delete.service.ts";

const AdminUsersList = () => {
  const loadHook = useApi<SettingsData<User>>(Tables.users, ['deleted_at = none'], [], 0, 10, ["user_role", "user_shift"]);
  const db = useDB();

  const [data, setData] = useState<User>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<User>();

  const columns: any = [
    columnHelper.accessor("first_name", {
      header: 'First name'
    }),
    columnHelper.accessor("last_name", {
      header: 'Last name'
    }),
    columnHelper.accessor("login", {
      header: 'Login'
    }),
    columnHelper.accessor("user_role", {
      header: 'Role',
      enableColumnFilter: false,
      cell: info => {
        const role = info.getValue();
        return role ? <div className="flex gap-2 flex-wrap"><span className="tag mr-2">{role?.name}</span></div> : '-';
      }
    }),
    columnHelper.accessor("user_shift", {
      header: 'Shift',
      enableColumnFilter: false,
      cell: info => {
        const shift = info.getValue();
        return shift ? <div className="flex gap-2 flex-wrap"><span className="tag mr-2">{shift.name} ({shiftDisplayTime(shift)})</span></div> : '-';
      }
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-3 items-center">
            <Button
              variant="primary"
              onClick={() => {
                setData(info.row.original);
                setFormModal(true);
              }}
            ><FontAwesomeIcon icon={faPencil}/></Button>
            <div className="separator"></div>
            <DeleteConfirm
              message={`Delete user ${info.row.original.first_name} ${info.row.original.last_name}`}
              onConfirm={() => deleteItem(info.row.original.id)}
            />
          </div>
        );
      },
    }),
  ];

  const deleteItem = async (id: string) => {
    await executeSettingsDelete({
      db,
      id,
      entityLabel: 'User',
      usageChecks: [
        {
          query: `SELECT count() AS count FROM ${Tables.orders} WHERE user = $idRecord OR cashier = $idRecord GROUP ALL`
        },
        {
          query: `SELECT count() AS count FROM ${Tables.time_entries} WHERE user = $idRecord GROUP ALL`
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
          <Button variant="primary" onClick={() => {
            setFormModal(true);
          }} icon={faPlus}> User</Button>
        ]}
      />

      <UserForm
        open={formModal}
        data={data}
        onClose={() => {
          setFormModal(false);
          setData(undefined);
          loadHook.fetchData();
        }}
      />
    </>
  )
}

export const AdminUsers = () => {
  const [s, setS] = useState('Users');
  const {protectAction} = useSecurity();

  return (
    <Tabs
      className="w-full flex flex-col"
      selectedKey={s}
      onSelectionChange={(k: string) => {
        protectAction(() => setS(k), {
          module: k,
          description: `Access ${k}`,
        });
      }}
    >
      <TabList aria-label="Manage users tabs" className="flex gap-3 p-3 bg-white border-b border-neutral-200">
        <Tab id="Users">Users</Tab>
        <Tab id="Roles">Roles</Tab>
        <Tab id="Shifts">Shifts</Tab>
        <Tab id="Tips definition">Tips definition</Tab>
      </TabList>
      <TabPanel id="Users" className="bg-white">
        <AdminUsersList />
      </TabPanel>
      <TabPanel id="Roles" className="bg-white">
        <AdminUserRoles />
      </TabPanel>
      <TabPanel id="Shifts" className="bg-white">
        <AdminShifts />
      </TabPanel>
      <TabPanel id="Tips definition" className="bg-white">
        <AdminTipDistribution />
      </TabPanel>
    </Tabs>
  );
};
