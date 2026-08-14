import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Tables } from "@/api/db/tables.ts";
import { useState } from "react";
import { createColumnHelper } from "@tanstack/react-table";
import { Button } from "@/components/common/input/button.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";
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
import {useTranslation} from 'react-i18next';
import {getAccessRuleChildLabel} from "@/lib/access.rules.i18n.ts";

const AdminUsersList = () => {
  const { t } = useTranslation(['admin', 'common', 'toast']);
  const loadHook = useApi<SettingsData<User>>(Tables.users, ['deleted_at = none'], [], 0, 10, ["user_role", "user_shift"]);
  const db = useDB();
  const {protectAction} = useSecurity();

  const [data, setData] = useState<User>();
  const [formModal, setFormModal] = useState(false);

  const columnHelper = createColumnHelper<User>();

  const columns: any = [
    columnHelper.accessor("first_name", {
      header: t('columns.firstName')
    }),
    columnHelper.accessor("last_name", {
      header: t('columns.lastName')
    }),
    columnHelper.accessor("login", {
      header: t('columns.login')
    }),
    columnHelper.accessor("user_role", {
      header: t('columns.role'),
      enableColumnFilter: false,
      cell: info => {
        const role = info.getValue();
        return role ? <div className="flex gap-2 flex-wrap"><span className="tag mr-2">{role?.name}</span></div> : '-';
      }
    }),
    columnHelper.accessor("user_shift", {
      header: t('columns.shift'),
      enableColumnFilter: false,
      cell: info => {
        const shift = info.getValue();
        return shift ? <div className="flex gap-2 flex-wrap"><span className="tag mr-2">{shift.name} ({shiftDisplayTime(shift)})</span></div> : '-';
      }
    }),
    columnHelper.accessor("id", {
      id: "actions",
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        return (
          <div className="flex gap-3 items-center">
            <IconTooltipButton label={t('common:actions.edit')}
              variant="primary"
              onClick={() => {
                protectAction(() => {
                  setData(info.row.original);
                  setFormModal(true);
                }, {
                  module: 'admin.users.update',
                  description: getAccessRuleChildLabel('admin.users.update'),
                });
              }}
            ><FontAwesomeIcon icon={faPencil}/></IconTooltipButton>
            <div className="separator"></div>
            <DeleteConfirm
              message={t('delete.user', { name: `${info.row.original.first_name} ${info.row.original.last_name}` })}
              onConfirm={() => protectAction(() => deleteItem(info.row.original.id), {
                module: 'admin.users.delete',
                description: getAccessRuleChildLabel('admin.users.delete'),
              })}
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
      entityLabel: t('entities.user'),
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
            protectAction(() => {
              setData(undefined);
              setFormModal(true);
            }, {
              module: 'admin.users.create',
              description: getAccessRuleChildLabel('admin.users.create'),
            });
          }} icon={faPlus} data-testid="admin-add-users">{t('buttons.user')}</Button>
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

const USERS_TAB_MODULES = [
  'admin.users',
  'admin.roles',
  'admin.shifts',
  'admin.tips_definition',
] as const;

export const AdminUsers = () => {
  const [s, setS] = useState<(typeof USERS_TAB_MODULES)[number]>('admin.users');
  const {protectAction} = useSecurity();
  const { t } = useTranslation('admin');

  const tabTitles: Record<(typeof USERS_TAB_MODULES)[number], string> = {
    'admin.users': t('tabs.users'),
    'admin.roles': t('tabs.roles'),
    'admin.shifts': t('tabs.shifts'),
    'admin.tips_definition': t('tabs.tipsDefinition'),
  };

  return (
    <Tabs
      className="w-full flex flex-col"
      selectedKey={s}
      onSelectionChange={(k: string) => {
        protectAction(() => setS(k as (typeof USERS_TAB_MODULES)[number]), {
          module: k,
          description: t('tabs.accessTab', { title: tabTitles[k as (typeof USERS_TAB_MODULES)[number]] ?? k }),
        });
      }}
    >
      <TabList aria-label={t('users.manageTabs')} className="flex gap-3 p-3 bg-white border-b border-neutral-200" data-testid="admin-users-tabs">
        <Tab id="admin.users" data-testid="admin-users-tab-users">{t('tabs.users')}</Tab>
        <Tab id="admin.roles" data-testid="admin-users-tab-roles">{t('tabs.roles')}</Tab>
        <Tab id="admin.shifts" data-testid="admin-users-tab-shifts">{t('tabs.shifts')}</Tab>
        <Tab id="admin.tips_definition" data-testid="admin-users-tab-tips_definition">{t('tabs.tipsDefinition')}</Tab>
      </TabList>
      <TabPanel id="admin.users" className="bg-white">
        <AdminUsersList />
      </TabPanel>
      <TabPanel id="admin.roles" className="bg-white">
        <AdminUserRoles />
      </TabPanel>
      <TabPanel id="admin.shifts" className="bg-white">
        <AdminShifts />
      </TabPanel>
      <TabPanel id="admin.tips_definition" className="bg-white">
        <AdminTipDistribution />
      </TabPanel>
    </Tabs>
  );
};
