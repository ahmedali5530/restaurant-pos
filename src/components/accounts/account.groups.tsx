import {useMemo, useState} from "react";
import {createColumnHelper} from "@tanstack/react-table";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencilAlt, faPlus} from "@fortawesome/free-solid-svg-icons";
import {StringRecordId} from "surrealdb";
import {useTranslation} from "react-i18next";
import {Button} from "@/components/common/input/button.tsx";
import {TableComponent} from "@/components/common/table/table.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {AccountGroup} from "@/api/model/account.group.ts";
import {CreateAccountGroup} from "@/components/accounts/create.account.group.tsx";

export const AccountGroups = () => {
  const {t} = useTranslation('accounts');
  const db = useDB();
  const [modal, setModal] = useState(false);
  const [operation, setOperation] = useState<"create" | "update">("create");
  const [group, setGroup] = useState<AccountGroup>();

  const groupListHook = useApi<SettingsData<AccountGroup>>(
    Tables.account_groups,
    [],
    ["code ASC"],
    0,
    25,
  );

  const columnHelper = createColumnHelper<AccountGroup>();

  const columns = useMemo(() => [
    columnHelper.accessor("code", {header: t('columns.code')}),
    columnHelper.accessor("name", {header: t('columns.name')}),
    columnHelper.accessor("head_type", {
      header: t('columns.mainHead'),
      cell: (info) => info.getValue()?.toUpperCase?.() || "-",
    }),
    columnHelper.accessor("normal_balance", {
      header: t('columns.normal'),
      cell: (info) => info.getValue()?.toUpperCase?.() || "-",
    }),
    columnHelper.accessor("is_active", {
      header: t('columns.status'),
      cell: (info) => (
        <span className={info.getValue() ? "text-success-600" : "text-danger-600"}>
          {info.getValue() ? t('status.active') : t('status.inactive')}
        </span>
      ),
    }),
    columnHelper.accessor("id", {
      header: t('columns.actions'),
      enableSorting: false,
      enableColumnFilter: false,
      cell: (info) => {
        const current = info.row.original;
        return (
          <>
            <Button
              type="button"
              variant="primary"
              className="w-[40px]"
              onClick={() => {
                setGroup(current);
                setOperation("update");
                setModal(true);
              }}
              tabIndex={-1}
            >
              <FontAwesomeIcon icon={faPencilAlt}/>
            </Button>
            <span className="mx-2 text-gray-300">|</span>
            <Switch
              checked={current.is_active}
              onChange={async () => {
                const message = t('confirm.activateGroup', {action: current.is_active ? 'de-' : ''});
                if (!window.confirm(message)) {
                  return;
                }
                await db.merge(new StringRecordId(current.id.toString()), {
                  is_active: !current.is_active,
                });
                await groupListHook.fetchData();
              }}
            />
          </>
        );
      },
    }),
  ], [columnHelper, db, groupListHook, t]);

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={groupListHook}
        loaderLineItems={6}
        buttons={[
          <Button
            key="create-group"
            variant="primary"
            onClick={() => {
              setGroup(undefined);
              setOperation("create");
              setModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2"/> {t('actions.group')}
          </Button>,
        ]}
      />

      {modal && (
        <CreateAccountGroup
          addModal={modal}
          operation={operation}
          entity={group}
          onClose={async () => {
            setModal(false);
            setGroup(undefined);
            setOperation("create");
            await groupListHook.fetchData();
          }}
        />
      )}
    </>
  );
};
