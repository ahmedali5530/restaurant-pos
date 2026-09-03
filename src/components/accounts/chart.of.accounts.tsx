import {useMemo, useRef, useState} from "react";
import {createColumnHelper} from "@tanstack/react-table";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPencilAlt, faPlus} from "@fortawesome/free-solid-svg-icons";
import {StringRecordId} from "surrealdb";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {useDB} from "@/api/db/db.ts";
import {Account} from "@/api/model/account.ts";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Button} from "@/components/common/input/button.tsx";
import {AiSparklesIcon} from "@/components/common/icons/ai-sparkles.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {TableComponent} from "@/components/common/table/table.tsx";
import {CreateAccount} from "@/components/accounts/create.account.tsx";
import {DataImportModal} from "@/components/common/data-import/data-import-modal.tsx";
import {createAccountImportConfig} from "@/components/accounts/account.import.config.ts";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import { IconTooltipButton } from "@/components/common/input/icon.tooltip.button.tsx";

export const ChartOfAccounts = () => {
  const {t} = useTranslation(['accounts', 'common']);
  const db = useDB();
  const [modal, setModal] = useState(false);
  const [csvUploader, setCsvUploader] = useState(false);
  const [operation, setOperation] = useState<"create" | "update">("create");
  const [account, setAccount] = useState<Account>();
  const [activateConfirm, setActivateConfirm] = useState<Account | null>(null);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    created: number;
    updated: number;
    invalid: number;
  }>();
  const importCounters = useRef({
    created: 0,
    updated: 0,
  });

  const storeFilter = [];

  const accountListHook = useApi<SettingsData<Account>>(
    Tables.accounts,
    storeFilter,
    ["code ASC"],
    0,
    25,
    ["parent", "group"],
  );

  const allAccountsHook = useApi<SettingsData<Account>>(
    Tables.accounts,
    storeFilter,
    ["code ASC"],
    0,
    9999,
    ["parent", "group"],
  );

  const accounts = allAccountsHook.data?.data || [];
  const columnHelper = createColumnHelper<Account>();

  const smartImportConfig = useMemo(
    () =>
      createAccountImportConfig({
        db,
        t,
        onResult: (result) => {
          if (result === "updated") {
            importCounters.current.updated += 1;
          } else {
            importCounters.current.created += 1;
          }
        },
      }),
    [db, t]
  );

  const columns = useMemo(() => [
    columnHelper.accessor("code", {
      header: t('columns.code'),
    }),
    columnHelper.accessor("name", {
      header: t('columns.name'),
    }),
    columnHelper.accessor("group", {
      header: t('columns.group'),
      enableSorting: false,
      cell: (info) => {
        const group = info.getValue();
        if (!group) {
          return "-";
        }
        return `${group.code} - ${group.name} (${group.head_type})`;
      },
    }),
    columnHelper.accessor("normal_balance", {
      header: t('columns.normal'),
      cell: (info) => info.getValue()?.toUpperCase?.() || "-",
    }),
    columnHelper.accessor("parent", {
      header: t('columns.parent'),
      enableSorting: false,
      cell: (info) => {
        const parent = info.getValue();
        if (!parent) {
          return "-";
        }
        return `${parent.code} - ${parent.name}`;
      }
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
            <IconTooltipButton label={t('common:actions.edit')}
              type="button"
              variant="primary"
              className="w-[40px]"
              onClick={() => {
                setAccount(current);
                setOperation("update");
                setModal(true);
              }}
              tabIndex={-1}
            >
              <FontAwesomeIcon icon={faPencilAlt}/>
            </IconTooltipButton>
            <span className="mx-2 text-gray-300">|</span>
            <Switch
              checked={current.is_active}
              onChange={() => setActivateConfirm(current)}
            />
          </>
        );
      }
    })
  ], [columnHelper, t]);

  return (
    <>
      <TableComponent
        columns={columns}
        loaderHook={accountListHook}
        loaderLineItems={6}
        buttons={[
          <Button
            key="import-account-csv"
            variant="success"
            onClick={() => {
              importCounters.current = {created: 0, updated: 0};
              setImportSummary(undefined);
              setCsvUploader(true);
            }}
          >
            <AiSparklesIcon className="mr-2"/> {t('actions.smartImport', {defaultValue: t('actions.importCsv')})}
          </Button>,
          <Button
            key="create-account"
            variant="primary"
            onClick={() => {
              setAccount(undefined);
              setOperation("create");
              setModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPlus} className="mr-2"/> {t('actions.account')}
          </Button>
        ]}
      />

      <DeleteConfirm
        open={activateConfirm != null}
        onOpenChange={(next) => {
          if (!next) setActivateConfirm(null);
        }}
        title={t('confirm.title')}
        message={activateConfirm
          ? t('confirm.activateAccount', {action: activateConfirm.is_active ? 'de-' : ''})
          : undefined}
        onConfirm={async () => {
          if (!activateConfirm) return;
          await db.merge(new StringRecordId(activateConfirm.id.toString()), {
            is_active: !activateConfirm.is_active,
          });
          await accountListHook.fetchData();
          await allAccountsHook.fetchData();
        }}
      />

      {importSummary && (
        <div className="mt-2 text-sm bg-primary-50 border border-primary-200 rounded px-3 py-2">
          {t('messages.importSummary', importSummary)}
        </div>
      )}

      {modal && (
        <CreateAccount
          addModal={modal}
          operation={operation}
          entity={account}
          allAccounts={accounts}
          onClose={async () => {
            setModal(false);
            setAccount(undefined);
            setOperation("create");
            await accountListHook.fetchData();
            await allAccountsHook.fetchData();
          }}
        />
      )}

      {csvUploader && (
        <DataImportModal
          isOpen
          onClose={async () => {
            setCsvUploader(false);
            await accountListHook.fetchData();
            await allAccountsHook.fetchData();
          }}
          config={smartImportConfig}
          title={t('forms.smartImportAccountsTitle', {defaultValue: 'AI Import accounts'})}
          enableImportModes
          defaultMatchFields={['code']}
          onExport={async () => {
            const list = accounts.length > 0
              ? accounts
              : (allAccountsHook.data?.data || []);
            return list.map((a) => ({
              code: a.code ?? '',
              name: a.name ?? '',
              group_code: a.group?.code ?? '',
              normal_balance: a.normal_balance ?? '',
              parent_code: a.parent?.code ?? '',
              is_active: a.is_active ? 'true' : 'false',
              notes: a.notes ?? '',
            }));
          }}
          onDone={() => {
            const created = importCounters.current.created;
            const updated = importCounters.current.updated;
            const total = created + updated;
            const invalid = 0;
            setImportSummary({
              total,
              created,
              updated,
              invalid,
            });
            toast.success(t('messages.importComplete', {created, updated, invalid}));
            importCounters.current = { created: 0, updated: 0 };
            void accountListHook.fetchData();
            void allAccountsHook.fetchData();
          }}
        />
      )}
    </>
  );
};
